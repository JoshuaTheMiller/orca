// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivePluginSidebarNavItem } from '@/store/plugin-sidebar-nav-items'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  items: [] as unknown[],
  updateSettings: vi.fn(),
  execute: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/store/plugin-sidebar-nav-items', () => ({
  usePluginSidebarNavItems: () => mocks.items
}))

vi.mock('@/lib/plugin-command-execution', () => ({ executePluginCommand: mocks.execute }))

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="context-menu">{children}</div>
  ),
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  ContextMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  )
}))

import { PluginSidebarNavItems } from './PluginSidebarNavItems'
import { clearPluginSvgIconCache } from '../plugins/PluginSvgIcon'

const SVG_TEXT =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>'

const plugin = { pluginKey: 'samples.graph', pluginName: 'Graph' }
const command: ActivePluginSidebarNavItem = {
  ...plugin,
  id: 'open',
  key: 'samples.graph/open',
  title: 'Open graph',
  runnable: {
    ...plugin,
    id: 'graph.open',
    title: 'Open',
    context: 'global',
    handler: { type: 'worker' },
    keybindings: []
  }
}
const toggle: ActivePluginSidebarNavItem = {
  ...plugin,
  id: 'details',
  key: 'samples.graph/details',
  title: 'Details',
  kind: 'toggle',
  setting: 'show-details',
  default: false,
  valueKey: 'samples.graph/show-details'
}
const childCommand: ActivePluginSidebarNavItem = {
  ...command,
  id: 'details-open',
  key: 'samples.graph/details-open',
  title: 'Open details',
  parentKey: toggle.key
}
const childCheckbox: ActivePluginSidebarNavItem = {
  ...plugin,
  id: 'labels',
  key: 'samples.graph/labels',
  title: 'Show labels',
  kind: 'checkbox',
  setting: 'show-labels',
  default: true,
  valueKey: 'samples.graph/show-labels',
  parentKey: toggle.key
}
// Declared with the children first: they still render under their toggle.
const ITEMS = [childCommand, childCheckbox, command, toggle]

function setState(settings: Record<string, unknown> = {}): void {
  mocks.state = {
    settings,
    activeWorktreeId: 'wt-1',
    updateSettings: mocks.updateSettings
  }
}

const roots: Root[] = []

async function render(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<PluginSidebarNavItems />)
  })
  return container
}

const click = (element: Element): Promise<void> =>
  act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })

function rowFor(container: ParentNode, title: string): HTMLElement {
  const label = Array.from(container.querySelectorAll('span')).find(
    (span) => span.textContent === title
  )
  const row = label?.closest<HTMLElement>('[data-depth]')
  if (!row) {
    throw new Error(`row not found: ${title}`)
  }
  return row
}

const titles = (container: ParentNode): string[] =>
  Array.from(container.querySelectorAll('[data-depth]')).map(
    (row) => row.querySelector('span')?.textContent ?? ''
  )

describe('PluginSidebarNavItems stateful items', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.execute.mockResolvedValue(undefined)
    mocks.items = ITEMS
    setState()
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('shows a toggle off by default with its children hidden', async () => {
    const container = await render()

    expect(titles(container)).toEqual(['Open graph', 'Details'])
    const row = rowFor(container, 'Details')
    expect(row.dataset.kind).toBe('toggle')
    expect(row.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
  })

  it('shows children indented right under a toggle that is on', async () => {
    setState({ pluginSidebarNavValues: { 'samples.graph/show-details': true } })
    const container = await render()

    expect(titles(container)).toEqual(['Open graph', 'Details', 'Open details', 'Show labels'])
    expect(rowFor(container, 'Details').dataset.depth).toBe('0')
    expect(rowFor(container, 'Open details').dataset.depth).toBe('1')
    expect(rowFor(container, 'Open details').className).toContain('pl-6')
    expect(rowFor(container, 'Show labels').dataset.depth).toBe('1')
    expect(rowFor(container, 'Show labels').querySelector('[role="checkbox"]')).not.toBeNull()
  })

  it('flips the value when the row is clicked, persisting it next to the other values', async () => {
    setState({ pluginSidebarNavValues: { 'samples.other/x': true } })
    const container = await render()

    await click(rowFor(container, 'Details'))

    expect(mocks.updateSettings).toHaveBeenCalledOnce()
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      pluginSidebarNavValues: { 'samples.other/x': true, 'samples.graph/show-details': true }
    })
  })

  it('flips once when the switch itself is clicked', async () => {
    const container = await render()

    await click(rowFor(container, 'Details').querySelector('[role="switch"]') as Element)

    expect(mocks.updateSettings).toHaveBeenCalledOnce()
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      pluginSidebarNavValues: { 'samples.graph/show-details': true }
    })
  })

  it('applies a checkbox default and flips it off', async () => {
    setState({ pluginSidebarNavValues: { 'samples.graph/show-details': true } })
    const container = await render()
    const row = rowFor(container, 'Show labels')
    expect(row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')).toBe('true')

    await click(row)
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({
      pluginSidebarNavValues: {
        'samples.graph/show-details': true,
        'samples.graph/show-labels': false
      }
    })

    await click(row.querySelector('[role="checkbox"]') as Element)
    expect(mocks.updateSettings).toHaveBeenCalledTimes(2)
  })

  it('hides a parent together with its children and keeps command items working', async () => {
    setState({
      pluginSidebarNavValues: { 'samples.graph/show-details': true },
      hiddenPluginSidebarNavItems: [toggle.key]
    })
    const container = await render()

    expect(titles(container)).toEqual(['Open graph'])
    await click(rowFor(container, 'Open graph'))
    expect(mocks.execute).toHaveBeenCalledWith(command.runnable, 'plugin-palette')
  })

  it('hides a toggle from its context menu', async () => {
    const container = await render()
    const menu = rowFor(container, 'Details').closest('[data-testid="context-menu"]')
    const hide = Array.from((menu as Element).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Hide from sidebar')
    )

    await click(hide as Element)

    expect(mocks.updateSettings).toHaveBeenCalledWith({
      hiddenPluginSidebarNavItems: [toggle.key]
    })
  })

  it('renders nothing when every item is hidden', async () => {
    setState({ hiddenPluginSidebarNavItems: [command.key, toggle.key] })
    const container = await render()

    expect(container.innerHTML).toBe('')
  })

  it('draws a nav item declared with an SVG icon as a mask, and the built-in icon otherwise', async () => {
    const read = vi.fn().mockResolvedValue(SVG_TEXT)
    Object.assign(window, { api: { plugins: { readContributionSvgIcon: read } } })
    clearPluginSvgIconCache()
    mocks.items = [{ ...command, svgIconSlot: 'nav-0' }, toggle]
    const container = await render()

    expect(read).toHaveBeenCalledWith({ pluginKey: 'samples.graph', slot: 'nav-0' })
    const icon = rowFor(container, 'Open graph').querySelector<HTMLElement>(
      '[data-plugin-svg-icon]'
    )
    expect(icon?.style.maskImage).toContain('data:image/svg+xml')
    expect(rowFor(container, 'Details').querySelector('[data-plugin-svg-icon]')).toBeNull()
    expect(rowFor(container, 'Details').querySelector('svg')).not.toBeNull()
  })
})
