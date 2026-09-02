import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { InfoHint } from './InfoHint'

/**
 * Flat form section — one level of visual hierarchy.
 * Replaces the nested "border box + grey header strip" sub-cards in the
 * empresas form. Title row + hairline + body; optionally collapsible with a
 * one-line summary when closed.
 *
 * Props:
 *  - title      section label
 *  - hint       plain-language text shown behind a discreet "?" (InfoHint)
 *  - action     node rendered at the right of the title row (input, toggle…)
 *  - valid      when true, a subtle check appears next to the title
 *  - collapsible / defaultOpen
 *  - summary    one-line text shown to the right when collapsed
 */
export function FormSection({
  title,
  hint,
  action,
  valid = false,
  collapsible = false,
  defaultOpen = true,
  summary,
  children,
  className = '',
}) {
  const [open, setOpen] = useState(defaultOpen)
  const isOpen = collapsible ? open : true

  const titleText = <span className="text-sm font-semibold text-text-primary truncate">{title}</span>

  return (
    <section className={`border-t border-border-tertiary pt-4 first:border-t-0 first:pt-0 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={isOpen}
              className="flex items-center gap-2 min-w-0 text-left"
            >
              {titleText}
              <Icons.ChevronDown
                size={16}
                className={`text-text-tertiary flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
          ) : (
            titleText
          )}
          {hint && <InfoHint>{hint}</InfoHint>}
          {valid && <Icons.Check size={14} className="text-donc-verde flex-shrink-0" />}
          {collapsible && !isOpen && summary && (
            <span className="text-xs text-text-tertiary truncate">· {summary}</span>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {isOpen && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  )
}
