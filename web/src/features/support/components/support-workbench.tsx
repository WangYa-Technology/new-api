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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock3, MessagesSquare, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { hasPermission } from '@/lib/admin-permissions'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import {
  saveSupportSettings,
  supportGet,
  type SupportConversation,
  type SupportSettings,
  type SupportInfo,
} from '../chat-api'
import { useSupportCustomer } from '../use-support-customer'
import { useSupportEvents } from '../use-support-events'
import { SupportAISettingsEditor } from './support-ai-settings'
import { SupportChat } from './support-chat'
import { SupportCustomerDetails } from './support-customer-details'
import { SupportKnowledgeEditor } from './support-knowledge'

const settingsSchema = z.object({
  quick_replies: z.array(z.string().trim().min(1).max(2000)).max(20),
  enabled: z.boolean(),
  knowledge: z.string().max(15000),
  offline_message: z.string().max(500),
})

function SupportSettingsForm(props: { initial: SupportSettings }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [replyIDs, setReplyIDs] = useState(() =>
    (props.initial.quick_replies ?? []).map(() => crypto.randomUUID())
  )
  const form = useForm<SupportSettings>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      ...props.initial,
      quick_replies: props.initial.quick_replies ?? [],
    },
  })
  const save = useMutation({
    mutationFn: saveSupportSettings,
    onSuccess: async (_, values) => {
      form.reset(values)
      await client.invalidateQueries({ queryKey: ['support-chat'] })
    },
  })
  const info = useQuery({
    queryKey: ['support-chat', 'info'],
    queryFn: () => supportGet<SupportInfo>('info'),
  })
  return (
    <form
      className='space-y-4'
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='support-enabled'>{t('Enable customer support')}</Label>
        <Switch
          id='support-enabled'
          checked={form.watch('enabled')}
          onCheckedChange={(enabled) =>
            form.setValue('enabled', enabled, { shouldDirty: true })
          }
        />
      </div>
      <p className='text-muted-foreground text-sm'>
        {info.data?.ai_available
          ? t('AI support is available')
          : t(
              'AI requires server model configuration and a knowledge base. Otherwise messages go to human support.'
            )}
      </p>
      <div className='space-y-2'>
        <Label htmlFor='support-offline'>{t('Waiting message')}</Label>
        <Textarea
          id='support-offline'
          maxLength={500}
          {...form.register('offline_message')}
        />
      </div>
      <div className='space-y-3'>
        <Label>{t('Quick replies')}</Label>
        {form.watch('quick_replies').map((reply, index) => (
          <div key={replyIDs[index]} className='flex items-start gap-2'>
            <Textarea
              aria-label={t('Quick reply')}
              maxLength={2000}
              value={reply}
              onChange={(event) =>
                form.setValue(`quick_replies.${index}`, event.target.value, {
                  shouldDirty: true,
                })
              }
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => {
                setReplyIDs((ids) => ids.filter((_, i) => i !== index))
                form.setValue(
                  'quick_replies',
                  form.getValues('quick_replies').filter((_, i) => i !== index),
                  { shouldDirty: true }
                )
              }}
            >
              {t('Remove')}
            </Button>
          </div>
        ))}
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={form.watch('quick_replies').length >= 20}
          onClick={() => {
            setReplyIDs((ids) => [...ids, crypto.randomUUID()])
            form.setValue(
              'quick_replies',
              [...form.getValues('quick_replies'), ''],
              { shouldDirty: true }
            )
          }}
        >
          {t('Add quick reply')}
        </Button>
      </div>
      <Button
        type='submit'
        disabled={
          save.isPending ||
          !form.formState.isDirty ||
          form.watch('quick_replies').some((reply) => !reply.trim())
        }
      >
        {t('Save')}
      </Button>
      {save.isSuccess && !form.formState.isDirty && (
        <p role='status' className='text-muted-foreground text-sm'>
          {t('Saved successfully')}
        </p>
      )}
    </form>
  )
}

