import React from 'react'
import { ChevronDown } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { resolvePluginPanelIcon } from '@/components/right-sidebar/plugin-panel-activity-items'
import type { ActivePluginSidebarCard } from '@/store/plugin-sidebar-cards'

/**
 * Replaces the Projects title while a plugin offers sidebar cards: a small menu that names the
 * view being shown and lists Projects plus each available card.
 */
export function PluginSidebarViewSwitcher({
  cards,
  current,
  projectsTitle,
  projectsKey
}: {
  cards: readonly ActivePluginSidebarCard[]
  /** The card being shown, or null while Projects (or Agents) is. */
  current: ActivePluginSidebarCard | null
  projectsTitle: string
  projectsKey: 'projects' | 'workspaces'
}): React.JSX.Element {
  const setSidebarBody = useAppStore((s) => s.setSidebarBody)
  const shown = current?.title ?? projectsTitle
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-w-0 gap-0.5 pl-2 pr-1 text-xs font-semibold text-muted-foreground/80"
          aria-label={translate(
            'auto.components.sidebar.PluginSidebarViewSwitcher.label',
            'Switch sidebar view'
          )}
          data-sidebar-section-title={current ? 'plugin-card' : projectsKey}
          data-sidebar-view-switcher=""
        >
          {/* Card titles are plugin-owned and render without app-catalog translation. */}
          <span className="min-w-0 truncate">{shown}</span>
          <ChevronDown className="size-3 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup
          value={current ? current.body : 'workspaces'}
          onValueChange={(next) => {
            const target = cards.find((card) => card.body === next)
            setSidebarBody(target ? target.body : 'workspaces')
          }}
        >
          <DropdownMenuRadioItem value="workspaces">{projectsTitle}</DropdownMenuRadioItem>
          {cards.map((card) => (
            <DropdownMenuRadioItem key={card.body} value={card.body} title={card.pluginName}>
              {React.createElement(
                resolvePluginPanelIcon(
                  card.icon,
                  card.svgIconSlot
                    ? { pluginKey: card.pluginKey, slot: card.svgIconSlot }
                    : undefined
                ),
                {
                  className: 'size-3.5 shrink-0'
                }
              )}
              {card.title}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
