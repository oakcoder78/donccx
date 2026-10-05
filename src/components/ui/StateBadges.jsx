import { Icons } from '../../lib/icons'

// Selos do faturamento (SDD §4.12). Regra de cor: ambar = acao pendente; verde
// so para quitada; azul para aberta e parcial; vermelho para vencida; cinza para
// consequencia. Cor nunca e a unica informacao: cada selo tem texto e icone.

const TONE = {
  amber: 'bg-status-amber-bg text-status-amber-text',
  red:   'bg-status-red-bg text-status-red-text',
  green: 'bg-status-green-bg text-status-green-text',
  blue:  'bg-status-blue-bg text-status-blue-text',
  slate: 'bg-status-slate-bg text-status-slate-text',
}

const BASE = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap'

export const INVOICE_STATE_META = {
  aberta:   { label: 'Aberta',   tone: 'blue',  Icon: Icons.Clock },
  parcial:  { label: 'Parcial',  tone: 'blue',  Icon: Icons.Minus },
  quitada:  { label: 'Quitada',  tone: 'green', Icon: Icons.CheckCircle },
  vencida:  { label: 'Vencida',  tone: 'red',   Icon: Icons.AlertCircle },
  cancelada:{ label: 'Cancelada', tone: 'slate', Icon: Icons.XCircle },
}

// `acao: true` = o que exige decisao do financeiro (ambar). O resto e consequencia.
export const MOTIVO_META = {
  sem_regra:        { label: 'Sem regra lançada',       tone: 'amber', Icon: Icons.AlertTriangle, acao: true },
  nao_fechada:      { label: 'Competência não fechada', tone: 'amber', Icon: Icons.Clock,         acao: true },
  valor_zero:       { label: 'Valor zero',              tone: 'slate', Icon: Icons.Minus },
  fora_janela:      { label: 'Fora da janela',          tone: 'slate', Icon: Icons.Calendar },
  antes_inicio:     { label: 'Antes do início',         tone: 'slate', Icon: Icons.ArrowLeft },
  usage_incomplete: { label: 'Uso incompleto',          tone: 'slate', Icon: Icons.HelpCircle },
}

export function InvoiceStateBadge({ state, className = '' }) {
  const meta = INVOICE_STATE_META[state]
  if (!meta) return null
  const { label, tone, Icon } = meta
  return (
    <span className={`${BASE} ${TONE[tone]} ${className}`} data-state={state}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  )
}

export function MotivoBadge({ motivo, className = '' }) {
  const meta = MOTIVO_META[motivo]
  if (!meta) return null
  const { label, tone, Icon } = meta
  return (
    <span className={`${BASE} ${TONE[tone]} ${className}`} data-motivo={motivo} data-acao={meta.acao ? 'true' : undefined}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  )
}
