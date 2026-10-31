import { createElement, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  pluginSvgIconError,
  pluginSvgMaskUrl
} from '../../../../shared/plugins/images/plugin-svg-icon'

export type PluginIconComponent = React.ComponentType<{ size?: number; className?: string }>

/** Which contribution icon to read: the plugin and the slot its list entry names. */
export type PluginSvgIconSource = { pluginKey: string; slot: string }

// Why cached: the same icon renders in several places. Cleared whenever the plugin list reloads,
// because an update or a dev edit can change the file behind the same slot.
let maskBySource = new Map<string, Promise<string | null>>()
let cacheGeneration = 0

export function clearPluginSvgIconCache(): void {
  maskBySource = new Map()
  cacheGeneration += 1
}

/** The data URL of a contribution's SVG icon, or null when it cannot be read or fails the rules. */
export function loadPluginSvgMask(source: PluginSvgIconSource): Promise<string | null> {
  const key = `${source.pluginKey}\u0000${source.slot}`
  let mask = maskBySource.get(key)
  if (!mask) {
    const read = window.api?.plugins?.readContributionSvgIcon
    mask = (read ? read({ pluginKey: source.pluginKey, slot: source.slot }) : Promise.resolve(null))
      .then((text) =>
        // Why check again: main already refuses unsafe icons; a mismatch fails closed.
        text !== null && !pluginSvgIconError(new TextEncoder().encode(text))
          ? pluginSvgMaskUrl(text)
          : null
      )
      .catch(() => null)
    maskBySource.set(key, mask)
  }
  return mask
}

/** A plugin's SVG icon as a one-color mask: it follows the text color like the lucide icons it
 *  replaces, and the SVG's markup never enters the DOM. `fallback` shows if loading fails. */
export function PluginSvgIcon({
  source,
  fallback,
  size = 16,
  className
}: {
  source: PluginSvgIconSource
  fallback: PluginIconComponent
  size?: number
  className?: string
}): React.JSX.Element {
  const key = `${source.pluginKey}\u0000${source.slot}`
  const [loaded, setLoaded] = useState<{ key: string; mask: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadPluginSvgMask({ pluginKey: source.pluginKey, slot: source.slot }).then((mask) => {
      if (!cancelled) {
        setLoaded({ key, mask })
      }
    })
    return () => {
      cancelled = true
    }
  }, [key, source.pluginKey, source.slot])
  if (loaded?.key === key && loaded.mask === null) {
    return createElement(fallback, { size, className })
  }
  const mask = loaded?.key === key ? loaded.mask : null
  return (
    <span
      aria-hidden="true"
      data-plugin-svg-icon=""
      className={cn('inline-block shrink-0 bg-current', className)}
      style={{
        width: size,
        height: size,
        ...(mask
          ? {
              maskImage: `url("${mask}")`,
              WebkitMaskImage: `url("${mask}")`,
              maskSize: 'contain',
              maskRepeat: 'no-repeat',
              maskPosition: 'center'
            }
          : { visibility: 'hidden' as const })
      }}
    />
  )
}

const componentBySource = new Map<string, PluginIconComponent>()

/** A stable icon component for a contribution's SVG icon, so lists keyed on component identity do
 *  not remount; a cache clear yields a new one, which re-reads the file. */
export function pluginSvgIconComponent(
  source: PluginSvgIconSource,
  fallback: PluginIconComponent
): PluginIconComponent {
  const key = `${cacheGeneration}\u0000${source.pluginKey}\u0000${source.slot}`
  let component = componentBySource.get(key)
  if (!component) {
    component = ({ size, className }) => (
      <PluginSvgIcon source={source} fallback={fallback} size={size} className={className} />
    )
    componentBySource.set(key, component)
  }
  return component
}
