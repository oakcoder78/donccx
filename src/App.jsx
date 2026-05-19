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
import BriefPublicPage from './pages/BriefPublicPage'
import SettingsBriefTemplates from './pages/SettingsBriefTemplates'
import AtendimentoPage from './pages/AtendimentoPage'
import PrimeiroAcesso from './pages/PrimeiroAcesso'
import HealthDashboardPage from './pages/HealthDashboardPage'

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
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const { isEnabled } = useFeatureFlags()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />

  if (!profile) return <Navigate to="/primeiro-acesso" replace />

  if (profile.status === 'pending') return <PendingPage status="pending" />
  if (profile.status === 'blocked') return <PendingPage status="blocked" />

  if (profile.status === 'invited') return <Navigate to="/primeiro-acesso" replace />

  const ageMs = Date.now() - new Date(profile.created_at).getTime()
  if (ageMs < 5 * 60 * 1000 && !profile.gender && !profile.avatar_url) {
    return <Navigate to="/primeiro-acesso" replace />
  }

  if (profile.role === 'analyst' && !location.pathname.startsWith('/atendimento')) {
    return <Navigate to="/atendimento" replace />
  }

  if (location.pathname.startsWith('/atendimento') && !isEnabled('whatsapp_atendimento', profile?.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
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
    return <Navigate to={profile?.role === 'analyst' ? '/atendimento' : '/dashboard'} replace />
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
          <Route path="/atendimento" element={<AtendimentoPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/health" element={<HealthDashboardPage />} />
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
