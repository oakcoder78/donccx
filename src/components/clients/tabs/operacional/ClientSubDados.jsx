import { Card } from '../../../ui/Card'
import { usePermissions } from '../../../../hooks/usePermissions'
import { useCatalog } from '../../../../hooks/useCatalog'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs text-white/50 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  )
}

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const STATUS_META = {
  implantado:      { icon: '✓', label: 'Implantado' },
  em_implantacao:  { icon: '🔄', label: 'Em implantação' },
  pausado:         { icon: '⚠', label: 'Pausado' },
  abandonado:      { icon: '⛔', label: 'Abandonado' },
  descontinuado:   { icon: null, label: 'Descontinuado' },
}

export function ClientSubDados({ client }) {
  const { canViewFinancial } = usePermissions()
  const { data: catalog = [] } = useCatalog()

  const servicos = client.client_catalog
    ?.filter(cc => cc.catalog_items?.type === 'servico')
    .map(cc => cc.catalog_items) || []

  const allSolucoes = catalog.filter(c => c.type === 'solucao')

  // map catalog_item_id → client_catalog entry (inclui status)
  const catalogMap = {}
  client.client_catalog?.forEach(cc => { catalogMap[cc.catalog_item_id] = cc })

  return (
    <div className="space-y-4">
      {/* Navy card with main info */}
      <div className="bg-donc-navy rounded-lg p-5 text-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoRow label="App Code" value={client.app_code} />
          <InfoRow label="URL donc" value={client.url_donc} />
          <InfoRow label="Início Contrato" value={formatDate(client.contract_start)} />
          <InfoRow label="Renovação" value={formatDate(client.contract_renewal)} />
          <InfoRow label="Início Onboarding" value={formatDate(client.onb_start)} />
          <InfoRow label="Go Live" value={formatDate(client.golive)} />
          {canViewFinancial && (
            <>
              <InfoRow label="MRR" value={client.mrr ? `R$ ${Number(client.mrr).toLocaleString('pt-BR')}` : null} />
              <InfoRow
                label="Licenças"
                value={client.billing_floor ? `${client.billing_floor} × R$ ${Number(client.billing_base_value || 0).toLocaleString('pt-BR')}` : null}
              />
            </>
          )}
          <InfoRow
            label="Unidades na Donc"
            value={client.unidades_donc > 0 ? String(client.unidades_donc) : null}
          />
          {client.delay_days > 0 && (
            <InfoRow label="Dias em Atraso" value={`${client.delay_days} dias`} />
          )}
        </div>
      </div>

      {/* Catálogo */}
      {(servicos.length > 0 || allSolucoes.length > 0) && (
        <Card>
          {servicos.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-text-tertiary mb-2">Serviços</p>
              <div className="flex flex-wrap gap-1.5">
                {servicos.map(s => (
                  <span
                    key={s.id}
                    className="px-2.5 py-1 rounded-full text-xs font-medium text-white select-none"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {allSolucoes.length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-2">Soluções</p>
              <div className="flex flex-wrap gap-1.5">
                {allSolucoes.map(sol => {
                  const entry = catalogMap[sol.id]

                  if (!entry) {
                    return (
                      <span
                        key={sol.id}
                        className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary border border-border-secondary select-none"
                        title="Não contratado"
                      >
                        {sol.name}
                      </span>
                    )
                  }

                  const status = entry.status || 'implantado'

                  if (status === 'descontinuado') {
                    return (
                      <span
                        key={sol.id}
                        className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary border border-border-secondary line-through select-none"
                        title={STATUS_META.descontinuado.label}
                      >
                        {sol.name}
                      </span>
                    )
                  }

                  const meta = STATUS_META[status] || STATUS_META.implantado
                  return (
                    <span
                      key={sol.id}
                      className="px-2.5 py-1 rounded-full text-xs font-medium text-white select-none flex items-center gap-1"
                      style={{ backgroundColor: sol.color }}
                      title={meta.label}
                    >
                      <span>{meta.icon}</span>
                      {sol.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
