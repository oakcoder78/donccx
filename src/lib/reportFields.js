/**
 * reportFields.js — Field Registry for report sections
 *
 * Each section type declares its available fields. The editor uses this to
 * render toggles + override inputs. The generator uses it to resolve values
 * and render only enabled fields.
 *
 * Field descriptor:
 *   key           — unique within section
 *   label         — displayed in editor + KPI card
 *   type          — number | percent | currency | duration | chart | delta
 *   defaultEnabled — whether field is enabled in new reports
 *   resolve(data) — extracts value from data context { usage, sup, opCurrent, opPrev, period, prevPeriod }
 *   format        — optional custom format function (value) => string
 */

const PREV = (resolveFn) => (data) => {
  const cur = resolveFn(data)
  const prev = resolveFn({ ...data, period: data.prevPeriod })
  if (cur == null || prev == null || prev === 0) return null
  return Math.round(((cur - prev) / prev) * 100)
}

const sectionFields = {

  escala: [
    {
      key: 'os_criadas',
      label: 'O.S. Criadas',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.total_os ?? null,
    },
    {
      key: 'delta_os_criadas',
      label: '↕ O.S. Criadas (delta)',
      type: 'delta',
      defaultEnabled: true,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.sumario?.total_os
        const prev = data.opPrev?.data_os?.sumario?.total_os
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'usuarios_ativos',
      label: 'Usuários Ativos',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.usage?.find(u => u.ref_month === data.period)?.active_users ?? null,
    },
    {
      key: 'delta_usuarios_ativos',
      label: '↕ Usuários Ativos (delta)',
      type: 'delta',
      defaultEnabled: true,
      resolve: (data) => {
        const cur = data.usage?.find(u => u.ref_month === data.period)?.active_users
        const prev = data.usage?.find(u => u.ref_month === data.prevPeriod)?.active_users
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'produtos_montados',
      label: 'Produtos Montados',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => {
        const p = data.opCurrent?.data_os?.operacional?.total_produtos
        if (p != null) return p
        return data.opCurrent?.data_produtividade?.sumario?.total_produtos ?? null
      },
    },
    {
      key: 'delta_produtos_montados',
      label: '↕ Produtos Montados (delta)',
      type: 'delta',
      defaultEnabled: true,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.operacional?.total_produtos
          ?? data.opCurrent?.data_produtividade?.sumario?.total_produtos
        const prev = data.opPrev?.data_os?.operacional?.total_produtos
          ?? data.opPrev?.data_produtividade?.sumario?.total_produtos
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'pct_montagem',
      label: '% Montagem',
      type: 'percent',
      defaultEnabled: false,
      resolve: (data) => {
        const porTipo = data.opCurrent?.data_os?.sumario?.por_tipo
        if (!porTipo) return null
        const getVal = (v) => typeof v === 'number' ? v : v?.total_os ?? 0
        const montagem = getVal(porTipo.Montagem)
        const total = Object.values(porTipo).reduce((s, v) => s + getVal(v), 0)
        if (total === 0) return null
        return Math.round((montagem / total) * 100)
      },
    },
    {
      key: 'pct_assistencia',
      label: '% Assistência',
      type: 'percent',
      defaultEnabled: false,
      resolve: (data) => {
        const porTipo = data.opCurrent?.data_os?.sumario?.por_tipo
        if (!porTipo) return null
        const getVal = (v) => typeof v === 'number' ? v : v?.total_os ?? 0
        const assist = getVal(porTipo.Assistência)
        const total = Object.values(porTipo).reduce((s, v) => s + getVal(v), 0)
        if (total === 0) return null
        return Math.round((assist / total) * 100)
      },
    },
    {
      key: 'valor_total_notas',
      label: 'Valor Total Notas',
      type: 'currency',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.valor_total_notas ?? null,
    },
    {
      key: 'delta_valor_total_notas',
      label: '↕ Valor Total Notas (delta)',
      type: 'delta',
      defaultEnabled: false,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.sumario?.valor_total_notas
        const prev = data.opPrev?.data_os?.sumario?.valor_total_notas
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'taxa_sucesso_geral',
      label: 'Taxa de Sucesso',
      type: 'percent',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.taxa_sucesso ?? null,
    },
    {
      key: 'delta_taxa_sucesso_geral',
      label: '↕ Taxa de Sucesso (delta pp)',
      type: 'delta',
      defaultEnabled: false,
      format: (v) => `${v >= 0 ? '+' : ''}${v} pp`,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.sumario?.taxa_sucesso
        const prev = data.opPrev?.data_os?.sumario?.taxa_sucesso
        if (cur == null || prev == null) return null
        return +(cur - prev).toFixed(1)
      },
    },
    {
      key: 'grafico_historico',
      label: 'Gráfico Histórico 12 Meses',
      type: 'chart',
      defaultEnabled: true,
      resolve: (data) => data.usage ?? null,
    },
    {
      key: 'grafico_por_tipo',
      label: 'OS por Tipo de Serviço',
      type: 'chart',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.por_tipo ?? null,
    },
  ],

  qualidade_operacao: [
    {
      key: 'taxa_sucesso',
      label: 'Execução Limpa',
      type: 'percent',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.taxa_sucesso ?? null,
    },
    {
      key: 'total_sucesso',
      label: 'OS Finalizadas sem Ocorrência',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.total_sucesso
        ?? data.opCurrent?.data_os?.sumario?.sub_status?.sucesso?.total ?? null,
    },
    {
      key: 'relatos_imprevistos',
      label: 'OS com Ocorrência',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.total_ocorrencias
        ?? data.opCurrent?.data_os?.sumario?.sub_status?.ocorrencia?.total ?? null,
    },
    {
      key: 'delta_imprevistos',
      label: '↕ OS com Ocorrência (delta)',
      type: 'delta',
      defaultEnabled: true,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.operacional?.total_ocorrencias
          ?? data.opCurrent?.data_os?.sumario?.sub_status?.ocorrencia?.total
        const prev = data.opPrev?.data_os?.operacional?.total_ocorrencias
          ?? data.opPrev?.data_os?.sumario?.sub_status?.ocorrencia?.total
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'pontualidade',
      label: 'Pontualidade',
      type: 'percent',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.tempos?.pontualidade?.percentual_pontualidade ?? null,
    },
    {
      key: 'delta_pontualidade',
      label: '↕ Pontualidade (delta pp)',
      type: 'delta',
      defaultEnabled: false,
      format: (v) => `${v >= 0 ? '+' : ''}${v} pp`,
      resolve: (data) => {
        const cur = data.opCurrent?.data_os?.tempos?.pontualidade?.percentual_pontualidade
        const prev = data.opPrev?.data_os?.tempos?.pontualidade?.percentual_pontualidade
        if (cur == null || prev == null) return null
        return +(cur - prev).toFixed(1)
      },
    },
    {
      key: 'no_prazo',
      label: 'OS no Prazo',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.tempos?.pontualidade?.no_prazo ?? null,
    },
    {
      key: 'atrasadas',
      label: 'OS Atrasadas',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.tempos?.pontualidade?.atrasadas ?? null,
    },
    {
      key: 'atraso_medio_dias',
      label: 'Atraso Médio (dias)',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.tempos?.pontualidade?.atraso_medio_dias ?? null,
    },
    {
      key: 'atrasadas_nao_concluidas',
      label: 'OS Atrasadas não Concluídas',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.atrasadas_nao_concluidas ?? null,
    },
    {
      key: 'os_sem_inicio',
      label: 'OS sem Início',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.os_sem_inicio ?? null,
    },
    {
      key: 'os_pedido_peca',
      label: 'OS Aguardando Peça',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.os_pedido_peca ?? null,
    },
    {
      key: 'nao_liberadas',
      label: 'OS não Liberadas',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.total_nao_liberada
        ?? data.opCurrent?.data_os?.sumario?.sub_status?.nao_liberada?.total ?? null,
    },
    {
      key: 'liberada_nao_iniciada',
      label: 'OS Liberadas não Iniciadas',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.total_liberada_nao_iniciada
        ?? data.opCurrent?.data_os?.sumario?.sub_status?.liberada_nao_iniciada?.total ?? null,
    },
  ],

  indicadores_operacionais: [
    {
      key: 'tempo_execucao',
      label: 'Tempo Médio de Execução',
      type: 'duration',
      defaultEnabled: true,
      resolve: (data) => {
        const horas = data.opCurrent?.data_os?.tempos?.tempo_medio_execucao_horas
        if (horas != null) return horas
        const min = data.opCurrent?.data_produtividade?.sumario?.tempo_execucao_medio_minutos
        if (min != null) return min / 60
        return null
      },
    },
    {
      key: 'delta_tempo_execucao',
      label: '↕ Tempo Execução (delta)',
      type: 'delta',
      format: (v) => `${v >= 0 ? '+' : ''}${v}%`,
      defaultEnabled: true,
      resolve: (data) => {
        const resolveH = (d) => {
          const h = d?.data_os?.tempos?.tempo_medio_execucao_horas
          if (h != null) return h
          const m = d?.data_produtividade?.sumario?.tempo_execucao_medio_minutos
          return m != null ? m / 60 : null
        }
        const cur = resolveH(data.opCurrent)
        const prev = resolveH(data.opPrev)
        if (cur == null || prev == null || prev === 0) return null
        return Math.round(((cur - prev) / prev) * 100)
      },
    },
    {
      key: 'tempo_atendimento',
      label: 'Tempo Médio de Atendimento',
      type: 'duration',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.tempos?.tempo_medio_atendimento_dias ?? null,
    },
    {
      key: 'tempo_transito',
      label: 'Tempo em Trânsito',
      type: 'duration',
      defaultEnabled: false,
      resolve: (data) => {
        const min = data.opCurrent?.data_produtividade?.sumario?.tempo_transito_medio_minutos
        return min != null ? min / 60 : null
      },
    },
  ],

  categorias_ocorrencia: [
    {
      key: 'categorias_ocorrencias',
      label: 'Categorias de Ocorrências',
      type: 'chart',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.categorias_ocorrencias ?? [],
    },
    {
      key: 'motivos_cancelamento',
      label: 'Motivos de Cancelamento',
      type: 'chart',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.motivos_cancelamento ?? [],
    },
    {
      key: 'sub_status_breakdown',
      label: 'Breakdown por Sub-status',
      type: 'chart',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.sumario?.sub_status ?? null,
    },
  ],

  desempenho_operacional: [
    {
      key: 'total_profissionais',
      label: 'Profissionais Ativos',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.ranking_profissionais?.length
        ?? data.opCurrent?.data_produtividade?.sumario?.total_profissionais ?? null,
    },
    {
      key: 'ranking_profissionais',
      label: 'Ranking de Profissionais',
      type: 'chart',
      defaultEnabled: true,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.ranking_profissionais ?? [],
    },
    {
      key: 'indice_produtividade',
      label: 'Índice de Produtividade Médio',
      type: 'percent',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_produtividade?.sumario?.indice_produtividade_medio ?? null,
    },
    {
      key: 'total_dias_trabalhados',
      label: 'Total Dias Trabalhados',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_produtividade?.sumario?.total_dias_trabalhados ?? null,
    },
    {
      key: 'produtos_mais_frequentes',
      label: 'Top Produtos do Mês',
      type: 'chart',
      defaultEnabled: false,
      resolve: (data) => data.opCurrent?.data_os?.operacional?.produtos_mais_frequentes ?? [],
    },
  ],

  suporte: [
    {
      key: 'tickets_abertos',
      label: 'Tickets Abertos',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.sup?.tickets_opened ?? null,
    },
    {
      key: 'tickets_resolvidos',
      label: 'Tickets Resolvidos',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.sup?.tickets_resolved ?? null,
    },
    {
      key: 'sla_primeira_resposta',
      label: 'SLA 1ª Resposta (min)',
      type: 'number',
      defaultEnabled: true,
      resolve: (data) => data.sup?.sla_first_response ?? null,
    },
    {
      key: 'taxa_resolucao',
      label: 'Taxa de Resolução',
      type: 'percent',
      defaultEnabled: true,
      resolve: (data) => {
        const a = data.sup?.tickets_opened
        const r = data.sup?.tickets_resolved
        if (a == null || r == null || a === 0) return null
        return Math.round((r / a) * 100)
      },
    },
    {
      key: 'n1_pct',
      label: 'Tickets N1',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.sup?.n1_pct ?? null,
    },
    {
      key: 'n2_pct',
      label: 'Tickets N2',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.sup?.n2_pct ?? null,
    },
    {
      key: 'n3_pct',
      label: 'Tickets N3',
      type: 'number',
      defaultEnabled: false,
      resolve: (data) => data.sup?.n3_pct ?? null,
    },
  ],
}

export function getSectionFields(type) {
  return sectionFields[type] ?? []
}

export function getField(type, key) {
  return sectionFields[type]?.find(f => f.key === key) ?? null
}

export function resolveField(type, key, data) {
  const field = getField(type, key)
  if (!field?.resolve) return null
  return field.resolve(data)
}

export function resolveAllFields(type, data) {
  const fields = getSectionFields(type)
  return fields.map(f => ({
    ...f,
    value: f.resolve?.(data) ?? null,
  }))
}

export function formatFieldValue(field, raw) {
  if (raw == null) return null
  if (field.format) return field.format(raw)
  switch (field.type) {
    case 'delta':
      return `${raw >= 0 ? '+' : ''}${raw}% vs anterior`
    case 'percent':
      return `${raw}%`
    case 'currency':
      return `R$ ${Number(raw).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case 'duration': {
      const h = Number(raw)
      if (h >= 1) {
        const hrs = Math.floor(h)
        const min = Math.round((h - hrs) * 60)
        return min > 0 ? `${hrs}h${min}` : `${hrs}h`
      }
      return `${Math.round(h * 60)} min`
    }
    case 'number':
      return Number(raw).toLocaleString('pt-BR')
    default:
      return raw
  }
}

export default sectionFields
