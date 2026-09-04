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
import { ArrowRight, Crown, WalletCards } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'

interface WalletActionCardProps {
  kind: 'recharge' | 'subscription'
  onClick: () => void
  disabled?: boolean
}

export function WalletActionCard(props: WalletActionCardProps) {
  const { t } = useTranslation()
  const isRecharge = props.kind === 'recharge'
  const title = isRecharge ? t('Add Funds') : t('Purchase Subscription')
  const description = isRecharge
    ? t('Choose an amount and payment method')
    : t('Subscribe to a plan for model access')
  const Icon = isRecharge ? WalletCards : Crown
  const tone: IconBadgeTone = isRecharge ? 'success' : 'warning'

  return (
    <Card data-card-hover='false' className='py-0'>
      <CardContent className='p-2 sm:p-3'>
        <Button
          type='button'
          variant='ghost'
          disabled={props.disabled}
          onClick={props.onClick}
          className='hover:bg-muted/60 h-auto w-full justify-start gap-3 rounded-lg px-2.5 py-3 text-left sm:px-3 sm:py-4'
        >
          <IconBadge tone={tone} size='lg'>
            <Icon />
          </IconBadge>
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-sm font-semibold sm:text-base'>
              {title}
            </span>
            <span className='text-muted-foreground mt-0.5 block truncate text-xs sm:text-sm'>
              {description}
            </span>
          </span>
          <ArrowRight className='text-muted-foreground size-4 shrink-0' />
        </Button>
      </CardContent>
    </Card>
  )
}
