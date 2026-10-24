import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

const REMEMBER_KEY = 'gmedhub-remember-email'

function readRememberedEmail() {
  try { return localStorage.getItem(REMEMBER_KEY) || '' } catch { return '' }
}

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 1.5a5 5 0 0 0-5 5V9H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6.5a5 5 0 0 0-5-5Zm-3 5a3 3 0 1 1 6 0V9H9V6.5Z" />
  </svg>
)
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.9 17.9A10.6 10.6 0 0 1 12 19.5C5.5 19.5 1.5 12 1.5 12a18 18 0 0 1 4.6-5.4M9.9 4.7A10 10 0 0 1 12 4.5C18.5 4.5 22.5 12 22.5 12a18 18 0 0 1-2.2 3.2M1 1l22 22" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
)
const HelpIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
    <path d="M12 18.5h.01" />
  </svg>
)

export default function Login(){
  const navigate = useNavigate()
  const [email, setEmail] = useState(readRememberedEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(() => Boolean(readRememberedEmail()))
  const [note, setNote] = useState(null) // null | 'forgot' | 'account'
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hospitalLogo, setHospitalLogo] = useState(null)
  const [hospitalName, setHospitalName] = useState(null)

  // On mount, check if any hospital has a logo set. If so, show it in the
  // round badge instead of the lock icon. Silent on failure.
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
    setNote(null)
    setLoading(true)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      // "Remember my email" only stores the email address — never the password.
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch { /* storage unavailable — ignore */ }
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
    <div className="neo-login">
      <div className="neo-card">
        <div className="neo-badge">
          {hospitalLogo
            ? <img src={hospitalLogo} alt={hospitalName || 'Hospital'} />
            : <LockIcon />}
        </div>

        <h1 className="neo-title">Welcome</h1>
        <p className="neo-sub">{hospitalName ? `Log in to ${hospitalName}` : 'Log in to your hospital workspace'}</p>

        {error && <div className="neo-error" role="alert">{error}</div>}
        {note === 'forgot' && (
          <div className="neo-note" role="status">
            Forgot your password? Ask your hospital administrator to reset it for you from the Staff page.
          </div>
        )}
        {note === 'account' && (
          <div className="neo-note" role="status">
            Accounts are created by your hospital administrator. Ask them to add you as a staff member.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="neo-field">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email Address"
              aria-label="Email address"
              autoComplete="username"
              required
            />
          </div>
          <div className="neo-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              aria-label="Password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="neo-eye"
              onClick={() => setShowPassword(s => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>

          <div className="neo-row">
            <label className="neo-check">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Remember my email
            </label>
            <button type="button" className="neo-link" onClick={() => setNote(n => (n === 'forgot' ? null : 'forgot'))}>
              Forgot Password?
            </button>
          </div>

          <button className="neo-btn" type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <div className="neo-foot">
          <span>Need an account?</span>
          <button
            type="button"
            className="neo-round"
            onClick={() => setNote(n => (n === 'account' ? null : 'account'))}
            aria-label="How do I get an account?"
          >
            <HelpIcon />
          </button>
        </div>
      </div>
    </div>
  )
}
