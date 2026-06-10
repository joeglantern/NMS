import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Role } from '../../types/api';

const ROLE_ROUTES: Record<Role, string> = {
  SUPER_ADMIN: '/admin/users',
  ADMIN: '/admin/users',
  DISPATCHER: '/dashboard',
  WATCHER: '/watcher/new-incident',
  PARTNER: '/partner/dashboard',
  DRIVER: '/dashboard',
  EMT: '/dashboard',
  NURSE: '/dashboard',
};

const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER'];

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: 'bg-purple-600',
  ADMIN: 'bg-brand-teal',
  DISPATCHER: 'bg-status-info',
  WATCHER: 'bg-status-warning',
  PARTNER: 'bg-brand-green',
  DRIVER: 'bg-slate-500',
  EMT: 'bg-slate-500',
  NURSE: 'bg-slate-500',
};

export default function DevRoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const { user, setRole } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [pendingNav, navigate]);

  if (!user) return null;

  const switchTo = (role: Role) => {
    setRole(role);
    setOpen(false);
    setPendingNav(ROLE_ROUTES[role]);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-2">
      {open && (
        <div className="bg-[#1a2327] border border-brand-teal/30 rounded-2xl shadow-2xl p-4 flex flex-col gap-2 min-w-[200px]">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Switch Role</p>
          {ROLES.map(role => (
            <button
              key={role}
              onClick={() => switchTo(role)}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${
                user.role === role
                  ? `${ROLE_COLORS[role]} text-white shadow-md`
                  : 'text-slate-400 hover:bg-white/5'
              }`}
            >
              {user.role === role && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>}
              {role.replace('_', ' ')}
            </button>
          ))}
          <div className="border-t border-white/10 mt-1 pt-2 space-y-1">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest text-center">UI navigation only</p>
            <p className="text-[8px] text-slate-600 text-center leading-tight">API permissions use your login role — log in as that user to test API features</p>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="bg-[#1a2327] border border-brand-teal/40 text-brand-green font-black text-[10px] uppercase tracking-widest px-4 py-3 rounded-2xl shadow-2xl hover:border-brand-green transition-all flex items-center gap-2"
      >
        <span className={`w-2 h-2 rounded-full ${ROLE_COLORS[user.role]} animate-pulse`}></span>
        {user.role.replace('_', ' ')}
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
    </div>
  );
}
