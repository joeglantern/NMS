import { Navigate } from 'react-router-dom';
import { Role } from '../../types/api';
import { useAuthStore } from '../../stores/authStore';

interface RoleGuardProps {
  allowed: Role[];
  children: React.ReactNode;
}

export default function RoleGuard({ allowed, children }: RoleGuardProps) {
  const { token, user } = useAuthStore();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const activeRole = user.activeRole || user.role;

  if (!allowed.includes(activeRole)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
