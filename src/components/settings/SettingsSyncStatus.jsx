import { useSyncStatus } from '@/hooks/useSyncStatus'
import { Icons } from '@/lib/icons'
import { Badge } from '../ui/Badge'

function formatDateTimeBR(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('pt-BR', { timeZone: 'UTC', timeZoneName: 'short' })
}

function nextCronDate() {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 1, 0))
  if (next <= now) {
    next.setUTCMonth(next.getUTCMonth() + 1)
  }
  return next.toLocaleString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
}

const S = {
  section: {
    backgroundColor: '#fff',
    border: '0.5px solid #e8e7e3',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a18', margin: '0 0 4px' },
  sectionDesc:  { fontSize: 12, color: '#888780', margin: '0 0 18px', lineHeight: 1.5 },
}

export function SettingsSyncStatus() {
  const { data: lastRun, isLoading, error } = useSyncStatus()

  const statusVariant = !lastRun ? 'slate' : lastRun.status === 'success' ? 'green' : 'red'
  const statusLabel = !lastRun ? 'Nunca executou' : lastRun.status === 'success' ? 'Sucesso' : 'Falha'
  const statusIcon = !lastRun ? '⏳' : lastRun.status === 'success' ? '✅' : '❌'

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={S.sectionTitle}>Status da Sincronização Automática</p>
      <p style={S.sectionDesc}>
        Acompanhe a última execução do cron mensal que sincroniza API DONC, Freshdesk e Health Score.
      </p>

      <div style={S.section}>
        {isLoading && (
          <p style={{ fontSize: 13, color: '#888780' }}>Carregando...</p>
        )}

        {error && (
          <p style={{ fontSize: 13, color: '#dc2626' }}>Erro ao carregar status: {error.message}</p>
        )}

        {!isLoading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>{statusIcon}</span>
              <div>
                <Badge variant={statusVariant}>{statusLabel}</Badge>
                <p style={{ fontSize: 12, color: '#888780', margin: '4px 0 0' }}>
                  Última execução: {lastRun ? formatDateTimeBR(lastRun.started_at) : 'Nunca'}
                </p>
              </div>
            </div>

            {lastRun?.status === 'failed' && lastRun?.error_message && (
              <div style={{ padding: '10px 14px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#991b1b' }}>
                <p style={{ fontWeight: 600, margin: '0 0 4px' }}>Mensagem de erro:</p>
                <p style={{ margin: 0 }}>{lastRun.error_message}</p>
              </div>
            )}

            {lastRun?.status === 'success' && lastRun?.summary && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 12 }}>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>DONC API</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.donc?.synced ?? '—'} instâncias</p>
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>Freshdesk</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.freshdesk?.synced ?? '—'} empresas</p>
                </div>
                <div style={{ padding: '10px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7 }}>
                  <p style={{ fontWeight: 600, color: '#166534', margin: '0 0 2px' }}>Health Score</p>
                  <p style={{ color: '#166534', margin: 0 }}>{lastRun.summary?.health?.recalculated ?? '—'} clientes</p>
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color: '#888780', borderTop: '1px solid #e8e7e3', paddingTop: 12 }}>
              <p style={{ margin: 0 }}>
                <strong style={{ color: '#1a1a18' }}>Próxima execução automática:</strong>{' '}
                {nextCronDate()}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11 }}>
                O cron executa no 1º dia de cada mês às 00:01 UTC.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
