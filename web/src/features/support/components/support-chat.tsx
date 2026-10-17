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
import { ArrowLeft, ArrowUp, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useStickToBottom } from 'use-stick-to-bottom'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { parseSupportAnswer } from '../ai-message'
import {
  supportAction,
  supportGet,
  loadSupportTranscript,
  refreshSupportHistory,
  type SupportHistory,
} from '../chat-api'
import { parseOrderMessage } from '../order-message'
import { SupportChatActions } from './support-chat-actions'
import { SupportSources } from './support-knowledge'
import { SupportMark } from './support-mark'
import { SupportNotes } from './support-notes'
import { SupportOrderCard } from './support-order-card'
import { SupportOrders } from './support-orders'
import { SupportQuickReplies } from './support-quick-replies'

export function SupportChat(props: {
  threadID?: string
  onBack?: () => void
  onClose?: () => void
  expanded?: boolean
  onToggleExpanded?: () => void
  active?: boolean
  compact?: boolean
  workbench?: boolean
  userID?: number
  connected?: boolean
  offlineMessage?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const systemName = useSystemConfigStore((state) => state.config.systemName)
  const client = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const draftKey = [
    'support-draft',
    user?.id,
    props.userID ?? 'self',
    props.threadID ?? 'legacy',
  ]
  const savedDraft = client.getQueryData<{
    body: string
    id: string
    failed: boolean
    note: boolean
  }>(draftKey)
  const [draft, setDraft] = useState(
    savedDraft?.note ? '' : (savedDraft?.body ?? '')
  )
  const [failed, setFailed] = useState(
    savedDraft?.note ? false : (savedDraft?.failed ?? false)
  )
  const scroll = useStickToBottom({ initial: 'instant', resize: 'instant' })
  const olderPosition = useRef<{ height: number; top: number } | null>(null)
  const agents = useQuery({
    queryKey: ['support-chat', 'agents', user?.id],
    queryFn: () =>
      supportGet<{ id: number; name: string; username: string }[]>('agents'),
    enabled: !!props.userID,
  })
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const requestID = useRef(savedDraft?.id ?? crypto.randomUUID())
  const queryKey = [
    'support-chat',
    'history',
    user?.id,
    props.userID ?? 'self',
    props.threadID ?? 'legacy',
  ]
  const historyPath = `${props.userID ? `users/${props.userID}` : 'history'}?thread_id=${encodeURIComponent(props.threadID ?? '')}`
  const history = useQuery({
    queryKey,
    queryFn: () =>
      refreshSupportHistory(
        historyPath,
        client.getQueryData<SupportHistory>(queryKey)
      ),
    enabled: props.active !== false,
    refetchInterval: props.userID ? 5000 : 15000,
  })
  const older = useMutation({
    mutationFn: () =>
      supportGet<SupportHistory>(
        `${historyPath}&before=${history.data?.messages[0]?.id}`
      ),
    onSuccess: (page) => {
      const element = scroll.scrollRef.current
      if (element) {
        olderPosition.current = {
          height: element.scrollHeight,
          top: element.scrollTop,
        }
      }
      scroll.stopScroll()
      client.setQueryData<SupportHistory>(queryKey, (current) => {
        if (!current) return current
        const merged = new Map(
          [...page.messages, ...current.messages].map((message) => [
            message.id,
            message,
          ])
        )
        return {
          ...current,
          messages: [...merged.values()].sort((a, b) => a.id - b.id),
          hasMore: page.messages.length === 100,
        }
      })
    },
  })
  useLayoutEffect(() => {
    const element = scroll.scrollRef.current
    if (element && olderPosition.current) {
      element.scrollTop =
        olderPosition.current.top +
        element.scrollHeight -
        olderPosition.current.height
      olderPosition.current = null
    }
  }, [history.data, scroll.scrollRef])
  const conversation = history.data?.conversation
  const transcript = useQuery({
    queryKey: [
      'support-chat',
      'transcript',
      user?.id,
      props.userID ?? 'self',
      props.threadID ?? 'legacy',
      conversation?.version,
    ],
    queryFn: () => loadSupportTranscript(props.userID, props.threadID),
    enabled: searchOpen && !!history.data,
  })
  const messages = history.data?.messages ?? []
  const visibleMessages = searchOpen
    ? (transcript.data ?? []).filter((message) =>
        message.body.toLowerCase().includes(search.trim().toLowerCase())
      )
    : messages
  const action = useMutation({
    mutationFn: (input: string | { name: 'transfer'; targetID: number }) =>
      supportAction(props.userID, {
        thread_id: props.threadID,
        action: typeof input === 'string' ? input : input.name,
        target_id: typeof input === 'string' ? undefined : input.targetID,
        version: conversation?.version,
      }),
    onSettled: () => client.invalidateQueries({ queryKey: ['support-chat'] }),
  })
  const send = useMutation({
    mutationFn: () =>
      supportAction(props.userID, {
        thread_id: props.threadID,
        action: props.userID ? 'reply' : 'send',
        body: draft,
        request_id: requestID.current,
      }),
    onSuccess: () => {
      setDraft('')
      setFailed(false)
      client.removeQueries({ queryKey: draftKey, exact: true })
      requestID.current = crypto.randomUUID()
      return client.invalidateQueries({ queryKey: ['support-chat'] })
    },
    onError: () => {
      setFailed(true)
      client.setQueryData(draftKey, {
        body: draft,
        id: requestID.current,
        failed: true,
        note: false,
      })
    },
  })
  const read = useMutation({
    mutationFn: (through: number) =>
      supportAction(props.userID, {
        action: 'read',
        through,
        thread_id: props.threadID,
      }),
    meta: { errorToast: false },
    onSuccess: () => client.invalidateQueries({ queryKey: ['support-chat'] }),
  })
  const lastID = conversation?.last_message_id ?? 0
  const readID = props.userID
    ? conversation?.staff_read_id
    : conversation?.user_read_id
  useEffect(() => {
    const markVisible = () => {
      if (
        props.active !== false &&
        !searchOpen &&
        scroll.isAtBottom &&
        document.visibilityState === 'visible' &&
        lastID > (readID ?? 0)
      ) {
        read.mutate(lastID)
      }
    }
    markVisible()
    document.addEventListener('visibilitychange', markVisible)
    return () => document.removeEventListener('visibilitychange', markVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastID, readID, props.active, searchOpen, scroll.isAtBottom])
  if (history.isPending || history.isError) {
    return (
      <div className='flex h-full min-h-0 flex-col'>
        {props.compact && (
          <header className='flex shrink-0 items-center justify-between border-b p-3'>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('Back')}
              onClick={props.onBack}
            >
              <ArrowLeft className='size-5' />
            </Button>
            <span className='font-semibold'>{t('Messages')}</span>
            <Button
              variant='ghost'
              size='icon'
              aria-label={t('Close')}
              onClick={props.onClose}
            >
              <X className='size-5' />
            </Button>
          </header>
        )}
        {history.isPending ? (
          <LoadingState />
        ) : (
          <ErrorState onRetry={() => void history.refetch()} />
        )}
      </div>
    )
  }
  const statusLabels = {
    ai: t('AI support'),
    waiting: t('Waiting for support'),
    human: t('Human support'),
    resolved: t('Resolved'),
  }
  const canReply =
    (!props.userID && conversation?.status !== 'resolved') ||
    (!!props.userID &&
      conversation?.status === 'human' &&
      conversation.agent_id === user?.id)
  return (
    <div
      className={`flex min-h-0 flex-col gap-4 ${props.compact ? 'h-full gap-0' : ''} ${props.workbench ? 'h-full overflow-hidden' : ''}`}
    >
      {props.compact && (
        <header className='flex shrink-0 items-center gap-3 border-b px-3 py-4'>
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('Back')}
            onClick={props.onBack}
          >
            <ArrowLeft className='size-5' />
          </Button>
          <span className='flex size-10 shrink-0 items-center justify-center rounded-full bg-[#243cf1] text-white'>
            <SupportMark className='size-6' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='truncate font-semibold'>{systemName}</p>
            <p className='text-muted-foreground text-xs'>
              {conversation && statusLabels[conversation.status]}
            </p>
          </div>
          <SupportChatActions
            userID={props.userID}
            threadID={props.threadID}
            expanded={props.expanded}
            onToggleExpanded={props.onToggleExpanded}
            onSearch={() => setSearchOpen(true)}
            disabled={messages.length === 0}
          />
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('Close')}
            onClick={props.onClose}
          >
            <X className='size-5' />
          </Button>
        </header>
      )}
      {searchOpen && (
        <div className='flex shrink-0 items-center gap-2 px-4 py-2'>
          <Input
            autoFocus
            aria-label={t('Search conversation')}
            placeholder={t('Search conversation')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setSearchOpen(false)
                setSearch('')
              }
            }}
          />
          <Button
            variant='ghost'
            size='icon'
            aria-label={t('Close search')}
            onClick={() => {
              setSearchOpen(false)
              setSearch('')
            }}
          >
            <X className='size-4' />
          </Button>
        </div>
      )}
      <div
        className={`flex shrink-0 flex-wrap items-center justify-between gap-2 ${props.compact ? 'px-5 py-2' : ''}`}
      >
        {!props.compact && (
          <span className='text-muted-foreground text-sm'>
            {conversation && statusLabels[conversation.status]}
          </span>
        )}
        <div
          role='group'
          aria-label={t('Actions')}
          className='ml-auto flex flex-wrap items-center justify-end gap-2'
        >
          {props.userID && (
            <SupportNotes
              userID={props.userID}
              threadID={props.threadID}
              canEdit={canReply}
              initialDraft={savedDraft?.note ? savedDraft.body : undefined}
            />
          )}
          {conversation?.status === 'resolved' ? (
            <Button
              size='sm'
              variant='outline'
              disabled={action.isPending}
              onClick={() => action.mutate('reopen')}
            >
              {t('Reopen conversation')}
            </Button>
          ) : null}
          {conversation?.status !== 'resolved' &&
            (props.userID ? (
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    action.isPending ||
                    !['ai', 'waiting'].includes(conversation?.status ?? '')
                  }
                  onClick={() => action.mutate('claim')}
                >
                  {t('Take over')}
                </Button>
                <Button
                  size='sm'
                  variant='default'
                  disabled={action.isPending || !canReply}
                  onClick={() => action.mutate('resolve')}
                >
                  {t('Resolve')}
                </Button>
              </div>
            ) : (
              <Button
                size='sm'
                variant={props.compact ? 'ghost' : 'outline'}
                disabled={
                  action.isPending ||
                  conversation?.status === 'waiting' ||
                  conversation?.status === 'human'
                }
                onClick={() => action.mutate('handoff')}
              >
                {t('Talk to a person')}
              </Button>
            ))}
        </div>
      </div>
      {props.connected === false && (
        <p role='status' className='text-muted-foreground px-5 text-xs'>
          {t('Reconnecting. Messages are refreshed automatically.')}
        </p>
      )}
      {conversation?.status === 'waiting' && (
        <p className='text-muted-foreground bg-muted mx-4 mb-2 shrink-0 rounded-lg p-3 text-xs'>
          {props.offlineMessage ||
            t('Your message is saved. Our team will reply here.')}
        </p>
      )}
      {props.userID && canReply && (
        <div className='flex flex-wrap items-center gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='outline'
                  size='sm'
                  disabled={action.isPending}
                />
              }
            >
              {t('Transfer conversation')}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              className='max-h-64 overflow-y-auto'
            >
              {agents.isPending && (
                <DropdownMenuItem disabled>{t('Loading...')}</DropdownMenuItem>
              )}
              {agents.data
                ?.filter((agent) => agent.id !== user?.id)
                .map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    disabled={action.isPending || !canReply}
                    onClick={() =>
                      action.mutate({ name: 'transfer', targetID: agent.id })
                    }
                  >
                    {agent.name || agent.username}
                  </DropdownMenuItem>
                ))}
              {agents.isSuccess &&
                !agents.data.some((agent) => agent.id !== user?.id) && (
                  <DropdownMenuItem disabled>
                    {t('No results found')}
                  </DropdownMenuItem>
                )}
              {agents.isError && (
                <DropdownMenuItem onClick={() => void agents.refetch()}>
                  {t('Retry')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {agents.isError && (
            <ErrorState onRetry={() => void agents.refetch()} />
          )}
        </div>
      )}
      <Conversation
        instance={scroll}
        aria-label={t('Support messages')}
        aria-live='polite'
        className={
          props.compact || props.workbench
            ? 'min-h-0 flex-1'
            : 'h-[min(45dvh,420px)] flex-none rounded-lg border'
        }
      >
        <ConversationContent className='gap-6 space-y-2 px-5 py-4'>
          {!searchOpen && history.data?.hasMore && (
            <Button
              size='sm'
              variant='ghost'
              disabled={older.isPending}
              onClick={() => older.mutate()}
            >
              {t('Load older messages')}
            </Button>
          )}
          {older.isError && <ErrorState onRetry={() => older.mutate()} />}
          {!searchOpen && messages.length === 0 && (
            <ConversationEmptyState
              title={t('How can we help you?')}
              description={t(
                'Describe your question. Never share passwords or API keys.'
              )}
            />
          )}
          {searchOpen && transcript.isPending && <LoadingState />}
          {searchOpen && transcript.isError && (
            <ErrorState onRetry={() => void transcript.refetch()} />
          )}
          {searchOpen &&
            transcript.isSuccess &&
            visibleMessages.length === 0 && (
              <p className='text-muted-foreground py-8 text-center text-sm'>
                {t('No results found')}
              </p>
            )}
          {visibleMessages.map((message) => {
            const answer =
              message.sender === 'ai' ? parseSupportAnswer(message.body) : null
            const order =
              message.sender === 'agent'
                ? parseOrderMessage(message.body)
                : null
            return (
              <Message
                key={message.id}
                from={
                  (
                    props.userID
                      ? (message.sender === 'agent' ||
                          message.sender === 'note') &&
                        (message.actor_id || conversation?.agent_id) ===
                          user?.id
                      : message.sender === 'user'
                  )
                    ? 'user'
                    : 'assistant'
                }
              >
                <div className='max-w-[90%] min-w-0'>
                  {order ? (
                    <SupportOrderCard
                      order={order}
                      staff={!!props.userID}
                      onNavigate={props.onClose}
                    />
                  ) : (
                    <MessageContent className='group-[.is-assistant]:bg-muted w-fit max-w-full rounded-2xl px-4 py-3 leading-relaxed group-[.is-user]:ml-auto group-[.is-user]:bg-[#243cf1] group-[.is-user]:text-white'>
                      <p className='break-words whitespace-pre-wrap'>
                        {message.sender === 'event'
                          ? t(
                              'Support activity: {{action}} · #{{actor}} → #{{target}}',
                              {
                                action:
                                  (
                                    {
                                      claim: t('Take over'),
                                      transfer: t('Transfer conversation'),
                                      resolve: t('Resolve'),
                                      reopen: t('Reopen conversation'),
                                      handoff: t('Talk to a person'),
                                    } as Record<string, string>
                                  )[message.body] ?? message.body,
                                actor:
                                  message.actor_id || conversation?.user_id,
                                target: message.target_id || '—',
                              }
                            )
                          : (answer?.answer ?? message.body)}
                      </p>
                      {answer && <SupportSources sources={answer.sources} />}
                      {answer?.interrupted && (
                        <p
                          role='status'
                          className='text-muted-foreground text-xs'
                        >
                          {t('Generation was interrupted')}
                        </p>
                      )}
                      {message.sender === 'ai' && !props.userID && (
                        <>
                          <Separator className='my-2' />
                          <Button
                            variant='ghost'
                            size='sm'
                            className='h-8 px-2'
                            disabled={
                              action.isPending || conversation?.status !== 'ai'
                            }
                            onClick={() => action.mutate('handoff')}
                          >
                            {t('Talk to a person')}
                          </Button>
                        </>
                      )}
                    </MessageContent>
                  )}
                  <span className='text-muted-foreground block px-3 pt-1.5 text-xs group-[.is-user]:text-right'>
                    {
                      {
                        ai: t('AI support'),
                        agent: t('Human support'),
                        user: t('User'),
                        note: t('Internal note'),
                        event: t('Activity'),
                      }[message.sender]
                    }
                    <time
                      className='ml-2'
                      dateTime={new Date(
                        message.created_at * 1000
                      ).toISOString()}
                    >
                      {new Date(message.created_at * 1000).toLocaleTimeString(
                        locale,
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )}
                    </time>
                  </span>
                </div>
              </Message>
            )
          })}
          {history.data?.ai_draft != null &&
            !searchOpen &&
            conversation?.status === 'ai' && (
              <Message from='assistant'>
                <MessageContent className='bg-muted max-w-full rounded-2xl px-4 py-3 leading-relaxed'>
                  {history.data.ai_draft && (
                    <p className='break-words whitespace-pre-wrap'>
                      {history.data.ai_draft}
                    </p>
                  )}
                  <LoadingState inline size='sm' message={t('Thinking...')} />
                  {!props.userID && (
                    <>
                      <Separator className='my-2' />
                      <Button
                        variant='ghost'
                        size='sm'
                        disabled={action.isPending}
                        onClick={() => action.mutate('handoff')}
                      >
                        {t('Talk to a person')}
                      </Button>
                    </>
                  )}
                </MessageContent>
              </Message>
            )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      {failed && (
        <p role='alert' className='text-destructive px-3 text-sm'>
          {t(
            'Message failed to send. Retry to confirm delivery without duplicates.'
          )}
        </p>
      )}
      <form
        className={`border-border shrink-0 rounded-2xl border-2 p-2 focus-within:border-[#243cf1] ${props.compact ? 'mx-3 mt-2 mb-3' : ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (draft.trim() && !send.isPending && canReply) send.mutate()
        }}
      >
        <Textarea
          className='max-h-32 min-h-14 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 dark:bg-transparent'
          aria-label={t('Message')}
          placeholder={t('Message')}
          maxLength={2000}
          value={draft}
          disabled={send.isPending || failed || !canReply}
          onChange={(event) => {
            setDraft(event.target.value)
            requestID.current = crypto.randomUUID()
            client.setQueryData(draftKey, {
              body: event.target.value,
              id: requestID.current,
              failed: false,
              note: false,
            })
          }}
        />
        <div className='flex items-center justify-end gap-3'>
          {props.userID && (
            <div className='mr-auto'>
              <SupportQuickReplies
                userID={props.userID}
                threadID={props.threadID}
                disabled={!canReply || send.isPending || failed}
              />
            </div>
          )}
          {!props.userID && (
            <div className='mr-auto'>
              <SupportOrders />
            </div>
          )}
          {send.isPending && <LoadingState inline message={t('Sending...')} />}
          <Button
            type='submit'
            size='icon'
            aria-label={failed ? t('Retry') : t('Send')}
            className='size-9 rounded-full bg-[#243cf1] text-white hover:bg-[#1930db]'
            disabled={!draft.trim() || send.isPending || !canReply}
          >
            <ArrowUp className='size-5' />
          </Button>
        </div>
      </form>
    </div>
  )
}
