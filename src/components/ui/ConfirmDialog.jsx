import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

// Confirmacao de acao irreversivel (SDD §4.7, §4.15). Nunca window.confirm.
// `summary` mostra o que vai acontecer; `children` recebe campos extras (ex.:
// "emitir substituta"). Com requireReason, o motivo e obrigatorio e o botao de
// confirmar so libera quando ele tem o minimo de caracteres.
//
// variant: 'danger' (cancelar, encerrar) | 'warning' (baixa por perda).
export function ConfirmDialog({
  open,
  title,
  description,
  summary = null,
  children = null,
  requireReason = true,
  reasonLabel = 'Motivo',
  reasonHint = 'Fica registrado na auditoria.',
  minReason = 10,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  variant = 'danger',
  busy = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState('')

  useEffect(() => { if (open) setReason('') }, [open])

  if (!open) return null

  const trimmed = reason.trim()
  const reasonTooShort = requireReason && trimmed.length < minReason
  const reasonId = 'confirm-reason'
  const reasonErrId = 'confirm-reason-err'
  const canConfirm = !busy && !reasonTooShort

  return (
    <Modal isOpen={open} onClose={onClose} title={title} maxWidth="max-w-lg">
      <div className="flex flex-col gap-4">
        {description && <p className="text-sm text-text-secondary">{description}</p>}

        {summary && (
          <div className="rounded-md border border-border-tertiary bg-bg-secondary p-3 text-sm text-text-primary">
            {summary}
          </div>
        )}

        {children}

        {requireReason && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-sm font-semibold text-text-primary">
              {reasonLabel} <span className="text-status-red-text font-normal">(obrigatório)</span>
            </label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              aria-invalid={reasonTooShort && reason.length > 0 ? 'true' : undefined}
              aria-describedby={reasonErrId}
              className="w-full px-3 py-2 text-sm rounded-md border border-border-secondary focus:outline-2 focus:outline-donc-blue"
            />
            <span id={reasonErrId} className="text-xs text-text-secondary">
              {reasonTooShort && reason.length > 0
                ? `Mínimo de ${minReason} caracteres.`
                : `${reasonHint} Mínimo de ${minReason} caracteres.`}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button
            variant={variant}
            disabled={!canConfirm}
            onClick={() => onConfirm?.({ reason: trimmed })}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
