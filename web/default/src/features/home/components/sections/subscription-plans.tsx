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
import { Link } from '@tanstack/react-router'
import { AxiosError } from 'axios'
import type { TFunction } from 'i18next'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Crown,
  Database,
  Gauge,
  PackageCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getPublicPlans } from '@/features/subscriptions/api'
import { formatDuration, formatResetPeriod } from '@/features/subscriptions/lib'
import type {
  PlanRecord,
  SubscriptionPlan,
} from '@/features/subscriptions/types'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

const planIcons = [PackageCheck, Zap, Sparkles, Crown]
const skeletonKeys = [
  'plan-preview-1',
  'plan-preview-2',
  'plan-preview-3',
  'plan-preview-4',
]

function getPlanPrice(plan: SubscriptionPlan): string {
  const price = Number(plan.price_amount || 0)
  return `$${price.toFixed(2)}`
}

function getPlanHighlights(
  plan: SubscriptionPlan,
  t: TFunction<'translation', undefined>
): string[] {
  const highlights = [
    plan.subtitle,
    plan.upgrade_group ? `${t('Upgrade Group')}: ${plan.upgrade_group}` : null,
    `${t('Validity Period')}: ${formatDuration(plan, t)}`,
  ]

  return highlights.filter(Boolean).slice(0, 3) as string[]
}

function PlanCard(props: {
  index: number
  isAuthenticated: boolean
  isFeatured: boolean
  planRecord: PlanRecord
}) {
  const { t } = useTranslation()
  const plan = props.planRecord.plan
  const Icon = planIcons[props.index % planIcons.length]
  const totalAmount = Number(plan.total_amount || 0)
  const resetPeriod = formatResetPeriod(plan, t)
  const ctaTarget = props.isAuthenticated ? '/wallet' : '/sign-up'
  const highlights = getPlanHighlights(plan, t)

  return (
    <AnimateInView
      delay={props.index * 90}
      animation='fade-up'
      className={cn(
        'bg-card text-card-foreground relative flex min-h-[33.5rem] w-full max-w-[21rem] flex-col overflow-hidden rounded-2xl border p-6 shadow-sm transition duration-500 hover:-translate-y-1 hover:shadow-[0_26px_80px_-50px_color-mix(in_oklch,var(--primary)_22%,transparent)] sm:basis-[calc(50%-0.625rem)] lg:basis-[20rem]',
        props.isFeatured
          ? 'border-primary/45 shadow-[0_28px_85px_-56px_color-mix(in_oklch,var(--primary)_42%,transparent)] ring-2 ring-primary/15'
          : 'border-border'
      )}
    >
      {props.isFeatured && (
        <div className='bg-primary/10 text-primary border-primary/15 absolute top-5 right-5 rounded-full border px-3 py-1 text-[0.68rem] font-bold tracking-[0.16em] uppercase'>
          {t('Recommended')}
        </div>
      )}

      <div className='bg-primary/10 text-primary border-primary/15 mb-5 flex size-10 items-center justify-center rounded-2xl border'>
        <Icon className='size-5' />
      </div>

      <div>
        <h3 className='text-card-foreground line-clamp-1 text-lg font-semibold'>
          {plan.title || t('Subscription Plans')}
        </h3>
        <div className='text-card-foreground mt-2 flex items-end gap-1'>
          <span className='text-3xl font-semibold tracking-tight'>
            {getPlanPrice(plan)}
          </span>
          <span className='text-muted-foreground pb-1 text-sm'>
            / {formatDuration(plan, t)}
          </span>
        </div>
      </div>

      {highlights.length > 0 && (
        <div className='border-border mt-5 space-y-2 border-t pt-5'>
          {highlights.map((item) => (
            <div
              key={item}
              className='text-muted-foreground flex items-start gap-2 text-sm'
            >
              <CheckCircle2 className='text-primary mt-0.5 size-3.5 shrink-0' />
              <span className='line-clamp-1'>{item}</span>
            </div>
          ))}
        </div>
      )}

      <div className='border-border mt-6 space-y-5 border-t pt-6 text-sm'>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <span className='text-muted-foreground flex items-center gap-2'>
            <Database className='size-4' />
            {t('Token Cap')}
          </span>
          <span className='text-card-foreground font-semibold'>
            {totalAmount > 0 ? formatQuota(totalAmount) : t('Unlimited')}
          </span>
        </div>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <span className='text-muted-foreground flex items-center gap-2'>
            <CalendarClock className='size-4' />
            {t('Quota Reset')}
          </span>
          <span className='text-card-foreground font-semibold'>
            {resetPeriod}
          </span>
        </div>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <span className='text-muted-foreground flex items-center gap-2'>
            <Gauge className='size-4' />
            {t('Purchase Limit')}
          </span>
          <span className='text-card-foreground font-semibold'>
            {Number(plan.max_purchase_per_user || 0) > 0
              ? plan.max_purchase_per_user
              : t('Unlimited')}
          </span>
        </div>
      </div>

      <Button
        className={cn(
          'group mt-auto h-11 rounded-xl text-sm font-semibold',
          props.isFeatured
            ? 'bg-primary text-primary-foreground shadow-[0_18px_40px_-18px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-primary/90'
            : 'border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground'
        )}
        variant={props.isFeatured ? 'default' : 'outline'}
        render={<Link to={ctaTarget} />}
      >
        {props.isAuthenticated ? t('View plans') : t('Create account')}
        <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
      </Button>
    </AnimateInView>
  )
}

