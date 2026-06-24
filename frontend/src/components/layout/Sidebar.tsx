import { useAuthStore } from '../../stores/authStore';
import {
  SquaresFour,
  WarningCircle,
  MapTrifold,
  ListBullets,
  Users,
  Gear,
  ChartLineUp,
  Phone,
  ClipboardText,
  ShieldCheck,
  List,
  Hospital,
  Tag,
} from '@phosphor-icons/react';
import { useActiveCalls } from '../../hooks/useActiveCalls';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { label: 'Dashboard', path: '/dashboard', Icon: SquaresFour, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
  { label: 'Incident Feed', path: '/queue', Icon: ListBullets, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
  { label: 'Fleet Management', path: '/fleet', Icon: MapTrifold, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
  { label: 'Call Logs', path: '/call-logs', Icon: Phone, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
  { label: 'Personnel', path: '/admin/users', Icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Facilities', path: '/admin/facilities', Icon: Hospital, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Nature Options', path: '/admin/nature-options', Icon: Tag, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'Analytics', path: '/admin/analytics', Icon: ChartLineUp, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER'] },
  { label: 'System Settings', path: '/admin/settings', Icon: Gear, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { label: 'My Alerts', path: '/watcher', Icon: ClipboardText, roles: ['WATCHER'] },
  { label: 'New Incident', path: '/watcher/new-incident', Icon: WarningCircle, roles: ['WATCHER'] },
  { label: 'Partner Dashboard', path: '/partner/dashboard', Icon: SquaresFour, roles: ['PARTNER'] },
];

export default function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const activeCalls = useActiveCalls();

  const visibleItems = navItems.filter((item) => user && item.roles.includes(user.role));
  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.role?.charAt(0) ?? 'U';

  return (
    <>
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
        {/* Brand header */}
        <div className="sidebar-head">
          <div className="crest">
            <ShieldCheck weight="fill" />
          </div>
          <div className="brand-text">
            <b>NMS-EOC</b>
            <span>Command Centre</span>
          </div>
          <button
            onClick={onToggleCollapse}
            style={{ marginLeft: 'auto', background: 'transparent', border: 0, color: 'var(--nav-muted)', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <List size={18} />
          </button>
        </div>

        {/* Nav scroll */}
        <nav className="nav-scroll">
          <div className="nav-group">
            <div className="nav-group-label">Navigation</div>
            {visibleItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              const hasCallBadge = item.path === '/call-logs' && activeCalls.length > 0;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item${isActive ? ' active' : ''}`}
                >
                  <item.Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                  <span className="nav-label">{item.label}</span>
                  {hasCallBadge && (
                    <span className="nav-badge">{activeCalls.length}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User footer */}
        <div className="sidebar-foot">
          <div className="sidebar-user">
            <div className="av av-sm" style={{ background: 'var(--green)' }}>{initials}</div>
            <div className="sidebar-user-meta">
              <b>{user?.name ?? 'Operator'}</b>
              <span>{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="bottomnav">
        {visibleItems.slice(0, 5).map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const hasCallBadge = item.path === '/call-logs' && activeCalls.length > 0;
          return (
            <Link key={item.path} to={item.path} className={`bn-item${isActive ? ' on' : ''}`}>
              {hasCallBadge && <span className="bn-badge" />}
              <item.Icon size={22} weight={isActive ? 'fill' : 'regular'} />
              <span>{item.label.split(' ')[0]}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}