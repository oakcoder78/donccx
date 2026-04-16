import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/ui/Button'
import toast from 'react-hot-toast'

export default function SolicitarAcessoPage() {
  const [form, setForm]       = useState({ name: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = await supabase
        .from('access_requests')
        .insert({ name: form.name.trim(), email: form.email.trim().toLowerCase() })
      if (error) {
        // Erro de email duplicado — mensagem amigável
        if (error.code === '23505') {
          toast.error('Este e-mail já tem uma solicitação em andamento.')
        } else {
          throw error
        }
        return
      }
      setSent(true)
    } catch (err) {
      toast.error(err.message || 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-0.5 mb-2">
            <span className="text-donc-lime font-bold text-3xl">donc</span>
            <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
          </div>
        </div>

        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-6 shadow-sm">
          {sent ? (
            <div className="text-center py-4 space-y-3">
              <div className="text-3xl">✅</div>
              <h2 className="text-base font-semibold text-text-primary">Solicitação enviada!</h2>
              <p className="text-sm text-text-tertiary">
                Você receberá um email quando seu acesso for aprovado.
              </p>
              <Link to="/login" className="block text-sm text-donc-sky hover:underline mt-4">
                Voltar para o login
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-text-primary mb-5">Solicitar Acesso</h1>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Nome completo
                  </label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    required
                    placeholder="Seu nome"
                    className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    E-mail
                  </label>
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    placeholder="seu@email.com"
                    className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
                  />
                </div>
                <Button type="submit" className="w-full justify-center" disabled={loading}>
                  {loading ? 'Enviando...' : 'Solicitar Acesso'}
                </Button>
              </form>

              <p className="text-center text-sm text-text-tertiary mt-4">
                Já tem acesso?{' '}
                <Link to="/login" className="text-donc-sky hover:underline">Entrar</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
