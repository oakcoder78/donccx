/**
 * useDonkie — Contexto global do assistente Donkie
 * Exporta DonkieProvider (envolve AppLayout) e useDonkie (hook).
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
    const cn  = clientData.fantasy_name || clientData.name
    const hs  = clientData.health_total ?? 0
    const st  = hs >= 75 ? 'Saudável' : hs >= 50 ? 'Atenção' : 'Risco'
    return (
      `Usuário está na ficha de ${cn}. ` +
      `Health Score: ${hs} (${st}). ` +
      `Dimensões — Uso: ${clientData.health_uso ?? 0}, ` +
      `Suporte: ${clientData.health_suporte ?? 0}, ` +
      `Relacionamento: ${clientData.health_relacionamento ?? 0}, ` +
      `Financeiro: ${clientData.health_financeiro ?? 0}, ` +
      `Projeto: ${clientData.health_projeto ?? 0}.`
    )
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

  const [isOpen,    setIsOpen]    = useState(false)
  const [messages,  setMessages]  = useState([])
  const [mode,      setMode]      = useState('discussao')
  const [isLoading, setIsLoading] = useState(false)
  const [clientData, setClientData] = useState(null)
  const [convId,    setConvId]    = useState(null)

  // Modo default do config
  useEffect(() => {
    if (config?.default_mode) setMode(config.default_mode)
  }, [config?.default_mode])

  // Limpa conversa quando muda de rota
  const prevPath = useRef(location.pathname)
  useEffect(() => {
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
      // Mantém histórico mas reseta o context_id
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

    // Monta conteúdo da mensagem do usuário (com ou sem imagem)
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
      const routeCtx   = buildRouteContext(location.pathname, clientData)
      const systemText = buildSystemPrompt(config, profile, routeCtx, mode)

      // Converte para formato da API (garante que text-only são strings)
      const apiMessages = newMessages.map(m => ({
        role:    m.role,
        content: m.content,
      }))

      const { data, error: fnError } = await supabase.functions.invoke('donkie-chat', {
        body: {
          model:      'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system:     systemText,
          messages:   apiMessages,
        },
      })

      if (fnError) throw new Error(fnError.message || 'Erro na Edge Function')
      if (data?.error) throw new Error(data.error?.message || data.error || 'Erro na resposta da IA')

      const assistantText = data.content?.[0]?.text ?? ''
      const assistantMsg  = { role: 'assistant', content: assistantText }
      const finalMessages = [...newMessages, assistantMsg]

      setMessages(finalMessages)
      saveConversation(finalMessages, convId)

    } catch (err) {
      console.error('[useDonkie] sendMessage error:', err)
      const errMsg = {
        role:    'assistant',
        content: `⚠️ Erro ao conectar com o Donkie: ${err.message}`,
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, config, profile, location.pathname, clientData, mode, convId, saveConversation])

  const toggleMode = useCallback(() => {
    setMode(m => m === 'discussao' ? 'implementacao' : 'discussao')
  }, [])

  const clearConversation = useCallback(() => {
    setMessages([])
    setConvId(null)
  }, [])

  const open  = useCallback(() => setIsOpen(true),  [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(o => !o), [])

  return (
    <DonkieContext.Provider value={{
      isOpen, open, close, toggle,
      messages, isLoading,
      mode, toggleMode,
      sendMessage, clearConversation,
      clientData, setClientData,
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
