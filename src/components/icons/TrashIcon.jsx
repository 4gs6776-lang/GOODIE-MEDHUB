// Single source of truth for the "delete" icon across the whole app —
// matches the icon already used on the Owner Dashboard, so every delete
// affordance in the product looks the same regardless of which page it's on.
export default function TrashIcon({ size = 15 }){
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" /><path d="M9 7V4h6v3" />
    </svg>
  )
}
