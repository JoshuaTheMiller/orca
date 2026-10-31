import type { PluginManifest } from '../manifest/plugin-manifest'
import { pluginRelativePathSchema } from '../manifest/plugin-manifest-fields'
import { pluginPathFieldDoc, PLUGIN_IMAGE_ICONS_SINCE } from '../manifest/plugin-schema-field-docs'

export const PLUGIN_SVG_ICON_MAX_BYTES = 32 * 1024

export const PLUGIN_SVG_ICON_RULE_TEXT = `A \`.svg\` file, at most ${PLUGIN_SVG_ICON_MAX_BYTES / 1024} KB, drawn as a single-color mask that follows the theme. Scripts, event handlers, \`foreignObject\` and references to anything but \`#fragment\` are refused.`

/** A contribution icon that is a plugin-relative SVG file rather than a built-in icon name. */
export const pluginSvgIconPathSchema = pluginRelativePathSchema
  .regex(/\.svg$/i, 'must end in .svg')
  .meta(
    pluginPathFieldDoc(
      `Path to an SVG icon. ${PLUGIN_SVG_ICON_RULE_TEXT}`,
      PLUGIN_IMAGE_ICONS_SINCE,
      ['images/star.svg']
    )
  )

export function isPluginSvgIconPath(value: string | undefined): value is string {
  return value !== undefined && pluginSvgIconPathSchema.safeParse(value).success
}

const FORBIDDEN_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'embed',
  'object',
  'audio',
  'video',
  'canvas'
])
const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'"
}

function decodeEntities(value: string): string | null {
  let bad = false
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1]?.toLowerCase() === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1))
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        bad = true
        return ''
      }
      return String.fromCodePoint(code)
    }
    const named = NAMED_ENTITIES[body]
    if (named === undefined) {
      bad = true
      return ''
    }
    return named
  })
  return bad ? null : decoded
}

function cssError(css: string): string | null {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replaceAll('\\', '')
  if (/@import/i.test(flat)) {
    return 'uses @import'
  }
  for (const match of flat.matchAll(/url\(\s*['"]?\s*([^)'"]*)/gi)) {
    if (!(match[1] ?? '').startsWith('#')) {
      return 'references something other than a #fragment'
    }
  }
  return /expression\s*\(|javascript:/i.test(flat) ? 'contains script' : null
}

function attributeError(name: string, raw: string, element: string): string | null {
  const lower = name.toLowerCase()
  if (lower.startsWith('on')) {
    return `has the event-handler attribute ${name}`
  }
  const value = decodeEntities(raw)
  if (value === null) {
    return `attribute ${name} has an unknown entity`
  }
  // Why strip whitespace and controls: browsers ignore them inside a URL scheme.
  // eslint-disable-next-line no-control-regex
  if (/javascript:/i.test(value.replace(/[\s\u0000-\u001f]/g, ''))) {
    return 'contains javascript:'
  }
  if (lower === 'href' || lower.endsWith(':href')) {
    return value.trim().startsWith('#')
      ? null
      : `${name} references something other than a #fragment`
  }
  if (
    lower === 'attributename' &&
    /href/i.test(value) &&
    (element === 'set' || element.startsWith('animate'))
  ) {
    return 'animates an href'
  }
  if (lower === 'style' || /url\(/i.test(value)) {
    const css = cssError(value)
    return css ? `${name} ${css}` : null
  }
  return null
}

const NAME = '[A-Za-z_][\\w.:-]*'
const TAG_RE = new RegExp(
  `^<(/)?(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(/)?>$`
)
const ATTRIBUTE_RE = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"<]*)"|'([^'<]*)')`, 'g')

/** Null when the bytes are a safe, well-formed SVG; else why not. Main checks on install and on
 *  every read, and the renderer repeats it before building a mask, so a mismatch fails closed. */
export function pluginSvgIconError(bytes: Uint8Array): string | null {
  if (bytes.byteLength > PLUGIN_SVG_ICON_MAX_BYTES) {
    return `must be at most ${PLUGIN_SVG_ICON_MAX_BYTES / 1024} KB`
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return 'is not UTF-8 text'
  }
  text = text.replace(/^﻿/, '')
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text)) {
    return 'must not declare a DOCTYPE, entity or CDATA section'
  }
  const stack: string[] = []
  let sawRoot = false
  let cursor = 0
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor)
    const between = text.slice(cursor, open === -1 ? text.length : open)
    if (stack.length === 0 && between.trim() !== '') {
      return 'has text outside the <svg> element'
    }
    if (open === -1) {
      break
    }
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4)
      if (end === -1) {
        return 'has an unterminated comment'
      }
      cursor = end + 3
      continue
    }
    if (text.startsWith('<?', open)) {
      const end = text.indexOf('?>', open + 2)
      if (end === -1 || sawRoot || text.slice(0, open).trim() !== '') {
        return 'has an invalid processing instruction'
      }
      cursor = end + 2
      continue
    }
    const close = text.indexOf('>', open)
    const tag = TAG_RE.exec(close === -1 ? '' : text.slice(open, close + 1))
    if (!tag) {
      return 'is not well-formed SVG'
    }
    cursor = close + 1
    const [, closing, name = '', attributes = '', selfClosing] = tag
    const local = name.slice(name.lastIndexOf(':') + 1).toLowerCase()
    if (closing) {
      if (stack.pop() !== name) {
        return 'is not well-formed SVG'
      }
      continue
    }
    if (!sawRoot) {
      if (local !== 'svg') {
        return 'must have an <svg> root element'
      }
      sawRoot = true
    } else if (stack.length === 0) {
      return 'must have a single root element'
    }
    if (FORBIDDEN_ELEMENTS.has(local)) {
      return `must not contain <${local}>`
    }
    const seen = new Set<string>()
    for (const attribute of attributes.matchAll(ATTRIBUTE_RE)) {
      const attributeName = attribute[1] ?? ''
      if (seen.has(attributeName)) {
        return 'is not well-formed SVG'
      }
      seen.add(attributeName)
      const error = attributeError(attributeName, attribute[2] ?? attribute[3] ?? '', local)
      if (error) {
        return error
      }
    }
    if (local === 'style') {
      const end = text.indexOf('</', cursor)
      const css = cssError(text.slice(cursor, end === -1 ? text.length : end))
      if (css) {
        return `<style> ${css}`
      }
    }
    if (!selfClosing) {
      stack.push(name)
    }
  }
  if (!sawRoot) {
    return 'must have an <svg> root element'
  }
  return stack.length > 0 ? 'is not well-formed SVG' : null
}

