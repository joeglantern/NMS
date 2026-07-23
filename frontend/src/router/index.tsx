import { createBrowserRouter, Navigate } from 'react-router-dom';
import RoleGuard from '../components/shared/RoleGuard';
import AppShell from '../components/layout/AppShell';
import LoginPage from '../pages/auth/LoginPage';
import DashboardPage from '../pages/dispatcher/DashboardPage';
import QueuePage from '../pages/dispatcher/QueuePage';
import IncidentDetailPage from '../pages/dispatcher/IncidentDetailPage';
import FleetPage from '../pages/dispatcher/FleetPage';
import CallLogPage from '../pages/dispatcher/CallLogPage';
import NewIncidentWizard from '../pages/watcher/NewIncidentWizard';
import WatcherDashboardPage from '../pages/watcher/WatcherDashboardPage';
import UserManagementPage from '../pages/admin/UserManagementPage';
import SystemSettingsPage from '../pages/admin/SystemSettingsPage';
import AnalyticsPage from '../pages/admin/AnalyticsPage';
import PartnerDashboardPage from '../pages/partner/PartnerDashboardPage';
import PartnerCaseDetailPage from '../pages/partner/PartnerCaseDetailPage';
import FacilitiesPage from '../pages/admin/FacilitiesPage';
import PartnersPage from '../pages/admin/PartnersPage';
import BulkSmsPage from '../pages/admin/BulkSmsPage';
import NatureOptionsPage from '../pages/admin/NatureOptionsPage';
import GbvDashboardPage from '../pages/gbv/GbvDashboardPage';
import GbvCaseDetailPage from '../pages/gbv/GbvCaseDetailPage';

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
