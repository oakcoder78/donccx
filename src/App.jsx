import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Navbar } from './components/layout/Navbar'
import { DonkieProvider } from './hooks/useDonkie'
import { DonkiePanel } from './components/donkie/DonkiePanel'
import { DonkieButton } from './components/donkie/DonkieButton'

import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SolicitarAcessoPage from './pages/SolicitarAcessoPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './components/dashboard/DashboardPage'
import ClientsPage from './components/clients/ClientsPage'
import ClientDetail from './components/clients/ClientDetail'
import ContactsPage from './components/contacts/ContactsPage'
import ActivitiesPage from './components/activities/ActivitiesPage'
import ProjectsPage from './components/projects/ProjectsPage'
import SettingsPage from './components/settings/SettingsPage'
import FreshdeskPendingPage from './pages/FreshdeskPendingPage'
import ReportEditorPage from './pages/ReportEditorPage'
import ReportPublicPage from './pages/ReportPublicPage'
import AtendimentoPage from './pages/AtendimentoPage'

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

// Layout autenticado — inclui Navbar + Donkie
function AppLayout() {
  return (
    <DonkieProvider>
      <div className="min-h-screen bg-bg-secondary">
        <Navbar />
        <Outlet />
      </div>
      <DonkiePanel />
      <DonkieButton />
    </DonkieProvider>
  )
}

function PrivateRoute() {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (profile?.status === 'pending') return <PendingPage status="pending" />
  if (profile?.status === 'blocked') return <PendingPage status="blocked" />
  // Analyst só pode acessar /atendimento
  if (profile?.role === 'analyst' && !location.pathname.startsWith('/atendimento')) {
    return <Navigate to="/atendimento" replace />
  }
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
  if (user && profile?.status === 'active') {
    // Analyst vai direto para /atendimento ao fazer login
    return <Navigate to={profile?.role === 'analyst' ? '/atendimento' : '/dashboard'} replace />
  }
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

      {/* Rota pública do RMC — sem autenticação, sem Navbar */}
      <Route path="/r/:token" element={<ReportPublicPage />} />

      {/* Public auth routes */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route element={<AuthRedirect />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/solicitar-acesso" element={<SolicitarAcessoPage />} />
      </Route>

      {/* Protected routes — dentro do AppLayout (Navbar + Donkie) */}
      <Route element={<PrivateRoute />}>
        <Route path="/atendimento" element={<AtendimentoPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/empresas" element={<ClientsPage />} />
        <Route path="/empresas/:id" element={<ClientDetail />} />
        <Route path="/empresas/:clientId/relatorios/:reportId/editar" element={<ReportEditorPage />} />
        {/* Legacy redirects */}
        <Route path="/clientes"     element={<Navigate to="/empresas" replace />} />
        <Route path="/clientes/:id" element={<Navigate to="/empresas" replace />} />
        <Route path="/contatos"     element={<ContactsPage />} />
        <Route path="/atividades"   element={<ActivitiesPage />} />
        <Route path="/projetos"     element={<ProjectsPage />} />

        <Route element={<AdminRoute />}>
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="/config/freshdesk/pendentes" element={<FreshdeskPendingPage />} />
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
