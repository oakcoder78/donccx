import { useState, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Icons } from '../../lib/icons'
import { Button } from '../ui/Button'
import { useCatalog } from '../../hooks/useCatalog'
import toast from 'react-hot-toast'

const NAVY = '#173557'
const SKY = '#59c2ed'

function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function relativeTime(isoStr) {
  if (!isoStr) return null
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return `há ${Math.floor(diff / 86400)} dias`
}

// ── Rail item (sortable section) ─────────────────────────────────────────────
function SortableSectionItem({ section, index, isActive, onSelect }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={onSelect}
        className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-all rounded-lg mb-1 group
          ${isActive
            ? 'border border-[#59c2ed] bg-[#59c2ed]/8 shadow-sm'
            : 'border border-transparent hover:bg-bg-secondary'
          }`}
      >
        <span
          {...attributes} {...listeners}
          className="flex-shrink-0 cursor-grab text-text-tertiary opacity-0 group-hover:opacity-40 hover:!opacity-100"
          onClick={e => e.stopPropagation()}
        >
          <Icons.GripVertical size={13} />
        </span>
        <span
          className={`w-5 h-5 flex-shrink-0 rounded text-[10px] font-bold flex items-center justify-center
            ${isActive ? 'text-white' : 'bg-bg-tertiary text-text-secondary'}`}
          style={isActive ? { background: SKY } : {}}
        >
          {index + 1}
        </span>
        <span className="flex-1 text-xs font-medium text-text-primary truncate leading-tight">
          {section.title || 'Sem título'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-tertiary text-text-tertiary flex-shrink-0">
          {section.questions?.length || 0}
        </span>
      </button>
    </div>
  )
}

// ── Question card (sortable) ─────────────────────────────────────────────────
function SortableQuestionCard({ question, index, onUpdate, onDuplicate, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const [showNote, setShowNote] = useState(!!question.note)

  return (
    <div ref={setNodeRef} style={style} className="bg-bg-primary border border-border-tertiary rounded-lg p-3 mb-2 group">
      {/* Main row */}
      <div className="flex gap-2 items-start">
        <span
          {...attributes} {...listeners}
          className="flex-shrink-0 mt-1 cursor-grab text-text-tertiary opacity-0 group-hover:opacity-40 hover:!opacity-100"
        >
          <Icons.GripVertical size={13} />
        </span>
        <span className="flex-shrink-0 w-5 h-5 rounded bg-bg-secondary text-text-tertiary text-[10px] font-bold flex items-center justify-center mt-0.5">
          {index + 1}
        </span>
        <input
          value={question.text}
          onChange={e => onUpdate('text', e.target.value)}
          className="flex-1 input-base text-sm min-w-0"
          placeholder="Texto da pergunta"
        />
        <button onClick={onDuplicate} className="flex-shrink-0 p-1 text-text-tertiary hover:text-text-primary transition-colors" title="Duplicar">
          <Icons.Copy size={14} />
        </button>
        <button onClick={onRemove} className="flex-shrink-0 p-1 text-text-tertiary hover:text-red-500 transition-colors" title="Remover">
          <Icons.X size={14} />
        </button>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap gap-2 mt-2 ml-[52px] items-center">
        <select
          value={question.type}
          onChange={e => onUpdate('type', e.target.value)}
          className="input-base text-xs py-1 pr-6"
        >
          <option value="text">Texto curto</option>
          <option value="textarea">Texto longo</option>
        </select>

        <button
          type="button"
          onClick={() => onUpdate('required', !question.required)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
            ${question.required
              ? 'border-[#173557]/25 text-[#173557]'
              : 'border-border-tertiary text-text-tertiary hover:border-[#173557]/25'
            }`}
          style={question.required ? { background: `${NAVY}0d` } : {}}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${question.required ? '' : 'bg-text-tertiary'}`}
            style={question.required ? { background: NAVY } : {}} />
          Obrigatória
        </button>

        <button
          type="button"
          onClick={() => onUpdate('allow_attachment', !question.allow_attachment)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors
            ${question.allow_attachment
              ? 'border-[#59c2ed]/30 text-[#59c2ed]'
              : 'border-border-tertiary text-text-tertiary hover:border-[#59c2ed]/30'
            }`}
          style={question.allow_attachment ? { background: `${SKY}12` } : {}}
        >
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${question.allow_attachment ? '' : 'bg-text-tertiary'}`}
            style={question.allow_attachment ? { background: SKY } : {}} />
          Anexo
        </button>

        {!showNote && (
          <button
            type="button"
            onClick={() => setShowNote(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-text-tertiary border border-dashed border-border-tertiary hover:border-[#59c2ed] hover:text-[#59c2ed] transition-colors"
          >
            <Icons.Plus size={10} />
            Orientação
          </button>
        )}
      </div>

      {/* Note row */}
      {(showNote || question.note) && (
        <div className="mt-2 ml-[52px] flex items-start gap-2 rounded-md px-2.5 py-1.5 border border-dashed"
          style={{ background: `${SKY}08`, borderColor: `${SKY}40` }}>
          <Icons.Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: SKY }} />
          <input
            value={question.note || ''}
            onChange={e => onUpdate('note', e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-xs text-text-secondary placeholder-text-tertiary"
            placeholder="Orientação opcional para o cliente ao responder esta pergunta"
            autoFocus={showNote && !question.note}
          />
          <button
            type="button"
            onClick={() => { onUpdate('note', ''); setShowNote(false) }}
            className="flex-shrink-0 text-text-tertiary hover:text-text-primary"
          >
            <Icons.X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────
export function BriefTemplateEditorModal({ template, onClose, onSave, isSaving }) {
  const { data: catalogItems = [] } = useCatalog()
  const services = catalogItems.filter(c => c.type === 'servico')

  const [name, setName] = useState(template?.name || '')
  const [operationType, setOperationType] = useState(template?.operation_type || '')
  const [sections, setSections] = useState(() => {
    const secs = template?.structure?.sections || []
    return secs.map(s => ({
      ...s,
      id: s.id || genId('s'),
      questions: (s.questions || []).map(q => ({ ...q, id: q.id || genId('q') })),
    }))
  })
  const [activeSecIdx, setActiveSecIdx] = useState(0)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const activeSection = sections[activeSecIdx] ?? null

  // ── Section operations ──────────────────────────────────────────────────────
  const addSection = () => {
    const newSec = {
      id: genId('s'), title: 'Nova Seção', deliverable: '', callout: '', audience: '', questions: [],
    }
    setSections(s => [...s, newSec])
    setActiveSecIdx(sections.length)
  }

  const removeSection = (idx) => {
    setSections(s => s.filter((_, i) => i !== idx))
    setActiveSecIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev))
  }

  const duplicateSection = (idx) => {
    const clone = {
      ...sections[idx],
      id: genId('s'),
      title: `${sections[idx].title} (cópia)`,
      questions: sections[idx].questions.map(q => ({ ...q, id: genId('q') })),
    }
    const next = [...sections]
    next.splice(idx + 1, 0, clone)
    setSections(next)
    setActiveSecIdx(idx + 1)
  }

  const updateSection = (idx, field, val) => {
    setSections(s => s.map((sec, i) => i === idx ? { ...sec, [field]: val } : sec))
  }

  const handleSectionDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setSections(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      const reordered = arrayMove(prev, oldIdx, newIdx)
      // keep active section following the item that was previously active
      const prevActiveId = prev[activeSecIdx]?.id
      if (prevActiveId) setActiveSecIdx(reordered.findIndex(s => s.id === prevActiveId))
      return reordered
    })
  }, [activeSecIdx])

  // ── Question operations ─────────────────────────────────────────────────────
  const addQuestion = (type = 'text') => {
    if (!activeSection) return
    const newQ = { id: genId('q'), text: '', type, required: true, allow_attachment: false, note: '' }
    setSections(s => s.map((sec, i) =>
      i === activeSecIdx ? { ...sec, questions: [...sec.questions, newQ] } : sec
    ))
  }

  const updateQuestion = (qIdx, field, val) => {
    setSections(s => s.map((sec, i) =>
      i === activeSecIdx
        ? { ...sec, questions: sec.questions.map((q, j) => j === qIdx ? { ...q, [field]: val } : q) }
        : sec
    ))
  }

  const removeQuestion = (qIdx) => {
    setSections(s => s.map((sec, i) =>
      i === activeSecIdx ? { ...sec, questions: sec.questions.filter((_, j) => j !== qIdx) } : sec
    ))
  }

  const duplicateQuestion = (qIdx) => {
    setSections(s => s.map((sec, i) => {
      if (i !== activeSecIdx) return sec
      const clone = { ...sec.questions[qIdx], id: genId('q') }
      const qs = [...sec.questions]
      qs.splice(qIdx + 1, 0, clone)
      return { ...sec, questions: qs }
    }))
  }

  const handleQuestionDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return
    setSections(s => s.map((sec, i) => {
      if (i !== activeSecIdx) return sec
      const oldIdx = sec.questions.findIndex(q => q.id === active.id)
      const newIdx = sec.questions.findIndex(q => q.id === over.id)
      return { ...sec, questions: arrayMove(sec.questions, oldIdx, newIdx) }
    }))
  }, [activeSecIdx])

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = (publish) => {
    if (!name.trim()) { toast.error('Informe o nome do template'); return }
    if (sections.length === 0) { toast.error('Adicione pelo menos uma seção'); return }
    const structure = {
      sections: sections.map((sec, si) => ({
        ...sec,
        order: si + 1,
        questions: (sec.questions || []).map((q, qi) => ({ ...q, order: qi + 1 })),
      })),
    }
    onSave({ id: template?.id, name: name.trim(), operation_type: operationType, structure, is_active: publish })
  }

  const isPublished = template?.is_active

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-xl w-full flex flex-col overflow-hidden shadow-2xl"
        style={{ maxWidth: 1080, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 pt-5 pb-4 border-b border-border-tertiary flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-tertiary mb-1">
                <Icons.FileQuestion size={13} style={{ color: SKY }} />
                <span>Biblioteca de Templates · Roteiros do cliente</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-text-primary truncate">{name || 'Novo Template'}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  isPublished ? 'bg-green-100 text-green-700' : 'bg-bg-tertiary text-text-tertiary'
                }`}>
                  {isPublished ? 'publicado' : 'rascunho'}
                </span>
              </div>
              <p className="text-xs text-text-tertiary mt-0.5">
                Defina seções, perguntas e regras que aparecerão para o cliente no roteiro.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors flex-shrink-0"
            >
              <Icons.X size={18} />
            </button>
          </div>

          {/* Basics row */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="label-sm">Nome *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="input-base w-full"
                placeholder="Nome do template"
              />
            </div>
            <div>
              <label className="label-sm">Tipo de Operação / Serviço</label>
              <select
                value={operationType}
                onChange={e => setOperationType(e.target.value)}
                className="input-base w-full"
              >
                <option value="">Selecione um serviço…</option>
                {services.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left rail */}
          <div className="flex-shrink-0 border-r border-border-tertiary flex flex-col overflow-hidden" style={{ width: 260 }}>
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-tertiary flex-shrink-0">
              <span className="text-xs font-semibold text-text-secondary">
                Seções <span className="font-normal text-text-tertiary">({sections.length})</span>
              </span>
              <button
                onClick={addSection}
                className="flex items-center gap-1 text-xs transition-colors"
                style={{ color: SKY }}
              >
                <Icons.Plus size={13} />
                Nova seção
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
                <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {sections.map((sec, idx) => (
                    <SortableSectionItem
                      key={sec.id}
                      section={sec}
                      index={idx}
                      isActive={idx === activeSecIdx}
                      onSelect={() => setActiveSecIdx(idx)}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {sections.length === 0 && (
                <p className="text-center text-xs text-text-tertiary py-8 px-2">
                  Nenhuma seção ainda.<br />Clique em "+ Nova seção".
                </p>
              )}
            </div>
          </div>

          {/* Right editor */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {!activeSection ? (
              <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
                Selecione ou crie uma seção
              </div>
            ) : (
              <>
                {/* Sticky section header */}
                <div className="sticky top-0 z-10 bg-bg-primary border-b border-border-tertiary px-5 py-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={activeSection.title}
                      onChange={e => updateSection(activeSecIdx, 'title', e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm font-semibold text-text-primary placeholder-text-tertiary focus:ring-1 rounded px-1"
                      style={{ '--tw-ring-color': SKY }}
                      placeholder="Título da seção"
                    />
                    <span className="text-xs text-text-tertiary flex-shrink-0">
                      {activeSection.questions?.length || 0} perguntas
                    </span>
                    <button
                      onClick={() => duplicateSection(activeSecIdx)}
                      className="p-1 text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
                      title="Duplicar seção"
                    >
                      <Icons.Copy size={15} />
                    </button>
                    <button
                      onClick={() => removeSection(activeSecIdx)}
                      className="p-1 text-text-tertiary hover:text-red-500 transition-colors flex-shrink-0"
                      title="Remover seção"
                    >
                      <Icons.Trash2 size={15} />
                    </button>
                  </div>

                  {/* Deliverable row */}
                  <div
                    className="mt-2 flex items-center gap-2 rounded-md px-3 py-1.5 border"
                    style={{ background: `${SKY}0a`, borderColor: `${SKY}35` }}
                  >
                    <Icons.Check size={13} className="flex-shrink-0" style={{ color: SKY }} />
                    <span className="text-xs font-medium flex-shrink-0" style={{ color: SKY }}>Entregável:</span>
                    <input
                      value={activeSection.deliverable || ''}
                      onChange={e => updateSection(activeSecIdx, 'deliverable', e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-xs text-text-secondary placeholder-text-tertiary"
                      placeholder="O que esta seção entrega para o cliente…"
                    />
                  </div>
                </div>

                {/* Questions */}
                <div className="p-5">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
                    <SortableContext
                      items={(activeSection.questions || []).map(q => q.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {(activeSection.questions || []).map((q, qIdx) => (
                        <SortableQuestionCard
                          key={q.id}
                          question={q}
                          index={qIdx}
                          onUpdate={(field, val) => updateQuestion(qIdx, field, val)}
                          onDuplicate={() => duplicateQuestion(qIdx)}
                          onRemove={() => removeQuestion(qIdx)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>

                  {/* Add question dock */}
                  <div
                    className="mt-2 flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-all group"
                    style={{ borderColor: 'var(--color-border-tertiary)' }}
                    onClick={() => addQuestion('text')}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = SKY; e.currentTarget.style.background = `${SKY}06` }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.background = '' }}
                  >
                    <Icons.Plus size={15} className="text-text-tertiary flex-shrink-0 group-hover:text-[#59c2ed] transition-colors" />
                    <span className="flex-1 text-sm text-text-tertiary group-hover:text-[#59c2ed] transition-colors">
                      Adicionar pergunta
                    </span>
                    <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => addQuestion('text')}
                        className="text-xs px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary hover:text-[#59c2ed] transition-colors"
                        style={{'--hover-bg': `${SKY}12`}}
                      >
                        Texto curto
                      </button>
                      <button
                        onClick={() => addQuestion('textarea')}
                        className="text-xs px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary hover:text-[#59c2ed] transition-colors"
                      >
                        Texto longo
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t border-border-tertiary bg-bg-secondary flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            {template?.updated_at && (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                <span>Última atualização {relativeTime(template.updated_at)}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
            <Button variant="secondary" size="sm" onClick={() => handleSave(false)} disabled={isSaving}>
              Salvar rascunho
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave(true)}
              disabled={isSaving}
              style={{ background: NAVY, color: '#fff' }}
            >
              {isSaving ? 'Publicando…' : 'Publicar template'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
