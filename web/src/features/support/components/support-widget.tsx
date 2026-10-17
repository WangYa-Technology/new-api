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
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useAuthStore } from '@/stores/auth-store'

import {
  supportGet,
  type SupportInfo,
  type SupportConversation,
} from '../chat-api'
import { useSupportEvents } from '../use-support-events'
import { SupportMark } from './support-mark'

const SupportPanel = lazy(() =>
  import('./support-panel').then((module) => ({ default: module.SupportPanel }))
)

function AuthenticatedSupportWidget() {
  const userID = useAuthStore((state) => state.auth.user?.id)
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const info = useQuery({
    queryKey: ['support-chat', 'info', userID],
    queryFn: () => supportGet<SupportInfo>('info'),
    staleTime: 60000,
    refetchInterval: 60000,
  })
  const history = useQuery({
    queryKey: ['support-chat', 'conversations', userID],
    queryFn: () =>
      supportGet<{ items: SupportConversation[]; total: number }>(
        'conversations'
      ),
    enabled: info.data?.enabled === true,
    refetchInterval: open ? 15000 : 30000,
  })
  const connected = useSupportEvents(info.data?.enabled === true && open)
  if (!info.data?.enabled) return null
  const unread = history.data?.items.some(
    (conversation) =>
      (conversation.unread_count ??
        Number(conversation.last_message_id > conversation.user_read_id)) > 0
  )
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) setExpanded(false)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size='icon'
            className='fixed right-5 bottom-5 z-40 size-15 rounded-full bg-[#243cf1] text-white shadow-[0_8px_24px_-4px_rgb(0_0_0/0.24),0_3px_10px_rgb(36_60_241/0.18),inset_0_1px_1px_rgb(255_255_255/0.3)] ring-1 ring-white/20 hover:bg-[#1930db] dark:shadow-[0_8px_28px_rgb(0_0_0/0.5),0_3px_12px_rgb(36_60_241/0.2),inset_0_1px_1px_rgb(255_255_255/0.25)]'
            aria-label={t('Customer support')}
          />
        }
      >
        <SupportMark className='size-8' />
        {unread && (
          <span
            className='bg-destructive ring-background absolute top-0 right-0 size-3 rounded-full ring-2'
            aria-label={t('Unread messages')}
          />
        )}
      </PopoverTrigger>
      {open && (
        <PopoverContent
          side='top'
          align='end'
          sideOffset={16}
          collisionPadding={12}
          className='support-widget-scrollbars ring-border relative gap-0 overflow-hidden rounded-3xl p-0 shadow-2xl'
          style={{
            width: expanded ? 760 : 400,
            maxWidth: 'calc(100vw - 24px)',
            height: expanded ? 760 : 650,
            maxHeight:
              'min(calc(100dvh - var(--app-header-height, 3rem) - 112px), var(--available-height))',
          }}
        >
          <Suspense fallback={<LoadingState />}>
            <SupportPanel
              connected={connected}
              expanded={expanded}
              onExpandedChange={setExpanded}
              history={history.data}
              historyLoading={history.isPending}
              historyError={history.isError}
              retryHistory={() => void history.refetch()}
              welcomeMessage={info.data.welcome_message}
              offlineMessage={info.data.offline_message}
              onClose={() => {
                setOpen(false)
                setExpanded(false)
              }}
            />
          </Suspense>
        </PopoverContent>
      )}
    </Popover>
  )
}

export function SupportWidget() {
  const user = useAuthStore((state) => state.auth.user)
  if (!user) return null
  return <AuthenticatedSupportWidget key={user.id} />
}
