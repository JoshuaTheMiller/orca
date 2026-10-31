// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivePluginSidebarCard } from '@/store/plugin-sidebar-cards'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  state: { sidebarBody: 'workspaces', setSidebarBody: vi.fn() },
  cards: [] as unknown[],
  setShown: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))
vi.mock('@/store/plugin-sidebar-cards', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePluginSidebarCards: () => mocks.cards
}))

import { usePluginSidebarCardBody } from './use-plugin-sidebar-card-body'

const issues = {
  id: 'issues',
  title: 'Issues',
  body: 'plugin:samples.tracker/issues',
  pluginKey: 'samples.tracker',
  pluginName: 'Tracker'
} satisfies ActivePluginSidebarCard

let container: HTMLDivElement
let root: Root
let seen: ReturnType<typeof usePluginSidebarCardBody> | null = null

function Probe({ open }: { open: boolean }): null {
  seen = usePluginSidebarCardBody(open)
  return null
}

async function render(open = true): Promise<void> {
  await act(async () => root.render(<Probe open={open} />))
}

beforeEach(() => {
  mocks.state.sidebarBody = 'workspaces'
  mocks.state.setSidebarBody = vi.fn()
  mocks.cards = [issues]
  mocks.setShown.mockReset().mockResolvedValue(undefined)
  seen = null
  vi.stubGlobal(
    'window',
    Object.assign(window, { api: { plugins: { setSidebarCardShown: mocks.setShown } } })
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('usePluginSidebarCardBody', () => {
  it('stays on Projects and reports no card while the body is a built-in one', async () => {
    await render()
    expect(seen?.current).toBeNull()
    expect(seen?.cards).toEqual([issues])
    expect(mocks.setShown).toHaveBeenLastCalledWith(null)
    expect(mocks.state.setSidebarBody).not.toHaveBeenCalled()
  })

  it('resolves a plugin body to its card and tells main it is shown', async () => {
    mocks.state.sidebarBody = issues.body
    await render()
    expect(seen?.current).toBe(issues)
    expect(mocks.setShown).toHaveBeenLastCalledWith({
      pluginKey: 'samples.tracker',
      cardId: 'issues'
    })
  })

  it('reports no card while the sidebar is closed', async () => {
    mocks.state.sidebarBody = issues.body
    await render(false)
    expect(mocks.setShown).toHaveBeenLastCalledWith(null)
  })

  it('falls back to Projects when the shown card is no longer available', async () => {
    mocks.state.sidebarBody = issues.body
    mocks.cards = []
    await render()
    expect(seen?.current).toBeNull()
    expect(mocks.state.setSidebarBody).toHaveBeenCalledWith('workspaces')
  })
})
