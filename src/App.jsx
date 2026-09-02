import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
import DashboardRoute from './pages/DashboardRoute'
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
import BriefPublicPage from './pages/BriefPublicPage'
import SettingsBriefTemplates from './pages/SettingsBriefTemplates'
import AtendimentoPage from './pages/AtendimentoPage'
import PrimeiroAcesso from './pages/PrimeiroAcesso'
import ModuleUnavailablePage from './pages/ModuleUnavailablePage'
import EmailViewPage from './pages/EmailViewPage'
import EmailUnsubscribePage from './pages/EmailUnsubscribePage'
import HealthDashboardPage from './pages/HealthDashboardPage'
import CockpitsPage from './pages/CockpitsPage'
import CsRadarPage from './pages/CsRadarPage'
import ProjectCockpitPage from './pages/ProjectCockpitPage'
import ProfissionaisCockpitPage from './pages/ProfissionaisCockpitPage'
import LabsDashboardPage from './pages/labs/LabsDashboardPage'
import EmpresasV2Page from './pages/labs/EmpresasV2Page'
import ClientFormPage from './pages/ClientFormPage'

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

function DonkieGuard() {
  const { effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  if (!isEnabled('donkie', effectiveRole)) return null
  return (
    <>
      <DonkiePanel />
      <DonkieButton />
    </>
  )
}

function AppLayout({ googleOAuthSignal }) {
  return (
    <DonkieProvider>
      <div className="min-h-screen bg-bg-secondary">
        <Navbar googleOAuthSignal={googleOAuthSignal} />
        <Outlet />
      </div>
      <DonkieGuard />
    </DonkieProvider>
  )
}

function PrivateRoute() {
  const { user, profile, effectiveRole, loading } = useAuth()
  const location = useLocation()
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()
  if (loading || flagsLoading) return null
  if (!user) return <Navigate to="/login" replace />

  if (!profile) return <Navigate to="/primeiro-acesso" replace />

  if (profile.status === 'pending') return <PendingPage status="pending" />
  if (profile.status === 'blocked') return <PendingPage status="blocked" />

  if (profile.status === 'invited') return <Navigate to="/primeiro-acesso" replace />

  const ageMs = Date.now() - new Date(profile.created_at).getTime()
  if (ageMs < 5 * 60 * 1000 && !profile.gender && !profile.avatar_url) {
    return <Navigate to="/primeiro-acesso" replace />
  }

  if (effectiveRole === 'analyst' && isEnabled('whatsapp_atendimento', effectiveRole) && !location.pathname.startsWith('/atendimento') && !location.pathname.startsWith('/dashboard')) {
    return <Navigate to="/atendimento" replace />
  }

  if (location.pathname.startsWith('/atendimento') && !isEnabled('whatsapp_atendimento', effectiveRole)) {
    return <Navigate to="/module-unavailable" replace />
  }

  return <Outlet />
}

function AdminRoute() {
  const { profile, effectiveRole } = useAuth()
  const { isEnabled, loading: flagsLoading } = useFeatureFlags()
  if (flagsLoading) return null
  // Use effectiveRole so impersonation previews correct access; original admin can still exit preview via banner
  if (effectiveRole !== 'admin' && effectiveRole !== 'manager') return <Navigate to="/dashboard" replace />
  if (effectiveRole === 'manager') {
    if (!isEnabled('settings_menu', effectiveRole)) return <Navigate to="/dashboard" replace />
    if (!isEnabled('api_donc', effectiveRole)) return <Navigate to="/dashboard" replace />
    if (!isEnabled('freshdesk', effectiveRole)) return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}

// Admin-strict guard (no manager branch, no flags) for /labs/dashboard —
// the legacy monolith kept as an admin parity reference. See labs-dashboard-sdd.md §1.3.
function AdminOnlyRoute() {
  const { effectiveRole } = useAuth()
  const { loading: flagsLoading } = useFeatureFlags()
  if (flagsLoading) return null
  if (effectiveRole !== 'admin') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

function AuthRedirect() {
  const { user, profile, effectiveRole, loading } = useAuth()
  if (loading) return null
  if (user && profile?.status === 'active') {
    return <Navigate to={effectiveRole === 'analyst' ? '/atendimento' : '/dashboard'} replace />
  }
  return <Outlet />
}

function AppRoutes() {
  const { loading } = useAuth()
  const location = useLocation()
  const [googleOAuthSignal, setGoogleOAuthSignal] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('google')
    if (g === 'success') return { success: true, error: null }
    if (g?.startsWith('error')) return { success: false, error: params.get('error_description') || g }
    return { success: false, error: null }
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('google')
    if (g === 'success') {
      setGoogleOAuthSignal({ success: true, error: null })
    } else if (g?.startsWith('error')) {
      setGoogleOAuthSignal({ success: false, error: params.get('error_description') || g })
    } else {
      setGoogleOAuthSignal(prev => (prev.success || prev.error) ? { success: false, error: null } : prev)
    }
  }, [location.search])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div>Carregando...</div>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public RMC */}
      <Route path="/r/:token" element={<ReportPublicPage />} />

      {/* Public Brief */}
      <Route path="/brief/:token" element={<BriefPublicPage />} />

      {/* Public email */}
      <Route path="/email/view/:token" element={<EmailViewPage />} />
      <Route path="/email/unsubscribe/:token" element={<EmailUnsubscribePage />} />

      {/* Public auth */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
      <Route element={<AuthRedirect />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/solicitar-acesso" element={<SolicitarAcessoPage />} />
      </Route>

      {/* Protected — AppLayout (Navbar + Donkie) + PrivateRoute gate */}
      <Route element={<PrivateRoute />}>
        <Route element={<AppLayout googleOAuthSignal={googleOAuthSignal} />}>
          <Route path="/module-unavailable" element={<ModuleUnavailablePage variant="no-access" />} />
          <Route path="/atendimento" element={<AtendimentoPage />} />
          <Route path="/dashboard" element={<DashboardRoute />} />
          <Route element={<AdminOnlyRoute />}>
            <Route path="/labs/dashboard" element={<LabsDashboardPage />} />
            <Route path="/labs/empresas_v2" element={<EmpresasV2Page />} />
            <Route path="/labs/empresas_v2/:id/editar" element={<EmpresasV2Page />} />
          </Route>
          <Route path="/cockpits" element={<CockpitsPage />} />
          <Route path="/health" element={<HealthDashboardPage />} />
          <Route path="/cs-radar" element={<CsRadarPage />} />
          <Route path="/projetos-cockpit" element={<ProjectCockpitPage />} />
          <Route path="/profissionais-cockpit" element={<ProfissionaisCockpitPage />} />
          <Route path="/empresas/nova" element={<ClientFormPage />} />
          <Route path="/empresas/:id/editar" element={<ClientFormPage />} />
          <Route path="/empresas" element={<ClientsPage />} />
          <Route path="/empresas/:id" element={<ClientDetail />} />
          <Route path="/empresas/:clientId/relatorios/:reportId/editar" element={<ReportEditorPage />} />
          <Route path="/contatos" element={<ContactsPage />} />
          <Route path="/atividades" element={<ActivitiesPage />} />
          <Route path="/projetos" element={<ProjectsPage />} />
          <Route path="/projetos/:id" element={<OnboardingDetailPage />} />

          <Route element={<AdminRoute />}>
            <Route path="/configuracoes" element={<SettingsPage />} />
            <Route path="/config/brief-templates" element={<SettingsBriefTemplates />} />
            <Route path="/config/freshdesk/pendentes" element={<FreshdeskPendingPage />} />
            <Route path="/config/donc-api/pendentes" element={<DoncAPIPendentes />} />
          </Route>
        </Route>
      </Route>

      {/* Legacy redirects */}
      <Route path="/clientes" element={<Navigate to="/empresas" replace />} />
      <Route path="/clientes/:id" element={<Navigate to="/empresas" replace />} />

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
