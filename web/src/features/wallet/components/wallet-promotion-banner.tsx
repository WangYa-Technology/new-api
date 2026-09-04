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
import { ExternalLink, Megaphone } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { parseWalletPromotionConfig } from '../lib/wallet-promotion'

type WalletPromotionBannerProps = {
  config: unknown
}

export function WalletPromotionBanner(props: WalletPromotionBannerProps) {
  const { t } = useTranslation()
  const config = parseWalletPromotionConfig(props.config)
  if (!config?.enabled) return null

  const isExternalAction = /^https?:\/\//i.test(config.actionUrl)

  return (
    <section
      aria-label={t('Wallet promotion')}
      className='border-primary/30 bg-primary/8 flex rounded-lg border p-3 shadow-xs sm:p-4'
    >
      {config.imageUrl ? (
        <img
          src={config.imageUrl}
          alt=''
          className='border-primary/20 size-10 shrink-0 rounded-lg border object-cover sm:size-11'
        />
      ) : (
        <div className='border-primary/20 bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg border sm:size-11'>
          <Megaphone className='size-5' aria-hidden='true' />
        </div>
      )}
      <div className='ml-3 flex min-w-0 flex-1 flex-col gap-3 sm:ml-4 sm:flex-row sm:items-center sm:gap-4'>
        <div className='min-w-0 flex-1'>
          <h2 className='text-foreground text-base leading-5 font-semibold'>
            {config.title}
          </h2>
          {config.description ? (
            <p className='text-foreground/75 mt-1 text-sm leading-5'>
              {config.description}
            </p>
          ) : null}
        </div>
        {config.actionLabel && config.actionUrl ? (
          <a
            href={config.actionUrl}
            target={isExternalAction ? '_blank' : undefined}
            rel={isExternalAction ? 'noreferrer' : undefined}
            className={cn(
              buttonVariants({ size: 'default' }),
              'w-full font-semibold shadow-xs sm:w-auto'
            )}
          >
            {config.actionLabel}
            {isExternalAction ? <ExternalLink data-icon='inline-end' /> : null}
          </a>
        ) : null}
      </div>
    </section>
  )
}
