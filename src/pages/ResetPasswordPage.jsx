import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword]     = useState('')
  const [confirm, setConfirm]       = useState('')
  const [loading, setLoading]       = useState(false)
  const [ready, setReady]           = useState(false)

  // O Supabase redireciona com o token no hash (#access_token=...).
  // onAuthStateChange captura o evento PASSWORD_RECOVERY e estabelece a sessão.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })

    // Se já há sessão ativa (usuário chegou aqui logado pelo link), libera direto
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 8) { toast.error('A senha deve ter ao menos 8 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) { toast.error(error.message || 'Erro ao salvar senha'); return }

    toast.success('Senha alterada com sucesso!')
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0.5 mb-2">
            <span className="text-donc-lime font-bold text-3xl">donc</span>
            <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
          </div>
          <p className="text-text-tertiary text-sm">Customer Success Platform</p>
        </div>

        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-text-primary mb-1">Redefinir senha</h1>
          <p className="text-sm text-text-tertiary mb-5">Digite e confirme sua nova senha.</p>

          {!ready ? (
            <p className="text-sm text-text-tertiary text-center py-4">Validando link...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nova senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="mínimo 8 caracteres"
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
                  minLength={8}
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
          )}
        </div>
      </div>
    </div>
  )
}
