import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowUpFromLine, LogOut, ReceiptText, Users, Tag, Banknote,
  Landmark, MoreHorizontal, X, FileText, ClipboardCheck, Receipt,
  UserSquare2, Briefcase, ChevronDown, LayoutDashboard, BellRing, Settings, ContactRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { toast } from 'sonner'

// Top-level nav items (not in the Aufträge group)
const CRM_ENABLED = import.meta.env.VITE_CRM_ENABLED === 'true'

const TOP_ITEMS = [
  { icon: LayoutDashboard, path: '/',           label: 'Übersicht',   end: true,  badge: false },
  { icon: ReceiptText,     path: '/rechnungen', label: 'Rechnungen',  end: false, badge: true  },
  ...(CRM_ENABLED ? [{ icon: ContactRound, path: '/crm', label: 'CRM', end: false, badge: false }] : []),
  { icon: ArrowUpFromLine, path: '/exports',    label: 'Exports',     end: false, badge: false },
]

const BOTTOM_ITEMS = [
  { icon: Users,    path: '/mitarbeiter',   label: 'Mitarbeiter',  end: false, badge: false },
  { icon: Tag,      path: '/kategorien',    label: 'Kategorien',   end: false, badge: false },
  { icon: Banknote, path: '/lohn',          label: 'Lohnkosten',   end: false, badge: false },
  { icon: Landmark, path: '/kontoauszuege', label: 'Kontoauszüge', end: false, badge: false },
  { icon: Settings, path: '/einstellungen', label: 'Einstellungen', end: false, badge: false },
]

// The grouped "Aufträge" sub-items
const AUFTRAEGE_CHILDREN = [
  { icon: FileText,      path: '/angebote',            label: 'Angebote'           },
  { icon: ClipboardCheck, path: '/auftraege',           label: 'Auftragsb.'         },
  { icon: Receipt,       path: '/ausgangsrechnungen',  label: 'Rechnungen'         },
  { icon: BellRing,      path: '/mahnwesen',           label: 'Mahnwesen'          },
  { icon: UserSquare2,   path: '/kunden',              label: 'Kunden'             },
]

// Mobile items always visible in bottom nav
const MOBILE_MAIN = ['/', '/rechnungen', '/lohn', '/kontoauszuege']

const MOBILE_MORE = [
  { icon: ArrowUpFromLine, path: '/exports',     label: 'Exports'    },
  { icon: Users,           path: '/mitarbeiter', label: 'Mitarbeiter'},
  { icon: Tag,             path: '/kategorien',  label: 'Kategorien' },
  { icon: LogOut,          path: null,           label: 'Logout'     },
]

