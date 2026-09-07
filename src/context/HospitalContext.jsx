import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

// =====================================================================
// GOODIE-MEDHUB — Hospital / Facility context (Stage 1)
//
// This replaces the old 2-byte junk stub with a real, minimal provider.
//
// What it does in Stage 1:
//   - Loads the facility list for the signed-in hospital (from the
//     `facilities` table created by migration 007).
//   - Exposes { facilities, activeFacility, setActiveFacility }.
//
// What it deliberately does NOT do (approved Stage 1 decision):
//   - No facility selector is rendered anywhere. When a hospital has
//     exactly one facility (the default, auto-created by the migration
//     backfill) the whole facility layer is invisible to users.
//   - It never blocks the app: if migration 007 has not been applied
//     yet (table missing) or the query fails, it degrades to an empty
//     facility list with a warning — every existing screen keeps
//     working exactly as before.
//
// Later stages build on this: department scoping, facility-scoped
// queries, and the facility switcher for multi-branch hospitals.
// =====================================================================

const HospitalContext = createContext(null)

export function HospitalProvider({ children }){
  // hospital comes from AuthContext — this provider must be mounted
  // INSIDE <AuthProvider> (Dashboard does exactly that).
  const { hospital } = useAuth()

  const [facilities, setFacilities] = useState([])
  const [facilitiesUnavailable, setFacilitiesUnavailable] = useState(false)
  const [activeFacilityId, setActiveFacilityId] = useState(null)
  const [loadingFacilities, setLoadingFacilities] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadFacilities(){
      if (!hospital?.id) {
        setFacilities([])
        setLoadingFacilities(false)
        return
      }

      setLoadingFacilities(true)
      const { data, error } = await supabase
        .from('facilities')
        .select('id, hospital_id, name, code, is_main, timezone, address, phone, active')
        .eq('hospital_id', hospital.id)
        .order('is_main', { ascending: false })
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        // Migration 007 not applied yet (or offline). The app continues
        // hospital-wide — this is the pre-Stage-1 behaviour.
        console.warn('Facility list unavailable (run migration 007):', error.message)
        setFacilitiesUnavailable(true)
        setFacilities([])
      } else {
        setFacilitiesUnavailable(false)
        setFacilities(data || [])
      }
      setLoadingFacilities(false)
    }

    loadFacilities()
    return () => { cancelled = true }
  }, [hospital?.id])

  const activeFacility = useMemo(() => {
    if (!activeFacilityId) return null
    return facilities.find(f => f.id === activeFacilityId) || null
  }, [activeFacilityId, facilities])

  const value = useMemo(() => ({
    hospital,
    // All facilities of the current hospital ([] when migration 007
    // hasn't been applied or the query failed).
    facilities,
    // The facility the user is currently working in. null = hospital-wide,
    // which stays the default until a facility switcher ships.
    activeFacility,
    setActiveFacilityId,
    loadingFacilities,
    // True when the facilities table could not be read — UI can use
    // this to hide facility UI instead of guessing.
    facilitiesUnavailable,
  }), [hospital, facilities, activeFacility, loadingFacilities, facilitiesUnavailable])

  return (
    <HospitalContext.Provider value={value}>
      {children}
    </HospitalContext.Provider>
  )
}

export function useHospital(){
  return useContext(HospitalContext)
}