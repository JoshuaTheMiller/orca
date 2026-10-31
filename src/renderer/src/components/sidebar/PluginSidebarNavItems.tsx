import React from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import { isWorkspaceScopedPluginContext } from '../../../../shared/plugins/contributions/plugin-command-contribution'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  usePluginSidebarNavItems,
  type ActivePluginSidebarNavItem
} from '@/store/plugin-sidebar-nav-items'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import { HideSidebarMenu } from './sidebar-nav-controls'

const NO_HIDDEN_ITEMS: readonly string[] = []

function PluginSidebarNavItem({
  item,
  onHide
}: {
  item: ActivePluginSidebarNavItem
  onHide: (key: string) => void
}): React.JSX.Element {
  const hasWorkspace = useAppStore((s) => Boolean(s.activeWorktreeId))
  const unavailable = isWorkspaceScopedPluginContext(item.runnable.context) && !hasWorkspace
  const run = (): void => {
    void executePluginCommand(item.runnable, 'plugin-palette').catch((cause: unknown) => {
      toast.error(
        translate('auto.components.sidebar.PluginSidebarNavItems.failed', '{{value0}} failed', {
          value0: item.title
        }),
        { description: cause instanceof Error ? cause.message : String(cause) }
      )
    })
  }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={run}
          disabled={unavailable}
          title={item.pluginName}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
            'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
            unavailable && 'opacity-50'
          )}
        >
          {React.createElement(resolvePluginPanelIcon(item.icon), {
            className: 'size-4 shrink-0 text-worktree-sidebar-foreground/30',
            strokeWidth: 1.75
          })}
          {/* Manifest titles are plugin-owned and render without app-catalog translation. */}
          <span className="flex-1">{item.title}</span>
        </button>
      </ContextMenuTrigger>
      <HideSidebarMenu onHide={() => onHide(item.key)} />
    </ContextMenu>
  )
}

/** Left-sidebar nav entries that enabled plugins contribute; each runs one of the plugin's commands. */
export function PluginSidebarNavItems(): React.JSX.Element | null {
  const items = usePluginSidebarNavItems()
  const hidden = useAppStore((s) => s.settings?.hiddenPluginSidebarNavItems ?? NO_HIDDEN_ITEMS)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const hide = React.useCallback(
    (key: string) => {
      void updateSettings({ hiddenPluginSidebarNavItems: [...new Set([...hidden, key])] })
    },
    [hidden, updateSettings]
  )
  const shown = items.filter((item) => !hidden.includes(item.key))
  if (shown.length === 0) {
    return null
  }
  return (
    <>
      {shown.map((item) => (
        <PluginSidebarNavItem key={item.key} item={item} onHide={hide} />
      ))}
    </>
  )
}
