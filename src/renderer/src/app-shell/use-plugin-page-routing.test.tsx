// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../preload/api-types'
import type { PluginPageOpenRequest } from '../../../shared/plugins/frames/plugin-page-document-bridge'
import { createUIStore } from '../store/slices/ui-slice-test-harness'

const VIEW = 'plugin:acme.reports/summary'
const holder = vi.hoisted(() => ({ store: null as unknown }))

type TestStore = ReturnType<typeof createUIStore>

vi.mock('@/store', () => {
  const current = (): TestStore => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test installs a UI store before any hook runs.
    return holder.store as TestStore
  }
  return {
    useAppStore: Object.assign(
      (select: (value: object) => unknown) =>
        select({ ...current().getState(), settings: { pluginSystemEnabled: true } }),
      { getState: () => current().getState() }
    )
  }
})

import { usePluginPageRouting } from './use-plugin-page-routing'
import { usePluginPageRequestsStore } from '@/store/plugin-pages'
import { usePluginPanelsStore } from '@/store/plugin-panels'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function plugin(pages: { id: string; viewKey: string }[], status = 'running'): PluginHostListEntry {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: routing reads only these list fields.
  return {
    pluginKey: 'acme.reports',
    name: 'Reports',
    status,
    panels: [],
    pages: pages.map((page) => ({ ...page, title: page.id }))
  } as unknown as PluginHostListEntry
}

let container: HTMLDivElement
let root: Root
let request: ((request: PluginPageOpenRequest) => void) | null
const list = vi.fn()

function Harness(): null {
  usePluginPageRouting()
  return null
}

// The mocked store hook re-reads the test store on every render, so a store change needs a render.
function ui(): TestStore {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: installed in beforeEach.
  return holder.store as TestStore
}

beforeEach(async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  request = null
  holder.store = createUIStore()
  list.mockReset().mockResolvedValue([plugin([{ id: 'summary', viewKey: VIEW }])])
  usePluginPageRequestsStore.setState({ paths: {} })
  usePluginPanelsStore.setState({
    plugins: [plugin([{ id: 'summary', viewKey: VIEW }])],
    fetchStatus: 'ready'
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: routing reads only these plugin bridge methods.
  globalThis.window.api = {
    plugins: {
      list,
      onChanged: () => vi.fn(),
      onOpenPageRequested: (callback: (request: PluginPageOpenRequest) => void) => {
        request = callback
        return vi.fn()
      }
    }
  } as unknown as Window['api']
  await act(async () => root.render(<Harness />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

const open = async (pageRequest: PluginPageOpenRequest) => {
  await act(async () => {
    request?.(pageRequest)
  })
  // Re-render so the hook sees the store the request just changed.
  await act(async () => root.render(<Harness />))
}

describe('usePluginPageRouting', () => {
  it('opens the requested page and remembers its file', async () => {
    await open({ pluginKey: 'acme.reports', pageId: 'summary', path: '/work/a.txt' })
    expect(ui().getState().activeView).toBe(VIEW)
    expect(usePluginPageRequestsStore.getState().paths[VIEW]).toBe('/work/a.txt')
  })

  it('focuses the page it already shows, replacing or clearing the file', async () => {
    await open({ pluginKey: 'acme.reports', pageId: 'summary', path: '/work/a.txt' })
    await open({ pluginKey: 'acme.reports', pageId: 'summary', path: '/work/b.txt' })
    expect(usePluginPageRequestsStore.getState().paths[VIEW]).toBe('/work/b.txt')
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(usePluginPageRequestsStore.getState().paths[VIEW]).toBeNull()
    expect(ui().getState().activeView).toBe(VIEW)
    ui().getState().closePluginPage()
    expect(ui().getState().activeView).toBe('terminal')
  })

  it('refetches the plugin list for a page it does not know yet, and ignores a missing one', async () => {
    usePluginPanelsStore.setState({ plugins: [], fetchStatus: 'ready' })
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(list).toHaveBeenCalled()
    expect(ui().getState().activeView).toBe(VIEW)

    ui().getState().closePluginPage()
    list.mockResolvedValue([])
    usePluginPanelsStore.setState({ plugins: [], fetchStatus: 'ready' })
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(ui().getState().activeView).toBe('terminal')
  })

  it('falls back to the previous view when the page goes away', async () => {
    ui().getState().openTaskPage()
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(ui().getState().activeView).toBe(VIEW)

    await act(async () => {
      usePluginPanelsStore.setState({ plugins: [plugin([])], fetchStatus: 'ready' })
    })
    await act(async () => root.render(<Harness />))
    expect(ui().getState().activeView).toBe('tasks')
  })

  it('falls back when the plugin is turned off', async () => {
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    await act(async () => {
      usePluginPanelsStore.setState({
        plugins: [plugin([{ id: 'summary', viewKey: VIEW }], 'disabled')],
        fetchStatus: 'ready'
      })
    })
    await act(async () => root.render(<Harness />))
    expect(ui().getState().activeView).toBe('terminal')
  })

  it('keeps the page while the plugin list is still loading', async () => {
    await open({ pluginKey: 'acme.reports', pageId: 'summary' })
    await act(async () => {
      usePluginPanelsStore.setState({ plugins: [], fetchStatus: 'loading' })
    })
    await act(async () => root.render(<Harness />))
    expect(ui().getState().activeView).toBe(VIEW)
  })
})
