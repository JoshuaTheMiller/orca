import { describe, expect, it } from 'vitest'
import {
  isPluginPageView,
  isStaticTopLevelView,
  isTopLevelView,
  parsePluginPageView,
  pluginPageViewKey
} from './top-level-view'
import { TopLevelViewSchema } from './rpc-contract/client-ui-params'

describe('top-level views', () => {
  it('builds and parses a plugin page view', () => {
    const view = pluginPageViewKey('acme.reports', 'summary')
    expect(view).toBe('plugin:acme.reports/summary')
    expect(parsePluginPageView(view)).toEqual({ pluginKey: 'acme.reports', pageId: 'summary' })
    expect(isPluginPageView(view)).toBe(true)
    expect(isTopLevelView(view)).toBe(true)
  })

  it('rejects malformed plugin page views', () => {
    for (const value of [
      'plugin:acme.reports',
      'plugin:acme.reports/',
      'plugin:/summary',
      'plugin:acme/summary',
      'plugin:acme.reports/summary/extra',
      'plugin:acme.reports/Summary Page',
      'plugins:acme.reports/summary',
      '',
      42,
      null
    ]) {
      expect(isPluginPageView(value)).toBe(false)
      expect(isTopLevelView(value)).toBe(false)
    }
  })

  it('keeps persistence and IPC to the built-in views', () => {
    const view = 'plugin:acme.reports/summary'
    expect(isStaticTopLevelView('tasks')).toBe(true)
    expect(isStaticTopLevelView(view)).toBe(false)
    expect(isStaticTopLevelView('constructor')).toBe(false)
    expect(TopLevelViewSchema.safeParse('tasks').success).toBe(true)
    expect(TopLevelViewSchema.safeParse(view).success).toBe(false)
  })
})
