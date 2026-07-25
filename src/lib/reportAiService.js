import { supabase } from './supabaseClient'
import { getSectionFields, getField, formatFieldValue } from './reportFields'

const FORBIDDEN_PATTERNS = [
  /recomenda[ -]se/i,
  /sugere[ -]se/i,
  /é (importante|necessário|fundamental|crucial) (que|manter|ter|a)/i,
  /exige aten[cç][aã]o/i,
  /precisa (ser|melhorar|mudar|ser revisto|ser revista)/i,
  /deveria(m)? (ser|estar|ter|haver)/i,
]

export function hasForbiddenTone(text) {
  return FORBIDDEN_PATTERNS.some(r => r.test(text))
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function mountUserContent({ sectionType, sectionData, activeFields, activeExtras, clientName, period, customContext }) {
  const [y, m] = (period || '').split('-').map(Number)
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  const periodLabel = months[m - 1] ? `${months[m - 1]} ${y}` : period

  const fields = getSectionFields(sectionType).filter(f => f.type !== 'delta')

  const sectionLabel = {
    escala: 'Escala da Operação',
    qualidade_operacao: 'Qualidade da Operação',
    indicadores_operacionais: 'Indicadores Operacionais',
    categorias_ocorrencia: 'Categorias de Ocorrência',
    desempenho_operacional: 'Desempenho Operacional',
    suporte: 'Suporte',
  }[sectionType] || sectionType

  const formatField = (key, raw) => {
    const def = getField(sectionType, key)
    if (!def) return String(raw ?? 'N/D')
    const fmt = formatFieldValue(def, raw)
    return fmt ?? 'N/D'
  }

  const linesActive = []

  for (const f of fields) {
    if (!activeFields.includes(f.key)) continue
    const raw = sectionData[f.key]
    if (raw == null) continue
    const formatted = formatField(f.key, raw)

    const deltaKey = `delta_${f.key}`
    const deltaRaw = sectionData[deltaKey]
    let deltaStr = ''
    if (deltaRaw != null) {
      const sign = deltaRaw > 0 ? '+' : ''
      deltaStr = ` (${sign}${deltaRaw}% vs anterior)`
    }

    linesActive.push(`  ${f.label}: ${formatted}${deltaStr}`)
  }

  for (const ex of activeExtras) {
    linesActive.push(`  ${ex.label}: ${ex.value}${ex.delta ? ` (${ex.delta})` : ''}`)
  }

  let prompt = `Relatório mensal — ${sectionLabel}\nCliente: ${clientName} | Período: ${periodLabel}\n`

  if (linesActive.length) {
    prompt += `\nCampos ativos:\n${linesActive.join('\n')}`
  } else {
    prompt += '\nNenhum campo ativo para análise.'
  }

  if (customContext) {
    prompt += '\n\nObservação do analista:\n' + customContext
  }

  return prompt
}

const SECTION_FIELD_HINTS = {
  qualidade_operacao: {
    taxa_sucesso: 'redução indica mais OS com ocorrência',
    total_sucesso: null,
    relatos_imprevistos: null,
    pontualidade: 'redução indica mais atrasos',
    atrasadas: 'aumento indica piora na pontualidade',
    atraso_medio_dias: 'redução indica melhora na pontualidade',
    os_canceladas: null,
  },
  indicadores_operacionais: {
    tempo_execucao: 'redução indica mais agilidade nas visitas',
    tempo_atendimento: 'redução indica agilidade na atribuição',
    tempo_transito: 'redução indica deslocamentos mais rápidos',
    produtos_por_os: 'aumento indica mais itens por visita',
  },
  escala: {
    usuarios_ativos: 'redução pode indicar menor demanda ou ganho de produtividade',
    os_criadas: 'aumento indica maior volume de trabalho',
    produtos_montados: null,
  },
  suporte: {
    tickets_abertos: 'aumento indica maior demanda',
    tickets_resolvidos: null,
    sla_primeira_resposta: 'redução indica melhora no atendimento',
    taxa_resolucao: null,
  },
}

function buildReferenceBlock(sectionType, activeFields) {
  const hints = SECTION_FIELD_HINTS[sectionType]
  if (!hints) return ''
  const labels = []
  for (const key of activeFields) {
    const hint = hints[key]
    if (hint) labels.push('  ' + hint)
  }
  if (!labels.length) return ''
  return '\nInterpretação dos indicadores:\n' + labels.join('\n')
}

function buildSystemPrompt(sectionType, activeFields) {
  const refBlock = buildReferenceBlock(sectionType, activeFields)

  return `Você é um redator de relatórios mensais para a Donc.
Analise APENAS os campos ativos listados abaixo, destacando tendências e contrastes
entre os indicadores fornecidos, em tom leve e observacional.${refBlock}

Destaque contrastes entre os campos listados, sem afirmações contundentes
ou tom crítico/alarmista — o relatório é para o cliente sobre a
própria operação.

Não use linguagem consultiva ("recomenda-se", "sugere-se",
"é importante que", "exige atenção").

Não invente ou mencione dados que não estejam explícitos nos campos fornecidos.
Máximo 3 frases. Português brasileiro. Sem markdown.`
}

export async function generateSectionAnalysis({ sectionType, sectionData, activeFields = [], activeExtras = [], clientName, period, customContext }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Sessão expirada. Faça login novamente.')

  const systemPrompt = buildSystemPrompt(sectionType, activeFields)
  const userContent = mountUserContent({ sectionType, sectionData, activeFields, activeExtras, clientName, period, customContext })

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