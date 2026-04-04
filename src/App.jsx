import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Navbar } from './components/layout/Navbar'
import { VersionBadge } from './components/ui/VersionBadge'

import LoginPage from './pages/LoginPage'
import SolicitarAcessoPage from './pages/SolicitarAcessoPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './components/dashboard/DashboardPage'
import ClientsPage from './components/clients/ClientsPage'
import ClientDetail from './components/clients/ClientDetail'
import ContactsPage from './components/contacts/ContactsPage'
import ActivitiesPage from './components/activities/ActivitiesPage'
import ProjectsPage from './components/projects/ProjectsPage'
import SettingsPage from './components/settings/SettingsPage'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      retry: 1,
    },
  },
})

function AppLayout() {
  return (
    <div className="min-h-screen bg-bg-secondary">
      <Navbar />
      <Outlet />
    </div>
  )
}

function PrivateRoute() {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (profile?.status === 'pending') return <PendingPage status="pending" />
  if (profile?.status === 'blocked') return <PendingPage status="blocked" />
  return <AppLayout />
}

function AdminRoute() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function AuthRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return null
  if (user && profile?.status === 'active') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function AppRoutes() {
  const { loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div>Carregando...</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public routes */}
      <Route element={<AuthRedirect />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/solicitar-acesso" element={<SolicitarAcessoPage />} />
      </Route>

      {/* Protected routes */}
      <Route element={<PrivateRoute />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/empresas" element={<ClientsPage />} />
        <Route path="/empresas/:id" element={<ClientDetail />} />
        {/* Legacy redirects */}
        <Route path="/clientes" element={<Navigate to="/empresas" replace />} />
        <Route path="/clientes/:id" element={<Navigate to="/empresas" replace />} />
        <Route path="/contatos" element={<ContactsPage />} />
        <Route path="/atividades" element={<ActivitiesPage />} />
        <Route path="/projetos" element={<ProjectsPage />} />

        <Route element={<AdminRoute />}>
          <Route path="/configuracoes" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <VersionBadge />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
