// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginSidebarCardItem } from '../../../../shared/plugins/contributions/plugin-sidebar-card-items'
import type { ActivePluginSidebarCard } from '@/store/plugin-sidebar-cards'
import { usePluginPanelsStore } from '@/store/plugin-panels'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const mocks = vi.hoisted(() => ({
  getItems: vi.fn(),
  invokeCommand: vi.fn(),
  openFile: vi.fn(),
  changed: null as null | ((change: { pluginKey: string; cardId: string }) => void),
  toastError: vi.fn(),
  executePluginCommand: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/lib/plugin-command-execution', () => ({
  executePluginCommand: mocks.executePluginCommand
}))

import PluginSidebarCardBody from './PluginSidebarCardBody'

const card = {
  id: 'issues',
  title: 'Issues',
  body: 'plugin:samples.tracker/issues',
  pluginKey: 'samples.tracker',
  pluginName: 'Tracker'
} satisfies ActivePluginSidebarCard

let container: HTMLDivElement
let root: Root

async function render(shown: ActivePluginSidebarCard = card): Promise<void> {
  await act(async () => {
    root.render(<PluginSidebarCardBody card={shown} />)
  })
}

function rows(items: PluginSidebarCardItem[]): void {
  mocks.getItems.mockResolvedValue(items)
}

beforeEach(() => {
  for (const mock of [mocks.getItems, mocks.invokeCommand, mocks.openFile, mocks.toastError]) {
    mock.mockReset()
  }
  mocks.executePluginCommand.mockReset()
  mocks.changed = null
  usePluginPanelsStore.setState({
    plugins: [
      // SAFETY: only the members the action runner reads are filled in.
      // oxlint-disable-next-line typescript/consistent-type-assertions
      {
        pluginKey: 'samples.tracker',
        name: 'Tracker',
        commands: [
          { id: 'tracker.open', title: 'Open', context: 'global', handler: { type: 'worker' } },
          {
            id: 'tracker.palette',
            title: 'Palette',
            context: 'global',
            handler: { type: 'built-in', action: 'view.tasks' }
          }
        ]
      } as never
    ]
  })
  vi.stubGlobal(
    'window',
    Object.assign(window, {
      api: {
        plugins: {
          getSidebarCardItems: mocks.getItems,
          invokeCommand: mocks.invokeCommand,
          openSidebarCardFile: mocks.openFile,
          onSidebarCardItemsChanged: (callback: typeof mocks.changed) => {
            mocks.changed = callback
            return () => undefined
          }
        }
      }
    })
  )
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  usePluginPanelsStore.setState({ plugins: [] })
})

describe('PluginSidebarCardBody', () => {
  it('renders the rows the plugin set, with subtitle and badges', async () => {
    rows([
      {
        id: 'a',
        title: 'Crash on start',
        subtitle: 'opened 2 days ago',
        badges: [{ label: 'bug', tone: 'danger' }, { label: 'new' }]
      },
      { id: 'b', title: 'Second' }
    ])
    await render()
    expect(mocks.getItems).toHaveBeenCalledWith({ pluginKey: 'samples.tracker', cardId: 'issues' })
    expect(container.textContent).toContain('Crash on start')
    expect(container.textContent).toContain('opened 2 days ago')
    const badges = [...container.querySelectorAll('[data-tone]')]
    expect(badges.map((badge) => [badge.textContent, badge.getAttribute('data-tone')])).toEqual([
      ['bug', 'danger'],
      ['new', 'neutral']
    ])
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('shows the card empty text, or a default, when there are no rows', async () => {
    rows([])
    await render({ ...card, emptyText: 'No issues.' })
    expect(container.querySelector('[data-plugin-sidebar-card-empty]')?.textContent).toBe(
      'No issues.'
    )
    await render()
    expect(container.querySelector('[data-plugin-sidebar-card-empty]')?.textContent).toBe(
      'Nothing to show yet.'
    )
  })

  it('reloads the rows when the worker sets them again, for this card only', async () => {
    rows([{ id: 'a', title: 'Old' }])
    await render()
    rows([{ id: 'b', title: 'New' }])
    await act(async () => mocks.changed?.({ pluginKey: 'samples.tracker', cardId: 'prs' }))
    expect(container.textContent).toContain('Old')
    await act(async () => mocks.changed?.({ pluginKey: 'samples.tracker', cardId: 'issues' }))
    expect(container.textContent).toContain('New')
    expect(container.textContent).not.toContain('Old')
  })

  it('runs a worker command with the row args when its row is clicked', async () => {
    rows([
      {
        id: 'a',
        title: 'Open it',
        action: { kind: 'command', command: 'tracker.open', args: { id: 7 } }
      }
    ])
    await render()
    await act(async () => container.querySelector('button')?.click())
    expect(mocks.invokeCommand).toHaveBeenCalledWith({
      pluginKey: 'samples.tracker',
      commandId: 'tracker.open',
      args: { id: 7 }
    })
  })

  it('runs a command without args through the palette path', async () => {
    rows([{ id: 'a', title: 'Go', action: { kind: 'command', command: 'tracker.palette' } }])
    await render()
    await act(async () => container.querySelector('button')?.click())
    expect(mocks.executePluginCommand).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'tracker.palette', pluginKey: 'samples.tracker' }),
      'plugin-palette'
    )
    expect(mocks.invokeCommand).not.toHaveBeenCalled()
  })

  it('asks main to open the file of a row by its id', async () => {
    mocks.openFile.mockResolvedValue({ ok: true })
    rows([{ id: 'a', title: 'Notes', action: { kind: 'openFile', path: '/tmp/notes.md' } }])
    await render()
    await act(async () => container.querySelector('button')?.click())
    expect(mocks.openFile).toHaveBeenCalledWith({
      pluginKey: 'samples.tracker',
      cardId: 'issues',
      itemId: 'a'
    })
    expect(mocks.toastError).not.toHaveBeenCalled()
  })

  it('toasts when the plugin may not open files, or the command is unknown', async () => {
    mocks.openFile.mockResolvedValue({
      ok: false,
      error: 'plugin does not have the "editor:open" capability'
    })
    rows([
      { id: 'a', title: 'Notes', action: { kind: 'openFile', path: '/tmp/notes.md' } },
      { id: 'b', title: 'Ghost', action: { kind: 'command', command: 'tracker.gone' } }
    ])
    await render()
    const [open, ghost] = [...container.querySelectorAll('button')]
    await act(async () => open?.click())
    expect(mocks.toastError).toHaveBeenLastCalledWith('Notes failed', {
      description: 'plugin does not have the "editor:open" capability'
    })
    await act(async () => ghost?.click())
    expect(mocks.toastError).toHaveBeenLastCalledWith('Ghost failed', {
      description: 'unknown command: tracker.gone'
    })
  })
})
