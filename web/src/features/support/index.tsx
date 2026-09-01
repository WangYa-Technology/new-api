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
import { ExternalLink, LifeBuoy } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

import { getSupportLinks } from './api'
import { SupportIcon } from './components/support-icon'
import { parseSupportConfig } from './lib/support-config'

export function Support() {
  const { t } = useTranslation()
  const supportQuery = useQuery({
    queryKey: ['support-links'],
    queryFn: getSupportLinks,
    staleTime: 5 * 60 * 1000,
  })
  const categories = parseSupportConfig(supportQuery.data?.data)
  let content: ReactNode

  if (supportQuery.isLoading) {
    content = (
      <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className='h-28 w-full rounded-lg' />
        ))}
      </div>
    )
  } else if (categories.length === 0) {
    content = (
      <Empty className='min-h-72 border'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <LifeBuoy />
          </EmptyMedia>
          <EmptyTitle>{t('No support resources available')}</EmptyTitle>
          <EmptyDescription>
            {supportQuery.isError
              ? t(
                  'Support resources could not be loaded. Please try again later.'
                )
              : t(
                  'The administrator has not configured support resources yet.'
                )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  } else {
    content = (
      <div className='divide-border divide-y'>
        {categories.map((category) => (
          <section
            key={category.id}
            className='space-y-4 py-6 first:pt-1 last:pb-2'
          >
            <div className='space-y-1'>
              <h3 className='text-xl font-semibold'>{category.title}</h3>
              {category.description ? (
                <p className='text-muted-foreground max-w-4xl text-sm leading-6'>
                  {category.description}
                </p>
              ) : null}
            </div>

            {category.items.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('No links in this category')}
              </p>
            ) : (
              <div
                data-testid='support-link-grid'
                className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'
              >
                {category.items.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='group hover:border-foreground/25 focus-visible:border-ring focus-visible:ring-ring/50 bg-card flex min-h-28 min-w-0 items-start gap-3 rounded-lg border p-4 transition-colors outline-none focus-visible:ring-3'
                  >
                    <span className='bg-primary/8 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg'>
                      <SupportIcon name={item.icon} className='size-5' />
                    </span>
                    <span className='min-w-0 flex-1 space-y-1'>
                      <span className='block truncate font-semibold'>
                        {item.title}
                      </span>
                      {item.label ? (
                        <span className='text-primary block truncate text-sm font-medium'>
                          {item.label}
                        </span>
                      ) : null}
                      {item.description ? (
                        <span className='text-muted-foreground line-clamp-2 block text-sm leading-5'>
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <ExternalLink className='text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0 transition-colors' />
                  </a>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Support')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
