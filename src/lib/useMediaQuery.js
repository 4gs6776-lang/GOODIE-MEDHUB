import { useEffect, useState } from 'react'

// =====================================================================
// useMediaQuery — shared responsive breakpoint hook (Stage 2 QA, pair 1)
//
// Lets a module RE-FLOW its markup instead of shrinking it (e.g. the
// appointments table becomes a stacked card list on phones). CSS-only
// show/hide of two parallel trees was rejected: it duplicates DOM and
// confuses screen readers. This hook re-renders once per breakpoint
// change, which is cheap at this scale.
//
//   const isPhone = useMediaQuery('(max-width: 767px)')
//
// SSR-safe default: matchMedia is guarded (returns false when absent).
// =====================================================================

export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = e => setMatches(e.matches)
    // Safari <14 needs addListener; modern browsers accept addEventListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else mql.addListener(onChange)
    setMatches(mql.matches)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange)
      else mql.removeListener(onChange)
    }
  }, [query])

  return matches
}
