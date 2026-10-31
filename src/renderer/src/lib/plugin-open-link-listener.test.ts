import { describe, expect, it, vi } from 'vitest'

const openAppHttpLink = vi.hoisted(() => vi.fn())
vi.mock('./app-http-link-open', () => ({ openAppHttpLink }))

describe('ensurePluginOpenLinksHandled', () => {
  it('subscribes once and routes requests through openAppHttpLink', async () => {
    const onOpenLink = vi.fn()
    vi.stubGlobal('window', { api: { plugins: { onOpenLink } } })
    const { ensurePluginOpenLinksHandled } = await import('./plugin-open-link-listener')
    ensurePluginOpenLinksHandled()
    ensurePluginOpenLinksHandled()
    expect(onOpenLink).toHaveBeenCalledTimes(1)
    onOpenLink.mock.calls[0]![0]({
      url: 'https://example.com',
      external: true,
      alternate: false
    })
    expect(openAppHttpLink).toHaveBeenCalledWith('https://example.com', {
      external: true,
      alternate: false
    })
    onOpenLink.mock.calls[0]![0]({
      url: 'https://example.com',
      external: false,
      alternate: true
    })
    expect(openAppHttpLink).toHaveBeenLastCalledWith('https://example.com', {
      external: false,
      alternate: true
    })
    vi.unstubAllGlobals()
  })
})
