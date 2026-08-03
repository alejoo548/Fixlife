import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminShell } from './layout/AdminShell';
import { Skeleton } from './components/AdminUI';

const OverviewModule = lazy(() => import('./modules/OverviewModule'));
const RequestsModule = lazy(() => import('./modules/RequestsModule'));
const UsersModule = lazy(() => import('./modules/UsersModule'));
const AdminsModule = lazy(() => import('./modules/AdminsModule'));
const ProsModule = lazy(() => import('./modules/ProsModule'));
const ServicesModule = lazy(() => import('./modules/ServicesModule'));
const ContentModule = lazy(() => import('./modules/ContentModule'));
const FinanceModule = lazy(() => import('./modules/FinanceModule'));
const TrustSafetyModule = lazy(() => import('./modules/TrustSafetyModule'));
const SupportModule = lazy(() => import('./modules/SupportModule'));
const ActivityModule = lazy(() => import('./modules/ActivityModule'));
const SettingsModule = lazy(() => import('./modules/SettingsModule'));
const AssistantModule = lazy(() => import('./modules/AssistantModule'));

const Loading = () => <Skeleton rows={6} />;
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<Loading />}>{children}</Suspense>;

export const AdminApp = ({ onClose }: { isOpen: boolean; onClose: () => void }) => <Routes>
  <Route element={<AdminShell onClose={onClose} />}>
    <Route index element={<Navigate to="/admin-dashboard/overview" replace />} />
    <Route path="overview" element={<Lazy><OverviewModule /></Lazy>} />
    <Route path="requests" element={<Lazy><RequestsModule /></Lazy>} />
    <Route path="users" element={<Lazy><UsersModule /></Lazy>} />
    <Route path="admins" element={<Lazy><AdminsModule /></Lazy>} />
    <Route path="pros" element={<Lazy><ProsModule /></Lazy>} />
    <Route path="services" element={<Lazy><ServicesModule /></Lazy>} />
    <Route path="content" element={<Lazy><ContentModule /></Lazy>} />
    <Route path="finance/*" element={<Lazy><FinanceModule /></Lazy>} />
    <Route path="trust-safety" element={<Lazy><TrustSafetyModule /></Lazy>} />
    <Route path="support" element={<Lazy><SupportModule /></Lazy>} />
    <Route path="activity" element={<Lazy><ActivityModule /></Lazy>} />
    <Route path="settings" element={<Lazy><SettingsModule /></Lazy>} />
    <Route path="assistant" element={<Lazy><AssistantModule /></Lazy>} />
    <Route path="*" element={<Navigate to="/admin-dashboard/overview" replace />} />
  </Route>
</Routes>;
