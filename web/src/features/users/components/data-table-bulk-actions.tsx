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
import { useMutation } from '@tanstack/react-query'
import type { Table } from '@tanstack/react-table'
import { PowerOff } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { manageUser } from '../api'
import { canDisableUser } from '../lib/user-actions'
import type { User } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
}

export function DataTableBulkActions(props: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()
  const operator = useAuthStore((state) => state.auth.user)
  const [targets, setTargets] = useState<User[] | null>(null)
  const processing = useRef(false)
  const selectedUsers = props.table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
    .filter((user) => canDisableUser(user, operator?.id, operator?.role ?? 0))

  const disableMutation = useMutation({
    mutationFn: async (users: User[]) => {
      const succeeded = new Set<string>()
      let firstError: unknown
      // Keep requests sequential to respect management API rate limits.
      for (const user of users) {
        try {
          requireServerSuccess(await manageUser(user.id, 'disable'))
          succeeded.add(String(user.id))
        } catch (error) {
          firstError ??= error
        }
      }
      return { succeeded, firstError }
    },
    onSuccess: ({ succeeded, firstError }) => {
      props.table.setRowSelection((previous) => {
        const next = { ...previous }
        for (const id of succeeded) delete next[id]
        return next
      })
      if (succeeded.size) {
        toast.success(t('Disabled {{count}} users', { count: succeeded.size }))
      }
      if (firstError) handleServerError(firstError, t('Batch disable failed'))
      triggerRefresh()
      setTargets(null)
    },
    onError: (error) => handleServerError(error, t('Batch disable failed')),
    onSettled: () => {
      processing.current = false
    },
  })
  const busy = disableMutation.isPending

  const handleDisable = () => {
    if (processing.current || !targets?.length) return
    processing.current = true
    disableMutation.mutate(targets)
  }

  return (
    <>
      <BulkActionsToolbar table={props.table} entityName={t('User')}>
        <Button
          variant='destructive'
          size='sm'
          disabled={busy || selectedUsers.length === 0}
          onClick={() => setTargets(selectedUsers)}
        >
          <PowerOff aria-hidden='true' />
          {t('Disable selected users')}
        </Button>
      </BulkActionsToolbar>
      <ConfirmDialog
        open={targets !== null}
        onOpenChange={(open) => {
          if (!open && !processing.current) setTargets(null)
        }}
        title={t('Disable selected users')}
        desc={t(
          'Disable {{count}} selected users? Their active sessions will be revoked. Failed users will remain selected for retry.',
          { count: targets?.length ?? 0 }
        )}
        confirmText={t('Disable')}
        destructive
        isLoading={busy}
        handleConfirm={handleDisable}
      >
        <ul className='max-h-48 space-y-1 overflow-y-auto text-sm'>
          {targets?.map((user) => (
            <li key={user.id} className='break-all'>
              {user.email?.trim() || '—'}{' '}
              <span className='text-muted-foreground'>(ID: {user.id})</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}
