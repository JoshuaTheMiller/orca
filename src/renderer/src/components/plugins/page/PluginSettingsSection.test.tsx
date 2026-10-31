// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginHostSetting } from '../../../../../preload/api-types'
import { usePluginSettingValuesStore } from '@/store/plugin-setting-values'

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSetting: vi.fn(),
  resetSetting: vi.fn(),
  toastError: vi.fn(),
  changed: null as null | ((change: { pluginKey: string; key: string; value: unknown }) => void)
}))

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('../../ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) => (
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  )
}))

import { PluginSettingsSection } from './PluginSettingsSection'

const pluginKey = 'samples.demo'
const settings: PluginHostSetting[] = [
  { id: 'verbose', title: 'Verbose', description: 'Say more.', type: 'boolean', default: false },
  { id: 'nickname', title: 'Nickname', type: 'string', default: 'orca', maxLength: 8 },
  {
    id: 'layout',
    title: 'Layout',
    type: 'enum',
    default: 'tree',
    options: [
      { value: 'tree', label: 'Tree' },
      { value: 'radial', label: 'Radial' }
    ]
  }
]

const roots: Root[] = []

async function render(entry: { settings?: PluginHostSetting[] } = { settings }) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<PluginSettingsSection plugin={{ pluginKey, ...entry }} />)
  })
  return container
}

const row = (container: ParentNode, id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-plugin-setting="${id}"]`)
  if (!found) {
    throw new Error(`row not found: ${id}`)
  }
  return found
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PluginSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSettings.mockResolvedValue({ verbose: false, nickname: 'orca', layout: 'tree' })
    mocks.setSetting.mockResolvedValue({ ok: true })
    mocks.resetSetting.mockResolvedValue({ ok: true })
    mocks.changed = null
    usePluginSettingValuesStore.setState({ values: {} })
    Object.assign(window, {
      api: {
        plugins: {
          getSettings: mocks.getSettings,
          setSetting: mocks.setSetting,
          resetSetting: mocks.resetSetting,
          onSettingChanged: (callback: typeof mocks.changed) => {
            mocks.changed = callback
            return () => undefined
          }
        }
      }
    })
  })

  afterEach(async () => {
    await act(async () => {
      for (const root of roots.splice(0)) {
        root.unmount()
      }
    })
    document.body.innerHTML = ''
  })

  it('renders nothing for a plugin that declares no settings', async () => {
    const container = await render({})

    expect(container.innerHTML).toBe('')
  })

  it('renders a control per type with title and description', async () => {
    const container = await render()

    expect(row(container, 'verbose').textContent).toContain('Verbose')
    expect(row(container, 'verbose').textContent).toContain('Say more.')
    expect(row(container, 'verbose').querySelector('[role="switch"]')).not.toBeNull()
    expect(row(container, 'nickname').querySelector('input')?.value).toBe('orca')
    expect(row(container, 'layout').querySelector('select')?.value).toBe('tree')
    expect(row(container, 'layout').querySelectorAll('option')).toHaveLength(2)
  })

  it('shows the stored values, not the defaults', async () => {
    mocks.getSettings.mockResolvedValue({ verbose: true, nickname: 'zed', layout: 'radial' })
    const container = await render()

    expect(
      row(container, 'verbose').querySelector('[role="switch"]')?.getAttribute('aria-checked')
    ).toBe('true')
    expect(row(container, 'nickname').querySelector('input')?.value).toBe('zed')
    expect(row(container, 'layout').querySelector('select')?.value).toBe('radial')
  })

  it('saves a switch the moment it flips', async () => {
    const container = await render()

    await act(async () => {
      row(container, 'verbose').querySelector<HTMLElement>('[role="switch"]')?.click()
    })

    expect(mocks.setSetting).toHaveBeenCalledWith({ pluginKey, key: 'verbose', value: true })
  })

  it('saves a chosen option', async () => {
    const container = await render()
    const select = row(container, 'layout').querySelector('select') as HTMLSelectElement

    await act(async () => {
      select.value = 'radial'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(mocks.setSetting).toHaveBeenCalledWith({ pluginKey, key: 'layout', value: 'radial' })
  })

  it('saves typed text on blur and bounds it by maxLength', async () => {
    const container = await render()
    const input = row(container, 'nickname').querySelector('input') as HTMLInputElement
    expect(input.maxLength).toBe(8)

    await act(async () => {
      setInputValue(input, 'zed')
    })
    expect(mocks.setSetting).not.toHaveBeenCalled()
    await act(async () => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })

    expect(mocks.setSetting).toHaveBeenCalledWith({ pluginKey, key: 'nickname', value: 'zed' })
  })

  it('offers reset only for a changed value, and resets through the host', async () => {
    mocks.getSettings.mockResolvedValue({ verbose: true, nickname: 'orca', layout: 'tree' })
    const container = await render()

    expect(row(container, 'layout').querySelector('button')).toBeNull()
    const reset = row(container, 'verbose').querySelector('button') as HTMLButtonElement
    expect(reset.textContent).toContain('Reset')

    await act(async () => {
      reset.click()
    })

    expect(mocks.resetSetting).toHaveBeenCalledWith({ pluginKey, key: 'verbose' })
  })

  it('follows a change announced by main', async () => {
    const container = await render()

    await act(async () => {
      mocks.changed?.({ pluginKey, key: 'layout', value: 'radial' })
    })

    expect(row(container, 'layout').querySelector('select')?.value).toBe('radial')
    expect(row(container, 'layout').querySelector('button')).not.toBeNull()
  })

  it('tells the user when a save is refused', async () => {
    mocks.setSetting.mockResolvedValue({ ok: false, error: 'layout must be one of: tree' })
    const container = await render()

    await act(async () => {
      row(container, 'verbose').querySelector<HTMLElement>('[role="switch"]')?.click()
    })

    expect(mocks.toastError).toHaveBeenCalledWith('Could not save the setting', {
      description: 'layout must be one of: tree'
    })
  })
})
