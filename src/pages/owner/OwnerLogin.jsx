import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export default function OwnerLogin(){
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
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!profileData || profileData.role !== 'owner') {
        await supabase.auth.signOut()
        throw new Error('This login is for the platform owner only.')
      }

      navigate('/owner')
    } catch (err) {
      setError(err.message || 'Could not log in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell" style={{ background: '#000000' }}>
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-mark" style={{ background: 'linear-gradient(150deg,var(--gold),#8a713f)', color: '#2A1F00' }}>G</div>
          <div className="auth-brand-name">G-MedHub Owner</div>
        </div>
        <div className="card" style={{ border: '1px solid rgba(201,169,97,0.3)' }}>
          <div className="auth-title">Platform Access</div>
          <div className="auth-sub">Restricted — owner login only</div>

          {error && <div className="error-box">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmedhub.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" />
            </div>
            <button className="btn" type="submit" disabled={loading} style={{ background: 'var(--gold)', color: '#2A1F00' }}>
              {loading ? 'Verifying…' : 'Enter Owner Portal'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
