import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function OwnerRoute({ children }){
  const { session, loading, isOwner } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!isOwner) return <Navigate to="/dashboard" replace />

  return children
}
