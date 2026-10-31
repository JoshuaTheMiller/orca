import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
// Why mocked: the workspace is assumed able to host a browser tab, so only the link settings decide.
vi.mock('./client-creation-action-policy', () => ({
  getWorkspaceClientCreationActionPolicy: () => ({ 'managed-browser': { state: 'enabled' } })
}))
vi.mock('@/components/native-chat/native-chat-http-link-source-owner', () => ({
  resolveNativeChatHttpLinkSourceOwner: () => ({ kind: 'local' }),
  canNativeChatOpenOwnedBrowser: () => true
}))
vi.mock('./shortcut-platform', () => ({ getShortcutPlatform: () => 'win32' }))

import {
  registerHttpLinkStoreAccessor,
  registerWorkspaceHttpLinkBrowserOpener
} from './http-link-routing'
import { openAppHttpLink, registerAppHttpLinkStateAccessor } from './app-http-link-open'

type Settings = {
  openLinksInApp: boolean
  openLinksInAppModifierInverts: boolean
}

describe('openAppHttpLink alternate', () => {
  const openUrl = vi.fn()
  const createBrowserTab = vi.fn()
  const openInOrca = vi.fn((): Promise<string | null> => Promise.resolve(null))
  const state = {
    settings: {} as Settings,
    setActiveWorktree: vi.fn(),
    createBrowserTab
  }

  beforeEach(() => {
    vi.clearAllMocks()
    registerHttpLinkStoreAccessor(() => state)
    // SAFETY: only the mocked host lookups read this state.
    // oxlint-disable-next-line typescript/consistent-type-assertions
    registerAppHttpLinkStateAccessor(() => ({}) as never)
    registerWorkspaceHttpLinkBrowserOpener(openInOrca)
    vi.stubGlobal('window', { api: { shell: { openUrl } } })
  })
  afterEach(() => vi.unstubAllGlobals())

  // Why: the user's settings, not the plugin, decide which target Shift means.
  it.each([
    // [openLinksInApp, inverts, alternate, expected target]
    [true, true, false, 'orca'],
    [true, true, true, 'system'],
    [false, true, false, 'system'],
    [false, true, true, 'orca'],
    [true, false, true, 'system'],
    [false, false, true, 'system']
  ] as const)(
    'openLinksInApp=%s inverts=%s alternate=%s opens in %s',
    (openLinksInApp, inverts, alternate, target) => {
      state.settings = {
        openLinksInApp,
        openLinksInAppModifierInverts: inverts
      }
      openAppHttpLink('https://example.com/', {
        worktreeId: 'wt-1',
        alternate
      })
      if (target === 'system') {
        expect(openUrl).toHaveBeenCalledWith('https://example.com/')
        expect(openInOrca).not.toHaveBeenCalled()
      } else {
        expect(openUrl).not.toHaveBeenCalled()
        expect(openInOrca).toHaveBeenCalled()
      }
    }
  )
})
