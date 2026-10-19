import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LogOut, ReceiptText, Banknote,
  Landmark, MoreHorizontal, X, FileText, ClipboardCheck, Receipt,
  UserSquare2, Briefcase, ChevronDown, LayoutDashboard, BellRing, Settings, ContactRound, LayoutTemplate, Package, Truck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useRole } from '@/contexts/RoleContext'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { BenachrichtigungenPanel } from './BenachrichtigungenPanel'
import { toast } from 'sonner'

const ADMIN_TOP_ITEMS = [
  { icon: LayoutDashboard, path: '/',           label: 'Übersicht',  end: true,  badge: false },
  { icon: ReceiptText,     path: '/rechnungen', label: 'Rechnungen', end: false, badge: true  },
  { icon: ContactRound,    path: '/crm',        label: 'CRM',        end: false, badge: false },
]

const SETTER_TOP_ITEMS = [
  { icon: ContactRound, path: '/crm', label: 'CRM', end: false, badge: false },
]

const BOTTOM_ITEMS = [
  { icon: Banknote, path: '/lohn',          label: 'Lohnkosten',   end: false, badge: false },
  { icon: Landmark, path: '/kontoauszuege', label: 'Kontoauszüge', end: false, badge: false },
  { icon: Settings, path: '/einstellungen', label: 'Einstellungen', end: false, badge: false },
]

// The grouped "Aufträge" sub-items
const AUFTRAEGE_CHILDREN = [
  { icon: FileText,      path: '/angebote',            label: 'Angebote'           },
  { icon: Package,       path: '/artikel',             label: 'Artikel'            },
  { icon: LayoutTemplate, path: '/vorlagen',           label: 'Vorlagen'           },
  { icon: ClipboardCheck, path: '/auftraege',           label: 'Auftragsb.'         },
  { icon: Receipt,       path: '/ausgangsrechnungen',  label: 'Rechnungen'         },
  { icon: Truck,         path: '/lieferscheine',       label: 'Lieferscheine'      },
  { icon: BellRing,      path: '/mahnwesen',           label: 'Mahnwesen'          },
  { icon: UserSquare2,   path: '/kunden',              label: 'Kunden'             },
]

// Mobile bottom nav: the four most-used pages, everything else lives under "Weitere"
const MOBILE_ADMIN_MAIN = [
  { icon: LayoutDashboard, path: '/',                   label: 'Übersicht',                 end: true,  badge: false },
  { icon: ReceiptText,     path: '/rechnungen',         label: 'Eingangs\u00ADrechnungen', end: false, badge: true  },
  { icon: Receipt,         path: '/ausgangsrechnungen', label: 'Ausgangs\u00ADrechnungen', end: false, badge: false },
  { icon: FileText,        path: '/angebote',           label: 'Angebote',                  end: false, badge: false },
]

const MOBILE_ADMIN_MORE = [
  {
    title: 'Aufträge',
    items: [
      { icon: ClipboardCheck, path: '/auftraege',     label: 'Auftrags\u00ADbestätigungen' },
      { icon: Truck,          path: '/lieferscheine', label: 'Lieferscheine' },
      { icon: BellRing,       path: '/mahnwesen',     label: 'Mahnwesen' },
      { icon: UserSquare2,    path: '/kunden',        label: 'Kunden' },
      { icon: Package,        path: '/artikel',       label: 'Artikel' },
      { icon: LayoutTemplate, path: '/vorlagen',      label: 'Vorlagen' },
    ],
  },
  {
    title: 'Allgemein',
    items: [
      { icon: ContactRound, path: '/crm',           label: 'CRM' },
      { icon: Banknote,     path: '/lohn',          label: 'Lohnkosten' },
      { icon: Landmark,     path: '/kontoauszuege', label: 'Kontoauszüge' },
      { icon: Settings,     path: '/einstellungen', label: 'Einstellungen' },
    ],
  },
]

