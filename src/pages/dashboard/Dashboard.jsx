import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [status, setStatus] = useState('stable')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  async function loadPatients(){
    setLoading(true)
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setPatients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadPatients() }, [])

  function showToast(msg){
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function handleAdd(e){
    e.preventDefault()
    if (!name || !age) return
    setSaving(true)
    const { error } = await supabase.from('patients').insert({
      hospital_id: hospital.id,
      full_name: name,
      age: parseInt(age, 10),
      status,
      created_by: profile.id,
    })
    setSaving(false)
    if (!error) {
      setShowModal(false)
      setName(''); setAge(''); setStatus('stable')
      showToast(`${name} added`)
      loadPatients()
    }
  }

  async function handleDelete(id, patientName){
    const { error } = await supabase.from('patients').delete().eq('id', id)
    if (!error) {
      showToast(`${patientName} removed`)
      loadPatients()
    }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: 4 }}>
            {hospital ? hospital.name : '—'}
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500 }}>
            Welcome, {profile?.full_name || '…'}
          </h1>
        </div>
        <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={signOut}>Sign Out</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Patients</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
              Only {hospital?.name || 'your hospital'} can see this list — enforced by the database
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => setShowModal(true)}>
            + Add Patient
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
        ) : patients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            No patients yet. Add your first one above.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Age', 'Status', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '0 12px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: 12, fontWeight: 700 }}>{p.full_name}</td>
                  <td style={{ padding: 12 }}>{p.age}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                      background: p.status === 'stable' ? 'var(--teal-soft)' : 'rgba(201,169,97,0.14)',
                      color: p.status === 'stable' ? 'var(--teal)' : 'var(--gold)',
                    }}>
                      {p.status === 'stable' ? 'Stable' : 'In Review'}
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>
                    <button
                      onClick={() => handleDelete(p.id, p.full_name)}
                      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}
                      title="Delete"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,3,26,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, marginBottom: 18 }}>Register Patient</div>
            <form onSubmit={handleAdd}>
              <div className="field">
                <label>Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chinedu Okafor" />
              </div>
              <div className="field">
                <label>Age</label>
                <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 34" />
              </div>
              <div className="field">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="stable">Stable</option>
                  <option value="review">In Review</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Patient'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--teal)', color: 'var(--teal)',
          padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, zIndex: 60,
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
