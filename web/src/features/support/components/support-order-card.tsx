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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ReceiptText } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { OrderStatus } from '@/features/site-orders/order-status'

import type { SupportOrderMessage } from '../order-message'

export function SupportOrderCard(props: {
  order: SupportOrderMessage
  staff: boolean
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Link
      to={props.staff ? '/site-orders' : '/my-orders'}
      search={{ order: props.order.trade_no }}
      onClick={(event) => {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          event.button === 0
        ) {
          props.onNavigate?.()
        }
      }}
      className='bg-card text-card-foreground hover:bg-accent focus-visible:outline-ring flex w-64 max-w-full flex-col gap-3 rounded-xl border p-3 no-underline transition-colors focus-visible:outline-2'
    >
      <span className='flex items-center gap-2 text-sm font-medium'>
        <ReceiptText className='size-4' aria-hidden='true' />
        {t('Order details')}
        <ArrowUpRight
          className='text-muted-foreground ml-auto size-4'
          aria-hidden='true'
        />
      </span>
      <span className='text-sm break-all'>{props.order.trade_no}</span>
      <OrderStatus order={props.order} />
      <span className='text-muted-foreground text-xs'>{t('View details')}</span>
    </Link>
  )
}