const RADIAL_OFFSETS = [
  { x: -78, y: -52 },
  { x: -28, y: -90 },
  { x:  28, y: -90 },
  { x:  78, y: -52 },
]

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase()
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: rechnungen = [] } = useRechnungen()
  const pendingCount = rechnungen.filter(r => r.status === 'eingegangen').length
  const [moreOpen, setMoreOpen] = useState(false)

  // Group is open by default; stays toggled by user click
  const isAuftActive = AUFTRAEGE_CHILDREN.some(c => location.pathname.startsWith(c.path))
  const [auftOpen, setAuftOpen] = useState(true)

  const handleSignOut = async () => {
    await signOut()
    toast.success('Erfolgreich abgemeldet')
    navigate('/login')
  }

  const allNavItems = [
    ...TOP_ITEMS.map(i => ({ ...i, end: i.end ?? false })),
    ...BOTTOM_ITEMS,
  ]
  const mobileMainItems = allNavItems.filter(i => MOBILE_MAIN.includes(i.path))

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-16 bg-bg-surface border-r border-border flex-col items-center py-0 z-50">

        {/* Logo */}
        <NavLink to="/" className="h-16 flex items-center justify-center w-full">
          <img src="/logo.svg" alt="QuickEnergy" className="w-10 h-10" />
        </NavLink>

        <div className="h-6" />

        <nav className="flex flex-col items-center gap-1 flex-1 w-full px-3">

          {/* Top items */}
          {TOP_ITEMS.map(({ icon: Icon, path, label, end, badge }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                  isActive ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted'
                )
              }
            >
              <Icon size={20} />
              {badge && pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-status-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </NavLink>
          ))}

          {/* Separator */}
          <div className="w-6 border-t border-border my-1" />

          {/* ── Aufträge collapsible group ── */}
          <div className="w-full flex flex-col items-center">

            {/* Parent toggle button */}
            <button
              title="Aufträge"
              onClick={() => setAuftOpen(v => !v)}
              className={cn(
                'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors group',
                isAuftActive ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted'
              )}
            >
              <Briefcase size={20} />
              {/* Small chevron indicator */}
              <ChevronDown
                size={10}
                className={cn(
                  'absolute bottom-1 right-1 transition-transform duration-200',
                  auftOpen ? 'rotate-0' : '-rotate-90',
                  isAuftActive ? 'text-accent-500' : 'text-ink-subtle'
                )}
              />
            </button>

            {/* Sub-items with vertical line */}
            {auftOpen && (
              <div className="mt-1 flex flex-col items-center gap-0.5 border-l-2 border-accent-200 pl-1">
                {AUFTRAEGE_CHILDREN.map(({ icon: Icon, path, label }) => (
                  <NavLink
                    key={path}
                    to={path}
                    title={label}
                    className={({ isActive }) =>
                      cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center transition-colors',
                        isActive
                          ? 'bg-accent-100 text-accent-600'
                          : 'text-ink-muted hover:bg-bg-muted'
                      )
                    }
                  >
                    <Icon size={18} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="w-6 border-t border-border my-1" />

          {/* Bottom items */}
          {BOTTOM_ITEMS.map(({ icon: Icon, path, label, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              title={label}
              className={({ isActive }) =>
                cn(
                  'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                  isActive ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted'
                )
              }
            >
              <Icon size={20} />
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <div className="w-10 h-10 rounded-full bg-accent-500 flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user?.email ? getInitials(user.email) : 'U'}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            title="Abmelden"
            className="w-10 h-10 rounded-xl bg-accent-50 text-accent-600 flex items-center justify-center hover:bg-accent-100 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ───────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-surface border-t border-border flex items-center justify-around z-50">

        {mobileMainItems.map(({ icon: Icon, path, label, end, badge }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 py-2 flex-1',
                isActive ? 'text-accent-600' : 'text-ink-muted'
              )
            }
          >
            <div className="relative">
              <Icon size={20} />
              {badge && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}

        {/* Weitere radial menu */}
        <div className="relative flex flex-col items-center flex-1">
          {moreOpen && (
            <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
          )}
          {MOBILE_MORE.map((item, i) => {
            const { x, y } = RADIAL_OFFSETS[i]
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className={cn(
                  'absolute z-[60] transition-all duration-200',
                  moreOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                )}
                style={{
                  bottom: `calc(50% + ${-y}px)`,
                  left: `calc(50% + ${x}px)`,
                  transform: 'translate(-50%, 50%)',
                  transitionDelay: moreOpen ? `${i * 40}ms` : '0ms',
                  ...(moreOpen ? {} : { transform: 'translate(-50%, 50%) scale(0.5)' }),
                }}
              >
                {item.path ? (
                  <NavLink
                    to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn('flex flex-col items-center gap-1', isActive ? 'text-accent-600' : 'text-ink')
                    }
                  >
                    <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-md border bg-bg-surface border-border">
                      <Icon size={18} />
                    </div>
                    <span className="text-[9px] font-medium text-ink-muted whitespace-nowrap">{item.label}</span>
                  </NavLink>
                ) : (
                  <button onClick={() => { setMoreOpen(false); handleSignOut() }} className="flex flex-col items-center gap-1">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center shadow-md border bg-bg-surface border-border text-ink-muted">
                      <Icon size={18} />
                    </div>
                    <span className="text-[9px] font-medium text-ink-muted">{item.label}</span>
                  </button>
                )}
              </div>
            )
          })}
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={cn('flex flex-col items-center gap-0.5 py-2 w-full transition-colors', moreOpen ? 'text-accent-600' : 'text-ink-muted')}
          >
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200', moreOpen ? 'bg-accent-100 rotate-90' : '')}>
              {moreOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
            </div>
            <span className="text-[10px] font-medium">Weitere</span>
          </button>
        </div>
      </nav>
    </>
  )
}
