import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserSwitch } from '@phosphor-icons/react';
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

/**
 * Role switcher — lives as an icon in the top bar. Switches the UI role for
 * navigation/preview only (API permissions still follow the logged-in user).
 */
export default function DevRoleSwitcher() {
  const [open, setOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const { user, setRole } = useAuthStore();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingNav) {
      navigate(pendingNav);
      setPendingNav(null);
    }
  }, [pendingNav, navigate]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!user) return null;

  const switchTo = (role: Role) => {
    setRole(role);
    setOpen(false);
    setPendingNav(ROLE_ROUTES[role]);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="icon-btn"
        style={{ position: 'relative' }}
        onClick={() => setOpen((o) => !o)}
        title={`Role: ${user.role.replace('_', ' ')} — switch (UI preview)`}
      >
        <UserSwitch size={18} />
        <span
          className={ROLE_COLORS[user.role]}
          style={{
            position: 'absolute', top: 6, right: 6,
            width: 8, height: 8, borderRadius: '99px',
            border: '1.5px solid var(--surface)',
          }}
        />
      </button>

      {open && (
        <div
          className="rounded-2xl shadow-2xl p-3 flex flex-col gap-1.5"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 9999,
            minWidth: 210, background: 'var(--surface)', border: '1px solid var(--border)',
          }}
        >
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 px-1" style={{ color: 'var(--muted)' }}>
            Switch Role
          </p>
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => switchTo(role)}
              className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${
                user.role === role ? `${ROLE_COLORS[role]} text-white shadow-md` : ''
              }`}
              style={user.role === role ? undefined : { color: 'var(--muted)' }}
              onMouseEnter={(e) => { if (user.role !== role) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={(e) => { if (user.role !== role) e.currentTarget.style.background = 'transparent'; }}
            >
              {user.role === role && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              {role.replace('_', ' ')}
            </button>
          ))}
          <div className="mt-1 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-[8px] text-center leading-tight" style={{ color: 'var(--muted-2)' }}>
              UI navigation only — API permissions use your login role
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
