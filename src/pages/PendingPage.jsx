import { useAuth } from '../contexts/AuthContext'

export default function PendingPage({ status }) {
  const { signOut } = useAuth()

  const isPending = status === 'pending'

  return (
    <div className="min-h-screen bg-bg-secondary flex items-center justify-center p-4">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center gap-0.5 mb-6">
          <span className="text-donc-lime font-bold text-3xl">donc</span>
          <span className="text-donc-navy/40 font-bold text-3xl">CX</span>
        </div>
        <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isPending ? 'bg-donc-amber/15' : 'bg-donc-red/15'}`}>
          <span className="text-2xl">{isPending ? '⏳' : '🚫'}</span>
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-2">
          {isPending ? 'Aguardando aprovação' : 'Acesso bloqueado'}
        </h2>
        <p className="text-text-tertiary text-sm mb-6">
          {isPending
            ? 'Sua solicitação foi recebida e está aguardando aprovação do administrador.'
            : 'Sua conta foi bloqueada. Entre em contato com o administrador.'}
        </p>
        <button onClick={signOut} className="text-sm text-donc-sky hover:underline">
          Voltar ao login
        </button>
      </div>
    </div>
  )
}
