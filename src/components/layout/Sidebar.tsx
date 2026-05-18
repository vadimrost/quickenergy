import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowUpFromLine, LogOut, ReceiptText, Users, Tag } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { icon: ReceiptText, path: '/', label: 'Rechnungen', end: true, badge: true },
  { icon: ArrowUpFromLine, path: '/exports', label: 'Exports', end: false },
  { icon: Users, path: '/mitarbeiter', label: 'Mitarbeiter', end: false },
  { icon: Tag, path: '/kategorien', label: 'Kategorien', end: false },
]

function getInitials(email: string): string {
  return email.slice(0, 2).toUpperCase()
}

export function Sidebar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { data: rechnungen = [] } = useRechnungen()
  const pendingCount = rechnungen.filter(r => r.status === 'eingegangen').length

  const handleSignOut = async () => {
    await signOut()
    toast.success('Erfolgreich abgemeldet')
    navigate('/login')
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-16 bg-bg-surface border-r border-border flex-col items-center py-0 z-50">
        {/* Logo */}
        <NavLink to="/" className="h-16 flex items-center justify-center w-full">
          <img src="/logo.svg" alt="QuickEnergy" className="w-10 h-10" />
        </NavLink>

        <div className="h-8" />

        {/* Nav */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ icon: Icon, path, label, end, badge }) => (
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
        </nav>

        {/* Bottom: avatar + logout */}
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

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-surface border-t border-border flex items-center justify-around z-50">
        {NAV_ITEMS.map(({ icon: Icon, path, label, end, badge }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 py-2 px-6',
                isActive ? 'text-accent-600' : 'text-ink-muted'
              )
            }
          >
            <div className="relative">
              <Icon size={22} />
              {badge && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-danger text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-0.5 py-2 px-6 text-ink-muted"
        >
          <LogOut size={22} />
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </nav>
    </>
  )
}
