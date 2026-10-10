// GOODIE-MEDHUB — LOCAL HOSPITAL SERVER (Phase 0 spike)
// Free/open-source parts only: Node.js, Fastify, PostgreSQL, ws (WebSocket), Argon2id.
//
// What this proves:  browser -> this API -> PostgreSQL, local login, live updates
// to every connected screen, and a "sync outbox" ready for the cloud later.

import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import fstatic from '@fastify/static'
import pg from 'pg'
import argon2 from 'argon2'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { DATABASE_URL, SESSION_SECRET, PORT = '3000', TLS_KEY, TLS_CERT, CLOUD_URL } = process.env
if (!DATABASE_URL || !SESSION_SECRET || SESSION_SECRET.startsWith('CHANGE_ME')) {
  console.error('Set DATABASE_URL and a real SESSION_SECRET in server/.env (see .env.example).')
  process.exit(1)
}

// ---- HTTPS is switched on only if certificate files are provided --------
const https = TLS_KEY && TLS_CERT
  ? { key: fs.readFileSync(TLS_KEY), cert: fs.readFileSync(TLS_CERT) }
  : null

const app = Fastify({ logger: true, ...(https ? { https } : {}) })
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 })

// ---- Session tokens: signed with HMAC, expire after 12 hours -------------
// (Spike-level. Phase 1 should move to server-side sessions that can be revoked.)
const b64 = (b) => Buffer.from(b).toString('base64url')
function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + 12 * 3600 * 1000 }))
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  return `${body}.${sig}`
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  const good = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(good)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  return payload.exp > Date.now() ? payload : null
}

// ---- Tiny login rate limiter: 5 attempts per minute per address ----------
const attempts = new Map()
function tooManyAttempts(ip) {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || rec.reset < now) { attempts.set(ip, { count: 1, reset: now + 60000 }); return false }
  rec.count += 1
  return rec.count > 5
}

const DUMMY_HASH = await argon2.hash('not-a-real-password', { type: argon2.argon2id })

// ---- Live connections, grouped by hospital (tenant isolation) ------------
const sockets = new Map() // hospitalId -> Set<socket>
function broadcast(hospitalId, message) {
  const text = JSON.stringify(message)
  for (const s of sockets.get(hospitalId) || []) if (s.readyState === 1) s.send(text)
}

async function audit(hospitalId, actorId, action, summary) {
  await pool.query(
    `INSERT INTO audit_events (hospital_id, actor_id, action, summary) VALUES ($1,$2,$3,$4)`,
    [hospitalId, actorId, action, summary])
}

// ---- Auth guard used by protected routes --------------------------------
async function requireAuth(req, reply) {
  const header = req.headers.authorization || ''
  const user = verifyToken(header.startsWith('Bearer ') ? header.slice(7) : '')
  if (!user) return reply.code(401).send({ error: 'Please log in again.' })
  req.user = user
}
const CAN_REGISTER = new Set(['admin', 'front_desk', 'nurse', 'doctor'])

await app.register(websocket)
await app.register(fstatic, { root: path.join(__dirname, 'public') })

// ---- Health: is the DB up? Is the cloud reachable? -----------------------
app.get('/api/health', async () => {
  let db = 'down'
  try { await pool.query('SELECT 1'); db = 'ok' } catch { /* stays down */ }
  let cloud = 'not-configured'
  if (CLOUD_URL) {
    try {
      const r = await fetch(CLOUD_URL, { method: 'HEAD', signal: AbortSignal.timeout(3000) })
      cloud = r.ok || r.status < 500 ? 'ok' : 'unreachable'
    } catch { cloud = 'unreachable' }
  }
  const { rows } = await pool.query(`SELECT count(*)::int AS pending FROM sync_outbox WHERE synced_at IS NULL`).catch(() => ({ rows: [{ pending: null }] }))
  return { server: 'ok', db, cloud, pendingSync: rows[0].pending }
})

