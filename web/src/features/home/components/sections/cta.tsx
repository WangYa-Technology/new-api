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
import { ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='bg-background text-foreground relative overflow-hidden px-4 py-20 sm:px-6 md:py-28'>
      <div className='mx-auto max-w-7xl'>
        <AnimateInView
          animation='scale-in'
          className='bg-card text-card-foreground border-border relative overflow-hidden rounded-3xl border px-6 py-12 shadow-[0_35px_100px_-62px_color-mix(in_oklch,var(--primary)_45%,transparent)] md:px-12 md:py-14'
        >
          <div
            aria-hidden
            className='absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_36%),radial-gradient(circle_at_88%_18%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_34%)]'
          />
          <div className='relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center'>
            <div>
              <p className='text-primary mb-3 text-xs font-bold tracking-[0.2em] uppercase'>
                {t('Ready to switch models faster?')}
              </p>
              <h2 className='max-w-3xl text-3xl leading-tight font-semibold tracking-tight md:text-5xl'>
                {t('Give every app one compatible AI router.')}
              </h2>
              <div className='text-muted-foreground mt-5 grid gap-2 text-sm sm:grid-cols-3'>
                {[
                  t('Unified endpoint'),
                  t('Budget guardrails'),
                  t('Auditable request logs'),
                ].map((item) => (
                  <div key={item} className='flex items-center gap-2'>
                    <CheckCircle2 className='text-primary size-4' />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className='flex flex-wrap gap-3 lg:justify-end'>
              <Button
                className='bg-primary text-primary-foreground group h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_18px_40px_-18px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-primary/90'
                render={<Link to='/sign-up' />}
              >
                {t('Get API Key')}
                <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </Button>
              <Button
                variant='outline'
                className='border-border bg-card text-foreground h-11 rounded-xl px-5 text-sm font-semibold shadow-sm hover:bg-accent hover:text-accent-foreground'
                render={<Link to='/pricing' />}
              >
                <BookOpen className='size-4' />
                {t('View pricing')}
              </Button>
            </div>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
