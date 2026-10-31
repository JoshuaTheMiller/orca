import { z } from 'zod'
import { safePluginDisplayText } from '../manifest/plugin-display-text'
import { pluginIdSchema } from '../manifest/plugin-manifest-fields'
import { pluginFieldDoc, PLUGIN_SETTINGS_SINCE } from '../manifest/plugin-schema-field-docs'

export const PLUGIN_SETTING_LIMIT = 32
export const PLUGIN_SETTING_TYPES = ['boolean', 'string', 'enum'] as const
export type PluginSettingType = (typeof PLUGIN_SETTING_TYPES)[number]
export const PLUGIN_SETTING_OPTION_MIN = 2
export const PLUGIN_SETTING_OPTION_MAX = 20
export const PLUGIN_SETTING_STRING_MAX_LENGTH = 200
/** Upper bound for a declared `maxLength`; a setting is a preference, not a document. */
export const PLUGIN_SETTING_STRING_LENGTH_CAP = 1000

const SINCE = PLUGIN_SETTINGS_SINCE

const pluginSettingOptionSchema = z
  .object({
    value: z
      .string()
      .min(1)
      .max(64)
      .meta(
        pluginFieldDoc('Value stored and returned when the option is chosen.', SINCE, ['dark'])
      ),
    label: safePluginDisplayText(z.string().min(1).max(64)).meta(
      pluginFieldDoc('Text shown for the option.', SINCE, ['Dark'])
    )
  })
  .strict()
  .meta({ id: 'SettingOption', description: 'One choice of an `enum` setting.' })

export const pluginSettingContributionSchema = z
  .object({
    id: pluginIdSchema.meta(
      pluginFieldDoc(
        "Setting key, unique among this plugin's settings. Stored in the same per-plugin store as `settings.set`. The reserved names `constructor` and `prototype` are refused.",
        SINCE,
        ['show-graph']
      )
    ),
    title: safePluginDisplayText(z.string().min(1).max(64)).meta(
      pluginFieldDoc("Label shown in Orca's settings.", SINCE, ['Show graph'])
    ),
    description: safePluginDisplayText(z.string().min(1).max(256))
      .optional()
      .meta(pluginFieldDoc('Help text shown under the label.', SINCE)),
    type: z
      .enum(PLUGIN_SETTING_TYPES)
      .meta(
        pluginFieldDoc(
          'Value type: `boolean` (a switch), `string` (a text field) or `enum` (a choice among `options`).',
          SINCE,
          ['boolean']
        )
      ),
    default: z
      .union([z.boolean(), z.string()])
      .meta(
        pluginFieldDoc(
          'Value until the user changes it. Must match `type`; for `enum` it must be one of the option values.',
          SINCE,
          [false]
        )
      ),
    options: z
      .array(pluginSettingOptionSchema)
      .min(PLUGIN_SETTING_OPTION_MIN)
      .max(PLUGIN_SETTING_OPTION_MAX)
      .optional()
      .meta(
        pluginFieldDoc(
          `Choices of an \`enum\` setting, ${PLUGIN_SETTING_OPTION_MIN} to ${PLUGIN_SETTING_OPTION_MAX}, with distinct values. Required for \`enum\` and refused on other types.`,
          SINCE
        )
      ),
    maxLength: z
      .number()
      .int()
      .min(1)
      .max(PLUGIN_SETTING_STRING_LENGTH_CAP)
      .optional()
      .meta(
        pluginFieldDoc(
          `Longest value of a \`string\` setting. Defaults to ${PLUGIN_SETTING_STRING_MAX_LENGTH}. Refused on other types.`,
          SINCE,
          [80]
        )
      )
  })
  .strict()
  .superRefine((setting, ctx) => {
    const issue = (path: string, message: string): void =>
      ctx.addIssue({ code: 'custom', path: [path], message })
    if (setting.type !== 'enum' && setting.options !== undefined) {
      issue('options', 'only for an enum setting')
    }
    if (setting.type !== 'string' && setting.maxLength !== undefined) {
      issue('maxLength', 'only for a string setting')
    }
    if (setting.type === 'boolean' && typeof setting.default !== 'boolean') {
      issue('default', 'must be true or false for a boolean setting')
    }
    if (setting.type === 'string') {
      if (typeof setting.default !== 'string') {
        issue('default', 'must be a string for a string setting')
      } else if (setting.default.length > (setting.maxLength ?? PLUGIN_SETTING_STRING_MAX_LENGTH)) {
        issue('default', 'is longer than maxLength')
      }
    }
    if (setting.type === 'enum') {
      if (setting.options === undefined) {
        issue('options', 'required for an enum setting')
        return
      }
      const values = setting.options.map((option) => option.value)
      if (new Set(values).size !== values.length) {
        issue('options', 'option values must be distinct')
      }
      if (typeof setting.default !== 'string' || !values.includes(setting.default)) {
        issue('default', 'must be one of the option values')
      }
    }
  })
  .meta({
    id: 'SettingContribution',
    description:
      "A typed setting that Orca shows in its own settings and stores with the plugin's other settings. Requires the `declarative` execution profile or higher; code reads it with `settings.get`, which needs the `settings:own` capability."
  })

export type PluginSettingContribution = z.infer<typeof pluginSettingContributionSchema>
