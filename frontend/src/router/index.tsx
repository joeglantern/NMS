import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import RoleGuard from '../components/shared/RoleGuard';
import AppShell from '../components/layout/AppShell';
import LoginPage from '../pages/auth/LoginPage';

// Heavy authenticated pages are code-split so they load on demand (keeps the
// initial bundle small). The Suspense boundary lives in AppShell.
const DashboardPage = lazy(() => import('../pages/dispatcher/DashboardPage'));
const QueuePage = lazy(() => import('../pages/dispatcher/QueuePage'));
const IncidentDetailPage = lazy(() => import('../pages/dispatcher/IncidentDetailPage'));
const FleetPage = lazy(() => import('../pages/dispatcher/FleetPage'));
const CallLogPage = lazy(() => import('../pages/dispatcher/CallLogPage'));
const NewIncidentWizard = lazy(() => import('../pages/watcher/NewIncidentWizard'));
const WatcherDashboardPage = lazy(() => import('../pages/watcher/WatcherDashboardPage'));
const UserManagementPage = lazy(() => import('../pages/admin/UserManagementPage'));
const SystemSettingsPage = lazy(() => import('../pages/admin/SystemSettingsPage'));
const AnalyticsPage = lazy(() => import('../pages/admin/AnalyticsPage'));
const PartnerDashboardPage = lazy(() => import('../pages/partner/PartnerDashboardPage'));
const PartnerCaseDetailPage = lazy(() => import('../pages/partner/PartnerCaseDetailPage'));
const FacilitiesPage = lazy(() => import('../pages/admin/FacilitiesPage'));
const PartnersPage = lazy(() => import('../pages/admin/PartnersPage'));
const BulkSmsPage = lazy(() => import('../pages/admin/BulkSmsPage'));
const NatureOptionsPage = lazy(() => import('../pages/admin/NatureOptionsPage'));
const GbvDashboardPage = lazy(() => import('../pages/gbv/GbvDashboardPage'));
const GbvCaseDetailPage = lazy(() => import('../pages/gbv/GbvCaseDetailPage'));

// Placeholder components for unimplemented pages
const Unauthorized = () => <div className="p-10 font-sans font-bold text-status-danger text-center">Unauthorized Access</div>;

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: 'admin/users',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <UserManagementPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/facilities',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <FacilitiesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/partners',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <PartnersPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/sms',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <BulkSmsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/nature-options',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <NatureOptionsPage />
          </RoleGuard>
        ),
      },
      
      {
        path: 'admin/settings',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN']}>
            <SystemSettingsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/analytics',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER']}>
            <AnalyticsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <DashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'queue',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <QueuePage />
          </RoleGuard>
        ),
      },
      {
        path: 'incidents/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'PARTNER']}>
            <IncidentDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'fleet',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <FleetPage />
          </RoleGuard>
        ),
      },
      {
        path: 'call-logs',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <CallLogPage />
          </RoleGuard>
        ),
      },
      {
        path: 'watcher',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER']}>
            <WatcherDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'watcher/new-incident',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'WATCHER', 'DISPATCHER']}>
            <NewIncidentWizard />
          </RoleGuard>
        ),
      },
      {
        path: 'partner/dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'PARTNER']}>
            <PartnerDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'partner/incidents/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'PARTNER']}>
            <PartnerCaseDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'gbv/dashboard',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <GbvDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'gbv/cases/:id',
        element: (
          <RoleGuard allowed={['SUPER_ADMIN', 'ADMIN', 'DISPATCHER']}>
            <GbvCaseDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: '*',
        element: <div className="p-10 font-sans font-bold text-slate-text text-center">Page Not Found</div>,
      },
    ],
  },
]);
