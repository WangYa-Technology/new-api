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
import { useRef, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { OrderStatus } from '@/features/site-orders/order-status'
import { useAuthStore } from '@/stores/auth-store'

import { supportAction, supportGet, type SupportHistory } from '../chat-api'
import { encodeOrderMessage } from '../order-message'

export function SupportOrders(props: {
  userID?: number
  threadID?: string
  embedded?: boolean
}) {
  const { t } = useTranslation()
  const viewerID = useAuthStore((state) => state.auth.user?.id)
  const [open, setOpen] = useState(false)
  const orders = useQuery({
    queryKey: ['support-chat', 'orders', viewerID, props.userID ?? 'self'],
    queryFn: () =>
      supportGet<
        (ComponentProps<typeof OrderStatus>['order'] & { trade_no: string })[]
      >(props.userID ? `users/${props.userID}/orders` : 'orders'),
    enabled: props.embedded || open,
  })
  // Subscribe to the chat's existing history without issuing another request.
  const history = useQuery<SupportHistory>({
    queryKey: [
      'support-chat',
      'history',
      viewerID,
      props.userID ?? 'self',
      props.threadID ?? 'legacy',
    ],
    enabled: false,
  })
  const canSend =
    history.data?.conversation.status === 'human' &&
    history.data.conversation.agent_id === viewerID
  const content = (
    <>
      {orders.isPending && <LoadingState />}
      {orders.isError && <ErrorState onRetry={() => void orders.refetch()} />}
      {orders.data?.length === 0 && <p>{t('No orders found')}</p>}
      {props.embedded &&
        props.threadID &&
        !canSend &&
        !!orders.data?.length && (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Take ownership of this conversation before sending orders. Reopen it first if resolved.'
            )}
          </p>
        )}
      <ul className='space-y-3'>
        {orders.data?.map((order) => (
          <li
            className='flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm'
            key={order.trade_no}
          >
            <span className='break-all'>{order.trade_no}</span>
            <OrderStatus order={order} />
            {props.embedded && props.userID && props.threadID && (
              <SendOrderButton
                key={`${props.threadID}:${order.trade_no}`}
                userID={props.userID}
                threadID={props.threadID}
                order={order}
                canSend={canSend}
              />
            )}
          </li>
        ))}
      </ul>
    </>
  )
  if (props.embedded) return content
  return (
    <>
      <Button size='sm' variant='outline' onClick={() => setOpen(true)}>
        {props.userID ? t('Orders') : t('My recent orders')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={props.userID ? t('Orders') : t('My recent orders')}
      >
        {content}
      </Dialog>
    </>
  )
}

function SendOrderButton(props: {
  userID: number
  threadID: string
  order: ComponentProps<typeof OrderStatus>['order'] & { trade_no: string }
  canSend: boolean
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const inFlight = useRef(false)
  const attempt = useRef<{ body: string; request_id: string } | null>(null)
  const send = useMutation({
    mutationFn: (payload: { body: string; request_id: string }) =>
      supportAction(props.userID, {
        ...payload,
        thread_id: props.threadID,
        action: 'reply',
      }),
    retry: false,
    onSettled: () => {
      inFlight.current = false
      void client.invalidateQueries({ queryKey: ['support-chat'] })
    },
  })
  let label = t('Send to chat')
  if (send.isPending) label = t('Sending...')
  if (send.isError) label = t('Retry')
  if (send.isSuccess) label = t('Sent to chat')
  return (
    <Button
      size='sm'
      variant='outline'
      className='w-full'
      disabled={!props.canSend || send.isPending || send.isSuccess}
      onClick={() => {
        if (!props.canSend || inFlight.current || send.isSuccess) return
        inFlight.current = true
        // Keep the exact body and id on retry to avoid duplicate replies.
        attempt.current ??= {
          body: encodeOrderMessage(props.order),
          request_id: crypto.randomUUID(),
        }
        send.mutate(attempt.current)
      }}
    >
      {label}
    </Button>
  )
}
