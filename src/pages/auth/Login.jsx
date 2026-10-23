import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function Login(){
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hospitalLogo, setHospitalLogo] = useState(null)
  const [hospitalName, setHospitalName] = useState(null)

  // On mount, check if any hospital has a logo set. If so, show it on
  // the login page instead of the default "G" brand mark. This is
  // primarily for single-hospital deployments — for multi-hospital,
  // the first hospital's logo shows on the shared login page.
  useEffect(() => {
    async function loadHospitalLogo() {
      try {
        const { data } = await supabase
          .from('hospitals')
          .select('logo_url, name')
          .not('logo_url', 'is', null)
          .limit(1)
          .maybeSingle()
        if (data?.logo_url) {
          setHospitalLogo(data.logo_url)
          setHospitalName(data.name)
        }
      } catch {
        // Silent — login page works fine without a logo
      }
    }
    loadHospitalLogo()
  }, [])

  async function handleSubmit(e){
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      navigate('/dashboard')
    } catch (err) {
      if (!navigator.onLine) {
        setError("You're offline. Please connect to the internet to log in — after that, the app will keep working without a connection.")
      } else {
        setError(err.message || 'Could not log in. Check your details and try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          {hospitalLogo ? (
            <img src={hospitalLogo} alt={hospitalName || 'Hospital'} style={{ maxWidth: 64, maxHeight: 64, borderRadius: 12, objectFit: 'contain' }} />
          ) : (
            <div className="auth-brand-mark">G</div>
          )}
          <div className="auth-brand-name">{hospitalName || 'G-MedHub'}</div>
        </div>
        <div className="card">
          <div className="auth-title">Welcome back</div>
          <div className="auth-sub">Log in to your hospital workspace</div>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@hospital.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'Logging in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