export function SubscriptionPlansPreview(props: { isAuthenticated: boolean }) {
  const { t } = useTranslation()
  const plansQuery = useQuery({
    queryKey: ['home-public-subscription-plans'],
    queryFn: async () => {
      try {
        const res = await getPublicPlans({ skipErrorHandler: true })
        if (!res.success) {
          throw new Error(res.message || 'Failed to load subscription plans')
        }
        return res.data || []
      } catch (error) {
        if (error instanceof AxiosError && error.response?.status === 401) {
          return []
        }
        throw error
      }
    },
    staleTime: 60_000,
  })

  if (plansQuery.isLoading) {
    return (
      <section
        id='plans'
        className='bg-background text-foreground relative px-4 py-24 sm:px-6 md:py-32'
      >
        <div className='mx-auto max-w-7xl'>
          <Skeleton className='mx-auto mb-10 h-8 w-72' />
          <div className='flex flex-wrap justify-center gap-5'>
            {skeletonKeys.map((key) => (
              <Skeleton
                key={key}
                className='h-[33.5rem] w-full max-w-[21rem] rounded-2xl sm:basis-[calc(50%-0.625rem)] lg:basis-[20rem]'
              />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (plansQuery.isError || !plansQuery.data || plansQuery.data.length === 0) {
    return null
  }

  const plans = plansQuery.data.slice(0, 4)
  const featuredIndex = plans.length >= 3 ? 2 : 0

  return (
    <section
      id='plans'
      className='bg-background text-foreground relative overflow-hidden px-4 py-24 sm:px-6 md:py-32'
    >
      <div
        aria-hidden
        className='absolute inset-x-0 top-1/2 -z-10 h-64 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_64%)]'
      />
      <div className='mx-auto max-w-7xl'>
        <AnimateInView className='mx-auto mb-12 max-w-3xl text-center'>
          <p className='text-primary mb-3 text-xs font-bold tracking-[0.2em] uppercase'>
            {t('Subscription Plans')}
          </p>
          <h2 className='text-foreground text-3xl leading-tight font-semibold tracking-tight md:text-4xl'>
            {t('Pick a plan from your configured catalog')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base leading-7'>
            {t(
              'Plans are loaded from the admin subscription settings, so homepage pricing stays aligned with your live billing configuration.'
            )}
          </p>
        </AnimateInView>

        <div className='flex flex-wrap justify-center gap-5'>
          {plans.map((planRecord, index) => (
            <PlanCard
              key={planRecord.plan.id}
              index={index}
              isAuthenticated={props.isAuthenticated}
              isFeatured={index === featuredIndex}
              planRecord={planRecord}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
