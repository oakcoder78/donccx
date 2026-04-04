import { useState, useEffect } from 'react'
import { Modal } from '../../../ui/Modal'
import { Button } from '../../../ui/Button'
import {
  useClientUsageMutations,
  useClientSupport,
  useClientSupportMutations,
} from '../../../../hooks/useClient'

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
  const [month, setMonth] = useState(initialMonth || currentMonth())

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

  const [errors, setErrors] = useState({})

  const { upsert: upsertUsage }   = useClientUsageMutations()
  const { upsert: upsertSupport } = useClientSupportMutations()
  const { data: supportData = [] } = useClientSupport(client.id)
  const usageData = client.client_usage || []

  // Auto-fill when month or data changes
  useEffect(() => {
    const uso = usageData.find(u => u.ref_month === month)
    setOsVal(uso    ? String(uso.os_created    ?? '') : '')
    setUsersVal(uso ? String(uso.active_users  ?? '') : '')

    const sup = supportData.find(s => s.ref_month === month)
    setOpenedVal(sup   ? String(sup.tickets_opened    ?? '') : '')
    setResolvedVal(sup ? String(sup.tickets_resolved  ?? '') : '')
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
    return errs
  }

  async function handleSave() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    const saves = []

    if (osVal !== '' || usersVal !== '') {
      saves.push(upsertUsage.mutateAsync({
        client_id:    client.id,
        ref_month:    month,
        os_created:   Number(osVal)    || 0,
        active_users: Number(usersVal) || 0,
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

    await Promise.all(saves)
    onClose()
  }

  const isSaving = upsertUsage.isPending || upsertSupport.isPending

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

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
