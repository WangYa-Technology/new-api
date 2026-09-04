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
import { ExternalLink, Gift, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'

import type { TopupInfo } from '../types'

interface RedemptionCodeCardProps {
  topupInfo: TopupInfo | null
  redemptionCode: string
  onRedemptionCodeChange: (code: string) => void
  onRedeem: () => void
  redeeming: boolean
  topupLink?: string
  loading?: boolean
  embedded?: boolean
}

export function RedemptionCodeCard(props: RedemptionCodeCardProps) {
  const { t } = useTranslation()
  const redemptionEnabled = props.topupInfo?.enable_redemption !== false

  let content: ReactNode
  if (props.loading) {
    content = (
      <div className='space-y-3' aria-label={t('Have a Code?')}>
        <Skeleton className='h-3 w-24' />
        <div className='flex gap-2'>
          <Skeleton className='h-10 flex-1' />
          <Skeleton className='h-10 w-20' />
        </div>
      </div>
    )
  } else if (redemptionEnabled) {
    content = (
      <div className='space-y-2.5 sm:space-y-3'>
        <div className='flex items-center gap-2'>
          {props.embedded && (
            <IconBadge tone='warning' size='xs'>
              <Gift />
            </IconBadge>
          )}
          <Label
            htmlFor='redemption-code'
            className={
              props.embedded
                ? 'text-muted-foreground text-xs font-medium tracking-wider uppercase'
                : 'sr-only'
            }
          >
            {t('Have a Code?')}
          </Label>
        </div>
        <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
          <Input
            id='redemption-code'
            value={props.redemptionCode}
            onChange={(event) =>
              props.onRedemptionCodeChange(event.target.value)
            }
            placeholder={t('Enter your redemption code')}
            className='h-9 min-w-0'
          />
          <Button
            onClick={props.onRedeem}
            disabled={props.redeeming}
            variant='outline'
            className='h-9 px-4'
          >
            {props.redeeming && (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            )}
            {t('Redeem')}
          </Button>
        </div>
        {props.topupLink && (
          <p className='text-muted-foreground text-xs'>
            {t('Need a redemption code?')}{' '}
            <a
              href={props.topupLink}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1 underline-offset-4 hover:underline'
            >
              {t('Get one here')}
              <ExternalLink className='h-3 w-3' />
            </a>
          </p>
        )}
      </div>
    )
  } else {
    content = (
      <Alert>
        <AlertDescription>
          {t(
            'Redemption codes are disabled until the administrator confirms compliance terms.'
          )}
        </AlertDescription>
      </Alert>
    )
  }

  if (props.embedded) {
    return <div className='border-t pt-4 sm:pt-6'>{content}</div>
  }

  return (
    <TitledCard
      title={t('Have a Code?')}
      icon={<Gift className='h-4 w-4' />}
      iconTone='warning'
      disableHoverEffect
      contentClassName='space-y-4 sm:space-y-6'
    >
      {content}
    </TitledCard>
  )
}
