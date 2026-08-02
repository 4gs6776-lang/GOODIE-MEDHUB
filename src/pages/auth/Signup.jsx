import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

function slugify(str){
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function Signup(){
  const navigate = useNavigate()
  const [hospitalName, setHospitalName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email, password,
      })
      if (signUpErr) throw signUpErr

      const user = signUpData.user
      if (!user) throw new Error('Account created — please check your email to confirm, then log in.')

      const subdomain = slugify(hospitalName) + '-' + Math.random().toString(36).slice(2, 6)
      const hospitalId = crypto.randomUUID()

      const { error: hospitalErr } = await supabase
        .from('hospitals')
        .insert({ id: hospitalId, name: hospitalName, subdomain })
      if (hospitalErr) throw hospitalErr

      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({ id: user.id, hospital_id: hospitalId, full_name: fullName, role: 'admin' })
      if (profileErr) throw profileErr

      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
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
              {loading ? 'Creating your workspace…' : 'Create Hospital Account'}
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
