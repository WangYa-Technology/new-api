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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StickyNote } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/stores/auth-store'

import { loadSupportTranscript, supportAction } from '../chat-api'

export function SupportNotes(props: {
  userID: number
  threadID?: string
  canEdit: boolean
  initialDraft?: string
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const viewerID = useAuthStore((state) => state.auth.user?.id)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string | undefined>(props.initialDraft)
  const requestID = useRef(crypto.randomUUID())
  const notes = useQuery({
    queryKey: [
      'support-chat',
      'notes',
      viewerID,
      props.userID,
      props.threadID ?? 'legacy',
    ],
    queryFn: () => loadSupportTranscript(props.userID, props.threadID),
    enabled: open,
  })
  const latest =
    notes.data?.filter((message) => message.sender === 'note').at(-1)?.body ??
    ''
  const body = draft ?? latest
  const save = useMutation({
    mutationFn: (text: string) =>
      supportAction(props.userID, {
        thread_id: props.threadID,
        action: 'note',
        body: text,
        request_id: requestID.current,
      }),
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['support-chat'] })
      setOpen(false)
      setDraft(undefined)
      requestID.current = crypto.randomUUID()
    },
  })
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        <StickyNote className='size-4' aria-hidden='true' />
        {t('Internal note')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!save.isPending) setOpen(value)
        }}
        title={t('Internal note')}
        description={t('Internal notes (not shown to users)')}
        contentClassName='sm:max-w-lg'
        footer={
          <Button
            disabled={
              !props.canEdit ||
              notes.isPending ||
              notes.isError ||
              save.isPending ||
              !body.trim() ||
              body === latest
            }
            onClick={() =>
              save.mutate(save.isError ? (save.variables ?? body) : body)
            }
          >
            {save.isError ? t('Retry') : t('Save changes')}
          </Button>
        }
      >
        {notes.isPending && <LoadingState />}
        {notes.isError && <ErrorState onRetry={() => void notes.refetch()} />}
        {notes.isSuccess && (
          <Textarea
            aria-label={t('Internal note')}
            value={body}
            maxLength={2000}
            className='min-h-40'
            disabled={!props.canEdit || save.isPending || save.isError}
            onChange={(event) => {
              setDraft(event.target.value)
              requestID.current = crypto.randomUUID()
            }}
          />
        )}
      </Dialog>
    </>
  )
}
