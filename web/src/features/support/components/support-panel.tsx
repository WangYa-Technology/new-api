import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  ChevronRight,
  CircleHelp,
  Home,
  MessagesSquare,
  Plus,
  Send,
  X,
} from 'lucide-react'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { PopoverTitle } from '@/components/ui/popover'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TabsIndicator,
} from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { parseSupportAnswer } from '../ai-message'
import { getSupportLinks } from '../api'
import { supportGet, type SupportConversation } from '../chat-api'
import { parseSupportConfig } from '../lib/support-config'
import { SupportChat } from './support-chat'
import { SupportHelp } from './support-knowledge'
import { SupportMark } from './support-mark'

const dockSurfaceClassName =
  'h-[70px] shrink-0 p-1.5 bg-background/85 border-border/50 supports-[backdrop-filter]:bg-background/65 rounded-full border shadow-[0_4px_20px_-8px_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.8)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:shadow-[0_4px_20px_-8px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.12)]'

export function SupportPanel(props: {
  connected?: boolean
  history?: { items: SupportConversation[]; total: number }
  historyLoading: boolean
  historyError: boolean
  retryHistory: () => void
  welcomeMessage?: string
  offlineMessage: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [tab, setTab] = useState('home')
  const [selected, setSelected] = useState<string>()
  const [page, setPage] = useState(1)
  const list = useQuery({
    queryKey: ['support-chat', 'conversations', userID, page],
    queryFn: () =>
      supportGet<{ items: SupportConversation[]; total: number }>(
        `conversations?page=${page}`
      ),
    enabled: tab === 'messages',
    refetchInterval: 15000,
  })
  const systemName = useSystemConfigStore((state) => state.config.systemName)
  const resources = useQuery({
    queryKey: ['support-links'],
    queryFn: async () => requireServerSuccess(await getSupportLinks()),
    staleTime: 300000,
  })
  const categories = parseSupportConfig(resources.data?.data)
  const recent = props.history?.items[0]
  const featured = [
    { id: 'models', title: t('View model list'), url: '/pricing' },
    {
      id: 'user-agreement',
      title: t('User Agreement'),
      url: '/user-agreement',
    },
    {
      id: 'privacy-policy',
      title: t('Privacy Policy'),
      url: '/privacy-policy',
    },
    ...categories.flatMap((category) => category.items).slice(0, 2),
  ]
  if (selected) {
    return (
      <div className='bg-background h-full min-h-0'>
        <PopoverTitle className='sr-only'>{t('Customer support')}</PopoverTitle>
        <SupportChat
          key={selected}
          threadID={selected}
          compact
          expanded={props.expanded}
          onToggleExpanded={() => props.onExpandedChange(!props.expanded)}
          connected={props.connected}
          offlineMessage={props.offlineMessage}
          onBack={() => {
            props.onExpandedChange(false)
            setSelected(undefined)
            setTab('messages')
          }}
          onClose={props.onClose}
        />
      </div>
    )
  }
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(String(value))}
      className='bg-background relative h-full min-h-0 gap-0'
    >
      <PopoverTitle className='sr-only'>{t('Customer support')}</PopoverTitle>
      <header
        className={`absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-4 ${tab === 'home' ? 'bg-[#243cf1] pb-4 text-white' : 'bg-background text-foreground pb-3'}`}
      >
        {tab !== 'home' ? (
          <h2 className='absolute left-1/2 max-w-[calc(100%-112px)] -translate-x-1/2 truncate text-center text-xl font-semibold'>
            {tab === 'help' ? t('Help') : t('Messages')}
          </h2>
        ) : (
          <span className='flex size-10 items-center justify-center rounded-xl bg-white/10'>
            <SupportMark className='size-6' />
          </span>
        )}
        <Button
          variant='ghost'
          size='icon'
          className={`ml-auto rounded-full ${tab === 'home' ? 'text-white hover:bg-white/15 hover:text-white' : ''}`}
          aria-label={t('Close')}
          onClick={props.onClose}
        >
          <X className='size-5' />
        </Button>
      </header>
      <TabsContent
        value='home'
        className='support-home-background relative min-h-0 overflow-y-auto overscroll-contain'
      >
        <div className='relative px-4 pt-24 pb-4'>
          <h2 className='mb-5 px-2 text-[28px] leading-tight font-semibold tracking-tight text-white'>
            {t('Hi there')} <span aria-hidden='true'>👋</span>
            <br />
            {props.welcomeMessage ||
              t('Welcome to {{name}}', { name: systemName })}
          </h2>
          <div className='space-y-3'>
            {props.historyLoading && (
              <LoadingState className='bg-card min-h-24 rounded-2xl' />
            )}
            {props.historyError && (
              <ErrorState
                className='bg-card min-h-24 rounded-2xl'
                onRetry={props.retryHistory}
              />
            )}
            {recent && (
              <Button
                variant='outline'
                className='bg-card text-card-foreground border-border/60 hover:bg-accent h-auto w-full flex-col items-stretch gap-3 rounded-2xl p-4 text-left whitespace-normal shadow-md'
                onClick={() => setSelected(recent.id)}
              >
                <span className='font-semibold'>{t('Recent message')}</span>
                <span className='flex min-w-0 items-center gap-3'>
                  <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[#243cf1] text-white'>
                    <SupportMark className='size-6' />
                  </span>
                  <span className='text-muted-foreground line-clamp-2 min-w-0 flex-1 text-sm font-normal break-words'>
                    {recent.preview.startsWith('{"type":"support_order",')
                      ? t('Order details')
                      : recent.preview}
                  </span>
                  <ChevronRight className='size-4 shrink-0' />
                </span>
              </Button>
            )}
            <Button
              variant='outline'
              className='bg-card text-card-foreground border-border/60 hover:bg-accent h-auto w-full justify-between gap-3 rounded-2xl p-4 text-left whitespace-normal shadow-md'
              onClick={() => setSelected(crypto.randomUUID())}
            >
              <span className='space-y-1'>
                <span className='block text-base font-semibold'>
                  {t('Send us a message')}
                </span>
                <span className='text-muted-foreground block text-sm font-normal'>
                  {t('AI answers and human assistance, in one conversation.')}
                </span>
              </span>
              <Send className='size-5 shrink-0 text-[#243cf1]' />
            </Button>
            {featured.length > 0 && (
              <div className='bg-card divide-border border-border/60 divide-y rounded-2xl border px-5 shadow-md'>
                {featured.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='focus-visible:outline-ring flex items-center justify-between gap-3 py-4 text-sm no-underline hover:no-underline focus:no-underline'
                  >
                    <span>{item.title}</span>
                    <ExternalLink
                      aria-hidden='true'
                      className='size-4 shrink-0 text-[#243cf1]'
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </TabsContent>
      <TabsContent
        value='help'
        className='min-h-0 overflow-y-auto px-5 pt-16 pb-3'
      >
        <SupportHelp />
      </TabsContent>
      <TabsContent value='messages' className='flex min-h-0 flex-col pt-16'>
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
          {list.isPending && <LoadingState />}
          {list.isError && <ErrorState onRetry={() => void list.refetch()} />}
          {list.data?.items.length === 0 && (
            <p className='text-muted-foreground px-6 py-12 text-center text-sm'>
              {t('No conversations yet')}
            </p>
          )}
          {list.data?.items.map((conversation) => (
            <Button
              key={conversation.id}
              variant='ghost'
              className='border-border h-auto w-full justify-start gap-3 rounded-none border-x-0 border-y px-5 py-4 text-left [&+button]:border-t-0'
              onClick={() => setSelected(conversation.id)}
            >
              <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[#243cf1] text-white'>
                <SupportMark className='size-6' />
              </span>
              <span className='min-w-0 flex-1 space-y-1'>
                <span className='flex items-center gap-2'>
                  <span className='truncate font-medium'>
                    {conversation.title || systemName}
                  </span>
                  <time
                    className='text-muted-foreground ml-auto shrink-0 text-xs'
                    dateTime={new Date(
                      conversation.updated_at * 1000
                    ).toISOString()}
                  >
                    {new Date(
                      conversation.updated_at * 1000
                    ).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </span>
                <span className='text-muted-foreground block truncate font-normal'>
                  {conversation.preview.startsWith('{"type":"support_order",')
                    ? t('Order details')
                    : (parseSupportAnswer(conversation.preview)?.answer ??
                      conversation.preview)}
                </span>
              </span>
              {(conversation.unread_count ??
                Number(
                  conversation.last_message_id > conversation.user_read_id
                )) > 0 && (
                <span
                  aria-label={t('Unread messages')}
                  className='size-2 shrink-0 rounded-full bg-[#243cf1]'
                />
              )}
            </Button>
          ))}
          {!!list.data && list.data.total > 50 && (
            <div className='flex justify-center gap-3 p-3'>
              <Button
                variant='ghost'
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous')}
              </Button>
              <Button
                variant='ghost'
                disabled={page * 50 >= list.data.total}
                onClick={() => setPage(page + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          )}
        </div>
      </TabsContent>
      <div className='mx-3 mt-1 mb-3 flex shrink-0 items-center gap-2.5'>
        <div
          data-slot='support-dock-surface'
          className={`${dockSurfaceClassName} min-w-0 flex-1`}
        >
          <TabsList
            className='relative min-h-[56px] w-full gap-1 rounded-full bg-transparent p-0 group-data-horizontal/tabs:h-[56px]'
            aria-label={t('Customer support')}
          >
            <TabsIndicator className='bg-foreground/[0.06] rounded-full dark:bg-white/10' />
            <TabsTrigger
              value='home'
              className='text-muted-foreground hover:text-foreground data-active:text-foreground dark:data-active:text-foreground z-10 h-full min-h-[56px] min-w-0 flex-col gap-1 rounded-full border-0 px-2 text-xs font-normal data-active:bg-transparent data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent'
            >
              <Home className='size-5' />
              {t('Home')}
            </TabsTrigger>
            <TabsTrigger
              value='help'
              className='text-muted-foreground hover:text-foreground data-active:text-foreground dark:data-active:text-foreground z-10 h-full min-h-[56px] min-w-0 flex-col gap-1 rounded-full border-0 px-2 text-xs font-normal data-active:bg-transparent data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent'
            >
              <CircleHelp className='size-5' />
              {t('Help')}
            </TabsTrigger>
            <TabsTrigger
              value='messages'
              className='text-muted-foreground hover:text-foreground data-active:text-foreground dark:data-active:text-foreground z-10 h-full min-h-[56px] min-w-0 flex-col gap-1 rounded-full border-0 px-2 text-xs font-normal data-active:bg-transparent data-active:font-semibold group-data-[variant=default]/tabs-list:data-active:shadow-none dark:data-active:bg-transparent'
            >
              <MessagesSquare className='size-5' />
              {t('Messages')}
            </TabsTrigger>
          </TabsList>
        </div>
        <div
          data-slot='support-dock-surface'
          className={`${dockSurfaceClassName} w-[70px]`}
        >
          <Button
            variant='ghost'
            size='icon'
            className='text-foreground hover:bg-foreground/[0.06] size-[56px] shrink-0 rounded-full border-0 bg-transparent bg-clip-border shadow-none dark:hover:bg-white/10'
            aria-label={t('Send us a message')}
            title={t('Send us a message')}
            onClick={() => setSelected(crypto.randomUUID())}
          >
            <Plus aria-hidden='true' className='size-7' strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </Tabs>
  )
}
