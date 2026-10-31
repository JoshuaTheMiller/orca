import { useEffect, useMemo, useRef } from 'react'
import type { RenderRow } from './render-row'
import { collectVisiblePluginProjectItems } from './plugin-project-item-rows'

/**
 * Tells main which projects each plugin project item shows under, so the owning worker can compute
 * details only for those. Sent only when the set changes; an unmounted list reports nothing shown.
 */
export function useReportVisiblePluginProjectItems(rows: readonly RenderRow[]): void {
  const visible = useMemo(() => collectVisiblePluginProjectItems(rows), [rows])
  const serialized = JSON.stringify(visible)
  const latest = useRef(visible)
  latest.current = visible
  useEffect(() => {
    window.api?.plugins?.reportVisibleProjectItems?.(latest.current)
  }, [serialized])
  useEffect(() => () => window.api?.plugins?.reportVisibleProjectItems?.([]), [])
}
