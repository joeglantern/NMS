import { Bell, SignOut, List, Phone, Sun, Moon, MagnifyingGlass } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import NotificationDrawer from '../shared/NotificationDrawer';
import { useNavigate, Link } from 'react-router-dom';
import { useActiveCalls } from '../../hooks/useActiveCalls';

interface TopBarProps {
  onToggleSidebar: () => void;
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
}

export default function TopBar({ onToggleSidebar, theme, onThemeToggle }: TopBarProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [clock, setClock] = useState('');

  const { notifications } = useNotificationStore();
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeCalls = useActiveCalls();
  const user = useAuthStore((s) => s.user);
  const canSeeCalls = user && ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(user.role);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setShow(!(currentScrollY > lastScrollY && currentScrollY > 60));
      setLastScrollY(currentScrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header
        className="topbar"
        style={{ transform: show ? 'none' : 'translateY(-100%)', transition: 'transform .3s' }}
      >
        {/* Left: hamburger (mobile) + search */}
        <button
          onClick={onToggleSidebar}
          className="icon-btn"
          style={{ border: 0, background: 'transparent' }}
          title="Toggle sidebar"
        >
          <List size={20} weight="bold" />
        </button>

        <div className="searchbox" style={{ display: 'flex' }}>
          <MagnifyingGlass size={16} />
          <input placeholder="Search incidents, units…" />
        </div>

        {/* Push everything else right */}
        <div style={{ flex: 1 }} />

        {/* Clock chip */}
        {clock && (
          <div className="status-chip mono tnum">
            {clock}
          </div>
        )}

        {/* Active calls indicator */}
        {canSeeCalls && activeCalls.length > 0 && (
          <Link
            to="/call-logs"
            className="status-chip"
            style={{ gap: 6, textDecoration: 'none', color: 'var(--blue)', background: 'var(--blue-soft)', borderColor: 'color-mix(in srgb, var(--blue) 18%, transparent)' }}
          >
            <span style={{ width: 7, height: 7, borderRadius: '99px', background: 'var(--blue)', display: 'inline-block', animation: 'pulse-ring 2s infinite' }} />
            <Phone size={13} weight="fill" />
            {activeCalls.length} active call{activeCalls.length > 1 ? 's' : ''}
          </Link>
        )}

        {/* Theme toggle */}
        <button className="icon-btn" onClick={onThemeToggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Notifications */}
        <button
          className="icon-btn"
          style={{ position: 'relative' }}
          onClick={() => setIsNotificationOpen(true)}
          title="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute', top: 6, right: 6,
                width: 8, height: 8, borderRadius: '99px',
                background: 'var(--red)', border: '1.5px solid var(--surface)',
              }}
            />
          )}
        </button>

        {/* Sign out */}
        <button
          className="icon-btn"
          onClick={handleSignOut}
          title="Sign Out"
          style={{ borderColor: 'transparent' }}
        >
          <SignOut size={18} weight="bold" />
        </button>
      </header>

      <NotificationDrawer isOpen={isNotificationOpen} onClose={() => setIsNotificationOpen(false)} />
    </>
  );
}
