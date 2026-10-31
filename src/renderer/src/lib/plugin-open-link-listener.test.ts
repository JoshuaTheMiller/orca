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
    onOpenLink.mock.calls[0]![0]({ url: 'https://example.com', external: true })
    expect(openAppHttpLink).toHaveBeenCalledWith('https://example.com', { external: true })
    vi.unstubAllGlobals()
  })
})
