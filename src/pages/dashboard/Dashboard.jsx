import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabaseClient'

export default function Dashboard(){
  const { profile, hospital, signOut } = useAuth()
  if (profile?.role === 'owner') {
    window.location.href = '/owner'
    return null
  }

  if (hospital && hospital.status !== 'active') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 10 }}>
            {hospital.status === 'pending' ? 'Account pending approval' : 'Account suspended'}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 20 }}>
            {hospital.status === 'pending'
              ? "Your hospital's account is being reviewed. You'll be able to log in fully once it's approved."
              : 'Please contact the platform administrator for help.'}
          </div>
          <button className="btn btn-ghost" onClick={signOut}>Sign Out</button>
        </div>
      </div>
    )
  }
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')
  const [age, setAge] = useState('')
  const [status, setStatus] = useState('stable')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const [pending, setPending] = useState(null)
  const pendingTimeoutRef = useRef(null)
  const pendingIntervalRef = useRef(null)

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
    setTimeout(() => setToast(null), 3000)
  }

  async function handleAdd(e){
    e.preventDefault()
    if (!name || !age) return

    if (!hospital || !profile) {
      showToast('Still loading your account — wait a moment and try again')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('patients').insert({
        hospital_id: hospital.id,
        full_name: name,
        age: parseInt(age, 10),
        status,
        created_by: profile.id,
      })
      if (error) throw error
      setShowModal(false)
      setName(''); setAge(''); setStatus('stable')
      showToast(`${name} added`)
      loadPatients()
    } catch (err) {
      showToast(err.message || 'Could not save patient')
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(patient){
    if (pending) {
      commitPendingDelete(pending.patient.id)
    }

    setPatients(prev => prev.filter(p => p.id !== patient.id))

    let secondsLeft = 5
    setPending({ patient, secondsLeft })

    pendingIntervalRef.current = setInterval(() => {
      secondsLeft -= 1
      setPending(prev => prev ? { ...prev, secondsLeft } : prev)
      if (secondsLeft <= 0) {
        clearInterval(pendingIntervalRef.current)
      }
    }, 1000)

    pendingTimeoutRef.current = setTimeout(() => {
      commitPendingDelete(patient.id)
    }, 5000)
  }

  async function commitPendingDelete(patientId){
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPending(null)
    try {
      const { error } = await supabase.from('patients').delete().eq('id', patientId)
      if (error) throw error
    } catch (err) {
      showToast(err.message || 'Could not delete patient')
      loadPatients()
    }
  }

  function handleUndo(){
    if (!pending) return
    clearTimeout(pendingTimeoutRef.current)
    clearInterval(pendingIntervalRef.current)
    setPatients(prev => [pending.patient, ...prev])
    setPending(null)
    showToast(`${pending.patient.full_name} restored`)
  }

  return (
    <div style={{ minHeight: '100vh', padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 700, marginBottom: 4 }}>
            {hospital ? hospital.name : 'Loading hospital…'}
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
