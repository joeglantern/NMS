import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { jwtRole } from '../../lib/jwt';

export default function RoleGuard({ allowed, children }: { allowed: string[]; children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);

  // Not logged in at all → send to login
  if (!token) return <Navigate to="/login" replace />;

  // Token exists but role not loaded yet → wait (don't redirect to login!)
  if (!role) return null;

  // The dev role switcher overrides `role` locally for UI preview only (see
  // DevRoleSwitcher) — it never changes the account's real login role. That
  // preview override must never lock the real account out of a page its true
  // role is allowed to reach, so the actual JWT role always wins first.
  const realRole = jwtRole(token);
  if (realRole && allowed.includes(realRole)) return <>{children}</>;

  // Logged in but wrong role → show unauthorized
  if (!allowed.includes(role)) return <Navigate to="/unauthorized" replace />;

  return <>{children}</>;
}
