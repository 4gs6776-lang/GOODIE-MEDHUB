import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import OwnerRoute from './components/OwnerRoute'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/auth/Login'
import Dashboard from './pages/dashboard/Dashboard'
import OwnerDashboard from './pages/owner/OwnerDashboard'
import OwnerLogin from './pages/owner/OwnerLogin'
import HospitalDetails from './pages/owner/HospitalDetails'

export default function App(){
  return (
    <ErrorBoundary fallbackMessage="The app hit an unexpected error. Your data is safe — try reloading.">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <ErrorBoundary fallbackMessage="The dashboard hit an unexpected error. Your data is safe — try reloading.">
                  <Dashboard />
                </ErrorBoundary>
              </ProtectedRoute>
            } />

            {/* Owner-only — not linked anywhere in the app */}
            <Route path="/gm-owner-portal" element={<OwnerLogin />} />
            <Route path="/owner" element={
              <OwnerRoute>
                <ErrorBoundary fallbackMessage="The owner portal hit an unexpected error. Try reloading.">
                  <OwnerDashboard />
                </ErrorBoundary>
              </OwnerRoute>
            } />
            <Route path="/owner/hospitals/:id" element={
              <OwnerRoute>
                <ErrorBoundary fallbackMessage="This page hit an unexpected error. Try reloading.">
                  <HospitalDetails />
                </ErrorBoundary>
              </OwnerRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
