import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

function slugify(str){
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function withTimeout(promise, ms, label){
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out while: ${label}`)), ms))
  ])
}

export default function Signup(){
  const navigate = useNavigate()
  const [hospitalName, setHospitalName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [step, setStep] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e){
    e.preventDefault()
    setError('')

    if (!hospitalName || !fullName || !email || !password) {
      setError('Please fill in every field.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      setStep('Creating your login…')
      const { data: signUpData, error: signUpErr } = await withTimeout(
        supabase.auth.signUp({ email, password }),
        15000,
        'creating your login'
      )
      if (signUpErr) throw signUpErr

      const user = signUpData.user
      if (!user) throw new Error('Account created — please check your email to confirm, then log in.')

      setStep('Setting up your hospital…')
      const subdomain = slugify(hospitalName) + '-' + Math.random().toString(36).slice(2, 6)
      const hospitalId = crypto.randomUUID()

      const { error: hospitalErr } = await withTimeout(
        supabase.from('hospitals').insert({ id: hospitalId, name: hospitalName, subdomain }),
        15000,
        'setting up your hospital'
      )
      if (hospitalErr) throw hospitalErr

      setStep('Creating your staff profile…')
      const { error: profileErr } = await withTimeout(
        supabase.from('profiles').insert({ id: user.id, hospital_id: hospitalId, full_name: fullName, role: 'admin' }),
        15000,
        'creating your staff profile'
      )
      if (profileErr) throw profileErr

      setStep('Almost done…')
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setStep('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark">G</div>
          <div className="auth-brand-name">G-MedHub</div>
        </div>
        <div className="card">
          <div className="auth-title">Register your hospital</div>
          <div className="auth-sub">Set up your own private workspace on G-MedHub</div>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Hospital Name</label>
              <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="e.g. St. John's Clinic" />
            </div>
            <div className="field">
              <label>Your Full Name</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Dr. John Doe" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@hospital.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? (step || 'Creating your workspace…') : 'Create Hospital Account'}
            </button>
          </form>
        </div>
        <div className="auth-switch">
          Already have an account? <Link to="/login">Log in</Link>
        </div>
      </div>
    </div>
  )
}
