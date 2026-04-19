import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SettingsMenuIcons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { PageSpinner } from '../ui/Spinner'

const ENTITY_TYPES = [
  { value: '', label: 'Todos' },
  { value: 'client', label: 'Empresa' },
  { value: 'user', label: 'Usuário' },
]

const ACTION_LABELS = {
  create_client:    'Empresa criada',
  update_client:    'Empresa atualizada',
  delete_client:    'Empresa removida',
  change_csm:       'CSM alterado',
  change_stage:     'Stage alterado',
  create_user:      'Usuário criado',
  update_user:      'Usuário atualizado',
  activate_user:    'Usuário reativado',
  deactivate_user:  'Usuário desativado',
  change_user_role: 'Perfil alterado',
  update_user_status: 'Status atualizado',
}

function formatDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function DetailCell({ oldValue, newValue }) {
  if (!oldValue && !newValue) return <span className="text-text-tertiary text-xs">—</span>
  const parts = []
  if (newValue) {
    Object.entries(newValue).forEach(([k, v]) => {
      if (oldValue?.[k] !== undefined && oldValue[k] !== v) {
        parts.push(`${k}: ${oldValue[k]} → ${v}`)
      } else if (v !== null && v !== undefined) {
        parts.push(`${k}: ${v}`)
      }
    })
  }
  return (
    <span className="text-xs text-text-secondary font-mono break-all">
      {parts.length ? parts.join(' | ') : JSON.stringify(newValue ?? oldValue)}
    </span>
  )
}

export function SettingsLogs() {
  const LogsIcon = SettingsMenuIcons['logs']
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]   = useState('')

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit_logs', entityType, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (entityType) q = q.eq('entity_type', entityType)
      if (dateFrom)   q = q.gte('created_at', dateFrom)
      if (dateTo)     q = q.lte('created_at', dateTo + 'T23:59:59')

      const { data, error } = await q
      if (error) { console.error('[SettingsLogs]', error); return [] }
      return data ?? []
    },
    retry: 0,
  })

  return (
    <div className="max-w-5xl space-y-4">
      <h2 className="text-base font-semibold text-text-primary flex items-center gap-2"><LogsIcon className="w-4 h-4" /> Logs de Auditoria</h2>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 bg-bg-primary border border-border-tertiary rounded-lg p-3">
        <div>
          <label className="label-sm">Entidade</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value)} className="input-base w-36">
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label-sm">Data inicial</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-base w-36" />
        </div>
        <div>
          <label className="label-sm">Data final</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-base w-36" />
        </div>
        <button
          onClick={() => { setEntityType(''); setDateFrom(''); setDateTo('') }}
          className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
        >
          Limpar filtros
        </button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-tertiary bg-bg-secondary">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-tertiary w-36">Data/Hora</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-tertiary w-32">Usuário</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-tertiary w-40">Ação</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-tertiary w-40">Entidade</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-tertiary">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-sm text-text-tertiary">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                ) : logs.map(log => (
                  <tr key={log.id} className="border-b border-border-tertiary last:border-0 hover:bg-bg-secondary transition-colors">
                    <td className="px-4 py-2.5 text-xs text-text-tertiary whitespace-nowrap">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-text-primary truncate max-w-[8rem]">
                      {log.user_name || '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-text-primary">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="text-xs text-text-primary">{log.entity_name || log.entity_id || '—'}</div>
                      {log.entity_type && (
                        <div className="text-[11px] text-text-tertiary capitalize">{log.entity_type}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 max-w-xs">
                      <DetailCell oldValue={log.old_value} newValue={log.new_value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length === 200 && (
            <div className="px-4 py-2 text-xs text-text-tertiary border-t border-border-tertiary">
              Exibindo os 200 registros mais recentes.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
