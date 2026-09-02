import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const GENDER_OPTIONS = [
  { value: '',          label: '— Prefiro não informar —' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino',  label: 'Feminino' },
  { value: 'outro',     label: 'Prefiro não informar' },
]

function parseHashError() {
  const hash = window.location.hash || ''
  const search = window.location.search || ''
  const combined = `${search}&${hash.replace(/^#/, '')}`
  const params = new URLSearchParams(combined)
  const error = params.get('error')
  const errorCode = params.get('error_code')
  const errorDesc = params.get('error_description')
  if (error || errorCode || errorDesc) {
    return { error, errorCode, errorDesc, raw: combined }
  }
  return null
}

export default function PrimeiroAcesso() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [gender, setGender]               = useState(profile?.gender || '')
  const [phone, setPhone]                 = useState(profile?.phone || '')
  const [avatarFile, setAvatarFile]       = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [password, setPassword]           = useState('')
  const [confirm, setConfirm]             = useState('')
  const [errors, setErrors]               = useState({})
  const [saving, setSaving]               = useState(false)

  // OTP / session handling
  const [checking, setChecking]           = useState(true)
  const [hashError, setHashError]         = useState(null)
  const [sessionReady, setSessionReady]   = useState(false)
  const [resendEmail, setResendEmail]     = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [resendSent, setResendSent]       = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => {
    setGender(profile?.gender || '')
    setPhone(profile?.phone || '')
  }, [profile?.gender, profile?.phone])

  useEffect(() => {
    if (profile?.status === 'active') {
      navigate(profile.role === 'analyst' ? '/atendimento' : '/dashboard', { replace: true })
    }
  }, [profile])

  // Detect hash errors + handle PKCE / session
  useEffect(() => {
    const hashErr = parseHashError()
    if (hashErr) {
      const isExpired = hashErr.errorCode === 'otp_expired'
        || (hashErr.errorDesc || '').toLowerCase().includes('expired')
        || hashErr.error === 'access_denied'
      if (isExpired || hashErr.errorCode || hashErr.error) {
        console.warn('[PrimeiroAcesso] hash error detected:', hashErr)
        setHashError({
          code: hashErr.errorCode || hashErr.error || 'otp_expired',
          message: decodeURIComponent((hashErr.errorDesc || '').replace(/\+/g, ' ')) || 'Link inválido ou expirado.',
        })
        setChecking(false)
        // clean URL without reload (keep path, drop hash/search error)
        try {
          const url = new URL(window.location.href)
          url.hash = ''
          // only clean if it was an auth error, keep other search params if any
          if (url.searchParams.has('error') || url.searchParams.has('error_code')) {
            url.searchParams.delete('error')
            url.searchParams.delete('error_code')
            url.searchParams.delete('error_description')
          }
          window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        } catch {}
        return
      }
    }

    // Try PKCE code exchange if ?code= present (Supabase PKCE flow)
    const urlParams = new URLSearchParams(window.location.search)
    const hasCode = urlParams.has('code')

    async function init() {
      if (hasCode) {
        try {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href)
          if (error) {
            console.warn('[PrimeiroAcesso] exchangeCodeForSession error:', error.message)
            // don't set hard error yet — let fallback handle
          } else {
            console.log('[PrimeiroAcesso] PKCE code exchanged successfully')
            setSessionReady(true)
            setHashError(null)
            // clean ?code from URL
            try {
              const url = new URL(window.location.href)
              url.searchParams.delete('code')
              window.history.replaceState({}, '', url.pathname + url.search + url.hash)
            } catch {}
          }
        } catch (e) {
          console.warn('[PrimeiroAcesso] exchangeCodeForSession exception:', e?.message)
        }
      }

      // Check existing session (hash #access_token flow already handled by supabase-js detectSessionInUrl)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        console.log('[PrimeiroAcesso] session found:', session.user.email)
        setSessionReady(true)
        setHashError(null)
        setChecking(false)
        // prefill resend email for convenience
        setResendEmail(prev => prev || session.user.email || '')
        return
      }

      // Wait for onAuthStateChange (SIGNED_IN / PASSWORD_RECOVERY / etc)
      // Fallback timeout
      timeoutRef.current = setTimeout(() => {
        // If still no session and no hash error, show checking done but allow form
        // (invite link with implicit flow should have set session by now)
        setChecking(false)
        // If no user and no explicit hash error, we are in unauthenticated state
        // Don't force error — let user see resend CTA if they try to save
        console.log('[PrimeiroAcesso] session check timeout — no session found')
      }, 3500)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[PrimeiroAcesso] onAuthStateChange:', event, session?.user?.email || 'no session')
      if (session?.user) {
        clearTimeout(timeoutRef.current)
        setSessionReady(true)
        setHashError(null)
        setChecking(false)
        setResendEmail(prev => prev || session.user.email || '')
      }
      // Supabase may emit SIGNED_OUT when hash contained error — keep hashError
    })

    return () => {
      clearTimeout(timeoutRef.current)
      subscription.unsubscribe()
    }
  }, [])

  // Prefill resendEmail from user when available
  useEffect(() => {
    if (user?.email && !resendEmail) setResendEmail(user.email)
    if (user?.id) {
      setSessionReady(true)
      setChecking(false)
    }
  }, [user?.email, user?.id])

  const metaName    = user?.user_metadata?.name || user?.email || ''
  const displayName = (profile?.name || metaName).split(' ')[0]
  const currentAvatar = avatarPreview || profile?.avatar_url || null

  function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  function validate() {
    const errs = {}
    if (!password) {
      errs.password = 'Senha é obrigatória'
    } else if (password.length < 6) {
      errs.password = 'Senha deve ter no mínimo 6 caracteres'
    }
    if (!confirm) {
      errs.confirm = 'Confirmação de senha é obrigatória'
    } else if (confirm !== password) {
      errs.confirm = 'As senhas não coincidem'
    }
    return errs
  }

  async function handleResend() {
    const email = (resendEmail || user?.email || '').trim()
    if (!email) {
      toast.error('Informe seu e-mail para reenviar o convite.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('E-mail inválido.')
      return
    }
    setResendLoading(true)
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend-invite`
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) {
        const msg = data?.error || `Erro ao reenviar (HTTP ${res.status})`
        // Friendly handling for rate limit
        if (res.status === 429 || /too many|rate limit/i.test(msg)) {
          throw new Error('Limite de envios atingido. Aguarde alguns minutos e tente novamente. Se o limite de 2 e-mails/hora estiver ativo no Dashboard, peça a um admin para reenviar.')
        }
        throw new Error(msg)
      }
      setResendSent(true)
      toast.success(`Convite reenviado para ${email}. Verifique sua caixa de entrada (e spam).`)
    } catch (e) {
      console.error('[PrimeiroAcesso] resend error:', e)
      toast.error(e.message || 'Erro ao reenviar convite')
    } finally {
      setResendLoading(false)
    }
  }

  async function handleSave() {
    if (!user?.id) {
      console.warn('[PrimeiroAcesso] handleSave blocked — no user session (hashError:', hashError, ')')
      toast.error('Sessão expirada ou inválida. Solicite um novo convite abaixo.')
      if (!hashError) {
        setHashError({ code: 'no_session', message: 'Sessão expirada. Solicite um novo convite com seu e-mail.' })
      }
      return
    }
    const errs = validate()
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) {
        const msg = (pwError.message || '').toLowerCase()
        const isSamePassword = pwError.status === 422
          || msg.includes('different')
          || msg.includes('same password')
          || msg.includes('should be different')
        if (isSamePassword) {
          console.warn('[PrimeiroAcesso] updateUser same-password ignored:', pwError.message)
        } else {
          throw pwError
        }
      }

      const patch = {
        name:   profile?.name || metaName,
        email:  user.email,
        status: 'active',
        gender: gender || null,
        phone:  phone.trim() || null,
      }

      if (avatarFile) {
        const ext  = avatarFile.name.split('.').pop()
        const path = `${user.id}/avatar.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(path)
          patch.avatar_url = publicUrl
        }
      }

      const { data: updatedRows, error: profileError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('id')
      if (profileError) throw profileError
      if (!updatedRows || updatedRows.length === 0) {
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({ id: user.id, ...patch, role: profile?.role || 'csm' })
        if (insertError) throw insertError
      }

      await supabase
        .from('access_requests')
        .update({ status: 'approved' })
        .eq('email', user.email)

      await supabase.auth.signOut()
      toast.success('Perfil configurado! Faça login com sua nova senha.')
      navigate('/login', { replace: true })
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar perfil')
    } finally {
      setSaving(false)
    }
  }

  // ── Render: error state (otp_expired / no session) ───────────────────────
  if (hashError) {
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
            <h1 className="text-lg font-semibold text-text-primary mb-1">Link expirado</h1>
            <p className="text-sm text-text-tertiary mb-1">
              {hashError.message}
            </p>
            <p className="text-xs text-text-tertiary mb-5">
              Links de convite expiram em 1 hora e são de uso único. Solicite um novo convite abaixo — use o mesmo e-mail do convite original.
            </p>

            {resendSent ? (
              <div className="rounded-md bg-green-50 border border-green-200 p-3 mb-4">
                <p className="text-sm text-green-700 font-medium">Convite reenviado!</p>
                <p className="text-xs text-green-600 mt-1">Verifique sua caixa de entrada e spam. Use apenas o link mais recente.</p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Seu e-mail</label>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
                />
              </div>
              <button
                onClick={handleResend}
                disabled={resendLoading || resendSent}
                className="w-full py-2 px-4 bg-donc-navy text-white rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                {resendLoading ? 'Enviando...' : resendSent ? 'Convite reenviado ✓' : 'Reenviar convite'}
              </button>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full py-2 px-4 border border-border-secondary text-sm text-text-secondary rounded-md hover:bg-bg-secondary transition-colors"
              >
                Voltar ao login
              </button>
              <p className="text-xs text-text-tertiary text-center">
                Se o limite de 2 e-mails/hora estiver ativo, o reenvio pode falhar — peça a um administrador para reenviar em <em>Configurações &gt; Usuários &gt; Convites enviados</em>.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: checking session ─────────────────────────────────────────────
  if (checking && !sessionReady && !user?.id) {
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
            <p className="text-sm text-text-tertiary text-center py-4">Verificando convite...</p>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: normal form ──────────────────────────────────────────────────
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
          <h1 className="text-lg font-semibold text-text-primary mb-1">
            Bem-vindo(a), {displayName}!
          </h1>
          <p className="text-sm text-text-tertiary mb-5">
            Configure seu perfil e defina sua senha para começar.
          </p>

          <div className="space-y-4">
            {/* Foto de perfil */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-donc-navy flex items-center justify-center border-2 border-border-tertiary flex-shrink-0">
                {currentAvatar
                  ? <img src={currentAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  : <span className="text-white font-bold text-2xl">
                      {(profile?.name || metaName || 'U')[0].toUpperCase()}
                    </span>
                }
              </div>
              <label className="cursor-pointer text-xs text-donc-sky hover:underline">
                {currentAvatar ? 'Alterar foto de perfil' : 'Adicionar foto de perfil'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>

            {/* Gênero */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Gênero</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm bg-bg-primary focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
              >
                {GENDER_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky"
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Defina sua senha de acesso <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })) }}
                placeholder="Mínimo 6 caracteres"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky ${errors.password ? 'border-red-400' : 'border-border-secondary'}`}
              />
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password}</p>
              )}
            </div>

            {/* Confirmar senha */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Confirmar senha <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: undefined })) }}
                placeholder="Repita a senha"
                className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky ${errors.confirm ? 'border-red-400' : 'border-border-secondary'}`}
              />
              {errors.confirm && (
                <p className="text-xs text-red-500 mt-1">{errors.confirm}</p>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-2 px-4 bg-donc-navy text-white rounded-md text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Completar perfil'}
            </button>

            {!sessionReady && !user?.id && (
              <p className="text-xs text-amber-600 text-center">
                Sessão não detectada. Se seu link expirou, use o reenvio — feche e reabra o link mais recente do e-mail.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
