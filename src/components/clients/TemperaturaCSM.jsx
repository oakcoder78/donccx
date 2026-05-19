import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

const TEMPS = [
  { value: 5,  label: 'Quente',  emoji: '🔥', color: '#1D9E75', bg: '#F0FDF4', desc: 'Engajado, champion ativo, potencial de expansão' },
  { value: 2,  label: 'Morno',   emoji: '☀️', color: '#BA7517', bg: '#FFFBEB', desc: 'Estável, sem entusiasmo mas sem sinais negativos' },
  { value: 0,  label: 'Neutro',  emoji: '➖', color: '#888780', bg: '#F7F7F5', desc: 'Sem avaliação recente ou situação indefinida' },
  { value: -3, label: 'Frio',    emoji: '❄️', color: '#185FA5', bg: '#EFF6FF', desc: 'Distância percebida, insatisfação em reunião' },
  { value: -7, label: 'Crítico', emoji: '🚨', color: '#E24B4A', bg: '#FEF2F2', desc: 'Risco iminente — troca de diretoria, insatisfação declarada' },
]

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export function TemperaturaCSM({ client, compact = false }) {
  const qc = useQueryClient()
  const current = TEMPS.find(t => t.value === (client.csm_temperature ?? 0)) ?? TEMPS[2]
  const days = daysSince(client.temperature_updated_at)
  const expired = days !== null && days > 30

  const [editing, setEditing]   = useState(false)
  const [selected, setSelected] = useState(client.csm_temperature ?? 0)
  const [note, setNote]         = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    if (!note.trim()) { toast.error('Adicione uma nota para registrar a temperatura'); return }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          csm_temperature:        selected,
          temperature_updated_at: new Date().toISOString(),
          temperature_note:       note.trim(),
        })
        .eq('id', client.id)
      if (error) throw error
      toast.success('Temperatura atualizada')
      qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
      setEditing(false)
      setNote('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (compact) {
    return (
      <div
        onClick={() => setEditing(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
          background: expired ? '#F7F7F5' : current.bg,
          border: `1px solid ${expired ? '#e8e7e3' : current.color}40`,
          transition: 'opacity 0.15s',
        }}
        title={expired ? 'Temperatura expirada — clique para atualizar' : `Temperatura: ${current.label}${client.temperature_note ? ` — ${client.temperature_note}` : ''}`}
      >
        <span style={{ fontSize: 13 }}>{expired ? '⏱' : current.emoji}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: expired ? '#888780' : current.color }}>
          {expired ? 'Expirada' : current.label}
        </span>
        {days !== null && !expired && (
          <span style={{ fontSize: 10, color: '#888780' }}>· {days}d</span>
        )}

        {/* Modal de edição inline para compact */}
        {editing && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
          >
            <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a18', marginBottom: 12 }}>Temperatura do CSM</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {TEMPS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelected(t.value)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: selected === t.value ? t.bg : '#F7F7F5',
                      outline: selected === t.value ? `2px solid ${t.color}` : '2px solid transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 16 }}>{t.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: '#888780' }}>{t.desc}</div>
                    </div>
                    {selected === t.value && <span style={{ fontSize: 12, color: t.color, fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Nota obrigatória — descreva o contexto da avaliação..."
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 12,
                  border: '1px solid #d4d3ce', resize: 'none', fontFamily: 'inherit',
                  outline: 'none', color: '#1a1a18', background: '#fff',
                  boxSizing: 'border-box', marginBottom: 10,
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setEditing(false); setNote('') }}
                  style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e8e7e3', background: '#fff', cursor: 'pointer', color: '#888780' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !note.trim()}
                  style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#173557', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !note.trim() ? 0.6 : 1 }}
                >
                  {saving ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Temperatura do CSM</span>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ fontSize: 11, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            atualizar
          </button>
        )}
      </div>

      {!editing ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{
              padding: '6px 14px', borderRadius: 20,
              background: expired ? '#F7F7F5' : current.bg,
              border: `1px solid ${expired ? '#e8e7e3' : current.color}40`,
            }}>
              <span style={{ fontSize: 13, marginRight: 6 }}>{expired ? '⏱' : current.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: expired ? '#888780' : current.color }}>
                {expired ? 'Expirada' : current.label}
              </span>
            </div>
            {days !== null && (
              <span style={{ fontSize: 11, color: '#888780' }}>
                {expired ? `Atualizada há ${days} dias — expirou` : `Atualizada há ${days} dia${days !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          {client.temperature_note && !expired && (
            <p style={{ fontSize: 12, color: '#4a4a46', fontStyle: 'italic', margin: 0 }}>"{client.temperature_note}"</p>
          )}
          {(!client.temperature_updated_at || expired) && (
            <p style={{ fontSize: 12, color: '#888780', fontStyle: 'italic', margin: 0 }}>
              {!client.temperature_updated_at ? 'Nenhuma avaliação registrada.' : 'Temperatura expirada — atualize após a próxima interação.'}
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TEMPS.map(t => (
              <button
                key={t.value}
                onClick={() => setSelected(t.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: selected === t.value ? t.bg : '#F7F7F5',
                  outline: selected === t.value ? `2px solid ${t.color}` : '2px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{t.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: '#888780' }}>{t.desc}</div>
                </div>
                {selected === t.value && (
                  <span style={{ fontSize: 12, color: t.color, fontWeight: 700 }}>✓</span>
                )}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Nota obrigatória — descreva o contexto da avaliação..."
            rows={2}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 7, fontSize: 12,
              border: '1px solid #d4d3ce', resize: 'none', fontFamily: 'inherit',
              outline: 'none', color: '#1a1a18', background: '#fff',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setEditing(false); setNote('') }}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #e8e7e3', background: '#fff', cursor: 'pointer', color: '#888780' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !note.trim()}
              style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#173557', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !note.trim() ? 0.6 : 1 }}
            >
              {saving ? 'Salvando...' : 'Registrar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
