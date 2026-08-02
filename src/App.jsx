import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import OwnerRoute from './components/OwnerRoute'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import OwnerDashboard from './pages/owner/OwnerDashboard'

export default function App(){
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          } />
          <Route path="/owner" element={
            <OwnerRoute><OwnerDashboard /></OwnerRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