app.post('/api/auth/login', async (req, reply) => {
  if (tooManyAttempts(req.ip)) return reply.code(429).send({ error: 'Too many attempts. Wait a minute.' })
  const { email = '', password = '' } = req.body || {}
  const { rows } = await pool.query(`SELECT * FROM users WHERE lower(email)=lower($1)`, [email])
  const user = rows[0]
  // Always run one hash check so "no such user" and "wrong password" take the same time.
  const ok = await argon2.verify(user?.password_hash || DUMMY_HASH, password).catch(() => false)
  if (!user || !user.active || !ok) {
    if (user) await audit(user.hospital_id, user.id, 'login.failed', `Failed login for ${user.email}`)
    return reply.code(401).send({ error: 'Wrong email or password.' })
  }
  await audit(user.hospital_id, user.id, 'login.ok', `${user.email} logged in`)
  const token = signToken({ uid: user.id, hid: user.hospital_id, role: user.role, name: user.full_name })
  return { token, user: { name: user.full_name, role: user.role } }
})

// Every query below filters by the hospital in the TOKEN, never by anything the browser sends.
app.get('/api/patients', { preHandler: requireAuth }, async (req) => {
  const { rows } = await pool.query(
    `SELECT id, mrn, full_name, created_at FROM patients WHERE hospital_id=$1 ORDER BY created_at DESC LIMIT 100`,
    [req.user.hid])
  return rows
})

app.post('/api/patients', { preHandler: requireAuth }, async (req, reply) => {
  if (!CAN_REGISTER.has(req.user.role)) return reply.code(403).send({ error: 'Your role cannot register patients.' })
  const name = String(req.body?.full_name || '').trim()
  if (name.length < 2 || name.length > 120) return reply.code(400).send({ error: 'Enter a valid name.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Counter + patient + outbox + audit succeed together, or none of them do.
    const c = await client.query(
      `UPDATE mrn_counters SET next_value = next_value + 1 WHERE hospital_id=$1 RETURNING next_value - 1 AS n`,
      [req.user.hid])
    const h = await client.query(`SELECT mrn_prefix FROM hospitals WHERE id=$1`, [req.user.hid])
    const mrn = `${h.rows[0].mrn_prefix}-${String(c.rows[0].n).padStart(6, '0')}`
    const p = await client.query(
      `INSERT INTO patients (hospital_id, mrn, full_name, created_by) VALUES ($1,$2,$3,$4)
       RETURNING id, mrn, full_name, created_at`,
      [req.user.hid, mrn, name, req.user.uid])
    await client.query(
      `INSERT INTO sync_outbox (hospital_id, table_name, record_id, op, payload) VALUES ($1,'patients',$2,'insert',$3)`,
      [req.user.hid, p.rows[0].id, JSON.stringify(p.rows[0])])
    await client.query(
      `INSERT INTO audit_events (hospital_id, actor_id, action, summary) VALUES ($1,$2,'patient.create',$3)`,
      [req.user.hid, req.user.uid, `Registered ${name} (${mrn})`])
    await client.query('COMMIT')
    broadcast(req.user.hid, { type: 'patient.created', patient: p.rows[0], by: req.user.name })
    return reply.code(201).send(p.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    req.log.error(err)
    return reply.code(500).send({ error: 'Could not save patient.' })
  } finally {
    client.release()
  }
})

// ---- Local realtime: browsers connect to /ws?token=... -------------------
app.get('/ws', { websocket: true }, (socket, req) => {
  const user = verifyToken(new URL(req.url, 'http://x').searchParams.get('token'))
  if (!user) { socket.close(4401, 'unauthorized'); return }
  if (!sockets.has(user.hid)) sockets.set(user.hid, new Set())
  sockets.get(user.hid).add(socket)
  socket.send(JSON.stringify({ type: 'hello', name: user.name }))
  socket.on('close', () => sockets.get(user.hid)?.delete(socket))
})

// ---- Clean shutdown: finish current requests, close DB, then exit --------
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    app.log.info(`${sig} received — shutting down cleanly`)
    await app.close()
    await pool.end()
    process.exit(0)
  })
}

await app.listen({ port: Number(PORT), host: '0.0.0.0' }) // 0.0.0.0 = reachable from the hospital Wi-Fi