function getInitials(email: string) {
  return email.slice(0, 2).toUpperCase()
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const { isAdmin, isSetter } = useRole()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: rechnungen = [] } = useRechnungen()
  const pendingCount = rechnungen.filter(r => r.status !== 'bezahlt').length
  const [moreOpen, setMoreOpen] = useState(false)

  const TOP_ITEMS = isSetter ? SETTER_TOP_ITEMS : ADMIN_TOP_ITEMS

  // Group is open by default; stays toggled by user click
  const isAuftActive = AUFTRAEGE_CHILDREN.some(c => location.pathname.startsWith(c.path))
  const [auftOpen, setAuftOpen] = useState(true)

  const handleSignOut = async () => {
    await signOut()
    toast.success('Erfolgreich abgemeldet')
    navigate('/login')
  }

  const mobileMainItems = isSetter ? SETTER_TOP_ITEMS : MOBILE_ADMIN_MAIN
  const mobileMoreGroups = isSetter ? [] : MOBILE_ADMIN_MORE
  const isMoreActive = mobileMoreGroups.some(g => g.items.some(i => location.pathname.startsWith(i.path)))

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

          {isAdmin && (
            <>
              {/* Separator */}
              <div className="w-6 border-t border-border my-1" />

              {/* ── Aufträge collapsible group ── */}
              <div className="w-full flex flex-col items-center">
                <button
                  title="Aufträge"
                  onClick={() => setAuftOpen(v => !v)}
                  className={cn(
                    'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors group',
                    isAuftActive ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted'
                  )}
                >
                  <Briefcase size={20} />
                  <ChevronDown
                    size={10}
                    className={cn(
                      'absolute bottom-1 right-1 transition-transform duration-200',
                      auftOpen ? 'rotate-0' : '-rotate-90',
                      isAuftActive ? 'text-accent-500' : 'text-ink-subtle'
                    )}
                  />
                </button>

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
                            isActive ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted'
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
            </>
          )}
        </nav>

        {/* Notifications + User + Logout */}
        <div className="flex flex-col items-center gap-2 pb-4">
          <BenachrichtigungenPanel />
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
                'relative flex flex-col items-center gap-0.5 py-2 flex-1 min-w-0',
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
            <span className="text-[10px] font-medium leading-tight text-center hyphens-manual break-words w-full px-0.5">{label}</span>
          </NavLink>
        ))}

        {/* Weitere: bottom panel with all remaining pages */}
        <div className="flex flex-col items-center flex-1 min-w-0">
          <button
            onClick={() => setMoreOpen(v => !v)}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 w-full transition-colors',
              moreOpen || isMoreActive ? 'text-accent-600' : 'text-ink-muted'
            )}
          >
            {moreOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
            <span className="text-[10px] font-medium leading-tight">Weitere</span>
          </button>
        </div>
      </nav>

      <div
        className={cn(
          'md:hidden fixed inset-0 bg-black/30 z-40 transition-opacity duration-200',
          moreOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setMoreOpen(false)}
      />
      <div
        className={cn(
          'md:hidden fixed left-0 right-0 bottom-16 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-bg-surface border-t border-border shadow-lg px-4 pt-4 pb-3 transition-transform duration-200',
          moreOpen ? 'translate-y-0' : 'translate-y-[calc(100%+4rem)]'
        )}
      >
        {mobileMoreGroups.map(group => (
          <div key={group.title} className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle mb-2 px-1">{group.title}</p>
            <div className="grid grid-cols-4 gap-1">
              {group.items.map(({ icon: Icon, path, label }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 rounded-xl py-2 px-1 transition-colors',
                      isActive ? 'bg-accent-100 text-accent-600' : 'text-ink hover:bg-bg-muted'
                    )
                  }
                >
                  <Icon size={20} />
                  <span className="text-[11px] font-medium text-center leading-tight hyphens-manual break-words w-full">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={() => { setMoreOpen(false); handleSignOut() }}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 bg-accent-50 text-accent-600 text-sm font-medium"
        >
          <LogOut size={16} />
          Abmelden
        </button>
      </div>
    </>
  )
}
