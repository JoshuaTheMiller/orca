import { describe, expect, it } from 'vitest'
import { describeSettingRows } from './plugin-setting-rows'
import { describePluginContributions, summaryContributionSource } from './plugin-contributions'

describe('setting rows', () => {
  it('adds nothing for a plugin without settings', () => {
    expect(describeSettingRows([])).toEqual([])
  })

  it('says how many settings the plugin adds, in one row', () => {
    expect(describeSettingRows([{ title: 'A' }]).map((row) => row.detail)).toEqual([
      'Adds 1 setting'
    ])
    const rows = describeSettingRows([{ title: 'A' }, { title: 'B' }, { title: 'C' }])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'settings',
      title: 'Settings',
      detail: 'Adds 3 settings'
    })
  })

  it('reads settings from a catalog summary', () => {
    const source = summaryContributionSource([
      { kind: 'settings', name: 'Show graph', detail: 'boolean' },
      { kind: 'settings', name: 'Layout', detail: 'enum' }
    ])
    expect(source.settings).toEqual([{ title: 'Show graph' }, { title: 'Layout' }])
    expect(
      describePluginContributions(source)
        .filter((row) => row.kind === 'settings')
        .map((row) => row.detail)
    ).toEqual(['Adds 2 settings'])
  })
})
