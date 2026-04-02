import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { Button } from '../components/ui/Button'
import toast from 'react-hot-toast'

export default function SolicitarAcessoPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'csm' })
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name, role: form.role } }
      })
      if (error) throw error

      // Insert profile manually in case trigger isn't set up
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          name: form.name,
          email: form.email,
          role: form.role,
          status: 'pending',
        })
      }

      toast.success('Solicitação enviada! Aguarde aprovação do administrador.')
      navigate('/login')
    } catch (err) {
      toast.error(err.message || 'Erro ao solicitar acesso')
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
          <h1 className="text-lg font-semibold text-text-primary mb-5">Solicitar Acesso</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Nome completo</label>
              <input name="name" value={form.name} onChange={handleChange} required
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
                placeholder="Seu nome" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">E-mail</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} required
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
                placeholder="seu@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Senha</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} required minLength={6}
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
                placeholder="Min. 6 caracteres" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Perfil</label>
              <select name="role" value={form.role} onChange={handleChange}
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary">
                <option value="csm">CSM</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button type="submit" className="w-full justify-center" disabled={loading}>
              {loading ? 'Enviando...' : 'Solicitar Acesso'}
            </Button>
          </form>

          <p className="text-center text-sm text-text-tertiary mt-4">
            Já tem acesso?{' '}
            <Link to="/login" className="text-donc-sky hover:underline">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
