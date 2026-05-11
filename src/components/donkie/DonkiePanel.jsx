import { useState, useRef, useEffect, useCallback } from 'react'
import { useDonkie } from '../../hooks/useDonkie'
import { useActivityMutations } from '../../hooks/useActivities'
import toast from 'react-hot-toast'

// ─── Markdown simples ────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ''
  let html = text
    // Escapa HTML básico
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.+)$/gm, '<h4 style="font-size:13px;font-weight:700;margin:10px 0 4px;">$1</h4>')
    .replace(/^## (.+)$/gm,  '<h3 style="font-size:14px;font-weight:700;margin:10px 0 4px;">$1</h3>')
    // Bold e italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    // Código inline
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace;">$1</code>')
    // Listas
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="margin:6px 0;padding-left:18px;">${m}</ul>`)
    // Parágrafos (linhas duplas)
    .split('\n\n')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li')) return p
      return `<p style="margin:0 0 8px 0;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`
    })
    .join('')
  return html
}

// ─── Parser de ações [ACAO:{...}] ────────────────────────────
function parseMessageParts(text) {
  const actionRe = /\[ACAO:(\{[\s\S]*?\})\]/g
  const parts = []
  let last = 0
  let m

  while ((m = actionRe.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ type: 'text', content: text.slice(last, m.index) })
    }
    try {
      const action = JSON.parse(m[1])
      parts.push({ type: 'action', action })
    } catch {
      parts.push({ type: 'text', content: m[0] })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) {
    parts.push({ type: 'text', content: text.slice(last) })
  }
  return parts.length ? parts : [{ type: 'text', content: text }]
}

// ─── Card de Ação Supervisionada ─────────────────────────────
const ACTIVITY_TYPE_LABEL = {
  reuniao:  '📅 Reunião',
  ligacao:  '📞 Ligação',
  email:    '📧 E-mail',
  whatsapp: '💬 WhatsApp',
  tarefa:   '✅ Tarefa',
  nota:     '📝 Nota',
}

function ActionCard({ action, onConfirm, onCancel, confirmed }) {
  const { data } = action
  if (!data) return null
  const label = ACTIVITY_TYPE_LABEL[data.type] || data.type

  if (confirmed === true) {
    return (
      <div style={{
        marginTop: 10, padding: '10px 14px', borderRadius: 8,
        background: '#d1fae5', border: '1px solid #6ee7b7',
        fontSize: 12, color: '#065f46', fontWeight: 600,
      }}>
        ✅ Atividade criada com sucesso!
      </div>
    )
  }
  if (confirmed === false) {
    return (
      <div style={{
        marginTop: 10, padding: '10px 14px', borderRadius: 8,
        background: '#f1f5f9', border: '1px solid #e2e8f0',
        fontSize: 12, color: '#64748b',
      }}>
        ↩ Ação cancelada.
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 10, padding: '12px 14px', borderRadius: 8,
      background: '#f8fafc', border: '1px solid #e2e8f0',
      fontSize: 13,
    }}>
      <div style={{ fontWeight: 700, color: '#173557', marginBottom: 6 }}>
        🎯 Ação sugerida — {label}
      </div>
      {data.title && (
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: '#64748b' }}>Título: </span>
          <span style={{ color: '#1e293b' }}>{data.title}</span>
        </div>
      )}
      {data.description && (
        <div style={{ marginBottom: 2 }}>
          <span style={{ color: '#64748b' }}>Descrição: </span>
          <span style={{ color: '#1e293b' }}>{data.description}</span>
        </div>
      )}
      {data.activity_date && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ color: '#64748b' }}>Data: </span>
          <span style={{ color: '#1e293b' }}>
            {new Date(data.activity_date + 'T00:00:00').toLocaleDateString('pt-BR')}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onConfirm}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 7, border: 'none',
            background: '#173557', color: '#fff', fontWeight: 700,
            fontSize: 12, cursor: 'pointer',
          }}
        >
          Confirmar
        </button>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 7,
            border: '1px solid #e2e8f0', background: '#fff',
            color: '#64748b', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Bolha de mensagem ────────────────────────────────────────
