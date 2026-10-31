import { beforeEach, describe, expect, it, vi } from 'vitest'

const openOwnedHttpLink = vi.hoisted(() => vi.fn())
vi.mock('./http-link-routing', () => ({ openOwnedHttpLink }))
vi.mock('./shortcut-platform', () => ({ getShortcutPlatform: () => 'win32' }))

import { openAppHttpLink } from './app-http-link-open'

describe('openAppHttpLink external', () => {
  beforeEach(() => openOwnedHttpLink.mockClear())

  it('forces the system browser only when external is set', () => {
    openAppHttpLink('https://example.com', { external: true })
    expect(openOwnedHttpLink.mock.calls[0]![1]).toMatchObject({ forceSystemBrowser: true })
    openAppHttpLink('https://example.com')
    expect(openOwnedHttpLink.mock.calls[1]![1]).not.toHaveProperty('forceSystemBrowser')
  })

  it('ignores non-web links', () => {
    openAppHttpLink('file:///etc/passwd', { external: true })
    expect(openOwnedHttpLink).not.toHaveBeenCalled()
  })
})
