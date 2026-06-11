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

  let summary
  switch (sectionType) {
    case 'escala':
      summary = `Analise os dados de escala operacional do cliente ${clientName} em ${periodLabel}:
- OS Criadas: ${data.total_os ?? 'N/D'} (${data.delta_os != null ? (data.delta_os >= 0 ? '+' : '') + data.delta_os + '%' : 'N/D'} vs anterior)
- Usuários Ativos: ${data.active_users ?? 'N/D'} (${data.delta_users != null ? (data.delta_users >= 0 ? '+' : '') + data.delta_users + '%' : 'N/D'} vs anterior)
- Produtos Montados: ${data.total_produtos ?? 'N/D'} (${data.delta_produtos != null ? (data.delta_produtos >= 0 ? '+' : '') + data.delta_produtos + '%' : 'N/D'} vs anterior)
- Composição: Montagem ${data.pct_montagem ?? 'N/D'}%, Assistência ${data.pct_assistencia ?? 'N/D'}%
Gere uma análise do desempenho operacional do período.`
      break

    case 'qualidade_operacao':
      summary = `Analise a qualidade operacional do cliente ${clientName} em ${periodLabel}:
- Taxa de conclusão: ${data.taxa_conclusao ?? 'N/D'}%
- OS finalizadas sem ocorrência: ${data.finalizado_sucesso ?? 'N/D'}
- OS com ocorrência: ${data.com_ocorrencia ?? 'N/D'} (${data.delta_ocorrencia != null ? (data.delta_ocorrencia >= 0 ? '+' : '') + data.delta_ocorrencia + '%' : 'N/D'} vs anterior)
- Pontualidade: ${data.percentual_pontualidade ?? 'N/D'}% (atraso médio ${data.atraso_medio_dias ?? 'N/D'} dias)
Gere uma análise focada em qualidade e oportunidades de melhoria.`
      break

    case 'indicadores_operacionais':
      summary = `Analise os indicadores operacionais do cliente ${clientName} em ${periodLabel}:
- Tempo médio de execução: ${data.execucao_min ?? 'N/D'} min (${data.delta_exec != null ? (data.delta_exec >= 0 ? '+' : '') + data.delta_exec + '%' : 'N/D'} vs anterior)
- Tempo em trânsito: ${data.transito_min ?? 'N/D'} min (${data.delta_transito != null ? (data.delta_transito >= 0 ? '+' : '') + data.delta_transito + '%' : 'N/D'} vs anterior)
Gere uma análise sobre eficiência operacional dos profissionais.`
      break

    case 'categorias_ocorrencia':
      summary = `Analise as categorias de ocorrência do cliente ${clientName} em ${periodLabel}:
Top 3 ocorrências: ${data.top3_ocorrencias || 'N/D'}
Top 2 cancelamentos: ${data.top2_cancelamentos || 'N/D'}
Total de ocorrências: ${data.total_ocorrencias ?? 'N/D'}
Gere uma análise identificando padrões e oportunidades de ação.`
      break

    case 'desempenho_operacional':
      summary = `Analise o desempenho dos profissionais do cliente ${clientName} em ${periodLabel}:
- Índice médio de produtividade: ${data.indice_medio ?? 'N/D'}%
- Total de profissionais ativos: ${data.total_profissionais ?? 'N/D'}
- Profissionais com atenção (índice < 70%): ${data.count_atencao ?? 'N/D'}
Gere uma análise do desempenho geral da equipe de campo.`
      break

    case 'suporte':
      summary = `Analise o suporte ao cliente ${clientName} em ${periodLabel}:
- Tickets abertos: ${data.tickets_opened ?? 'N/D'}
- Tickets resolvidos: ${data.tickets_resolved ?? 'N/D'}
- SLA primeira resposta: ${data.sla ?? 'N/D'} min
- Taxa de resolução: ${data.taxa_resolucao ?? 'N/D'}%
- N1: ${data.n1_pct ?? 'N/D'}%, N2: ${data.n2_pct ?? 'N/D'}%, N3: ${data.n3_pct ?? 'N/D'}%
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
