import { Trash2 } from 'lucide-react'

// Single source of truth for the "delete" icon across the whole app.
// Stage 1: now backed by Lucide (same 1.8 stroke weight as before, so
// every delete affordance keeps its exact look) — the hand-drawn SVG
// copy is retired. Prefer <AppIcon name="trash" /> in new code; this
// wrapper stays because 7 modules already import it.
export default function TrashIcon({ size = 15 }){
  return <Trash2 width={size} height={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />
}
