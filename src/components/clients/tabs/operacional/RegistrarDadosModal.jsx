import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import {
  useClientUsageMutations,
  useClientSupport,
  useClientSupportMutations,
} from '@/hooks/useClient'
import { supabase } from '@/lib/supabaseClient'
import toast from 'react-hot-toast'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthLong(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = [
    'janeiro','fevereiro','março','abril','maio','junho',
    'julho','agosto','setembro','outubro','novembro','dezembro',
  ]
  return `${months[parseInt(m) - 1]} de ${y}`
}

export function RegistrarDadosModal({ client, initialMonth, onClose }) {
  const qc = useQueryClient()
  const [month, setMonth] = useState(initialMonth || currentMonth())
  const [saving, setSaving] = useState(false)

  // USO
  const [osVal,    setOsVal]    = useState('')
  const [usersVal, setUsersVal] = useState('')

  // SUPORTE
  const [openedVal,   setOpenedVal]   = useState('')
  const [resolvedVal, setResolvedVal] = useState('')
  const [slaVal,      setSlaVal]      = useState('')
  const [n1Val,       setN1Val]       = useState('')
  const [n2Val,       setN2Val]       = useState('')
  const [n3Val,       setN3Val]       = useState('')

  // FINANCEIRO — inicializa do valor atual do cliente (campo global, não por mês)
  const [delayActive,   setDelayActive]   = useState((client.delay_days ?? 0) > 0)
  const [delayDaysVal,  setDelayDaysVal]  = useState(
    (client.delay_days ?? 0) > 0 ? String(client.delay_days) : ''
  )

  const [errors, setErrors] = useState({})

  const { upsert: upsertUsage }   = useClientUsageMutations()
  const { upsert: upsertSupport } = useClientSupportMutations()
  const { data: supportData = [] } = useClientSupport(client.id)
  const usageData = client.client_usage || []

  // Auto-fill uso/suporte quando mês muda
  useEffect(() => {
    const uso = usageData.find(u => u.ref_month === month)
    setOsVal(uso    ? String(uso.os_created    ?? '') : '')
    setUsersVal(uso ? String(uso.active_users  ?? '') : '')

    const sup = supportData.find(s => s.ref_month === month)
    setOpenedVal(sup   ? String(sup.tickets_opened     ?? '') : '')
    setResolvedVal(sup ? String(sup.tickets_resolved   ?? '') : '')
    setSlaVal(sup      ? String(sup.sla_first_response ?? '') : '')
    setN1Val(sup       ? String(sup.n1_pct ?? '') : '')
    setN2Val(sup       ? String(sup.n2_pct ?? '') : '')
    setN3Val(sup       ? String(sup.n3_pct ?? '') : '')
    setErrors({})
  }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  function validate() {
    const errs = {}
    if (osVal    !== '' && (isNaN(Number(osVal))    || Number(osVal)    < 0)) errs.os    = 'Número válido'
    if (usersVal !== '' && (isNaN(Number(usersVal)) || Number(usersVal) < 0)) errs.users = 'Número válido'
    if (openedVal   !== '' && (isNaN(Number(openedVal))   || Number(openedVal)   < 0)) errs.opened   = 'Número válido'
    if (resolvedVal !== '' && (isNaN(Number(resolvedVal)) || Number(resolvedVal) < 0)) errs.resolved = 'Número válido'
    if (delayActive && delayDaysVal !== '' && (isNaN(Number(delayDaysVal)) || Number(delayDaysVal) < 0)) errs.delay = 'Número válido'
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const saves = []

      if (osVal !== '' || usersVal !== '') {
        saves.push(upsertUsage.mutateAsync({
          client_id:    client.id,
          ref_month:    month,
          os_created:   Number(osVal)    || 0,
          active_users: Number(usersVal) || 0,
          pending:      month === currentMonth(),
          partial_day:  month === currentMonth() ? new Date().getDate() : null,
        }))
      }

      if (openedVal !== '' || resolvedVal !== '') {
        saves.push(upsertSupport.mutateAsync({
          client_id:          client.id,
          ref_month:          month,
          tickets_opened:     Number(openedVal)   || 0,
          tickets_resolved:   Number(resolvedVal) || 0,
          sla_first_response: slaVal !== '' ? Number(slaVal) : 0,
          n1_pct:             n1Val  !== '' ? Number(n1Val)  : 0,
          n2_pct:             n2Val  !== '' ? Number(n2Val)  : 0,
          n3_pct:             n3Val  !== '' ? Number(n3Val)  : 0,
        }))
      }

      // Financeiro: sempre persiste delay_days junto com os demais saves
      const newDelayDays = delayActive ? (Number(delayDaysVal) || 0) : 0
      saves.push(
        supabase
          .from('clients')
          .update({ delay_days: newDelayDays })
          .eq('id', client.id)
          .then(({ error }) => { if (error) throw error })
      )

      await Promise.all(saves)
      qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Dados salvos')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title="Registrar Dados do Mês" maxWidth="max-w-2xl">
      <div className="space-y-5">

        {/* Mês de Referência */}
        <div>
          <label className="label-sm">Mês de Referência</label>
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="input-base"
            />
            {month && (
              <span className="text-sm text-text-tertiary capitalize">{fmtMonthLong(month)}</span>
            )}
          </div>
        </div>

        {/* Seção USO */}
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-donc-sky inline-block" />
            Uso
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">OS Criadas</label>
              <input
                type="number" value={osVal} min="0" placeholder="—"
                onChange={e => { setOsVal(e.target.value); setErrors(p => ({ ...p, os: undefined })) }}
                className={`input-base w-full ${errors.os ? 'border-red-400' : ''}`}
              />
              {errors.os && <p className="text-xs text-red-500 mt-0.5">{errors.os}</p>}
            </div>
            <div>
              <label className="label-sm">Usuários Ativos</label>
              <input
                type="number" value={usersVal} min="0" placeholder="—"
                onChange={e => { setUsersVal(e.target.value); setErrors(p => ({ ...p, users: undefined })) }}
                className={`input-base w-full ${errors.users ? 'border-red-400' : ''}`}
              />
              {errors.users && <p className="text-xs text-red-500 mt-0.5">{errors.users}</p>}
            </div>
          </div>
        </div>

        {/* Seção SUPORTE */}
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-donc-red inline-block" />
            Suporte
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label-sm">Tickets Abertos</label>
              <input
                type="number" value={openedVal} min="0" placeholder="—"
                onChange={e => { setOpenedVal(e.target.value); setErrors(p => ({ ...p, opened: undefined })) }}
                className={`input-base w-full ${errors.opened ? 'border-red-400' : ''}`}
              />
              {errors.opened && <p className="text-xs text-red-500 mt-0.5">{errors.opened}</p>}
            </div>
            <div>
              <label className="label-sm">Tickets Resolvidos</label>
              <input
                type="number" value={resolvedVal} min="0" placeholder="—"
                onChange={e => { setResolvedVal(e.target.value); setErrors(p => ({ ...p, resolved: undefined })) }}
                className={`input-base w-full ${errors.resolved ? 'border-red-400' : ''}`}
              />
              {errors.resolved && <p className="text-xs text-red-500 mt-0.5">{errors.resolved}</p>}
            </div>
            <div>
              <label className="label-sm">SLA 1ª Resp. (min)</label>
              <input
                type="number" value={slaVal} min="0" placeholder="—"
                onChange={e => setSlaVal(e.target.value)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label-sm">N1 (tickets)</label>
              <input
                type="number" value={n1Val} min="0" placeholder="—"
                onChange={e => setN1Val(e.target.value)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label-sm">N2 (tickets)</label>
              <input
                type="number" value={n2Val} min="0" placeholder="—"
                onChange={e => setN2Val(e.target.value)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label-sm">N3 (tickets)</label>
              <input
                type="number" value={n3Val} min="0" placeholder="—"
                onChange={e => setN3Val(e.target.value)}
                className="input-base w-full"
              />
            </div>
          </div>
        </div>

        {/* Seção FINANCEIRO */}
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Financeiro
          </p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setDelayActive(v => !v)
                  if (delayActive) setDelayDaysVal('')
                }}
                className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${delayActive ? 'bg-amber-500' : 'bg-border-secondary'}`}
              >
                <span className={`block w-3 h-3 bg-white rounded-full shadow mx-1 transition-transform ${delayActive ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-sm text-text-secondary">Cliente com atraso no pagamento este mês?</span>
            </div>
            {delayActive && (
              <div className="w-40">
                <label className="label-sm">Dias de atraso</label>
                <input
                  type="number"
                  value={delayDaysVal}
                  min="1"
                  placeholder="—"
                  onChange={e => { setDelayDaysVal(e.target.value); setErrors(p => ({ ...p, delay: undefined })) }}
                  className={`input-base w-full ${errors.delay ? 'border-red-400' : ''}`}
                />
                {errors.delay && <p className="text-xs text-red-500 mt-0.5">{errors.delay}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
