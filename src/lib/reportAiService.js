import { supabase } from './supabaseClient'

const sleep = ms => new Promise(r => setTimeout(r, ms))

function dataDump(data) {
  return Object.entries(data)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

function mountUserContent(sectionType, data, clientName, period, customContext, includeRawData) {
  const [y, m] = (period || '').split('-').map(Number)
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const periodLabel = months[m - 1] ? `${months[m - 1]} ${y}` : period
  const fmtPct = v => v != null ? `${v}%` : 'N/D'

  let summary
  switch (sectionType) {
    case 'escala':
      summary = `Analise os dados de escala operacional do cliente ${clientName} em ${periodLabel}:
- OS Criadas: ${data.os_criadas ?? 'N/D'} (${data.delta_os_criadas != null ? (data.delta_os_criadas >= 0 ? '+' : '') + data.delta_os_criadas + '%' : 'N/D'} vs anterior)
- Usuários Ativos: ${data.usuarios_ativos ?? 'N/D'} (${data.delta_usuarios_ativos != null ? (data.delta_usuarios_ativos >= 0 ? '+' : '') + data.delta_usuarios_ativos + '%' : 'N/D'} vs anterior)
- Produtos Montados: ${data.produtos_montados ?? 'N/D'} (${data.delta_produtos_montados != null ? (data.delta_produtos_montados >= 0 ? '+' : '') + data.delta_produtos_montados + '%' : 'N/D'} vs anterior)
- Composição: Montagem ${fmtPct(data.pct_montagem)}, Assistência ${fmtPct(data.pct_assistencia)}
Gere uma análise do desempenho operacional do período.`
      break

    case 'qualidade_operacao':
      summary = `Analise a qualidade operacional do cliente ${clientName} em ${periodLabel}:
- Execução limpa: ${fmtPct(data.taxa_sucesso)}
- OS finalizadas sem ocorrência: ${data.total_sucesso ?? 'N/D'}
- OS com ocorrência: ${data.relatos_imprevistos ?? 'N/D'} (${data.delta_imprevistos != null ? (data.delta_imprevistos >= 0 ? '+' : '') + data.delta_imprevistos + '%' : 'N/D'} vs anterior)
- Pontualidade: ${fmtPct(data.pontualidade)} (atraso médio ${data.atraso_medio_dias ?? 'N/D'} dias)
Gere uma análise focada em qualidade e oportunidades de melhoria.`
      break

    case 'indicadores_operacionais':
      summary = `Analise os indicadores operacionais do cliente ${clientName} em ${periodLabel}:
- Tempo médio de execução: ${data.tempo_execucao != null ? Math.round(data.tempo_execucao * 60) + ' min' : 'N/D'} (${data.delta_tempo_execucao != null ? (data.delta_tempo_execucao >= 0 ? '+' : '') + data.delta_tempo_execucao + '%' : 'N/D'} vs anterior)
- Tempo em trânsito: ${data.tempo_transito != null ? Math.round(data.tempo_transito * 60) + ' min' : 'N/D'}
Gere uma análise sobre eficiência operacional dos profissionais.`
      break

    case 'categorias_ocorrencia':
      summary = `Analise as categorias de ocorrência do cliente ${clientName} em ${periodLabel}:
Gere uma análise identificando padrões e oportunidades de ação com base nos dados disponíveis.`
      break

    case 'desempenho_operacional':
      summary = `Analise o desempenho dos profissionais do cliente ${clientName} em ${periodLabel}:
- Índice médio de produtividade: ${fmtPct(data.indice_produtividade)}
- Total de profissionais ativos: ${data.total_profissionais ?? 'N/D'}
Gere uma análise do desempenho geral da equipe de campo.`
      break

    case 'suporte':
      summary = `Analise o suporte ao cliente ${clientName} em ${periodLabel}:
- Tickets abertos: ${data.tickets_abertos ?? 'N/D'}
- Tickets resolvidos: ${data.tickets_resolvidos ?? 'N/D'}
- SLA primeira resposta: ${data.sla_primeira_resposta ?? 'N/D'} min
- Taxa de resolução: ${fmtPct(data.taxa_resolucao)}
- N1: ${fmtPct(data.n1_pct)}, N2: ${fmtPct(data.n2_pct)}, N3: ${fmtPct(data.n3_pct)}
Gere uma análise da performance de suporte no período, destacando pontos de atenção.`
      break

    default:
      summary = `Analise os dados operacionais do cliente ${clientName} em ${periodLabel}.`
  }

  let prompt = summary

  if (customContext) {
    prompt += `\n\nInstruções adicionais do analista:\n${customContext}`
  }

  if (includeRawData) {
    prompt += '\n\nDados completos disponíveis:\n' + dataDump(data)
  }

  return prompt
}

export async function generateSectionAnalysis({ sectionType, sectionData, clientName, period, customContext, includeRawData }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const systemPrompt = `Você é um analista de Customer Success especializado em operações de campo.
Gere análises profissionais, concisas e orientadas a insights acionáveis.
Responda sempre em português brasileiro.
Máximo 3 frases por análise.
Não use markdown, apenas texto corrido.`

  const userContent = mountUserContent(sectionType, sectionData, clientName, period, customContext, includeRawData)

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`
  let lastError

  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(1000)

    let res
    try {
      res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ]}),
      })
    } catch (networkErr) {
      lastError = new Error(`Erro de rede: ${networkErr.message}`)
      continue
    }

    if (res.ok) {
      const data = await res.json()
      return data?.choices?.[0]?.message?.content ?? ''
    }

    if (res.status === 404 || res.status >= 500) {
      const err = await res.json().catch(() => ({}))
      lastError = new Error(err.error || `OpenRouter error ${res.status}`)
      continue
    }

    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `OpenRouter error ${res.status}`)
  }

  throw lastError || new Error('Falha ao chamar OpenRouter após múltiplas tentativas.')
}
