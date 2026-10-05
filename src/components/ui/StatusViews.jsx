import { Icons } from '../../lib/icons'
import { Button } from './Button'

// Estados de tela do faturamento (SDD §4.13). Vazio explica o motivo; erro
// oferece nova tentativa por refetch (nunca reload da pagina); somente leitura
// mostra por que nao se pode editar.

// Vazio: `reason` e o motivo, exibido como rotulo pequeno em maiusculas.
export function EmptyState({ reason, title, description, action = null, icon: Icon = Icons.Info }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-border-secondary p-5">
      {reason && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{reason}</span>
      )}
      <div className="flex items-center gap-2 text-text-primary">
        <Icon size={16} aria-hidden="true" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      {description && <p className="text-sm text-text-secondary">{description}</p>}
      {action}
    </div>
  )
}

// Erro com nova tentativa. `onRetry` deve chamar o refetch da query.
export function ErrorState({ title = 'Não foi possível carregar.', message, onRetry, retryLabel = 'Tentar novamente' }) {
  return (
    <div role="alert" className="flex items-center gap-3 rounded-lg border border-status-red-line bg-status-red-bg p-4">
      <Icons.AlertCircle size={18} className="text-status-red-text shrink-0" aria-hidden="true" />
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-status-red-text">{title}</span>
        {message && <span className="text-xs text-status-red-text">{message}</span>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <Icons.RefreshCw size={14} aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

// Somente leitura, com o motivo visivel: quem nao pode editar precisa saber por que.
export function ReadOnlyBanner({ reason = 'Seu perfil não tem permissão de escrita no financeiro.' }) {
  return (
    <div role="status" className="flex items-center gap-3 rounded-lg border border-status-amber-line bg-status-amber-bg px-4 py-3">
      <Icons.Lock size={16} className="text-status-amber-text shrink-0" aria-hidden="true" />
      <span className="text-sm text-status-amber-text">
        <strong className="font-semibold">Somente leitura.</strong> {reason}
      </span>
    </div>
  )
}
