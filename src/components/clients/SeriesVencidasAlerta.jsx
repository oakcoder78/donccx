import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Icons } from '@/lib/icons'
import { useSeriesLifecycleMutations, useSeriesVencidas } from '@/hooks/useContractCharges'
import { Button } from '@/components/ui/Button'
import { EncerrarSerieDialog, CobrarMaisMesesDialog } from './ContractLifecycleDialogs'

function brDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Séries contratuais vencidas: o contrato assinado acabou e a série não foi
 * marcada para rolar no mês a mês, então ela parou de ser lançada e sumiu do
 * cockpit. Aqui a decisão fica visível.
 *
 * Três destinos possíveis, e os três já existiam por caminhos diferentes — o
 * que faltava era torná-los descobríveis lado a lado:
 *   · Renovar mês a mês      → liga auto_renew e repõe a folga na hora
 *   · Cobrar mais N meses     → desliga auto_renew e dá a data (o caso do acordo)
 *   · Encerrar                → a série para de vez (abre diálogo, pois apaga dado)
 *
 * Renderiza `null` quando não há nada pendente, para poder ser montado nas duas
 * telas (cockpit e lista de clientes) sem custo visual.
 */
export function SeriesVencidasAlerta() {
  const qc = useQueryClient()
  const [pendingId, setPendingId] = useState(null)
  const [dialog, setDialog] = useState(null) // { tipo, serie }
  const mutate = useSeriesLifecycleMutations()

  const { data: series = [], isLoading } = useSeriesVencidas()
  if (isLoading || series.length === 0) return null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['financeiro_cockpit'] })
    qc.invalidateQueries({ queryKey: ['clients'] })
    qc.invalidateQueries({ queryKey: ['contract_series'] })
    qc.invalidateQueries({ queryKey: ['series_vencidas'] })
  }

  const acting = (serie, action) => {
    setPendingId(`${serie.series_id}:${action}`)
    mutate.mutate(
      { seriesId: serie.series_id, action },
      {
        onSettled: () => {
          setPendingId(null)
          invalidate()
        },
      }
    )
  }

  return (
    <div className="rounded-xl border border-donc-red/30 bg-donc-red/5 p-4">
      <div className="flex items-start gap-2">
        <Icons.AlertTriangle className="w-4 h-4 text-donc-red mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-text-primary">
            {series.length === 1 ? 'Série contratual vencida' : 'Séries contratuais vencidas'}
          </h4>
          <p className="text-xs text-text-tertiary mt-0.5">
            O período contratado acabou e a renovação automática não foi marcada, então estas
            séries pararam de ser lançadas e saíram do faturamento. Defina o destino de cada uma.
          </p>

          <ul className="mt-3 space-y-2">
            {series.map((s) => (
              <li
                key={s.series_id}
                className="rounded-lg border border-border-tertiary bg-bg-primary p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">
                      {s.client_name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {s.series_label} · terminou em {brDate(s.contract_renewal)}
                      {s.months_overdue > 0 && ` · ${s.months_overdue} meses atrás`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pendingId != null}
                      onClick={() => setDialog({ tipo: 'encerrar', serie: s })}
                    >
                      Encerrar série
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pendingId != null}
                      onClick={() => setDialog({ tipo: 'cobrar', serie: s })}
                    >
                      Cobrar mais meses
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={pendingId != null}
                      onClick={() => acting(s, 'renovar')}
                    >
                      {pendingId === `${s.series_id}:renovar` ? 'Ativando…' : 'Renovar mês a mês'}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {dialog?.tipo === 'encerrar' && (
        <EncerrarSerieDialog
          series={dialog.serie}
          mesesFuturos={dialog.serie.meses_futuros || 0}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            invalidate()
          }}
        />
      )}

      {dialog?.tipo === 'cobrar' && (
        <CobrarMaisMesesDialog
          series={dialog.serie}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            invalidate()
          }}
        />
      )}
    </div>
  )
}