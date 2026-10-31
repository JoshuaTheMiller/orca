import React from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { EyeOff, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import { isWorkspaceScopedPluginContext } from '../../../../../../shared/plugins/contributions/plugin-command-contribution'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import {
  loadPluginProjectItemDetails,
  pluginProjectItemDetailKey,
  usePluginProjectItemDetailsStore
} from '@/store/plugin-project-item-details'
import { pluginProjectItemTitleKey } from '@/store/plugin-sidebar-project-items'
import type { PluginProjectItemRenderRow } from '../listing/render-row'
import { getVirtualRowTransform } from '../viewport/virtual-rows'
import { getProjectGroupHeaderPaddingLeft, SIDEBAR_TREE_INDENT } from './indentation'
import { PluginProjectItemRenameDialog } from './PluginProjectItemRenameDialog'

const NO_HIDDEN_ITEMS: readonly string[] = []
const NO_TITLES: Readonly<Record<string, string>> = {}

function PluginProjectItemButton({ row }: { row: PluginProjectItemRenderRow }): React.JSX.Element {
  const { item, project } = row
  const hidden = useAppStore((s) => s.settings?.hiddenPluginProjectItems ?? NO_HIDDEN_ITEMS)
  const titles = useAppStore((s) => s.settings?.pluginProjectItemTitles ?? NO_TITLES)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const detail = usePluginProjectItemDetailsStore(
    (s) => s.details[pluginProjectItemDetailKey(item.key, project.id)]
  )
  const [renaming, setRenaming] = React.useState(false)
  React.useEffect(() => loadPluginProjectItemDetails(), [])
  const titleKey = pluginProjectItemTitleKey(item.key, project.id)
  const override = titles[titleKey]
  // Why the override wins: it is the user's own name for this project's row; item.title is already the setting-or-manifest default.
  const title = override?.trim() || item.title
  const hide = (): void => {
    void updateSettings({ hiddenPluginProjectItems: [...new Set([...hidden, item.key])] })
  }
  const saveName = (name: string): void => {
    void updateSettings({ pluginProjectItemTitles: { ...titles, [titleKey]: name } })
  }
  const resetName = (): void => {
    const { [titleKey]: _removed, ...rest } = titles
    void updateSettings({ pluginProjectItemTitles: rest })
  }
  const hasWorkspace = useAppStore((s) => Boolean(s.activeWorktreeId))
  const unavailable = isWorkspaceScopedPluginContext(item.runnable.context) && !hasWorkspace
  const run = (): void => {
    void executePluginCommand(item.runnable, 'plugin-palette', {
      project,
      itemTitle: title
    }).catch((cause: unknown) => {
      toast.error(
        translate('auto.components.sidebar.PluginSidebarNavItems.failed', '{{value0}} failed', {
          value0: title
        }),
        { description: cause instanceof Error ? cause.message : String(cause) }
      )
    })
  }
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={run}
            disabled={unavailable}
            title={item.pluginName}
            data-plugin-project-item={item.key}
            className={cn(
              'flex w-full items-center gap-2 rounded-md py-1 pr-2 text-left text-[13px] font-medium tracking-tight transition-colors',
              'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8',
              unavailable && 'opacity-50'
            )}
            // Why one tree step in: it reads as the first child of the project header above it.
            style={{
              paddingLeft: getProjectGroupHeaderPaddingLeft(row.groupDepth) + SIDEBAR_TREE_INDENT
            }}
          >
            {React.createElement(
              resolvePluginPanelIcon(
                item.icon,
                item.svgIconSlot ? { pluginKey: item.pluginKey, slot: item.svgIconSlot } : undefined
              ),
              {
                className: 'size-4 shrink-0 text-worktree-sidebar-foreground/30',
                strokeWidth: 1.75
              }
            )}
            {/* Manifest titles are plugin-owned and render without app-catalog translation. */}
            <span className="flex-1 truncate">{title}</span>
            {detail ? (
              // Worker-supplied and plugin-owned: shown as given, muted, with aligned digits.
              <span
                data-plugin-project-item-detail=""
                className="shrink-0 text-[11px] font-normal tabular-nums text-worktree-sidebar-foreground/40"
              >
                {detail}
              </span>
            ) : null}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="size-3.5" />
            {translate('auto.components.sidebar.PluginSidebarNavItems.rename', 'Rename…')}
          </ContextMenuItem>
          {override ? (
            <ContextMenuItem onSelect={resetName}>
              <RotateCcw className="size-3.5" />
              {translate('auto.components.sidebar.PluginSidebarNavItems.resetName', 'Reset name')}
            </ContextMenuItem>
          ) : null}
          <ContextMenuItem onSelect={hide}>
            <EyeOff className="size-3.5" />
            {translate('auto.components.sidebar.SidebarNav.d599269755', 'Hide from sidebar')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <PluginProjectItemRenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        currentName={title}
        projectName={project.name}
        onSave={saveName}
      />
    </>
  )
}

export function renderPluginProjectItemVirtualRow(args: {
  measureVirtualRowElement: (element: HTMLDivElement | null) => void
  row: PluginProjectItemRenderRow
  vItem: VirtualItem
}): React.JSX.Element {
  const { row, vItem } = args
  return (
    <div
      key={vItem.key}
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(vItem.key)}
      data-worktree-virtual-row-start={vItem.start}
      data-index={vItem.index}
      ref={args.measureVirtualRowElement}
      className="absolute left-0 right-0 top-0"
      style={{ transform: getVirtualRowTransform(vItem.start) }}
    >
      <PluginProjectItemButton row={row} />
    </div>
  )
}
