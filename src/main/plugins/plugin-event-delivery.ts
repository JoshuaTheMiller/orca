import type { PluginEventName } from '../../shared/plugins/manifest/plugin-manifest'
import type { PluginCapabilityKind } from '../../shared/plugins/capabilities/plugin-capabilities'
import { PLUGIN_EVENT_CAPABILITY } from '../../shared/plugins/contributions/plugin-event-contribution'
import { PLUGIN_EVENT_PAYLOAD_SCHEMAS } from '../../shared/plugins/events/plugin-events'
import {
  isInvalidDiscoveredPlugin,
  type DiscoveredPlugin,
  type ValidDiscoveredPlugin
} from './plugin-discovery'
import type { PluginWorkerController } from './workers/plugin-worker-controller'

const deliveryQueues = new WeakMap<PluginWorkerController, Map<string, Promise<void>>>()

function queuesFor(controller: PluginWorkerController): Map<string, Promise<void>> {
  let queues = deliveryQueues.get(controller)
  if (!queues) {
    queues = new Map()
    deliveryQueues.set(controller, queues)
  }
  return queues
}

/** Delivers only to plugins whose manifest subscribes and whose grant covers the event's domain. */
export function deliverPluginEvent(options: {
  event: PluginEventName
  payload: unknown
  plugins: readonly DiscoveredPlugin[]
  /** Limits delivery to one plugin, for events about that plugin's own state. */
  onlyPluginKey?: string
  workerController: PluginWorkerController
  isRuntimeApproved: (plugin: ValidDiscoveredPlugin) => boolean
  grantedCapabilities: (pluginKey: string) => readonly PluginCapabilityKind[] | null
  logWarning: (pluginKey: string) => (line: string) => void
}): void {
  // Why: payloads are bounded projections, so a malformed one never reaches a plugin.
  const projected = PLUGIN_EVENT_PAYLOAD_SCHEMAS[options.event].safeParse(options.payload)
  if (!projected.success) {
    return
  }
  const required = PLUGIN_EVENT_CAPABILITY[options.event]
  for (const plugin of options.plugins) {
    if (
      (options.onlyPluginKey !== undefined && plugin.pluginKey !== options.onlyPluginKey) ||
      isInvalidDiscoveredPlugin(plugin) ||
      !plugin.manifest.main ||
      !options.isRuntimeApproved(plugin) ||
      !plugin.manifest.contributes.events.some(
        (subscription) => subscription.on === options.event
      ) ||
      (required === null
        ? options.grantedCapabilities(plugin.pluginKey) === null
        : !options.grantedCapabilities(plugin.pluginKey)?.includes(required))
    ) {
      continue
    }
    const logWarning = options.logWarning(plugin.pluginKey)
    // Why: ensure() can settle in a different order for two events sent back to back (the first
    // one may be starting the worker), so each plugin's deliveries are chained to stay in order.
    const queues = queuesFor(options.workerController)
    const tail = queues.get(plugin.pluginKey) ?? Promise.resolve()
    const next: Promise<void> = tail
      .then(() => options.workerController.ensure(plugin))
      .then((handle) => handle.deliverEvent(options.event, projected.data))
      .catch((error) => {
        logWarning(
          `event ${options.event} dropped: ${error instanceof Error ? error.message : String(error)}`
        )
      })
      .finally(() => {
        if (queues.get(plugin.pluginKey) === next) {
          queues.delete(plugin.pluginKey)
        }
      })
    queues.set(plugin.pluginKey, next)
  }
}
