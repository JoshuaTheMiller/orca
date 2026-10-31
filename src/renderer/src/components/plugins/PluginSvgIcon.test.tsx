// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Plug } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPluginSvgIconCache, PluginSvgIcon } from './PluginSvgIcon'
import { resolvePluginPanelIcon } from '../right-sidebar/plugin-panel-activity-items'

const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>'
const source = { pluginKey: 'acme.demo', slot: 'panel-0' }

function bridge(result: string | null | Error) {
  const read = vi.fn(async () => {
    if (result instanceof Error) {
      throw result
    }
    return result
  })
  vi.stubGlobal(
    'window',
    Object.assign(window, { api: { plugins: { readContributionSvgIcon: read } } })
  )
  return read
}

beforeEach(() => clearPluginSvgIconCache())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PluginSvgIcon', () => {
  it('draws the SVG as a currentColor mask, without putting its markup in the DOM', async () => {
    const read = bridge(GOOD)
    const { container } = render(<PluginSvgIcon source={source} fallback={Plug} size={18} />)
    const icon = container.querySelector<HTMLElement>('[data-plugin-svg-icon]')!
    await waitFor(() => expect(icon.style.maskImage).toContain('data:image/svg+xml'))
    expect(read).toHaveBeenCalledWith(source)
    expect(icon.style.width).toBe('18px')
    expect(icon.className).toContain('bg-current')
    expect(decodeURIComponent(icon.style.maskImage)).toContain('<path d=')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('path')).toBeNull()
  })

  it('falls back to the built-in icon when main returns nothing or the read fails', async () => {
    for (const result of [null, new Error('gone')]) {
      clearPluginSvgIconCache()
      bridge(result)
      const { container, unmount } = render(<PluginSvgIcon source={source} fallback={Plug} />)
      await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
      expect(container.querySelector('[data-plugin-svg-icon]')).toBeNull()
      unmount()
    }
  })

  it('falls back when the text fails the safety rules', async () => {
    bridge(GOOD.replace('<path', '<script/><path'))
    const { container } = render(<PluginSvgIcon source={source} fallback={Plug} />)
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
    expect(container.querySelector('[data-plugin-svg-icon]')).toBeNull()
  })

  it('falls back on a host without the read method', async () => {
    vi.stubGlobal('window', Object.assign(window, { api: { plugins: {} } }))
    const { container } = render(<PluginSvgIcon source={source} fallback={Plug} />)
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
  })
})

describe('resolvePluginPanelIcon with an SVG source', () => {
  it('returns a stable component per source until the cache is cleared', () => {
    const icon = resolvePluginPanelIcon(undefined, source)
    expect(icon).not.toBe(Plug)
    expect(resolvePluginPanelIcon(undefined, source)).toBe(icon)
    expect(resolvePluginPanelIcon(undefined, { ...source, slot: 'panel-1' })).not.toBe(icon)
    clearPluginSvgIconCache()
    expect(resolvePluginPanelIcon(undefined, source)).not.toBe(icon)
    expect(resolvePluginPanelIcon('plug', undefined)).toBe(Plug)
  })
})
