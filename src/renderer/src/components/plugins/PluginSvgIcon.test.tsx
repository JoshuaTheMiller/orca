// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { Plug } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pluginInstalledImageUrl } from '../../../../shared/plugins/images/plugin-image-url'
import { PluginSvgIcon } from './PluginSvgIcon'
import { resolvePluginPanelIcon } from '../right-sidebar/plugin-panel-activity-items'

const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>'
let count = 0
// Why unique: loaded masks are cached per URL for the life of the module.
const freshUrl = () => pluginInstalledImageUrl('acme.demo', 'a'.repeat(64), `panel-${count++}`)

function respond(body: string | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (body === null ? new Response(null, { status: 404 }) : new Response(body)))
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PluginSvgIcon', () => {
  it('draws the SVG as a currentColor mask, without putting its markup in the DOM', async () => {
    respond(GOOD)
    const { container } = render(<PluginSvgIcon url={freshUrl()} fallback={Plug} size={18} />)
    const icon = container.querySelector<HTMLElement>('[data-plugin-svg-icon]')!
    await waitFor(() => expect(icon.style.maskImage).toContain('data:image/svg+xml'))
    expect(icon.style.width).toBe('18px')
    expect(icon.className).toContain('bg-current')
    expect(decodeURIComponent(icon.style.maskImage)).toContain('<path d=')
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('path')).toBeNull()
  })

  it('falls back to the built-in icon when the fetch fails', async () => {
    respond(null)
    const { container } = render(<PluginSvgIcon url={freshUrl()} fallback={Plug} />)
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
    expect(container.querySelector('[data-plugin-svg-icon]')).toBeNull()
  })

  it('falls back when the bytes fail the safety rules', async () => {
    respond(GOOD.replace('<path', '<script/><path'))
    const { container } = render(<PluginSvgIcon url={freshUrl()} fallback={Plug} />)
    await waitFor(() => expect(container.querySelector('svg')).not.toBeNull())
    expect(container.querySelector('[data-plugin-svg-icon]')).toBeNull()
  })

  it('never fetches a URL that is not a served plugin image', () => {
    respond(GOOD)
    const { container } = render(<PluginSvgIcon url="https://evil.test/a.svg" fallback={Plug} />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('resolvePluginPanelIcon with an SVG URL', () => {
  it('returns a stable component per URL, and ignores URLs that are not served images', () => {
    const url = freshUrl()
    const icon = resolvePluginPanelIcon(undefined, url)
    expect(icon).not.toBe(Plug)
    expect(resolvePluginPanelIcon(undefined, url)).toBe(icon)
    expect(resolvePluginPanelIcon(undefined, 'https://evil.test/a.svg')).toBe(Plug)
    expect(resolvePluginPanelIcon('plug', undefined)).toBe(Plug)
  })
})