function MessageBubble({ msg, onConfirmAction, actionStates }) {
  const isUser = msg.role === 'user'

  const textContent = Array.isArray(msg.content)
    ? msg.content.find(c => c.type === 'text')?.text ?? ''
    : msg.content ?? ''

  const imgContent = Array.isArray(msg.content)
    ? msg.content.find(c => c.type === 'image')
    : null

  const parts = isUser ? null : parseMessageParts(textContent)

  return (
    <div style={{
      display:       'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems:    'flex-start',
      gap:           8,
      marginBottom:  12,
    }}>
      {/* Avatar do Donkie */}
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: '#173557', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, color: '#d3da47',
          marginTop: 2,
        }}>D</div>
      )}

      <div style={{ maxWidth: '80%' }}>
        {/* Imagem se houver */}
        {imgContent && (
          <div style={{ marginBottom: 6 }}>
            <img
              src={`data:${imgContent.source?.media_type};base64,${imgContent.source?.data}`}
              alt="anexo"
              style={{ maxWidth: 200, borderRadius: 8, display: 'block' }}
            />
          </div>
        )}

        {/* Bolha de texto */}
        {textContent && (
          <div style={{
            padding:      '10px 14px',
            borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
            background:   isUser ? '#173557' : '#f1f5f9',
            color:        isUser ? '#fff' : '#1e293b',
            fontSize:     13,
            lineHeight:   1.5,
          }}>
            {isUser ? (
              <span style={{ whiteSpace: 'pre-wrap' }}>{textContent}</span>
            ) : (
              <>
                {parts?.map((part, i) => {
                  if (part.type === 'text') {
                    return (
                      <div
                        key={i}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(part.content) }}
                      />
                    )
                  }
                  if (part.type === 'action') {
                    const stateKey = `${msg._id ?? i}_${i}`
                    return (
                      <ActionCard
                        key={i}
                        action={part.action}
                        confirmed={actionStates[stateKey]}
                        onConfirm={() => onConfirmAction(stateKey, part.action, true)}
                        onCancel={() => onConfirmAction(stateKey, part.action, false)}
                      />
                    )
                  }
                  return null
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Indicador de loading ─────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: '#173557', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 800, color: '#d3da47',
      }}>D</div>
      <div style={{
        padding: '10px 16px', borderRadius: '4px 16px 16px 16px',
        background: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: '#94a3b8', display: 'inline-block',
              animation: `donkie-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes donkie-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .4; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ─── Painel principal ─────────────────────────────────────────
export function DonkiePanel() {
  const {
    isOpen, close,
    messages, isLoading,
    mode, toggleMode,
    sendMessage, clearConversation,
    lastModel,
  } = useDonkie()

  const { create: createActivity } = useActivityMutations()

  const [input,        setInput]        = useState('')
  const [image,        setImage]        = useState(null) // { base64, mime, preview }
  const [actionStates, setActionStates] = useState({})   // stateKey → true|false
  const messagesEndRef = useRef(null)
  const textareaRef    = useRef(null)
  const fileInputRef   = useRef(null)

  // Scroll automático
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages, isLoading, isOpen])

  // ── Envio ────────────────────────────────────────────────
  async function handleSend() {
    const text = input.trim()
    if (!text && !image) return
    setInput('')
    const imgBase64 = image?.base64 ?? null
    const imgMime   = image?.mime   ?? null
    setImage(null)
    await sendMessage(text, imgBase64, imgMime)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Imagem ───────────────────────────────────────────────
  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      const base64  = dataUrl.split(',')[1]
      setImage({ base64, mime: file.type, preview: dataUrl })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Ação supervisionada ──────────────────────────────────
  async function handleConfirmAction(stateKey, action, confirmed) {
    setActionStates(prev => ({ ...prev, [stateKey]: confirmed }))
    if (!confirmed) return

    if (action.type === 'create_activity') {
      try {
        await createActivity.mutateAsync({
          ...action.data,
          activity_date: action.data.activity_date || new Date().toISOString().slice(0, 10),
          status:        action.data.status || 'pendente',
        })
        // Notifica no chat
        await sendMessage('✅ Atividade confirmada e criada com sucesso!')
      } catch (err) {
        toast.error('Erro ao criar atividade: ' + err.message)
      }
    }
  }

  // ── Painel não renderiza se fechado ──────────────────────
  const PANEL_WIDTH = 420

  return (
    <>
      {/* Overlay semi-transparente em mobile */}
      {isOpen && (
        <div
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 99,
            background: 'rgba(0,0,0,0.15)',
            backdropFilter: 'blur(1px)',
          }}
        />
      )}

      {/* Painel lateral */}
      <div style={{
        position:   'fixed',
        top:        0,
        right:      0,
        bottom:     0,
        width:      PANEL_WIDTH,
        zIndex:     100,
        background: '#ffffff',
        boxShadow:  '-4px 0 32px rgba(0,0,0,0.12)',
        display:    'flex',
        flexDirection: 'column',
        transform:  isOpen ? 'translateX(0)' : `translateX(${PANEL_WIDTH}px)`,
        transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding:      '14px 16px',
          borderBottom: '1px solid #e2e8f0',
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          flexShrink:   0,
          background:   '#ffffff',
        }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: '#173557', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 800, color: '#d3da47',
          }}>D</div>

          {/* Nome + modo */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#173557', lineHeight: 1.2 }}>
              Donkie
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              Assistente de CS · Donc
            </div>
          </div>

          {/* Toggle de modo */}
          <button
            onClick={toggleMode}
            title={mode === 'discussao' ? 'Mudar para Implementação' : 'Mudar para Discussão'}
            style={{
              padding:      '4px 10px',
              borderRadius: 20,
              border:       'none',
              background:   mode === 'implementacao' ? '#173557' : '#f1f5f9',
              color:        mode === 'implementacao' ? '#d3da47' : '#64748b',
              fontSize:     11,
              fontWeight:   700,
              cursor:       'pointer',
              transition:   'all .15s',
              letterSpacing: 0.3,
            }}
          >
            {mode === 'implementacao' ? '⚡ Implement.' : '💬 Discussão'}
          </button>

          {/* Limpar */}
          {messages.length > 0 && (
            <button
              onClick={clearConversation}
              title="Limpar conversa"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: 18, lineHeight: 1, padding: 2,
              }}
            >
              🗑
            </button>
          )}

          {/* Fechar */}
          <button
            onClick={close}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#94a3b8', fontSize: 20, lineHeight: 1, padding: 2,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Mensagens ── */}
        <div style={{
          flex:       1,
          overflowY:  'auto',
          padding:    '16px 14px',
          background: '#fafafa',
        }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>👋</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                Olá! Sou o Donkie.
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                Seu assistente especialista em Customer Success da Donc.
                <br />
                Pergunte sobre clientes, estratégias de CS ou peça ajuda para redigir comunicações.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              msg={{ ...msg, _id: i }}
              actionStates={actionStates}
              onConfirmAction={handleConfirmAction}
            />
          ))}

          {isLoading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Footer: input ── */}
        <div style={{
          padding:      '12px 14px',
          borderTop:    '1px solid #e2e8f0',
          background:   '#ffffff',
          flexShrink:   0,
        }}>
          {/* Preview de imagem */}
          {image && (
            <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
              <img
                src={image.preview}
                alt="preview"
                style={{ height: 60, borderRadius: 8, display: 'block' }}
              />
              <button
                onClick={() => setImage(null)}
                style={{
                  position: 'absolute', top: -6, right: -6,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#ef4444', border: 'none', color: '#fff',
                  fontSize: 12, cursor: 'pointer', lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >×</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            {/* Anexar imagem */}
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Anexar imagem"
              style={{
                background: 'none', border: '1px solid #e2e8f0',
                borderRadius: 8, padding: '8px 10px', cursor: 'pointer',
                color: '#94a3b8', fontSize: 16, flexShrink: 0,
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#59c2ed')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'implementacao' ? 'Modo Implementação — seja direto...' : 'Pergunte algo ao Donkie...'}
              rows={1}
              disabled={isLoading}
              style={{
                flex:       1,
                resize:     'none',
                border:     '1px solid #e2e8f0',
                borderRadius: 10,
                padding:    '9px 12px',
                fontSize:   13,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                outline:    'none',
                maxHeight:  120,
                overflowY:  'auto',
                transition: 'border-color .15s',
                background: isLoading ? '#f8fafc' : '#fff',
              }}
              onFocus={e  => (e.target.style.borderColor = '#59c2ed')}
              onBlur={e   => (e.target.style.borderColor = '#e2e8f0')}
              onInput={e  => {
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
            />

            {/* Enviar */}
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !image)}
              style={{
                background:   (!isLoading && (input.trim() || image)) ? '#173557' : '#e2e8f0',
                border:       'none',
                borderRadius: 10,
                padding:      '9px 14px',
                cursor:       (!isLoading && (input.trim() || image)) ? 'pointer' : 'not-allowed',
                color:        (!isLoading && (input.trim() || image)) ? '#d3da47' : '#94a3b8',
                fontSize:     18,
                flexShrink:   0,
                transition:   'background .15s',
                display:      'flex',
                alignItems:   'center',
              }}
            >
              ↑
            </button>
          </div>

          <p style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', marginTop: 6 }}>
            Enter envia · Shift+Enter quebra linha
          </p>
          {lastModel && (
            <div style={{ padding: '4px 14px 6px', fontSize: 10, color: '#b0b8c1', textAlign: 'right', borderTop: '1px solid #f1f5f9' }}>
              modelo: {lastModel}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
