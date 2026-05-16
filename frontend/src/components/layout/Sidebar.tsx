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
  X
} from '@phosphor-icons/react';
import { useActiveCalls } from '../../hooks/useActiveCalls';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();
  const activeCalls = useActiveCalls();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: SquaresFour, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
    { label: 'Incident Feed', path: '/queue', icon: ListBullets, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
    { label: 'Fleet Management', path: '/fleet', icon: MapTrifold, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
    { label: 'Call Logs', path: '/call-logs', icon: Phone, roles: ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'] },
    { label: 'Personnel', path: '/admin/users', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { label: 'Analytics', path: '/admin/analytics', icon: ChartLineUp, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { label: 'System Settings', path: '/admin/settings', icon: Gear, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { label: 'New Incident', path: '/watcher/new-incident', icon: WarningCircle, roles: ['WATCHER'] },
    { label: 'Partner Dashboard', path: '/partner/dashboard', icon: SquaresFour, roles: ['PARTNER'] },
  ];

  const visibleItems = navItems.filter((item) => user && item.roles.includes(user.role));

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden" 
          onClick={onClose} 
        />
      )}

      <aside className={`
        flex flex-col h-screen fixed left-0 top-0 z-50 w-[260px] bg-brand-sidebar text-white shadow-xl border-r border-slate-700/50
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        {/* Header Profile */}
        <div className="p-6 pt-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-green/20 border border-brand-green flex items-center justify-center text-brand-green font-bold text-lg shadow-sm shrink-0">
              {user?.name?.charAt(0) || user?.role?.charAt(0) || 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <p className="text-sm font-semibold text-white/90 truncate">
                {user?.name || 'Operator'}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
          {/* Close button on mobile */}
          <button 
            onClick={onClose}
            className="lg:hidden text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all"
          >
            <X size={22} weight="bold" />
          </button>
        </div>

        <nav className="flex-1 mt-6 flex flex-col gap-1.5 px-3 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-semibold ${
                  isActive
                    ? 'bg-brand-green text-white shadow-md'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <item.icon size={22} weight={isActive ? 'fill' : 'regular'} />
                <span className="text-sm tracking-wide flex-1">{item.label}</span>
                {item.path === '/call-logs' && activeCalls.length > 0 && (
                  <span className="flex items-center gap-1 text-xs font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    {activeCalls.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-6 border-t border-white/5 bg-black/10">
          <div className="flex items-center justify-between text-white/60">
            <span className="text-xs font-bold uppercase tracking-widest">System Status</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-brand-green">Syncing</span>
              <div className="w-2 h-2 rounded-full bg-brand-green animate-pulse shadow-[0_0_8px_rgba(136,194,65,0.8)]"></div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
