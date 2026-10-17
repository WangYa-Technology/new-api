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
import {
  Download,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { parseSupportAnswer } from '../ai-message'
import { loadSupportTranscript } from '../chat-api'
import { parseOrderMessage } from '../order-message'

export function SupportChatActions(props: {
  userID?: number
  threadID?: string
  expanded?: boolean
  onToggleExpanded?: () => void
  onSearch: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  const download = useMutation({
    mutationFn: async () => {
      const messages = await loadSupportTranscript(props.userID, props.threadID)
      const labels = {
        user: t('User'),
        ai: t('AI support'),
        agent: t('Human support'),
        note: t('Internal note'),
        event: t('Activity'),
      }
      const text = messages
        .map((message) => {
          const order =
            message.sender === 'agent' ? parseOrderMessage(message.body) : null
          const body = order
            ? `${t('Order number')}: ${order.trade_no}`
            : ((message.sender === 'ai'
                ? parseSupportAnswer(message.body)?.answer
                : undefined) ?? message.body)
          return `[${new Date(message.created_at * 1000).toISOString()}] ${labels[message.sender]}\n${body}`
        })
        .join('\n\n')
      const url = URL.createObjectURL(
        new Blob([text], { type: 'text/plain;charset=utf-8' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `support-${props.threadID ?? 'conversation'}.txt`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button variant='ghost' size='icon' aria-label={t('More actions')} />
        }
      >
        <MoreHorizontal className='size-5' />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        className='w-60 rounded-2xl p-2 shadow-xl'
      >
        {props.onToggleExpanded && (
          <DropdownMenuItem
            className='gap-3 rounded-xl px-3 py-3'
            onClick={props.onToggleExpanded}
          >
            {props.expanded ? (
              <Minimize2 className='size-4' />
            ) : (
              <Maximize2 className='size-4' />
            )}
            {props.expanded ? t('Collapse window') : t('Expand window')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className='gap-3 rounded-xl px-3 py-3'
          disabled={props.disabled}
          onClick={props.onSearch}
        >
          <Search className='size-4' />
          {t('Search conversation')}
        </DropdownMenuItem>
        <DropdownMenuItem
          className='gap-3 rounded-xl px-3 py-3'
          disabled={props.disabled || download.isPending}
          onClick={() => download.mutate()}
        >
          <Download className='size-4' />
          {t('Download transcript')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
