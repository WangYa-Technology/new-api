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
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { supportAction, supportGet, type SupportInfo } from '../chat-api'

export function SupportQuickReplies(props: {
  userID: number
  threadID?: string
  disabled: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const sending = useRef(false)
  const info = useQuery({
    queryKey: ['support-chat', 'info'],
    queryFn: () => supportGet<SupportInfo>('info'),
  })
  const send = useMutation({
    mutationFn: (payload: { body: string; request_id: string }) =>
      supportAction(props.userID, {
        ...payload,
        thread_id: props.threadID,
        action: 'reply',
      }),
    retry: false,
    onSettled: () => {
      sending.current = false
      void client.invalidateQueries({ queryKey: ['support-chat'] })
    },
  })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type='button'
            size='sm'
            variant='ghost'
            disabled={props.disabled || send.isPending}
          />
        }
      >
        {t('Quick reply')}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side='top'
        align='start'
        className='max-h-72 w-72 overflow-y-auto'
      >
        {send.isError && send.variables ? (
          <DropdownMenuItem
            onClick={() => {
              if (!sending.current && send.variables) {
                sending.current = true
                send.mutate(send.variables)
              }
            }}
          >
            {t('Retry')}: {send.variables.body}
          </DropdownMenuItem>
        ) : (
          [...new Set(info.data?.quick_replies ?? [])].map((reply) => (
            <DropdownMenuItem
              key={reply}
              className='break-words whitespace-pre-wrap'
              disabled={props.disabled || send.isPending}
              onClick={() => {
                if (sending.current || props.disabled) return
                sending.current = true
                send.mutate({ body: reply, request_id: crypto.randomUUID() })
              }}
            >
              {reply}
            </DropdownMenuItem>
          ))
        )}
        {info.isPending && (
          <DropdownMenuItem disabled>{t('Loading...')}</DropdownMenuItem>
        )}
        {info.isError && (
          <DropdownMenuItem onClick={() => void info.refetch()}>
            {t('Retry')}
          </DropdownMenuItem>
        )}
        {info.isSuccess && !info.data.quick_replies?.length && (
          <DropdownMenuItem disabled>
            {t('No quick replies configured. Add them in Support settings.')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
