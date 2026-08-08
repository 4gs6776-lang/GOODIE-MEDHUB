import React from 'react'
import { useAuth } from '../../context/AuthContext'

export default function DoctorWorkbench() {
  const { profile, hospital } = useAuth()

  return (
    <div className="dash-panel">
      <h2>Doctor Workbench</h2>

      <p>Doctor Workbench is loading correctly.</p>

      <p>
        Doctor: {profile?.full_name || profile?.email || 'Loading...'}
      </p>

      <p>
        Hospital: {hospital?.name || 'Loading...'}
      </p>
    </div>
  )
}