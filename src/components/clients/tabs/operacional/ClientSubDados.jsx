import { Card } from '../../../ui/Card'
import { usePermissions } from '../../../../hooks/usePermissions'

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

export function ClientSubDados({ client }) {
  const { canViewFinancial } = usePermissions()
  const servicos = client.client_catalog?.filter(cc => cc.catalog_items?.type === 'servico').map(cc => cc.catalog_items) || []
  const solucoes = client.client_catalog?.filter(cc => cc.catalog_items?.type === 'solucao').map(cc => cc.catalog_items) || []

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

      {/* Catalog chips — somente exibição, sem interação */}
      {(servicos.length > 0 || solucoes.length > 0) && (
        <Card>
          {servicos.length > 0 && (
            <div className="mb-3">
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
          {solucoes.length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-2">Soluções</p>
              <div className="flex flex-wrap gap-1.5">
                {solucoes.map(s => (
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
        </Card>
      )}
    </div>
  )
}
