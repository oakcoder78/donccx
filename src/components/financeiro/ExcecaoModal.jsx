import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useContractSeries } from '@/hooks/useContractCharges'
import { useBillingExceptions } from '@/hooks/useBillingExceptions'
import { Icons } from '@/lib/icons'
import { formatBRL4 } from '@/lib/contractRules'

const TYPE_OPTIONS = [
  { value: 'isencao_total', label: 'Isenção total (não cobrar)' },
  { value: 'desconto_percent', label: 'Desconto percentual (%)' },
  { value: 'valor_reduzido', label: 'Valor reduzido (R$/mês)' },
  { value: 'desconto_unidade', label: 'Desconto por licença/OS (R$)' },
]

const KIND_LABELS = { original: 'Contrato original', aditivo: 'Aditivo', renegociacao: 'Renegociação' }

function firstDayOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function defaultValidTo() {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function ExcecaoModal({ open, onClose, clientId, clientName, excecao = null, onSaved }) {
  const { profile } = useAuth()
  const qc = useQueryClient()
  const { data: series = [] } = useContractSeries(clientId)
  const { data: existing = [] } = useBillingExceptions(clientId)

  const [scope, setScope] = useState('')
  const [type, setType] = useState('isencao_total')
  const [percent, setPercent] = useState('')
  const [reducedValue, setReducedValue] = useState('')
  const [unitDiscount, setUnitDiscount] = useState('')
  const [validFrom, setValidFrom] = useState(firstDayOfMonth())
  const [validTo, setValidTo] = useState(defaultValidTo())
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setScope(excecao?.series_id || '')
    setType(excecao?.type || 'isencao_total')
    setPercent(excecao?.percent != null ? String(excecao.percent) : '')
    setReducedValue(excecao?.reduced_value != null ? String(excecao.reduced_value) : '')
    setUnitDiscount(excecao?.unit_discount != null ? String(excecao.unit_discount) : '')
    setValidFrom(excecao?.valid_from || firstDayOfMonth())
    setValidTo(excecao?.valid_to || defaultValidTo())
    setReason(excecao?.reason || '')
    setError('')
  }, [open, excecao])

  const activeSeries = useMemo(() => (series || []).filter((s) => s.status === 'ativa'), [series])
  const selectedSeries = useMemo(
    () => (series || []).find((s) => s.id === scope) || null,
    [series, scope]
  )
  const selectedInactive = !!scope && !activeSeries.some((s) => s.id === scope)

  const overlap = useMemo(() => {
    if (!validFrom || !validTo) return null
    return (existing || []).find(
      (e) =>
        e.id !== excecao?.id &&
        (e.series_id || '') === (scope || '') &&
        e.type === type &&
        e.valid_from <= validTo &&
        e.valid_to >= validFrom
    ) || null
  }, [existing, scope, type, validFrom, validTo, excecao])

  if (!open) return null

  function validate() {
    if (reason.trim().length < 10) return 'Motivo precisa de ao menos 10 caracteres'
    if (!validFrom || !validTo) return 'Informe a vigência'
    if (validTo < validFrom) return 'Fim da vigência não pode ser antes do início'
    if (validFrom < firstDayOfMonth()) return 'Sem retroatividade: escolha o mês corrente ou depois'
    if (type === 'desconto_percent') {
      const p = Number(percent)
      if (!(p > 0 && p <= 100)) return 'Desconto deve ser maior que 0% e no máximo 100%'
    }
    if (type === 'valor_reduzido' && !(Number(reducedValue) > 0)) {
      return 'Valor reduzido deve ser maior que zero'
    }
    if (type === 'desconto_unidade') {
      if (!scope) return 'Desconto por licença/OS exige uma série específica'
      if (!selectedSeries?.usage_driven) {
        return 'Desconto por licença/OS só se aplica a séries "Base + excedente"'
      }
      const base = Number(selectedSeries?.billing_base_value) || 0
      const disc = Number(unitDiscount)
      if (!(disc > 0)) return 'Desconto por licença/OS deve ser maior que zero'
      if (base > 0 && disc >= base) return 'Desconto não pode ser maior ou igual ao valor base da série'
    }
    return ''
  }

  async function handleSubmit() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      client_id: clientId,
      series_id: scope || null,
      type,
      percent: type === 'desconto_percent' ? Number(percent) : null,
      reduced_value: type === 'valor_reduzido' ? Number(reducedValue) : null,
      unit_discount: type === 'desconto_unidade' ? Number(unitDiscount) : null,
      valid_from: validFrom,
      valid_to: validTo,
      reason: reason.trim(),
    }
    try {
      if (excecao?.id) {
        const { error: e } = await supabase
          .from('billing_exceptions')
          .update({ ...payload, updated_by: profile?.id, updated_at: new Date().toISOString() })
          .eq('id', excecao.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase
          .from('billing_exceptions')
          .insert({ ...payload, created_by: profile?.id })
        if (e) throw e
      }
      toast.success(excecao?.id ? 'Exceção atualizada' : 'Exceção criada')
      qc.invalidateQueries({ queryKey: ['billing_exceptions', clientId] })
      onSaved?.()
      onClose()
    } catch (e) {
      const msg = e?.code === '42501' ? 'Ação não permitida' : e.message
      toast.error(msg)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!excecao?.id) return
    if (!window.confirm('Excluir esta exceção? A trilha de auditoria permanece.')) return
    setSaving(true)
    try {
      const { error: e } = await supabase.from('billing_exceptions').delete().eq('id', excecao.id)
      if (e) throw e
      toast.success('Exceção excluída')
      qc.invalidateQueries({ queryKey: ['billing_exceptions', clientId] })
      onSaved?.()
      onClose()
    } catch (e) {
      toast.error(e?.code === '42501' ? 'Ação não permitida' : e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary border border-border-tertiary rounded-xl shadow-xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-text-primary">
              {excecao?.id ? 'Editar exceção' : 'Nova exceção'}
            </h3>
            {clientName && <p className="text-xs text-text-tertiary mt-0.5">{clientName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label-sm">Escopo</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="input-base w-full"
            >
              <option value="">Todas as séries (cliente inteiro)</option>
              {activeSeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || KIND_LABELS[s.kind] || 'Série'}
                </option>
              ))}
              {selectedInactive && selectedSeries && (
                <option value={selectedSeries.id}>
                  {selectedSeries.label || KIND_LABELS[selectedSeries.kind] || 'Série'} (encerrada)
                </option>
              )}
            </select>
            <p className="text-[11px] text-text-tertiary mt-1">
              Use uma série específica para negociar só aquele item (ex.: aditivo não cobrado).
            </p>
          </div>

          <div>
            <label className="label-sm">Tipo de exceção</label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setPercent('')
                setReducedValue('')
                setUnitDiscount('')
              }}
              className="input-base w-full"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {type === 'desconto_percent' && (
            <div>
              <label className="label-sm">Percentual de desconto (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="input-base w-full"
                placeholder="Ex: 10"
              />
            </div>
          )}

          {type === 'valor_reduzido' && (
            <div>
              <label className="label-sm">Valor mensal reduzido (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={reducedValue}
                onChange={(e) => setReducedValue(e.target.value)}
                className="input-base w-full"
                placeholder="Ex: 1500"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                Substitui o cálculo do escopo por esse valor fixo no período.
              </p>
            </div>
          )}

          {type === 'desconto_unidade' && (
            <div>
              <label className="label-sm">
                Desconto por {selectedSeries?.billing_type === 'por_os' ? 'OS' : 'licença'} (R$)
              </label>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={unitDiscount}
                onChange={(e) => setUnitDiscount(e.target.value)}
                className="input-base w-full"
                placeholder="Ex: 10"
              />
              <p className="text-[11px] text-text-tertiary mt-1">
                {selectedSeries
                  ? `Valor base da série: ${formatBRL4(selectedSeries.billing_base_value)} por ${selectedSeries.billing_type === 'por_os' ? 'OS' : 'licença'}. Piso e excedente continuam valendo.`
                  : 'Selecione uma série "Base + excedente" para usar este tipo.'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Início da vigência</label>
              <input
                type="date"
                value={validFrom}
                min={firstDayOfMonth()}
                onChange={(e) => setValidFrom(e.target.value)}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label-sm">Fim da vigência</label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="input-base w-full"
              />
            </div>
          </div>

          <div>
            <label className="label-sm">Motivo da negociação *</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-base w-full"
              placeholder="Ex: cortesia de 3 meses negociada com o comercial"
            />
            <p className="text-[11px] text-text-tertiary mt-1">
              Mínimo 10 caracteres — fica registrado na trilha (autor e data).
            </p>
          </div>

          {overlap && (
            <div className="flex items-start gap-2 px-3 py-2 bg-donc-amber/10 border border-donc-amber/30 rounded-lg text-donc-amber text-xs">
              <Icons.AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              Já existe uma exceção desse tipo com vigência sobreposta neste escopo.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-donc-red/10 border border-donc-red/20 rounded-lg text-donc-red text-xs">
              <Icons.AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-5">
          <div>
            {excecao?.id && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="text-xs text-donc-red hover:underline disabled:opacity-50"
              >
                Excluir
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border-tertiary text-text-secondary hover:bg-bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="px-3 py-2 text-sm rounded-lg bg-donc-navy text-white font-medium hover:bg-donc-navy/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
