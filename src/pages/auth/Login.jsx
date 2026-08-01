import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function Login(){
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e){
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Could not log in. Check your details and try again.')
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
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>
        </div>
        <div className="auth-switch">
          New hospital? <Link to="/signup">Register here</Link>
        </div>
      </div>
    </div>
  )
}
