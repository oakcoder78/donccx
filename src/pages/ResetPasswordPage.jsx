import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError]       = useState(null)
  const timeoutRef = useRef(null)

  useEffect(() => {
    async function activate(session) {
      if (!session) return
      await supabase.auth.signOut({ scope: 'others' })
      clearTimeout(timeoutRef.current)
      setShowForm(true)
    }

    // Verificar sessão já existente (Supabase pode ter processado o token antes da montagem)
    supabase.auth.getSession().then(({ data: { session } }) => activate(session))

    // Fallback: aguardar evento do Supabase (PASSWORD_RECOVERY ou SIGNED_IN via link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        activate(session)
      }
    })

    // Timeout de 15s como último recurso
    timeoutRef.current = setTimeout(() => {
      setError(prev => prev ?? 'Link inválido ou expirado. Solicite um novo e-mail de redefinição.')
    }, 15000)

    return () => {
      clearTimeout(timeoutRef.current)
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }

    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) { toast.error(updateError.message || 'Erro ao salvar senha'); return }

    await supabase.auth.signOut()
    toast.success('Senha redefinida! Faça login com sua nova senha.')
    setTimeout(() => navigate('/login'), 2000)
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
          <h1 className="text-lg font-semibold text-text-primary mb-1">Redefinir senha</h1>

          {error ? (
            <div className="space-y-4">
              <p className="text-sm text-donc-red">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2 px-4 border border-border-secondary text-sm text-text-secondary rounded-md hover:bg-bg-secondary transition-colors"
              >
                Voltar ao login
              </button>
            </div>
          ) : !showForm ? (
            <p className="text-sm text-text-tertiary text-center py-4">Verificando link...</p>
          ) : (
            <>
              <p className="text-sm text-text-tertiary mb-5">Digite e confirme sua nova senha.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder="mínimo 6 caracteres"
                    className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Confirmar senha</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    minLength={6}
                    placeholder="repita a senha"
                    className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-donc-navy text-white text-sm font-medium rounded-md hover:bg-donc-navy/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Salvando...' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
