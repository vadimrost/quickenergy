import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { Bold, Italic, Underline as UnderlineIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (val: string) => void
  rows?: number
  placeholder?: string
}

function ToolbarButton({ active, onClick, children }: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={cn(
        'p-1.5 rounded text-sm transition-colors',
        active
          ? 'bg-accent-500 text-white'
          : 'text-ink-muted hover:bg-bg-muted hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

export function richTextToPlain(value: string): string {
  try {
    const json = JSON.parse(value)
    if (json?.type === 'doc') {
      return (json.content ?? [])
        .map((node: any) =>
          (node.content ?? []).map((n: any) => n.text ?? '').join('')
        )
        .join('\n')
    }
  } catch {}
  return value
}

export function RichTextEditor({ value, onChange, rows = 4 }: Props) {
  const isInternalUpdate = useRef(false)

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: parseContent(value),
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true
      onChange(JSON.stringify(editor.getJSON()))
      isInternalUpdate.current = false
    },
  })

  // Sync editor when value changes from outside (e.g. existing data loads from DB)
  useEffect(() => {
    if (!editor || isInternalUpdate.current) return
    const editorJson = JSON.stringify(editor.getJSON())
    if (editorJson !== value) {
      editor.commands.setContent(parseContent(value), false)
    }
  }, [editor, value])

  if (!editor) return null

  const minHeight = `${rows * 1.6}rem`

  return (
    <div className="border border-border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-accent-500">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-bg-muted">
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={14} />
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <EditorContent
        editor={editor}
        className="text-sm px-3 py-2 bg-bg-base focus:outline-none [&_.tiptap]:outline-none [&_.tiptap]:min-h-[var(--editor-min-h)] [&_.tiptap_p]:my-0.5"
        style={{ '--editor-min-h': minHeight } as React.CSSProperties}
      />
    </div>
  )
}

function parseContent(value: string) {
  if (!value) return ''
  try {
    const json = JSON.parse(value)
    if (json?.type === 'doc') return json
  } catch {}
  // Plain text fallback: convert newlines to paragraphs
  return {
    type: 'doc',
    content: value.split('\n').map(line => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    })),
  }
}
