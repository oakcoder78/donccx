import { useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { Icons } from '../../lib/icons'

const NAVY = '#173557'
const SKY = '#59c2ed'

function ToolbarBtn({ icon: Icon, active, onClick, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-7 h-7 rounded transition-colors"
      style={{
        background: active ? `${SKY}18` : 'transparent',
        color: active ? '#0a6a96' : '#64748b',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f1f5f9' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={15} />
    </button>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 18, background: '#e2e8f0', flexShrink: 0 }} />
}

export default function EmailEditor({ value, onChange, placeholder = 'Escreva aqui o conteúdo do e-mail...', onRewrite, rewriting }) {
  const [linkUrl, setLinkUrl] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { style: 'color: #59c2ed; text-decoration: underline; cursor: pointer;' },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
        style: `min-height: 250px; padding: 14px 16px; font-family: inherit; font-size: 14px; line-height: 1.7; color: ${NAVY};`,
      },
    },
  })

  const toggleLink = useCallback(() => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      setShowLinkInput(false)
      return
    }
    setShowLinkInput(true)
    setLinkUrl('https://')
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor || !linkUrl.trim()) return
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }, [editor, linkUrl])

  if (!editor) return null

  const handleHeading = (level) => {
    editor.chain().focus().toggleHeading({ level }).run()
  }

  return (
    <div
      className="border border-border-tertiary rounded-md overflow-hidden bg-bg-primary"
      style={{ fontFamily: 'inherit' }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border-tertiary bg-bg-secondary flex-wrap">
        <ToolbarBtn icon={Icons.Bold} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrito" />
        <ToolbarBtn icon={Icons.Italic} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Itálico" />
        <ToolbarBtn icon={Icons.Underline} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Sublinhado" />

        <Divider />

        <ToolbarBtn icon={Icons.Heading1} active={editor.isActive('heading', { level: 1 })} onClick={() => handleHeading(1)} title="Título 1" />
        <ToolbarBtn icon={Icons.Heading2} active={editor.isActive('heading', { level: 2 })} onClick={() => handleHeading(2)} title="Título 2" />
        <ToolbarBtn icon={Icons.Heading3} active={editor.isActive('heading', { level: 3 })} onClick={() => handleHeading(3)} title="Título 3" />

        <Divider />

        <ToolbarBtn icon={Icons.List} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista" />
        <ToolbarBtn icon={Icons.ListOrdered} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada" />

        <Divider />

        <ToolbarBtn icon={Icons.AlignLeft} active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinhar à esquerda" />
        <ToolbarBtn icon={Icons.AlignCenter} active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centralizar" />
        <ToolbarBtn icon={Icons.AlignRight} active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinhar à direita" />

        <Divider />

        <ToolbarBtn icon={Icons.Link} active={editor.isActive('link')} onClick={toggleLink} title="Inserir link" />

        <div style={{ flex: 1 }} />

        {onRewrite && (
          <button
            type="button"
            title="Reescrever com IA"
            onClick={onRewrite}
            disabled={rewriting || !value?.trim()}
            className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium transition-colors disabled:opacity-40"
            style={{
              color: rewriting ? '#0a6a96' : '#64748b',
              background: rewriting ? `${SKY}18` : 'transparent',
            }}
            onMouseEnter={e => { if (!rewriting) e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { if (!rewriting) e.currentTarget.style.background = 'transparent' }}
          >
            <Icons.Sparkles size={13} />
            {rewriting ? 'Reescrevendo...' : 'Reescrever'}
          </button>
        )}

        <ToolbarBtn icon={Icons.RemoveFormatting} active={false} onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Remover formatação" />
      </div>

      {/* Link input */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border-tertiary bg-bg-secondary">
          <Icons.Link size={13} style={{ color: '#64748b' }} />
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            placeholder="https://..."
            autoFocus
            className="flex-1 text-sm bg-transparent text-text-primary outline-none border-none"
            style={{ fontFamily: 'inherit' }}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setShowLinkInput(false) }}
            onFocus={e => e.target.style.outline = 'none'}
          />
          <button
            onClick={applyLink}
            className="px-2.5 py-1 text-xs font-medium rounded text-white transition-colors"
            style={{ background: NAVY }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Aplicar
          </button>
          <button
            onClick={() => setShowLinkInput(false)}
            className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Editor */}
      <div style={{ maxHeight: 400, overflowY: 'auto', position: 'relative' }}>
        <EditorContent editor={editor} />

        {!value && (
          <div
            className="pointer-events-none select-none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '14px 16px',
              fontSize: 14,
              color: '#94a3b8',
              fontFamily: 'inherit',
              lineHeight: 1.7,
            }}
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  )
}
