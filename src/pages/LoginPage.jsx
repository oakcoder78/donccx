import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  const [forgotOpen, setForgotOpen]     = useState(false)
  const [resetEmail, setResetEmail]     = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) toast.error(error.message || 'Erro ao fazer login')
    setLoading(false)
  }

  async function handleGoogle() {
    const { error } = await signInWithGoogle()
    if (error) toast.error(error.message || 'Erro ao entrar com Google')
  }

  async function handleResetSubmit(e) {
    e.preventDefault()
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: 'https://donccx.vercel.app/reset-password',
    })
    setResetLoading(false)
    if (error) {
      toast.error(error.message || 'Erro ao enviar email de recuperação')
      return
    }
    setResetSent(true)
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0.5 mb-2">
            <span className="text-donc-lime font-bold text-3xl">donc</span>
            <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
          </div>
          <p className="text-text-tertiary text-sm">Customer Success Platform</p>
        </div>

        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary mb-5">Entrar</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-text-secondary">Senha</label>
                <button
                  type="button"
                  onClick={() => { setForgotOpen(o => !o); setResetSent(false) }}
                  className="text-xs text-donc-sky hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                placeholder="••••••••"
              />
            </div>

            {/* Recuperação de senha inline */}
            {forgotOpen && (
              <div className="rounded-md border border-border-tertiary bg-bg-secondary p-3 space-y-2">
                {resetSent ? (
                  <p className="text-xs text-donc-lime text-center py-1">
                    Verifique seu email — enviamos um link para redefinir sua senha.
                  </p>
                ) : (
                  <form onSubmit={handleResetSubmit} className="space-y-2">
                    <p className="text-xs text-text-tertiary">Informe seu email para receber o link de recuperação.</p>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required
                      placeholder="seu@email.com"
                      className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                    />
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="w-full py-2 px-3 bg-donc-sky text-white text-xs font-medium rounded-md hover:bg-donc-sky/90 disabled:opacity-50 transition-colors"
                    >
                      {resetLoading ? 'Enviando...' : 'Enviar link de recuperação'}
                    </button>
                  </form>
                )}
              </div>
            )}

            <Button type="submit" className="w-full justify-center" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border-tertiary" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-bg-primary px-2 text-text-tertiary">ou</span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-border-secondary rounded-md text-sm text-text-secondary hover:bg-bg-secondary transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Entrar com Google
          </button>

          <p className="text-center text-sm text-text-tertiary mt-4">
            Sem acesso?{' '}
            <Link to="/solicitar-acesso" className="text-donc-sky hover:underline">Solicitar acesso</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
