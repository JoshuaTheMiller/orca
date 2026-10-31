// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import type { PluginPageDocumentUpdate } from '../../../../shared/plugins/frames/plugin-page-document-bridge'

const closePluginPage = vi.fn()

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { closePluginPage: () => void }) => unknown) =>
    select({ closePluginPage })
}))

vi.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null
}))

import PluginFullPage from './PluginFullPage'
import { usePluginPageRequestsStore } from '@/store/plugin-pages'
import { usePluginPanelsStore } from '@/store/plugin-panels'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const VIEW = 'plugin:acme.reports/summary'
const PATH = '/work/notes.txt'
const READY = { orca: 1, kind: 'evt', event: 'ready', payload: { protocol: 1 } }
const documentEvent = (version: number, text: string) => ({
  orca: 1,
  kind: 'evt',
  event: 'editor.document',
  payload: { version, readOnly: true, content: { kind: 'text', text } }
})

function pluginEntry(): PluginHostListEntry {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the page reads only these list fields.
  return {
    pluginKey: 'acme.reports',
    name: 'Reports',
    status: 'running',
    panels: [],
    pages: [{ id: 'summary', title: 'Summary', icon: 'file-text', viewKey: VIEW }]
  } as unknown as PluginHostListEntry
}

let container: HTMLDivElement
let root: Root
let changed: ((update: PluginPageDocumentUpdate) => void) | null
const readPageEntry = vi.fn()
const openPageDocument = vi.fn()
const closePageDocument = vi.fn()
const unsubscribe = vi.fn()

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  changed = null
  closePluginPage.mockReset()
  readPageEntry.mockReset().mockResolvedValue({
    html: '<main>page</main>',
    sessionToken: 't'.repeat(43)
  })
  openPageDocument.mockReset().mockResolvedValue({ ok: true, text: 'first' })
  closePageDocument.mockReset().mockResolvedValue(undefined)
  unsubscribe.mockReset()
  usePluginPanelsStore.setState({ plugins: [pluginEntry()], fetchStatus: 'ready' })
  usePluginPageRequestsStore.setState({ paths: {} })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the page reads only these plugin bridge methods.
  globalThis.window.api = {
    plugins: {
      list: vi.fn().mockResolvedValue([pluginEntry()]),
      readPageEntry,
      openPageDocument,
      closePageDocument,
      onPageDocumentChanged: (callback: (update: PluginPageDocumentUpdate) => void) => {
        changed = callback
        return unsubscribe
      },
      onChanged: () => vi.fn()
    }
  } as unknown as Window['api']
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function renderPage(path: string | null = null) {
  usePluginPageRequestsStore.setState({ paths: { [VIEW]: path } })
  await act(async () => {
    root.render(<PluginFullPage viewKey={VIEW} />)
  })
  const iframe = container.querySelector('iframe')
  const frameWindow = iframe?.contentWindow ?? null
  const posted = frameWindow ? vi.spyOn(frameWindow, 'postMessage') : null
  const fromFrame = async (data: unknown) => {
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data, source: frameWindow }))
    })
  }
  return { iframe, posted, fromFrame }
}

const documentsPosted = (posted: ReturnType<typeof vi.spyOn> | null) =>
  (posted?.mock.calls ?? [])
    .map(([message]) => message as { event?: string; payload?: { version: number } })
    .filter((message) => message.event === 'editor.document')

