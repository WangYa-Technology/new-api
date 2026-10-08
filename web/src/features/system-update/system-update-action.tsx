/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ROLE } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { SystemUpdateDialog } from './system-update-dialog'
import { useSystemUpdate } from './use-system-update'

type SystemUpdateActionProps = {
  /** Version labels expand when the header's system-brand container has room. */
  presentation?: 'action' | 'version'
  compact?: boolean
}

export function SystemUpdateAction(props: SystemUpdateActionProps) {
  const isAdmin = useAuthStore(
    (state) => (state.auth.user?.role ?? 0) >= ROLE.ADMIN
  )
  if (!isAdmin) return null
  return <AdminSystemVersionAction {...props} />
}

function AdminSystemVersionAction(props: SystemUpdateActionProps) {
  const { t } = useTranslation()
  const { currentVersion } = useSystemUpdate()
  const [open, setOpen] = useState(false)
  const version = currentVersion || t('Unknown version')
  const description = `${t('Current version')}: ${version}`
  const versionPresentation = props.presentation === 'version'

  return (
    <SystemUpdateDialog
      open={open}
      onOpenChange={setOpen}
      currentVersion={version}
      trigger={
        <Button
          type='button'
          variant='ghost'
          aria-label={description}
          title={description}
          className={cn(
            'text-muted-foreground',
            versionPresentation &&
              'size-8 px-0 @min-[22rem]/system-brand:h-7 @min-[22rem]/system-brand:w-auto @min-[22rem]/system-brand:gap-1.5 @min-[22rem]/system-brand:px-1.5'
          )}
        >
          <HugeiconsIcon
            icon={InformationCircleIcon}
            className={cn(
              versionPresentation && '@min-[22rem]/system-brand:hidden'
            )}
            aria-hidden='true'
          />
          <span
            className={cn(
              'max-w-32 truncate font-mono text-xs',
              versionPresentation && 'hidden @min-[22rem]/system-brand:inline'
            )}
          >
            {version}
          </span>
        </Button>
      }
    />
  )
}
