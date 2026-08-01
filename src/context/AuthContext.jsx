import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }){
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [hospital, setHospital] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadProfileAndHospital(userId){
    const { data: profileData, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileErr || !profileData) {
      setProfile(null)
      setHospital(null)
      return
    }
    setProfile(profileData)

    const { data: hospitalData } = await supabase
      .from('hospitals')
      .select('*')
      .eq('id', profileData.hospital_id)
      .single()

    setHospital(hospitalData || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        await loadProfileAndHospital(session.user.id)
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session?.user) {
        await loadProfileAndHospital(session.user.id)
      } else {
        setProfile(null)
        setHospital(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signOut(){
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, hospital, loading, signOut, reload: () => session?.user && loadProfileAndHospital(session.user.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(){
  return useContext(AuthContext)
}
