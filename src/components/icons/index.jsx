// =====================================================================
// GOODIE-MEDHUB — AppIcon: the single icon system (Stage 1, req. #12)
//
// Before Stage 1 there were FOUR hand-rolled <Icon/> copies (Dashboard,
// OwnerDashboard, HospitalDetails, Billing) with slightly different
// path sets, plus text glyphs (⌕, ×, ✕) pretending to be icons.
//
// Now every icon comes from Lucide through this one component:
//   - consistent 24×24 grid, stroke-based, currentColor
//   - consistent default size (18) and stroke width (1.8) — the values
//     the app already used, so existing screens keep their look
//   - `title` prop adds an accessible tooltip for non-obvious actions
//   - decorative icons stay aria-hidden; labelled ones get aria-label
//
// Emoji/text-glyph usage as UI icons is removed. Icons must match the
// MEANING of the action — decorative icon spam is not allowed.
//
// Lucide imports are named (tree-shakeable) — never import the barrel
// as a namespace.
// =====================================================================

import {
  Activity, AlertTriangle, Ambulance, ArrowDown, ArrowLeft,
  ArrowLeftRight, ArrowRight, ArrowUp, BarChart3, BedDouble, Bell,
  Building2, Calendar, Camera, Check, CheckCircle2, ChevronRight, ClipboardList, Clock,
  CloudOff, ConciergeBell, Download, Eye, FileText, FlaskConical,
  HeartPulse, House, Info, ListFilter, Loader2, Lock, Menu, MessageCircle, Mic,
  Moon, MoreHorizontal, Package, Pause, Pencil, Phone, Pill, Play,
  Plus, Power, Printer, RadioTower, RefreshCw, Receipt, ScanLine,
  Search, Send, Settings, Shield, ShieldCheck, Stethoscope, Sun, Trash2,
  TriangleAlert, Upload, Users, Wifi, WifiOff, X, XCircle,
} from 'lucide-react'

// name → Lucide component. Names are the app's semantic vocabulary
// (they match the old in-file Icon maps 1:1 so the refactor is a pure
// replacement, not a redesign).
const ICONS = {
  // Navigation modules
  home: { C: House },
  calendar: { C: Calendar },
  users: { C: Users },
  reception: { C: ConciergeBell },
  billing: { C: Receipt },
  lab: { C: FlaskConical },
  pharmacy: { C: Pill },
  radiology: { C: ScanLine },
  inventory: { C: Package },
  doctor: { C: Stethoscope },
  nurse: { C: HeartPulse },
  bed: { C: BedDouble },
  insurance: { C: ShieldCheck },
  reports: { C: BarChart3 },
  bell: { C: Bell },
  settings: { C: Settings },
  handover: { C: ArrowLeftRight },
  clipboard: { C: ClipboardList },
  mic: { C: Mic },

  // Actions
  search: { C: Search },
  camera: { C: Camera },
  menu: { C: Menu },
  plus: { C: Plus },
  edit: { C: Pencil },
  trash: { C: Trash2 },
  archive: { C: Package }, // semantic alias; use 'inventory' for stock
  filter: { C: ListFilter },
  print: { C: Printer },
  export: { C: Download },
  import: { C: Upload },
  download: { C: Download },
  upload: { C: Upload },
  refresh: { C: RefreshCw },
  check: { C: Check },
  close: { C: X },
  more: { C: MoreHorizontal },
  send: { C: Send },
  lock: { C: Lock },
  eye: { C: Eye },
  play: { C: Play },
  pause: { C: Pause },
  power: { C: Power },

  // Arrows
  arrowUp: { C: ArrowUp },
  arrowDown: { C: ArrowDown },
  arrowLeft: { C: ArrowLeft },
  arrowRight: { C: ArrowRight },
  chevron: { C: ChevronRight },

  // Status / feedback
  alert: { C: AlertTriangle },
  warning: { C: TriangleAlert },
  info: { C: Info },
  success: { C: CheckCircle2 },
  error: { C: XCircle },
  loading: { C: Loader2 },

  // Connectivity (Stage 1 requirement #14)
  wifi: { C: Wifi },
  wifiOff: { C: WifiOff },
  offline: { C: CloudOff },
  connecting: { C: RadioTower },

  // Misc
  clock: { C: Clock },
  phone: { C: Phone },
  chat: { C: MessageCircle },
  building: { C: Building2 },
  moon: { C: Moon },
  sun: { C: Sun },
  file: { C: FileText },
  shield: { C: Shield },
  activity: { C: Activity },
  emergency: { C: Ambulance },
}

// Aliases set outside the literal (avoids self-reference in the map).
ICONS.save = { C: Check }

export default function AppIcon({
  name,
  size = 18,
  strokeWidth = 1.8,
  title,               // tooltip + accessible name; set when meaning isn't obvious
  style,
  spin = false,        // for loading state icons
  className,
}) {
  const entry = ICONS[name]
  const Component = entry?.C || ICONS.home.C

  if (title) {
    return (
      <span
        title={title}
        aria-label={title}
        role="img"
        style={{ display: 'inline-flex', lineHeight: 0, ...style }}
        className={className}
      >
        <Component
          width={size}
          height={size}
          strokeWidth={strokeWidth}
          aria-hidden="true"
          style={spin ? { animation: 'gmedhub-spin 1s linear infinite' } : undefined}
        />
      </span>
    )
  }

  return (
    <Component
      width={size}
      height={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...(spin ? { animation: 'gmedhub-spin 1s linear infinite' } : null), ...style }}
      className={className}
    />
  )
}

// Boolean → icon helper for status pills/badges.
export function StatusIcon({ status, size = 14, ...rest }) {
  const map = {
    online: 'wifi',
    synced: 'check',
    syncing: 'refresh',
    pending: 'clock',
    offline: 'offline',
    failed: 'alert',
    conflict: 'warning',
  }
  return <AppIcon name={map[status] || 'info'} size={size} {...rest} />
}
