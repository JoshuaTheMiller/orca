import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The name now shown on the row; seeds the field. */
  currentName: string
  projectName: string
  onSave: (name: string) => void
}

/** Asks for the name one project's plugin row shows; a blank name is not saved. */
export function PluginProjectItemRenameDialog({
  open,
  onOpenChange,
  currentName,
  projectName,
  onSave
}: Props): React.JSX.Element {
  const [value, setValue] = useState(currentName)
  // Seed on every open so a canceled draft cannot reappear.
  useEffect(() => {
    if (open) {
      setValue(currentName)
    }
  }, [open, currentName])
  const trimmed = value.trim()
  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    if (trimmed) {
      onSave(trimmed)
      onOpenChange(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {translate('auto.components.sidebar.PluginSidebarNavItems.renameTitle', 'Rename row')}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {translate(
              'auto.components.sidebar.PluginSidebarNavItems.renameHint',
              'This name is shown only on this computer, under {{value0}}.',
              { value0: projectName }
            )}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor="plugin-project-item-name" className="text-[11px] text-muted-foreground">
              {translate('auto.components.sidebar.PluginSidebarNavItems.nameLabel', 'Name')}
            </Label>
            <Input
              id="plugin-project-item-name"
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onOpenChange(false)}
            >
              {translate('auto.components.sidebar.PluginSidebarNavItems.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={!trimmed}>
              {translate('auto.components.sidebar.PluginSidebarNavItems.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