/** A CSS-mask-ready data URL; the caller has run pluginSvgIconError on the same bytes. */
export function pluginSvgMaskUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Contribution kinds that may carry an SVG icon. Another contribution point adds its kind here
 *  and lists its icon paths below; the slot, IPC read and renderer icon then work unchanged. */
export type PluginSvgIconKind = 'panel' | 'nav' | 'project' | 'page' | 'card'

const SVG_ICON_PATHS: Record<
  PluginSvgIconKind,
  (manifest: PluginManifest) => (string | undefined)[]
> = {
  panel: (manifest) => manifest.contributes.panels.map((panel) => panel.icon),
  nav: (manifest) => manifest.contributes.sidebarNavItems.map((item) => item.icon),
  project: (manifest) => manifest.contributes.projectItems.map((item) => item.icon),
  page: (manifest) => manifest.contributes.pages.map((page) => page.icon),
  card: (manifest) => manifest.contributes.sidebarCards.map((card) => card.icon)
}

/** The slot id of a contribution's SVG icon: its kind and its index in the manifest list. */
export function pluginSvgIconSlot(kind: PluginSvgIconKind, index: number): string {
  return `${kind}-${index}`
}

/** The slot the host sends for a contribution icon, or {} when it is a built-in name or absent. */
export function pluginSvgIconSlotField(
  kind: PluginSvgIconKind,
  index: number,
  icon: string | undefined
): { svgIconSlot?: string } {
  return isPluginSvgIconPath(icon) ? { svgIconSlot: pluginSvgIconSlot(kind, index) } : {}
}

/** Every SVG icon a manifest declares, with the slot it is read under. */
export function declaredPluginSvgIconPaths(
  manifest: PluginManifest
): { path: string; slot: string }[] {
  return (Object.keys(SVG_ICON_PATHS) as PluginSvgIconKind[]).flatMap((kind) =>
    SVG_ICON_PATHS[kind](manifest).flatMap((icon, index) =>
      isPluginSvgIconPath(icon) ? [{ path: icon, slot: pluginSvgIconSlot(kind, index) }] : []
    )
  )
}
