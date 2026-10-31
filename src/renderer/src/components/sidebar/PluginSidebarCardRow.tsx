import React from 'react'
import { cn } from '@/lib/utils'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import type {
  PluginSidebarCardItem,
  PluginSidebarCardTone
} from '../../../../shared/plugins/contributions/plugin-sidebar-card-items'

const TONE_CLASS: Record<PluginSidebarCardTone, string> = {
  neutral: 'bg-worktree-sidebar-foreground/10 text-worktree-sidebar-foreground/70',
  info: 'bg-callout-note/10 text-callout-note',
  warning: 'bg-status-warning-background text-status-warning-text',
  danger: 'bg-destructive/10 text-destructive',
  success: 'bg-status-success-background text-status-success'
}

/** One row of a plugin card, styled like a Projects row; a row with an action is a button. */
export function PluginSidebarCardRow({
  item,
  onRun
}: {
  item: PluginSidebarCardItem
  onRun: (item: PluginSidebarCardItem) => void
}): React.JSX.Element {
  const body = (
    <>
      {React.createElement(resolvePluginPanelIcon(item.icon), {
        className: 'mt-0.5 size-4 shrink-0 text-worktree-sidebar-foreground/30',
        strokeWidth: 1.75
      })}
      <span className="flex min-w-0 flex-1 flex-col">
        {/* Row text is plugin-owned and renders without app-catalog translation. */}
        <span className="truncate text-[13px] font-medium tracking-tight">{item.title}</span>
        {item.subtitle ? (
          <span className="truncate text-xs text-worktree-sidebar-foreground/45">
            {item.subtitle}
          </span>
        ) : null}
      </span>
      {item.badges?.map((badge, index) => (
        <span
          key={index}
          data-tone={badge.tone ?? 'neutral'}
          className={cn(
            'mt-0.5 shrink-0 rounded px-1.5 text-[10px] font-medium leading-4',
            TONE_CLASS[badge.tone ?? 'neutral']
          )}
        >
          {badge.label}
        </span>
      ))}
    </>
  )
  const className = cn(
    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-worktree-sidebar-foreground/70 transition-colors',
    item.action && 'cursor-pointer hover:bg-worktree-sidebar-foreground/8'
  )
  return item.action ? (
    <button type="button" className={className} onClick={() => onRun(item)}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  )
}
