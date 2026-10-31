import React from 'react'
import { cn } from '@/lib/utils'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import type { ActivePluginSidebarStateItem } from '@/store/plugin-sidebar-nav-items'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import { HideSidebarMenu } from './sidebar-nav-controls'

/** A toggle or checkbox row. The whole row flips the value; the control on the right shows it. */
export function PluginSidebarStateRow({
  item,
  depth,
  checked,
  onChange,
  onHide
}: {
  item: ActivePluginSidebarStateItem
  depth: 0 | 1
  checked: boolean
  onChange: (valueKey: string, value: boolean) => void
  onHide: (key: string) => void
}): React.JSX.Element {
  const flip = (): void => onChange(item.valueKey, !checked)
  // Why stopPropagation: the control is a real button inside a clickable row, so its own click
  // would otherwise flip the value a second time through the row.
  const control = {
    checked,
    'aria-label': item.title,
    onClick: (event: React.MouseEvent) => event.stopPropagation()
  }
  const change = (value: boolean | 'indeterminate'): void => onChange(item.valueKey, value === true)
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-depth={depth}
          data-kind={item.kind}
          title={item.pluginName}
          onClick={flip}
          className={cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
            'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
            depth === 1 && 'pl-6'
          )}
        >
          {React.createElement(resolvePluginPanelIcon(item.icon), {
            className: 'size-4 shrink-0 text-worktree-sidebar-foreground/30',
            strokeWidth: 1.75
          })}
          {/* Manifest titles are plugin-owned and render without app-catalog translation. */}
          <span className="flex-1">{item.title}</span>
          {item.kind === 'toggle' ? (
            <Switch
              {...control}
              onCheckedChange={change}
              className="h-3.5 w-6 border-0"
              thumbClassName="size-2.5 data-[state=checked]:translate-x-2.5"
            />
          ) : (
            <Checkbox {...control} onCheckedChange={change} />
          )}
        </div>
      </ContextMenuTrigger>
      <HideSidebarMenu onHide={() => onHide(item.key)} />
    </ContextMenu>
  )
}
