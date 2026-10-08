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
import { Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import { useApiInfo } from '@/features/dashboard/hooks/use-status-data'
import {
  getDefaultPingStatus,
  getLatencyColorClass,
  testUrlLatency,
} from '@/features/dashboard/lib/api-info'
import type { ApiInfoItem } from '@/features/dashboard/types'
import { useStatus } from '@/hooks/use-status'
import { toIntlLocale } from '@/i18n/languages'
import { avatarColorMap, type SemanticColor } from '@/lib/colors'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

function ApiAddressItem(props: { address: ApiInfoItem }) {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState(getDefaultPingStatus)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  let testLabel = ''
  if (status.testing) {
    testLabel = t('Testing...')
  } else if (status.error) {
    testLabel = t('Test failed')
  } else if (status.latency !== null) {
    testLabel = `${formatNumber(status.latency, locale)} ms`
  }
  const testDisabled = status.testing || status.error || status.latency !== null

  return (
    <Item
      role='listitem'
      size='xs'
      className='bg-muted border-input w-auto max-w-full min-w-0 flex-nowrap gap-2 rounded-md border px-2.5 py-0'
    >
      <ItemContent className='min-w-0 flex-row flex-wrap items-center gap-2 group-data-[size=xs]/item:gap-2 sm:flex-nowrap'>
        <ItemTitle className='text-muted-foreground max-w-full min-w-0 shrink-0 flex-wrap gap-1.5 text-xs font-normal'>
          <Badge
            variant='secondary'
            className={cn(
              'h-auto min-h-5 min-w-0 shrink px-1.5 text-xs font-normal break-all whitespace-normal',
              avatarColorMap[props.address.color as SemanticColor] ||
                avatarColorMap.grey
            )}
            title={props.address.description || undefined}
          >
            {props.address.route}
          </Badge>
        </ItemTitle>
        <code className='text-foreground min-w-0 basis-full font-mono text-xs break-all select-text sm:basis-auto'>
          {props.address.url}
        </code>
      </ItemContent>
      <ItemActions className='text-muted-foreground shrink-0 gap-0.5'>
        <CopyButton
          value={props.address.url}
          size='sm'
          className='size-7 p-0'
          tooltip={t('Copy API URL')}
          aria-label={`${t('Copy API URL')}: ${props.address.url}`}
        />
        <span role='status'>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'h-7 min-w-7 px-1 text-xs disabled:opacity-100',
              status.latency !== null && getLatencyColorClass(status.latency),
              status.error && 'text-destructive'
            )}
            title={testLabel || t('Test Latency')}
            aria-label={`${testLabel || t('Test Latency')}: ${props.address.url}`}
            disabled={testDisabled}
            onClick={async () => {
              if (testDisabled) return
              setStatus({ latency: null, testing: true, error: false })
              setStatus(await testUrlLatency(props.address.url))
            }}
          >
            {testLabel || <Zap aria-hidden='true' className='size-3.5' />}
          </Button>
        </span>
      </ItemActions>
    </Item>
  )
}

export function ApiAddresses() {
  const { t } = useTranslation()
  const { status, loading } = useStatus()
  const { items } = useApiInfo()
  const serverAddress =
    (typeof status?.server_address === 'string' &&
      status.server_address.trim()) ||
    ''
  const addresses = items.length
    ? items
    : [
        {
          url: serverAddress || window.location.origin,
          route: serverAddress ? t('Default API address') : t('Current domain'),
          description: '',
          color: 'grey',
        },
      ]

  if (loading) {
    return <LoadingState inline size='sm' message={t('Loading...')} />
  }

  return (
    <ItemGroup
      aria-label={t('API Addresses')}
      className='ml-auto max-h-40 w-auto max-w-full min-w-0 flex-row flex-wrap items-center justify-end overflow-y-auto sm:max-w-xl lg:max-w-2xl'
    >
      {addresses.map((address) => (
        <ApiAddressItem key={address.url} address={address} />
      ))}
    </ItemGroup>
  )
}
