import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { usePluginPanelsStore, fromPlugin } from '@/store/plugin-panels'
import { executePluginCommand } from '@/lib/plugin-command-execution'
import type { PluginSidebarCardItem } from '../../../../shared/plugins/contributions/plugin-sidebar-card-items'

function failure(item: PluginSidebarCardItem, cause: unknown): void {
  toast.error(
    translate('auto.components.sidebar.PluginSidebarCard.failed', '{{value0}} failed', {
      value0: item.title
    }),
    { description: cause instanceof Error ? cause.message : String(cause) }
  )
}

/** Runs a card row's action: a command of its plugin, or opening a file through its `editor:open` capability. */
export async function runPluginSidebarCardAction(
  card: { pluginKey: string; cardId: string },
  item: PluginSidebarCardItem
): Promise<void> {
  const { action } = item
  if (!action) {
    return
  }
  try {
    if (action.kind === 'openFile') {
      const outcome = await window.api.plugins.openSidebarCardFile({ ...card, itemId: item.id })
      if (!outcome.ok) {
        failure(item, new Error(outcome.error))
      }
      return
    }
    const plugin = usePluginPanelsStore
      .getState()
      .plugins.find((candidate) => candidate.pluginKey === card.pluginKey)
    const command = plugin?.commands.find((candidate) => candidate.id === action.command)
    if (!plugin || !command) {
      throw new Error(`unknown command: ${action.command}`)
    }
    if (command.handler.type === 'worker' && action.args !== undefined) {
      await window.api.plugins.invokeCommand({
        pluginKey: card.pluginKey,
        commandId: command.id,
        args: action.args
      })
      return
    }
    await executePluginCommand(fromPlugin(plugin, command), 'plugin-palette')
  } catch (cause) {
    failure(item, cause)
  }
}