function SupportSettingsEditor() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const settings = useQuery({
    queryKey: ['support-chat', 'settings'],
    queryFn: () => supportGet<SupportSettings>('settings'),
    enabled: open,
  })
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('Support settings')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t('Support settings')}>
        {settings.isPending && <LoadingState />}
        {settings.isError && (
          <ErrorState onRetry={() => void settings.refetch()} />
        )}
        {settings.data && <SupportSettingsForm initial={settings.data} />}
      </Dialog>
    </>
  )
}

type QueueCounts = Record<'waiting' | 'mine' | 'all' | 'resolved', number>

export function SupportWorkbench() {
  const client = useQueryClient()
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [selected, setSelected] = useState<SupportConversation>()
  const [filter, setFilter] = useState('waiting')
  const [page, setPage] = useState(1)
  const allowed = hasPermission(user, 'support', 'operate')
  const connected = useSupportEvents(allowed, true)
  const countsKey = ['support-chat', 'queue-counts', user?.id]
  const counts = useQuery<QueueCounts>({ queryKey: countsKey, enabled: false })
  const queue = useQuery({
    queryKey: ['support-chat', 'queue', user?.id, filter, page],
    queryFn: async () => {
      const result = await supportGet<{
        items: SupportConversation[]
        total: number
        counts: QueueCounts
      }>(`queue?page=${page}&status=${filter}`)
      if (result.counts) client.setQueryData(countsKey, result.counts)
      return result
    },
    enabled: allowed,
    refetchInterval: 5000,
  })
  if (!allowed) {
    if (
      !hasPermission(user, 'support', 'write') &&
      !hasPermission(user, 'support', 'sensitive_write')
    ) {
      return null
    }
    return (
      <section className='bg-background flex flex-wrap gap-2 rounded-xl border p-4'>
        {hasPermission(user, 'support', 'write') && <SupportKnowledgeEditor />}
        {hasPermission(user, 'support', 'sensitive_write') && (
          <>
            <SupportAISettingsEditor />
            <SupportSettingsEditor />
          </>
        )}
      </section>
    )
  }
  const statusLabels = {
    ai: t('AI support'),
    waiting: t('Waiting for support'),
    human: t('Human support'),
    resolved: t('Resolved'),
  }
  return (
    <section className='bg-background flex h-full min-h-0 flex-col overflow-hidden rounded-xl border'>
      <div className='grid shrink-0 grid-cols-2 items-center gap-3 border-b px-4 py-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]'>
        <h2 className='sr-only'>{t('Support workbench')}</h2>
        <span
          role='status'
          className='text-muted-foreground col-start-1 row-start-1 min-w-0 text-xs'
        >
          {connected
            ? t('Live updates connected')
            : t('Reconnecting. Messages are refreshed automatically.')}
        </span>
        <div className='col-span-2 row-start-2 max-w-full min-w-0 justify-self-center overflow-x-auto lg:col-span-1 lg:col-start-2 lg:row-start-1'>
          <ToggleGroup
            aria-label={t('Messages')}
            value={[filter]}
            onValueChange={(values) => {
              if (!values[0]) return
              setFilter(values[0])
              setPage(1)
            }}
            className='bg-muted p-1'
            size='sm'
            spacing={1}
          >
            {[
              {
                value: 'waiting',
                label: t('Waiting for support'),
                icon: Clock3,
              },
              { value: 'mine', label: t('Assigned to me'), icon: UserRound },
              { value: 'all', label: t('All'), icon: MessagesSquare },
              { value: 'resolved', label: t('Resolved'), icon: CheckCircle2 },
            ].map((item) => (
              <ToggleGroupItem
                key={item.value}
                value={item.value}
                aria-label={item.label}
                className='data-pressed:bg-background gap-1.5 px-3 data-pressed:shadow-sm'
              >
                <item.icon className='size-4' aria-hidden='true' />
                {item.label}
                <span className='text-muted-foreground text-xs tabular-nums'>
                  {formatNumber(
                    counts.data?.[item.value as keyof QueueCounts] ?? 0
                  )}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className='col-start-2 row-start-1 flex min-w-0 flex-wrap justify-end gap-1.5 justify-self-end lg:col-start-3'>
          {hasPermission(user, 'support', 'write') && (
            <SupportKnowledgeEditor />
          )}
          {hasPermission(user, 'support', 'sensitive_write') && (
            <>
              <SupportAISettingsEditor />
              <SupportSettingsEditor />
            </>
          )}
        </div>
      </div>
      <div className='grid min-h-0 flex-1 overflow-auto lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:overflow-hidden 2xl:grid-cols-[260px_minmax(0,1fr)_320px]'>
        <aside
          aria-label={t('Messages')}
          className='flex min-h-0 flex-col border-b lg:border-r lg:border-b-0'
        >
          <div className='min-h-0 flex-1 overflow-y-auto p-2'>
            {queue.isPending && <LoadingState />}
            {queue.isError && (
              <ErrorState onRetry={() => void queue.refetch()} />
            )}
            {queue.data?.items.length === 0 && (
              <p className='text-muted-foreground flex h-full items-center justify-center p-4 text-center text-sm'>
                {t('No conversations yet')}
              </p>
            )}
            {queue.data?.items.map((conversation) => (
              <Button
                key={conversation.id}
                variant={
                  selected?.id === conversation.id ? 'secondary' : 'ghost'
                }
                aria-pressed={selected?.id === conversation.id}
                className='h-10 w-full flex-row items-center gap-2 px-3 text-left'
                onClick={() => setSelected(conversation)}
              >
                <span className='min-w-0 flex-1'>
                  <SupportCustomerName userID={conversation.user_id} />
                </span>
                <span className='text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-normal whitespace-nowrap'>
                  {statusLabels[conversation.status]}
                  {(conversation.unread_count ??
                    Number(
                      conversation.last_message_id > conversation.staff_read_id
                    )) > 0 && (
                    <span
                      aria-label={t('Unread messages')}
                      className='bg-primary text-primary-foreground ml-1 rounded-full px-1.5'
                    >
                      {formatNumber(conversation.unread_count ?? 1)}
                    </span>
                  )}
                  {conversation.status === 'waiting' && (
                    <span className='sr-only'>
                      {t('Waiting {{minutes}} min', {
                        minutes: formatNumber(
                          Math.max(
                            0,
                            Math.floor(
                              (Date.now() / 1000 -
                                (conversation.waiting_since ||
                                  conversation.updated_at)) /
                                60
                            )
                          )
                        ),
                      })}
                    </span>
                  )}
                </span>
              </Button>
            ))}
          </div>
          {(page > 1 || (queue.data?.total ?? 0) > 50) && (
            <div className='flex shrink-0 justify-between gap-2 border-t p-3'>
              <Button
                variant='outline'
                size='sm'
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('Previous page')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={!queue.data || page * 50 >= queue.data.total}
                onClick={() => setPage(page + 1)}
              >
                {t('Next page')}
              </Button>
            </div>
          )}
        </aside>
        <div className='flex min-h-[400px] min-w-0 flex-col overflow-hidden border-b p-4 lg:min-h-0 lg:border-r lg:border-b-0'>
          {selected ? (
            <SupportChat
              key={selected.id}
              workbench
              userID={selected.user_id}
              threadID={selected.id}
            />
          ) : (
            <p className='text-muted-foreground flex flex-1 items-center justify-center p-8 text-center text-sm'>
              {t('Select a conversation to reply')}
            </p>
          )}
        </div>
        <aside
          aria-label={t('User information')}
          className='min-h-0 overflow-y-auto'
        >
          {selected ? (
            <SupportCustomerDetails
              key={selected.id}
              userID={selected.user_id}
              threadID={selected.id}
            />
          ) : (
            <p className='text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm'>
              {t('Select a conversation to view user details')}
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}

function SupportCustomerName(props: { userID: number }) {
  const { t } = useTranslation()
  const profile = useSupportCustomer(props.userID)
  return (
    <span className='block truncate font-medium'>
      {profile.data?.display_name ||
        profile.data?.username ||
        `${t('User')} #${props.userID}`}
    </span>
  )
}
