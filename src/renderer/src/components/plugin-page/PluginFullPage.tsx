import React, { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import { usePluginPageRequestsStore, usePluginPages } from '@/store/plugin-pages'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { createCustomEditorHost } from '../editor/plugin-custom-editor-host'
import { fillPluginPanelShell } from '../right-sidebar/plugin-panel-design-token-css'
import { resolvePluginPanelIcon } from '../right-sidebar/plugin-panel-activity-items'
import { usePluginFrameEntry } from '../right-sidebar/use-plugin-frame-entry'
import { usePluginFrameHost } from '../right-sidebar/use-plugin-frame-host'
import { PLUGIN_PANEL_FRAME_NAME_PREFIX } from '../../../../shared/plugins/frames/plugin-frame-bridge'
import type { PluginPageDocumentFailure } from '../../../../shared/plugins/frames/plugin-page-document-bridge'
import { usePluginPageDocument } from './use-plugin-page-document'

function documentFailureText(reason: PluginPageDocumentFailure): string {
  switch (reason) {
    case 'not_found':
      return translate(
        'auto.components.plugin.page.PluginFullPage.fileMissing',
        'The file this page shows no longer exists.'
      )
    case 'not_a_file':
      return translate(
        'auto.components.plugin.page.PluginFullPage.notAFile',
        'This page was asked to show something that is not a file.'
      )
    case 'too_large':
      return translate(
        'auto.components.plugin.page.PluginFullPage.fileTooLarge',
        'The file this page shows is too large.'
      )
    case 'unreadable':
      return translate(
        'auto.components.plugin.page.PluginFullPage.fileUnreadable',
        'The file this page shows could not be read.'
      )
  }
}

function PageMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/**
 * A plugin's page in the main area, under Orca's usual page header (back and title). The plugin's
 * HTML runs in the same sandboxed frame as a panel; a file given to `pages.open` arrives as a
 * read-only `orca.document` that main keeps current.
 */
export default function PluginFullPage({ viewKey }: { viewKey: string }): React.JSX.Element {
  const closePluginPage = useAppStore((state) => state.closePluginPage)
  const pages = usePluginPages()
  const page = pages.find((entry) => entry.viewKey === viewKey) ?? null
  const path = usePluginPageRequestsStore((state) => state.paths[viewKey] ?? null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Why random: window.name is readable inside the frame, so it must not carry the file's path.
  const [frameName] = useState(() => `${PLUGIN_PANEL_FRAME_NAME_PREFIX}page:${createBrowserUuid()}`)
  const { entry, markUnresponsive } = usePluginFrameEntry(
    'page',
    page?.pluginKey ?? null,
    page?.id ?? null
  )
  const pageDocument = usePluginPageDocument(page, path)
  const text = pageDocument.status === 'ready' ? pageDocument.text : null
  const latestTextRef = useRef(text)
  useLayoutEffect(() => {
    latestTextRef.current = text
  })

  const frameKey = entry.status === 'ready' ? `${viewKey}:${entry.revision}` : null
  const entryHtml = entry.status === 'ready' ? entry.html : null
  // Why memoized: a new srcdoc reloads the frame; theme changes arrive as messages instead.
  const frameDocument = useMemo(
    () => (entryHtml === null ? null : fillPluginPanelShell(entryHtml)),
    [entryHtml]
  )
  // Why a host for every page: edits to the document are answered `not_permitted`, never dropped.
  const host = useMemo(
    () =>
      createCustomEditorHost({
        getFrameWindow: () => iframeRef.current?.contentWindow ?? null,
        getDocument: () => ({ text: latestTextRef.current ?? '', readOnly: true }),
        hasDocument: () => latestTextRef.current !== null,
        onEdit: () => undefined
      }),
    []
  )
  const { onFrameLoad } = usePluginFrameHost({
    surface: 'page',
    iframeRef,
    frameKey,
    sessionToken: entry.status === 'ready' ? entry.sessionToken : null,
    editor: host.channel,
    onUnresponsive: markUnresponsive
  })

  useEffect(() => {
    if (!frameKey) {
      return
    }
    return () => host.reset()
  }, [frameKey, host])

  useEffect(() => {
    host.syncDocument()
  }, [text, host])

  const title = page?.title ?? ''
  // Why createElement: the icon is picked from a closed table of components, not built here.
  const icon = createElement(
    resolvePluginPanelIcon(
      page?.icon,
      page?.svgIconSlot ? { pluginKey: page.pluginKey, slot: page.svgIconSlot } : undefined
    ),
    {
      className: 'size-4 shrink-0 text-muted-foreground'
    }
  )
  const backLabel = translate('auto.components.plugin.page.PluginFullPage.back', 'Back')

  let body: React.ReactNode
  if (!page) {
    body = (
      <PageMessage>
        {translate(
          'auto.components.plugin.page.PluginFullPage.unavailable',
          'This plugin page is no longer available.'
        )}
      </PageMessage>
    )
  } else if (entry.status === 'loading') {
    body = (
      <PageMessage>
        {translate('auto.components.plugin.page.PluginFullPage.loading', 'Loading plugin page...')}
      </PageMessage>
    )
  } else if (entry.status === 'unresponsive') {
    body = (
      <PageMessage>
        {translate(
          'auto.components.plugin.page.PluginFullPage.unresponsive',
          'This plugin page stopped responding and was suspended.'
        )}
      </PageMessage>
    )
  } else if (entry.status === 'error') {
    body = (
      <PageMessage>
        {translate(
          'auto.components.plugin.page.PluginFullPage.loadFailed',
          'The plugin page could not be loaded.'
        )}
      </PageMessage>
    )
  } else {
    body = (
      <>
        {pageDocument.status === 'failed' ? (
          <div className="border-b border-border px-3 py-1.5 text-xs text-destructive">
            {documentFailureText(pageDocument.reason)}
          </div>
        ) : null}
        <iframe
          key={frameKey}
          ref={iframeRef}
          // SECURITY: never add allow-same-origin — the srcdoc frame must stay an opaque origin so
          // plugin UI cannot reach the app DOM, storage, IPC or the file it shows.
          sandbox="allow-scripts"
          name={frameName}
          srcDoc={frameDocument ?? ''}
          onLoad={onFrameLoad}
          title={title}
          className="min-h-0 w-full flex-1 border-0 bg-background"
        />
      </>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={backLabel}
              onClick={closePluginPage}
            >
              <ArrowLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {backLabel}
          </TooltipContent>
        </Tooltip>
        {icon}
        {/* Manifest titles are plugin-owned and render without app-catalog translation. */}
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
      </div>
      {body}
    </div>
  )
}
