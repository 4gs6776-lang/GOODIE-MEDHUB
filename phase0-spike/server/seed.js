// Creates one demo hospital and one admin user. Run:  npm run seed
import pg from 'pg'
import argon2 from 'argon2'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const email = process.env.SEED_EMAIL || 'admin@demo.local'
const password = process.env.SEED_PASSWORD || 'ChangeMe-Now-123'

const { rows: h } = await pool.query(
  `INSERT INTO hospitals (name, mrn_prefix) VALUES ('Demo Hospital', 'DEMO')
   ON CONFLICT DO NOTHING RETURNING id`)
let hospitalId = h[0]?.id
if (!hospitalId) hospitalId = (await pool.query(`SELECT id FROM hospitals LIMIT 1`)).rows[0].id

await pool.query(`INSERT INTO mrn_counters (hospital_id) VALUES ($1) ON CONFLICT DO NOTHING`, [hospitalId])
const hash = await argon2.hash(password, { type: argon2.argon2id })
await pool.query(
  `INSERT INTO users (hospital_id, email, full_name, role, password_hash)
   VALUES ($1,$2,'Demo Admin','admin',$3) ON CONFLICT (email) DO NOTHING`,
  [hospitalId, email, hash])
console.log(`Seeded. Log in with ${email} / ${password}`)
await pool.end()
