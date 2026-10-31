import { describe, expect, it } from 'vitest'
import { createUIStore } from './ui-slice-test-harness'

const PAGE_A = 'plugin:acme.reports/summary'
const PAGE_B = 'plugin:acme.reports/log'

describe('plugin page views', () => {
  it('opens a plugin page and returns to the view it came from', () => {
    const store = createUIStore()
    store.getState().openTaskPage()
    store.getState().openPluginPage(PAGE_A)
    expect(store.getState().activeView).toBe(PAGE_A)
    expect(store.getState().previousViewBeforePluginPage).toBe('tasks')

    store.getState().closePluginPage()
    expect(store.getState().activeView).toBe('tasks')
  })

  it('keeps the original previous view while moving between plugin pages', () => {
    const store = createUIStore()
    store.getState().openPluginPage(PAGE_A)
    store.getState().openPluginPage(PAGE_B)
    expect(store.getState().activeView).toBe(PAGE_B)
    store.getState().closePluginPage()
    expect(store.getState().activeView).toBe('terminal')
  })

  it('treats opening the page it already shows as a focus', () => {
    const store = createUIStore()
    store.getState().openAutomationsPage()
    store.getState().openPluginPage(PAGE_A)
    store.getState().openPluginPage(PAGE_A)
    store.getState().closePluginPage()
    expect(store.getState().activeView).toBe('automations')
  })

  it('does not move the view when closed from somewhere else', () => {
    const store = createUIStore()
    store.getState().openTaskPage()
    store.getState().closePluginPage()
    expect(store.getState().activeView).toBe('tasks')
  })

  it('lets a built-in page opened from a plugin page return to it', () => {
    const store = createUIStore()
    store.getState().openPluginPage(PAGE_A)
    store.getState().openSettingsPage()
    expect(store.getState().previousViewBeforeSettings).toBe(PAGE_A)
    store.getState().closeSettingsPage()
    expect(store.getState().activeView).toBe(PAGE_A)
  })
})