describe('PluginFullPage', () => {
  it('shows the title under a back button and hosts the entry in a sandboxed page frame', async () => {
    const { iframe, posted, fromFrame } = await renderPage()
    expect(container.querySelector('h1')?.textContent).toBe('Summary')
    expect(readPageEntry).toHaveBeenCalledWith({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(iframe?.getAttribute('srcdoc')).toContain('<main>page</main>')
    // The window name must not carry the page's file.
    expect(iframe?.getAttribute('name')).toMatch(/^orca-plugin-panel:page:/)

    await fromFrame(READY)
    const hello = posted?.mock.calls.map(([message]) => message).find((m) => m.event === 'hello')
    expect(hello.payload.surface).toBe('page')
    expect(hello.payload.methods).toContain('pages.open')
    expect(hello.payload.methods).not.toContain('terminal.sendText')

    container.querySelector<HTMLButtonElement>('button[aria-label="Back"]')?.click()
    expect(closePluginPage).toHaveBeenCalledTimes(1)
  })

  it('sends a page opened without a file no document', async () => {
    const { posted, fromFrame } = await renderPage(null)
    await fromFrame(READY)
    expect(openPageDocument).not.toHaveBeenCalled()
    expect(documentsPosted(posted)).toEqual([])
  })

  it('gives a page opened with a file a read-only text document and each later change', async () => {
    const { posted, fromFrame } = await renderPage(PATH)
    expect(openPageDocument).toHaveBeenCalledWith({
      pluginKey: 'acme.reports',
      pageId: 'summary',
      instanceId: expect.any(String),
      path: PATH
    })
    await fromFrame(READY)
    expect(posted).toHaveBeenCalledWith(documentEvent(1, 'first'), '*', [])

    const { instanceId } = openPageDocument.mock.calls[0]![0]
    await act(async () => {
      changed?.({ instanceId: 'someone-else', result: { ok: true, text: 'ignored' } })
      changed?.({ instanceId, result: { ok: true, text: 'second' } })
    })
    expect(documentsPosted(posted).map((message) => message.payload?.version)).toEqual([1, 2])
    expect(posted).toHaveBeenLastCalledWith(documentEvent(2, 'second'), '*', [])
  })

  it('answers an edit from the page with not_permitted', async () => {
    const { posted, fromFrame } = await renderPage(PATH)
    await fromFrame(READY)
    await fromFrame({
      orca: 1,
      kind: 'req',
      id: 3,
      method: 'editor.applyEdit',
      params: { baseVersion: 1, content: { kind: 'text', text: 'rewrite' } }
    })
    const answer = posted?.mock.calls.map(([message]) => message).find((m) => m.id === 3)
    expect(answer).toMatchObject({ kind: 'res', error: { code: 'not_permitted' } })
  })

  it('releases the file watch when the page closes', async () => {
    await renderPage(PATH)
    const { instanceId } = openPageDocument.mock.calls[0]![0]
    await act(async () => root.unmount())
    expect(closePageDocument).toHaveBeenCalledWith({ instanceId })
    expect(unsubscribe).toHaveBeenCalled()
    root = createRoot(container)
  })

  it('swaps the watched file when the page is asked to show another', async () => {
    await renderPage(PATH)
    const first = openPageDocument.mock.calls[0]![0].instanceId
    await act(async () => {
      usePluginPageRequestsStore.getState().setPagePath(VIEW, '/work/other.txt')
    })
    expect(closePageDocument).toHaveBeenCalledWith({ instanceId: first })
    expect(openPageDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: '/work/other.txt' })
    )
  })

  it('says why a file cannot be shown, and still shows the page', async () => {
    openPageDocument.mockResolvedValue({ ok: false, reason: 'too_large' })
    const { iframe } = await renderPage(PATH)
    expect(container.textContent).toContain('The file this page shows is too large.')
    expect(iframe).not.toBeNull()
  })

  it('shows a notice when the page is gone', async () => {
    usePluginPanelsStore.setState({ plugins: [], fetchStatus: 'ready' })
    await renderPage()
    expect(container.textContent).toContain('This plugin page is no longer available.')
    expect(container.querySelector('iframe')).toBeNull()
    expect(readPageEntry).not.toHaveBeenCalled()
  })

  it('shows a notice when the entry cannot be loaded', async () => {
    readPageEntry.mockResolvedValue(null)
    await renderPage()
    expect(container.textContent).toContain('The plugin page could not be loaded.')
  })
})
