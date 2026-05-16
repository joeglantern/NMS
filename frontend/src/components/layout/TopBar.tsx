import { Bell, ShieldCheck, SignOut, List, Phone } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import NotificationDrawer from '../shared/NotificationDrawer';
import { useNavigate, Link } from 'react-router-dom';
import { useActiveCalls } from '../../hooks/useActiveCalls';

interface TopBarProps {
  onToggleSidebar: () => void;
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  
  const { notifications } = useNotificationStore();
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const unreadCount = notifications.filter(n => !n.read).length;
  const activeCalls = useActiveCalls();
  const user = useAuthStore(s => s.user);
  const canSeeCalls = user && ['SUPER_ADMIN', 'ADMIN', 'DISPATCHER'].includes(user.role);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setShow(false);
      } else {
        setShow(true);
      }
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
      <header className={`flex justify-between items-center w-full px-4 sm:px-8 h-[60px] sticky top-0 z-40 bg-white border-b border-surface-border transition-transform duration-300 ${show ? 'translate-y-0' : '-translate-y-full'}`}>
        <div className="flex items-center gap-3">
          {/* Hamburger button — visible only on mobile */}
          <button 
            onClick={onToggleSidebar}
            className="lg:hidden text-brand-teal hover:bg-slate-100 p-2 rounded-lg transition-all"
          >
            <List size={24} weight="bold" />
          </button>
          <div className="bg-brand-sidebar p-1.5 rounded-lg hidden sm:flex">
            <ShieldCheck size={20} weight="fill" className="text-brand-green" />
          </div>
          <h1 className="font-semibold text-brand-teal text-sm">
            <span className="hidden md:inline">Emergency Operations Centre</span>
            <span className="md:hidden">NMS EOC</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 sm:gap-6">
          {/* Active call indicator */}
          {canSeeCalls && activeCalls.length > 0 && (
            <Link
              to="/call-logs"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all"
            >
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <Phone size={14} weight="fill" />
              {activeCalls.length} active call{activeCalls.length > 1 ? 's' : ''}
            </Link>
          )}
          <div className="flex items-center gap-1 sm:gap-2 sm:border-l border-surface-border sm:pl-6">
            <button 
              className="relative text-slate-500 hover:text-brand-teal hover:bg-slate-100 p-2 sm:p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center"
              onClick={() => setIsNotificationOpen(true)}
              title="Notifications"
            >
              <Bell size={22} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-danger opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-status-danger border-2 border-white"></span>
                </span>
              )}
            </button>
            <button
              onClick={handleSignOut}
              title="Sign Out"
              className="text-slate-500 hover:text-status-danger hover:bg-status-danger/10 p-2 sm:p-2.5 rounded-full transition-all cursor-pointer flex items-center justify-center"
            >
              <SignOut size={22} weight="bold" />
            </button>
          </div>
        </div>
      </header>
      <NotificationDrawer isOpen={isNotificationOpen} onClose={() => setIsNotificationOpen(false)} />
    </>
  );
}
