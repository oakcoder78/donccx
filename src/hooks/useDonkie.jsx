/**
 * useDonkie — Contexto global do assistente Donkie
 * Exporta DonkieProvider (envolve AppLayout) e useDonkie (hook).
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

// ─── Contexto ────────────────────────────────────────────────
const DonkieContext = createContext(null)

// ─── Carrega donkie_config ───────────────────────────────────
function useDonkieConfig() {
  return useQuery({
    queryKey: ['donkie_config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donkie_config')
        .select('*')
        .eq('id', 1)
        .single()
      if (error) { console.error('[useDonkieConfig]', error); return null }
      return data
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })
}

// ─── Helpers ─────────────────────────────────────────────────
// Converte formato Anthropic para OpenRouter (OpenAI-compatible)
function toOpenRouterContent(content) {
  // Se for string simples, retorna direto
  if (typeof content === 'string') return content

  // Se for array (formato Anthropic multimodal), converte
  if (Array.isArray(content)) {
    return content.map(part => {
      if (part.type === 'image') {
        const mime = part.source?.media_type || 'image/jpeg'
        const data = part.source?.data
        return { type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } }
      }
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }
      return part
    })
  }

  return content
}

function refMonths() {
  const now  = new Date()
  const cur  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const pd   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prev = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`
  const pd2  = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const prev2 = `${pd2.getFullYear()}-${String(pd2.getMonth() + 1).padStart(2, '0')}`
  return [cur, prev, prev2]
}

function monthLabel(refMonth) {
  if (!refMonth) return ''
  const [year, month] = refMonth.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month, 10) - 1]}/${year.slice(2)}`
}

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtMrr(v) {
  if (v == null || v === 0) return 'N/D'
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(v) {
  if (v == null) return 'N/D'
  return `${Math.round(v)}%`
}

async function fetchClientDossie(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      id, name, fantasy_name, abc_class, mrr, segment,
      health_total, health_uso, health_suporte,
      health_relacionamento, health_financeiro, health_projeto,
      stage:stages(name),
      activities(type, title, activity_date, description),
      client_support(tickets_opened, tickets_resolved, n1_pct, n2_pct, n3_pct, sla_first_response, ref_month),
      client_usage(os_created, active_users, ref_month),
      contact_links(papel, champion, contacts(id, name)),
      projects(title, status)
    `)
    .eq('id', clientId)
    .single()
  if (error) { console.error('[useDonkie] fetchClientDossie:', error); return null }

  const [curMonth, prevMonth, prev2Month] = refMonths()

  const activities = (data.activities ?? [])
    .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
    .slice(0, 5)

  const lastActivityDate = activities[0]?.activity_date ?? null

  const support = (data.client_support ?? [])
    .filter(s => s.ref_month === curMonth || s.ref_month === prevMonth)
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))[0] ?? null

  const usages = (data.client_usage ?? [])
    .filter(u => u.ref_month === curMonth || u.ref_month === prevMonth || u.ref_month === prev2Month)
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
    .slice(0, 2)

  const curUsage  = usages[0] ?? null
  const prevUsage = usages[1] ?? null
  const osVariation = (curUsage && prevUsage && prevUsage.os_created)
    ? Math.round(((curUsage.os_created - prevUsage.os_created) / prevUsage.os_created) * 100)
    : null

  const activeProjects = (data.projects ?? [])
    .filter(p => p.status !== 'concluido' && p.status !== 'suspenso' && p.status !== 'cancelado')

  const keyContacts = (data.contact_links ?? [])
    .filter(cl => cl.papel === 'Decisor' || cl.champion === true)
    .map(cl => ({ name: cl.contacts?.name, role: cl.papel === 'Decisor' ? 'Decisor' : 'Champion' }))
    .filter(c => c.name)

  return {
    ...data,
    _activities:       activities,
    _lastActivityDate: lastActivityDate,
    _support:          support,
    _curUsage:         curUsage,
    _prevUsage:        prevUsage,
    _osVariation:      osVariation,
    _activeProjects:   activeProjects,
    _keyContacts:      keyContacts,
  }
}

function detectClientMention(text) {
  const t = text.trim()
  const patterns = [
    /(?:cliente|empresa|conta|sobre|análise d[eo]|como (?:está|vai|estão)|me (?:fala|fale) (?:sobre|do|da|de))\s+(.+)/i,
    /(?:situação|status|health|dossiê|perfil)\s+(?:do|da|de)\s+(.+)/i,
    /(.+?)\s+(?:está bem|está mal|em risco|saudável|com risco)/i,
    /(?:do|da|de|para o|para a)\s+([A-ZÀ-Úa-zà-ú][a-zA-ZÀ-ÿ0-9\s&._-]{1,40}?)(?:\s*[?!.,;:]|$)/,
    /(?:health score|score|saúde|situação|carteira|conta|cliente)\s+(?:do|da|de|para)?\s*([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ0-9\s&._-]{1,40}?)(?:\s*[?!.,;:]|$)/i,
  ]
  for (const re of patterns) {
    const m = t.match(re)
    if (m?.[1]) return m[1].replace(/[?!.,;:]+$/, '').trim()
  }
  const words = t.split(/\s+/)
  if (words.length <= 5 && !/^(o que|como|qual|quando|onde|por que|quem|me|nos|você)/i.test(t)) {
    return t.replace(/[?!.,;:]+$/, '').trim()
  }
  return null
}

async function searchClientsByName(term) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, fantasy_name')
    .or(`fantasy_name.ilike.%${term}%,name.ilike.%${term}%`)
    .eq('contract_active', true)
    .order('fantasy_name')
    .limit(6)
  if (error) { console.error('[useDonkie] searchClientsByName:', error); return [] }
  return data ?? []
}

// ─── Busca dados enriquecidos do cliente pela rota ───────────
function useRouteClientData(pathname) {
  const match    = pathname.match(/^\/empresas\/(\d+)/)
  const clientId = match ? parseInt(match[1], 10) : null

  return useQuery({
    queryKey: ['donkie_client_ctx', clientId],
    enabled:  !!clientId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id, name, fantasy_name, abc_class, mrr, segment,
          health_total, health_uso, health_suporte,
          health_relacionamento, health_financeiro, health_projeto,
          stage:stages(name),
          activities(type, title, activity_date, description),
          client_support(tickets_opened, tickets_resolved, n1_pct, n2_pct, n3_pct, sla_first_response, ref_month),
          client_usage(os_created, active_users, ref_month),
          contact_links(papel, champion, contacts(id, name)),
          projects(title, status)
        `)
        .eq('id', clientId)
        .single()
      if (error) { console.error('[useDonkie] client ctx:', error); return null }

      const [curMonth, prevMonth, prev2Month] = refMonths()

      // Últimas 5 atividades
      const activities = (data.activities ?? [])
        .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
        .slice(0, 5)

      const lastActivityDate = activities[0]?.activity_date ?? null

      // Suporte: mês atual ou anterior, mais recente primeiro
      const support = (data.client_support ?? [])
        .filter(s => s.ref_month === curMonth || s.ref_month === prevMonth)
        .sort((a, b) => b.ref_month.localeCompare(a.ref_month))[0] ?? null

      // Uso: últimos 2 meses disponíveis
      const usages = (data.client_usage ?? [])
        .filter(u => u.ref_month === curMonth || u.ref_month === prevMonth || u.ref_month === prev2Month)
        .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
        .slice(0, 2)

      // Variação de OS mês a mês
      const curUsage  = usages[0] ?? null
      const prevUsage = usages[1] ?? null
      const osVariation = (curUsage && prevUsage && prevUsage.os_created)
        ? Math.round(((curUsage.os_created - prevUsage.os_created) / prevUsage.os_created) * 100)
        : null

      // Projetos ativos
      const activeProjects = (data.projects ?? [])
        .filter(p => p.status !== 'concluido' && p.status !== 'suspenso' && p.status !== 'cancelado')

      // Decisores e Champions
      const keyContacts = (data.contact_links ?? [])
        .filter(cl => cl.papel === 'Decisor' || cl.champion === true)
        .map(cl => ({
          name: cl.contacts?.name,
          role: cl.papel === 'Decisor' ? 'Decisor' : 'Champion',
        }))
        .filter(c => c.name)

      return {
        ...data,
        _activities:       activities,
        _lastActivityDate: lastActivityDate,
        _support:          support,
        _curUsage:         curUsage,
        _prevUsage:        prevUsage,
        _osVariation:      osVariation,
        _activeProjects:   activeProjects,
        _keyContacts:      keyContacts,
      }
    },
    staleTime: 60 * 1000,
    retry: 0,
  })
}

// ─── Monta contexto de rota ──────────────────────────────────
function buildRouteContext(pathname, clientData) {
  if (pathname === '/dashboard') {
    return 'Usuário está na Dashboard — visão geral da carteira de clientes.'
  }

  if (/^\/empresas\/\d+\/relatorios\/.+\/editar/.test(pathname)) {
    const cn = clientData?.fantasy_name || clientData?.name || 'cliente'
    return `Usuário está editando um Relatório Mensal (RMC) para ${cn}.`
  }

  if (/^\/empresas\/\d+/.test(pathname) && clientData) {
    const cn        = clientData.fantasy_name || clientData.name
    const hs        = clientData.health_total ?? 0
    const st        = hs >= 75 ? 'Saudável' : hs >= 50 ? 'Atenção' : 'Risco'
    const stageName = clientData.stage?.name ?? null
    const segName   = clientData.segment ?? null

    // Linha 1 — identificação
    const abc = clientData.abc_class ? `ABC ${clientData.abc_class}` : null
    const parts1 = [
      `Cliente: ${cn}`,
      abc,
      segName ? `Segmento: ${segName}` : null,
      `MRR: ${fmtMrr(clientData.mrr)}`,
    ].filter(Boolean)
    let ctx = parts1.join(' | ')

    // Linha 2 — health
    ctx += `\nHealth Score: ${hs}/100 (${st})` +
      ` — Uso ${clientData.health_uso ?? 0}` +
      `, Suporte ${clientData.health_suporte ?? 0}` +
      `, Relacionamento ${clientData.health_relacionamento ?? 0}` +
      `, Financeiro ${clientData.health_financeiro ?? 0}` +
      `, Projeto ${clientData.health_projeto ?? 0}` +
      (stageName ? ` | Estágio: ${stageName}` : '')

    // Linha 3 — operação (uso)
    const cu = clientData._curUsage
    if (cu) {
      const varStr = clientData._osVariation != null
        ? ` (${clientData._osVariation > 0 ? '+' : ''}${clientData._osVariation}% vs mês anterior)`
        : ''
      const osUser = (cu.os_created && cu.active_users)
        ? ` | ${Math.round(cu.os_created / cu.active_users)} OS/usuário`
        : ''
      ctx += `\nOperação (${monthLabel(cu.ref_month)}): ${cu.os_created ?? 'N/D'} OS criadas${varStr} | ${cu.active_users ?? 'N/D'} usuários ativos${osUser}`
    }

    // Linha 4 — suporte
    const sup = clientData._support
    if (sup) {
      const sla = sup.sla_first_response != null ? ` | SLA 1ª resp: ${sup.sla_first_response}min` : ''
      ctx += `\nSuporte (${monthLabel(sup.ref_month)}): ${sup.tickets_opened ?? 0} tickets | ${sup.tickets_resolved ?? 0} resolvidos` +
        ` | N1: ${fmtPct(sup.n1_pct)} N2: ${fmtPct(sup.n2_pct)} N3: ${fmtPct(sup.n3_pct)}${sla}`
    }

    // Linha 5 — decisores/champions
    const kc = clientData._keyContacts ?? []
    if (kc.length > 0) {
      ctx += `\nDecisores/Champions: ${kc.map(c => `${c.name} (${c.role})`).join(', ')}`
    }

    // Linha 6 — últimas atividades
    const acts = clientData._activities ?? []
    if (acts.length > 0) {
      const actStr = acts
        .map(a => `${a.type} — ${a.title}${a.activity_date ? ` — ${fmtDate(a.activity_date)}` : ''}`)
        .join('; ')
      ctx += `\nÚltimas atividades: ${actStr}`
    }

    // Linha 7 — projetos ativos
    const projs = clientData._activeProjects ?? []
    if (projs.length > 0) {
      ctx += `\nProjetos ativos: ${projs.map(p => `${p.title} (${p.status})`).join('; ')}`
    }

    // Linha 8 — último contato
    if (clientData._lastActivityDate) {
      ctx += `\nÚltimo contato: ${fmtDate(clientData._lastActivityDate)}`
    }

    return ctx
  }

  if (pathname === '/projetos')      return 'Usuário está na visão global do Kanban de Projetos.'
  if (pathname === '/atividades')    return 'Usuário está na lista de Atividades.'
  if (pathname === '/contatos')      return 'Usuário está na lista de Contatos.'
  if (pathname === '/configuracoes') return 'Usuário está nas Configurações do sistema.'
  return `Usuário está em ${pathname}.`
}

// ─── Monta system prompt completo ────────────────────────────
function buildSystemPrompt(config, profile, routeContext, mode) {
  if (!config) return 'Você é o Donkie, assistente de Customer Success da Donc.'

  const modeInstruction = mode === 'implementacao'
    ? '\n\nMODO ATUAL: Implementação. Seja executivo: gere conteúdo pronto, proponha ações concretas com o formato [ACAO:{...}] quando for o caso, e aguarde confirmação.'
    : '\n\nMODO ATUAL: Discussão. Questione, analise e sugira. Não execute ações sem confirmação explícita.'

  const userCtx = profile
    ? `\n\nUsuário atual: ${profile.name || 'CSM'}, função: ${profile.role || 'csm'}.`
    : ''

  const routeCtx = routeContext
    ? `\n\nCONTEXTO ATUAL:\n${routeContext}`
    : ''

  return config.system_prompt + userCtx + modeInstruction + routeCtx
}

// ─── Provider ────────────────────────────────────────────────
export function DonkieProvider({ children }) {
  const { profile } = useAuth()
  const location    = useLocation()
  const { data: config }          = useDonkieConfig()
  const { data: routeClientData } = useRouteClientData(location.pathname)

  const [isOpen,     setIsOpen]    = useState(false)
  const [messages,   setMessages]  = useState([])
  const [mode,       setMode]      = useState('discussao')
  const [isLoading,  setIsLoading] = useState(false)
  const [clientData, setClientData] = useState(null)
  const [convId,     setConvId]    = useState(null)
  const [pendingClientSearch, setPendingClientSearch] = useState(null)

  useEffect(() => {
    if (config?.default_mode) setMode(config.default_mode)
  }, [config?.default_mode])

  const prevPath = useRef(location.pathname)
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      setConvId(null)
    }
  }, [location.pathname])

  // ── Salva conversa (debounced) ────────────────────────────
  const saveTimer = useRef(null)
  const saveConversation = useCallback((msgs, cid) => {
    if (!profile?.id || msgs.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const m           = location.pathname.match(/^\/empresas\/(\d+)/)
      const clientIdNum = m ? parseInt(m[1], 10) : null
      if (cid) {
        await supabase
          .from('donkie_conversations')
          .update({ messages: msgs, updated_at: new Date().toISOString(), route: location.pathname })
          .eq('id', cid)
      } else {
        const { data } = await supabase
          .from('donkie_conversations')
          .insert({ user_id: profile.id, client_id: clientIdNum, route: location.pathname, messages: msgs })
          .select('id')
          .single()
        if (data?.id) setConvId(data.id)
      }
    }, 1500)
  }, [profile?.id, location.pathname])

  // ── Envia mensagem ────────────────────────────────────────
  const sendMessage = useCallback(async (content, imageBase64 = null, imageMime = null) => {
    if (!content.trim() && !imageBase64) return
    if (isLoading) return

    const userContent = imageBase64
      ? [
          { type: 'image', source: { type: 'base64', media_type: imageMime || 'image/jpeg', data: imageBase64 } },
          { type: 'text',  text: content || 'O que você vê nessa imagem?' },
        ]
      : content

    const newMessages = [...messages, { role: 'user', content: userContent }]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const activeClient = routeClientData || clientData

      // ── Busca de cliente por nome (fora da ficha) ────────────────────────────
      if (!activeClient && !imageBase64 && typeof content === 'string') {
        if (pendingClientSearch) {
          const idx = parseInt(content.trim(), 10)
          if (!isNaN(idx) && idx >= 1 && idx <= pendingClientSearch.length) {
            const chosen = pendingClientSearch[idx - 1]
            setPendingClientSearch(null)
            const dossie = await fetchClientDossie(chosen.id)
            if (dossie) {
              setClientData(dossie)
              const displayName = dossie.fantasy_name || dossie.name
              const confirmMsg = { role: 'assistant', content: `Dossiê de **${displayName}** carregado. O que você quer saber?` }
              setMessages([...newMessages, confirmMsg])
              saveConversation([...newMessages, confirmMsg], convId)
              setIsLoading(false)
              return
            }
          } else {
            setPendingClientSearch(null)
          }
        }

        const term = detectClientMention(content)
        if (term && term.length >= 2) {
          const results = await searchClientsByName(term)

          if (results.length === 1) {
            const dossie = await fetchClientDossie(results[0].id)
            if (dossie) {
              setClientData(dossie)
              const routeCtx   = buildRouteContext(location.pathname, dossie)
              const systemText = buildSystemPrompt(config, profile, routeCtx, mode)
              const apiMessages = [
                { role: 'system', content: systemText },
                ...newMessages.map(m => ({ role: m.role, content: toOpenRouterContent(m.content) })),
              ]
              const { data: { session } } = await supabase.auth.getSession()
              const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                  },
                  body: JSON.stringify({ messages: apiMessages }),
                }
              )
              const data = await response.json()
              if (!response.ok) throw new Error(data.error?.message || data.error || `HTTP ${response.status}`)
              const assistantText = data?.choices?.[0]?.message?.content ?? ''
              const finalMessages = [...newMessages, { role: 'assistant', content: assistantText }]
              setMessages(finalMessages)
              saveConversation(finalMessages, convId)
              setIsLoading(false)
              return
            }
          } else if (results.length > 1) {
            setPendingClientSearch(results)
            const list = results
              .map((c, i) => `${i + 1}. ${c.fantasy_name || c.name}${c.fantasy_name && c.name !== c.fantasy_name ? ` (${c.name})` : ''}`)
              .join('\n')
            const choiceMsg = { role: 'assistant', content: `Encontrei ${results.length} clientes com esse nome. Qual você quer?\n\n${list}\n\nDigite o número correspondente.` }
            setMessages([...newMessages, choiceMsg])
            saveConversation([...newMessages, choiceMsg], convId)
            setIsLoading(false)
            return
          }
        }
      }

      // ── Fluxo normal ─────────────────────────────────────────────────────────
      const routeCtx   = buildRouteContext(location.pathname, activeClient)
      const systemText = buildSystemPrompt(config, profile, routeCtx, mode)
      const apiMessages = [
        { role: 'system', content: systemText },
        ...newMessages.map(m => ({ role: m.role, content: toOpenRouterContent(m.content) })),
      ]

      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/openrouter-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            max_tokens: 1000,
            messages:   apiMessages,
          }),
        }
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error?.message || data.error || `HTTP ${response.status}`)
      if (data?.error)  throw new Error(data.error?.message || data.error || 'Erro na resposta da IA')

      const assistantText = data.choices?.[0]?.message?.content ?? ''
      const finalMessages = [...newMessages, { role: 'assistant', content: assistantText }]

      setMessages(finalMessages)
      saveConversation(finalMessages, convId)

    } catch (err) {
      console.error('[useDonkie] sendMessage error:', err)
      setMessages(prev => [...prev, {
        role:    'assistant',
        content: `⚠️ Erro ao conectar com o Donkie: ${err.message}`,
      }])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, config, profile, location.pathname, routeClientData, clientData, pendingClientSearch, mode, convId, saveConversation])

  const toggleMode       = useCallback(() => setMode(m => m === 'discussao' ? 'implementacao' : 'discussao'), [])
  const clearConversation = useCallback(() => { setMessages([]); setConvId(null) }, [])
  const open   = useCallback(() => setIsOpen(true),    [])
  const close  = useCallback(() => setIsOpen(false),   [])
  const toggle = useCallback(() => setIsOpen(o => !o), [])

  return (
    <DonkieContext.Provider value={{
      isOpen, open, close, toggle,
      messages, isLoading,
      mode, toggleMode,
      sendMessage, clearConversation,
      clientData: routeClientData || clientData,
      setClientData,
      config,
    }}>
      {children}
    </DonkieContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────
export function useDonkie() {
  const ctx = useContext(DonkieContext)
  if (!ctx) throw new Error('useDonkie deve ser usado dentro de DonkieProvider')
  return ctx
}
