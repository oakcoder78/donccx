import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Navbar } from './components/layout/Navbar'
import { DonkieProvider } from './hooks/useDonkie'
import { DonkiePanel } from './components/donkie/DonkiePanel'
import { DonkieButton } from './components/donkie/DonkieButton'
import { useFeatureFlags } from './hooks/useFeatureFlags'

import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SolicitarAcessoPage from './pages/SolicitarAcessoPage'
import PendingPage from './pages/PendingPage'
import DashboardPage from './pages/Dashboard'
import ClientsPage from './components/clients/ClientsPage'
import ClientDetail from './components/clients/ClientDetail'
import ContactsPage from './components/contacts/ContactsPage'
import ActivitiesPage from './components/activities/ActivitiesPage'
import ProjectsPage from './components/projects/ProjectsPage'
import OnboardingDetailPage from './pages/OnboardingDetailPage'
import SettingsPage from './components/settings/SettingsPage'
import FreshdeskPendingPage from './pages/FreshdeskPendingPage'
import DoncAPIPendentes from './pages/DoncAPIPendentes'
import ReportEditorPage from './pages/ReportEditorPage'
import ReportPublicPage from './pages/ReportPublicPage'
import AtendimentoPage from './pages/AtendimentoPage'
import PrimeiroAcesso from './pages/PrimeiroAcesso'
import DesignSystemTest from './pages/DesignSystemTest'

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

// Renderiza o Donkie apenas se a feature flag estiver habilitada para o perfil do usuário
function DonkieGuard() {
  const { profile } = useAuth()
  const { isEnabled } = useFeatureFlags()
  if (!isEnabled('donkie', profile?.role)) return null
  return (
    <>
      <DonkiePanel />
      <DonkieButton />
    </>
  )
}

// Layout autenticado — inclui Navbar + Donkie (condicional via feature flag)
function AppLayout() {
  return (
    <DonkieProvider>
      <div className="min-h-screen bg-bg-secondary">
        <Navbar />
        <Outlet />
      </div>
      <DonkieGuard />
    </DonkieProvider>
  )
}

function PrivateRoute() {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const { isEnabled } = useFeatureFlags()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  // Profile ainda carregando após onAuthStateChange — aguardar silenciosamente
  if (!profile) return <Navigate to="/primeiro-acesso" replace />

  if (profile.status === 'pending') return <PendingPage status="pending" />
  if (profile.status === 'blocked') return <PendingPage status="blocked" />

  // Convidado que ainda não completou o primeiro acesso
  if (profile.status === 'invited') return <Navigate to="/primeiro-acesso" replace />

  // Perfil recém-criado sem setup (ex: acesso liberado diretamente sem passar pelo fluxo)
  const ageMs = Date.now() - new Date(profile.created_at).getTime()
  if (ageMs < 5 * 60 * 1000 && !profile.gender && !profile.avatar_url) {
    return <Navigate to="/primeiro-acesso" replace />
  }

  // Analyst só pode acessar /atendimento
  if (profile.role === 'analyst' && !location.pathname.startsWith('/atendimento')) {
    return <Navigate to="/atendimento" replace />
  }

  // Gate para /atendimento via feature flag
  if (location.pathname.startsWith('/atendimento') && !isEnabled('whatsapp_atendimento', profile?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <AppLayout />
}

function AdminRoute() {
  const { profile } = useAuth()
  const { isEnabled } = useFeatureFlags()
  if (profile?.role !== 'admin' && profile?.role !== 'manager') return <Navigate to="/dashboard" replace />
  if (profile?.role === 'manager') {
    if (!isEnabled('settings_menu', profile?.role)) return <Navigate to="/dashboard" replace />
    if (!isEnabled('api_donc', profile?.role)) return <Navigate to="/dashboard" replace />
    if (!isEnabled('freshdesk', profile?.role)) return <Navigate to="/dashboard" replace />
  }
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
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
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
        <Route path="/projetos/:id" element={<OnboardingDetailPage />} />
        <Route path="/design-test" element={<DesignSystemTest />} />

        <Route element={<AdminRoute />}>
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="/config/freshdesk/pendentes" element={<FreshdeskPendingPage />} />
          <Route path="/config/donc-api/pendentes" element={<DoncAPIPendentes />} />
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
