import { createElement, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { parsePluginImageUrl } from '../../../../shared/plugins/images/plugin-image-url'
import {
  pluginSvgIconError,
  pluginSvgMaskUrl
} from '../../../../shared/plugins/images/plugin-svg-icon'

export type PluginIconComponent = React.ComponentType<{
  size?: number
  className?: string
}>

// Why cached by URL: every URL names exact bytes (the install hash), and the same icon renders in
// several places; a failed load is cached too so a broken icon is not refetched per render.
const maskByUrl = new Map<string, Promise<string | null>>()

/** The data URL of a served SVG icon, or null when it cannot be loaded or fails the safety rules. */
export function loadPluginSvgMask(url: string): Promise<string | null> {
  let mask = maskByUrl.get(url)
  if (!mask) {
    mask = fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          return null
        }
        const bytes = new Uint8Array(await response.arrayBuffer())
        // Why check again: main already refused unsafe icons; a mismatch fails closed.
        return pluginSvgIconError(bytes) ? null : pluginSvgMaskUrl(new TextDecoder().decode(bytes))
      })
      .catch(() => null)
    maskByUrl.set(url, mask)
  }
  return mask
}

/** A plugin's SVG icon as a one-color mask: it follows the text color like the lucide icons it
 *  replaces, and the SVG's markup never enters the DOM. `fallback` shows if loading fails. */
export function PluginSvgIcon({
  url,
  fallback,
  size = 16,
  className
}: {
  url: string
  fallback: PluginIconComponent
  size?: number
  className?: string
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<{
    url: string
    mask: string | null
  } | null>(null)
  const valid = parsePluginImageUrl(url) !== null
  useEffect(() => {
    if (!valid) {
      return
    }
    let cancelled = false
    void loadPluginSvgMask(url).then((mask) => {
      if (!cancelled) {
        setLoaded({ url, mask })
      }
    })
    return () => {
      cancelled = true
    }
  }, [url, valid])
  if (!valid || (loaded?.url === url && loaded.mask === null)) {
    return createElement(fallback, { size, className })
  }
  const mask = loaded?.url === url ? loaded.mask : null
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

const componentByUrl = new Map<string, PluginIconComponent>()

/** A stable icon component for an SVG URL, so lists keyed on component identity do not remount. */
export function pluginSvgIconComponent(
  url: string,
  fallback: PluginIconComponent
): PluginIconComponent {
  const key = `${url}`
  let component = componentByUrl.get(key)
  if (!component) {
    component = ({ size, className }) => (
      <PluginSvgIcon url={url} fallback={fallback} size={size} className={className} />
    )
    componentByUrl.set(key, component)
  }
  return component
}
