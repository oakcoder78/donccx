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

// ─── Helpers de data ─────────────────────────────────────────
function refMonths() {
  const now = new Date()
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prv = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  return [cur, prv]
}

function fmtDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Busca dados enriquecidos do cliente pela rota ───────────
function useRouteClientData(pathname) {
  const match = pathname.match(/^\/empresas\/(\d+)/)
  const clientId = match ? parseInt(match[1], 10) : null

  return useQuery({
    queryKey: ['donkie_client_ctx', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id, name, fantasy_name,
          health_total, health_uso, health_suporte,
          health_relacionamento, health_financeiro, health_projeto,
          stage:stages(name),
          activities(type, title, activity_date),
          client_support(tickets_opened, tickets_resolved, sla_first_response, ref_month),
          projects(title, status)
        `)
        .eq('id', clientId)
        .single()
      if (error) { console.error('[useDonkie] client ctx:', error); return null }

      // Pós-processa: ordena e filtra no client (sem round-trips extras)
      const [curMonth, prvMonth] = refMonths()

      const activities = (data.activities ?? [])
        .sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
        .slice(0, 3)

      const lastActivityDate = activities[0]?.activity_date ?? null

      const support = (data.client_support ?? [])
        .filter(s => s.ref_month === curMonth || s.ref_month === prvMonth)
        .sort((a, b) => b.ref_month.localeCompare(a.ref_month))[0] ?? null

      const activeProjects = (data.projects ?? [])
        .filter(p => p.status !== 'concluido' && p.status !== 'suspenso')

      return {
        ...data,
        _activities:      activities,
        _lastActivityDate: lastActivityDate,
        _support:         support,
        _activeProjects:  activeProjects,
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
    const cn       = clientData.fantasy_name || clientData.name
    const hs       = clientData.health_total ?? 0
    const st       = hs >= 75 ? 'Saudável' : hs >= 50 ? 'Atenção' : 'Risco'
    const stageName = clientData.stage?.name ?? null

    // Health block
    let ctx =
      `Usuário está na ficha de ${cn}. ` +
      `Health Score total: ${hs} (${st}). ` +
      `Dimensões: Uso ${clientData.health_uso ?? 0}/20, ` +
      `Suporte ${clientData.health_suporte ?? 0}/20, ` +
      `Relacionamento ${clientData.health_relacionamento ?? 0}/20, ` +
      `Financeiro ${clientData.health_financeiro ?? 0}/20, ` +
      `Projeto ${clientData.health_projeto ?? 0}/20.` +
      (stageName ? ` Estágio: ${stageName}.` : '')

    // Últimas atividades
    const acts = clientData._activities ?? []
    if (acts.length > 0) {
      const actStr = acts
        .map(a => `${a.type} — ${a.title}${a.activity_date ? ` (${fmtDate(a.activity_date)})` : ''}`)
        .join('; ')
      ctx += ` Últimas atividades: ${actStr}.`
    }

    // Último contato
    if (clientData._lastActivityDate) {
      ctx += ` Último contato: ${fmtDate(clientData._lastActivityDate)}.`
    }

    // Suporte último mês
    const sup = clientData._support
    if (sup) {
      const sla = sup.sla_first_response != null ? ` SLA 1ª resposta: ${sup.sla_first_response} min.` : ''
      ctx +=
        ` Suporte (${sup.ref_month}): ${sup.tickets_opened ?? 0} tickets abertos, ` +
        `${sup.tickets_resolved ?? 0} resolvidos.${sla}`
    }

    // Projetos ativos
    const projs = clientData._activeProjects ?? []
    if (projs.length > 0) {
      const projStr = projs.map(p => `${p.title} (${p.status})`).join('; ')
      ctx += ` Projetos ativos: ${projStr}.`
    }

    return ctx
  }

  if (pathname === '/projetos') {
    return 'Usuário está na visão global do Kanban de Projetos.'
  }
  if (pathname === '/atividades') {
    return 'Usuário está na lista de Atividades.'
  }
  if (pathname === '/contatos') {
    return 'Usuário está na lista de Contatos.'
  }
  if (pathname === '/configuracoes') {
    return 'Usuário está nas Configurações do sistema.'
  }
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
    ? `\n\nContexto da tela: ${routeContext}`
    : ''

  return config.system_prompt + userCtx + routeCtx + modeInstruction
}

// ─── Provider ────────────────────────────────────────────────
export function DonkieProvider({ children }) {
  const { profile } = useAuth()
  const location = useLocation()
  const { data: config } = useDonkieConfig()
  const { data: routeClientData } = useRouteClientData(location.pathname)

  const [isOpen,     setIsOpen]    = useState(false)
  const [messages,   setMessages]  = useState([])
  const [mode,       setMode]      = useState('discussao')
  const [isLoading,  setIsLoading] = useState(false)
  const [clientData, setClientData] = useState(null)  // override manual (legado)
  const [convId,     setConvId]    = useState(null)

  // Modo default do config
  useEffect(() => {
    if (config?.default_mode) setMode(config.default_mode)
  }, [config?.default_mode])

  // Limpa conversa quando muda de rota
  const prevPath = useRef(location.pathname)
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      setConvId(null)
    }
  }, [location.pathname])

  // ── Salva conversa no Supabase (debounced) ────────────────
  const saveTimer = useRef(null)
  const saveConversation = useCallback((msgs, cid) => {
    if (!profile?.id || msgs.length === 0) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const clientIdMatch = location.pathname.match(/^\/empresas\/(\d+)/)
      const clientIdNum   = clientIdMatch ? parseInt(clientIdMatch[1], 10) : null

      if (cid) {
        await supabase
          .from('donkie_conversations')
          .update({ messages: msgs, updated_at: new Date().toISOString(), route: location.pathname })
          .eq('id', cid)
      } else {
        const { data } = await supabase
          .from('donkie_conversations')
          .insert({
            user_id:   profile.id,
            client_id: clientIdNum,
            route:     location.pathname,
            messages:  msgs,
          })
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

    const userMsg = { role: 'user', content: userContent }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      // routeClientData (automático) tem precedência sobre clientData manual
      const activeClientData = routeClientData || clientData
      const routeCtx   = buildRouteContext(location.pathname, activeClientData)
      const systemText = buildSystemPrompt(config, profile, routeCtx, mode)

      const apiMessages = newMessages.map(m => ({
        role:    m.role,
        content: m.content,
      }))

      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donkie-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            model:      'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system:     systemText,
            messages:   apiMessages,
          }),
        }
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error?.message || data.error || `HTTP ${response.status}`)
      if (data?.error)  throw new Error(data.error?.message || data.error || 'Erro na resposta da IA')

      const assistantText = data.content?.[0]?.text ?? ''
      const assistantMsg  = { role: 'assistant', content: assistantText }
      const finalMessages = [...newMessages, assistantMsg]

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
  }, [messages, isLoading, config, profile, location.pathname, routeClientData, clientData, mode, convId, saveConversation])

  const toggleMode = useCallback(() => {
    setMode(m => m === 'discussao' ? 'implementacao' : 'discussao')
  }, [])

  const clearConversation = useCallback(() => {
    setMessages([])
    setConvId(null)
  }, [])

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
