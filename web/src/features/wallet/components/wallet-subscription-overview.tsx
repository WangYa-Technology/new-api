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
import { CrownIcon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { StatusBadge, textColorMap } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  getPublicPlans,
  getSelfSubscriptionFull,
  updateBillingPreference,
} from '@/features/subscriptions/api'
import type {
  PlanRecord,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

interface WalletSubscriptionOverviewProps {
  refreshKey?: number
}

function getBillingPreferenceLabel(
  preference: string,
  t: (key: string) => string
): string {
  switch (preference) {
    case 'subscription_first':
      return t('Subscription First')
    case 'wallet_first':
      return t('Wallet First')
    case 'subscription_only':
      return t('Subscription Only')
    case 'wallet_only':
      return t('Wallet Only')
    default:
      return preference
  }
}

function getUsagePercent(subscription?: UserSubscriptionRecord): number {
  const total = Number(subscription?.subscription?.amount_total || 0)
  const used = Number(subscription?.subscription?.amount_used || 0)
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)))
}

export function WalletSubscriptionOverview(
  props: WalletSubscriptionOverviewProps
) {
  const { t } = useTranslation()
  const [plans, setPlans] = useState<PlanRecord[]>([])
  const [activeSubscriptions, setActiveSubscriptions] = useState<
    UserSubscriptionRecord[]
  >([])
  const [billingPreference, setBillingPreference] =
    useState('subscription_first')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const fetchPlans = useCallback(async () => {
    try {
      const response = await getPublicPlans()
      setPlans(response.success ? response.data || [] : [])
    } catch {
      setPlans([])
    }
  }, [])

  const fetchSubscriptions = useCallback(async () => {
    try {
      const response = await getSelfSubscriptionFull()
      if (!response.success || !response.data) {
        setActiveSubscriptions([])
        return
      }
      setBillingPreference(
        response.data.billing_preference || 'subscription_first'
      )
      setActiveSubscriptions(response.data.subscriptions || [])
    } catch {
      setActiveSubscriptions([])
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([fetchPlans(), fetchSubscriptions()])
      .finally(() => {
        if (active) setLoading(false)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [fetchPlans, fetchSubscriptions, props.refreshKey])

  const planTitleMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const record of plans) {
      if (record.plan?.id) map.set(record.plan.id, record.plan.title || '')
    }
    return map
  }, [plans])

  const activeSubscription = activeSubscriptions[0]
  const subscription = activeSubscription?.subscription
  const hasActive = Boolean(subscription)
  const planTitle = subscription
    ? planTitleMap.get(subscription.plan_id) || t('Subscription')
    : t('No Active')
  const usagePercent = getUsagePercent(activeSubscription)
  const totalAmount = Number(subscription?.amount_total || 0)
  const usedAmount = Number(subscription?.amount_used || 0)
  const remainingAmount = Math.max(0, totalAmount - usedAmount)
  const remainingDays = subscription?.end_time
    ? Math.max(
        0,
        Math.ceil((subscription.end_time - Date.now() / 1000) / 86400)
      )
    : 0
  const subscriptionPreference =
    billingPreference === 'subscription_first' ||
    billingPreference === 'subscription_only'
  const displayedPreference =
    !hasActive && subscriptionPreference ? 'wallet_first' : billingPreference

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([fetchPlans(), fetchSubscriptions()])
    } finally {
      setRefreshing(false)
    }
  }

  const handlePreferenceChange = async (preference: string) => {
    const previous = billingPreference
    setBillingPreference(preference)
    try {
      const response = await updateBillingPreference(preference)
      if (response.success) {
        setBillingPreference(response.data?.billing_preference || preference)
        toast.success(t('Updated successfully'))
        return
      }
      toast.error(response.message || t('Update failed'))
    } catch {
      toast.error(t('Request failed'))
    }
    setBillingPreference(previous)
  }

  if (loading) {
    return (
      <div
        data-testid='wallet-subscription-overview'
        className='min-w-0 px-2.5 py-2.5 sm:px-5 sm:py-4'
      >
        <Skeleton className='h-3.5 w-full' />
        <Skeleton className='mt-2 h-6 w-full sm:h-7' />
        <Skeleton className='mt-2 h-1.5 w-full' />
      </div>
    )
  }

  return (
    <>
      <button
        type='button'
        data-testid='wallet-subscription-overview'
        aria-haspopup='dialog'
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen(true)}
        className='hover:bg-muted/40 focus-visible:ring-ring min-w-0 px-2.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5 sm:py-4'
      >
        <div className='flex min-w-0 items-center gap-1.5 sm:gap-2.5'>
          <IconBadge tone='warning' size='stat'>
            <HugeiconsIcon icon={CrownIcon} />
          </IconBadge>
          <span className='text-muted-foreground truncate text-[11px] font-medium tracking-wider uppercase sm:text-xs'>
            {t('My Subscriptions')}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 text-[11px] font-medium',
              hasActive ? textColorMap.success : 'text-muted-foreground'
            )}
          >
            {activeSubscriptions.length} {t('active')}
          </span>
        </div>

        <div className='text-foreground mt-1.5 truncate text-sm font-bold sm:mt-2.5 sm:text-base'>
          {planTitle}
        </div>
        <div className='mt-2 flex items-center gap-2'>
          <Progress
            value={usagePercent}
            aria-label={`${t('Usage')} ${usagePercent}%`}
            className='min-w-0 flex-1'
          />
          <span className='text-muted-foreground shrink-0 font-mono text-xs tabular-nums'>
            {usagePercent}%
          </span>
        </div>
      </button>

      <Dialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={t('My Subscriptions')}
        description={
          hasActive ? planTitle : t('Subscribe to a plan for model access')
        }
        contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-lg'
        bodyClassName='flex flex-col gap-4'
      >
        {hasActive ? (
          <>
            <div className='flex min-w-0 items-start gap-3'>
              <IconBadge tone='warning' size='md'>
                <HugeiconsIcon icon={CrownIcon} />
              </IconBadge>
              <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <h3 className='truncate text-sm font-semibold'>
                    {planTitle}
                  </h3>
                  <StatusBadge
                    label={t('Active')}
                    variant='success'
                    copyable={false}
                  />
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t('Subscription')} #{subscription.id}
                </p>
              </div>
              <span className='text-muted-foreground shrink-0 text-xs'>
                {t('{{count}} days remaining', { count: remainingDays })}
              </span>
            </div>

            <div className='flex flex-col gap-2'>
              <div className='flex items-center justify-between gap-3 text-xs'>
                <span className='text-muted-foreground'>{t('Usage')}</span>
                <span className='font-mono font-medium tabular-nums'>
                  {totalAmount > 0
                    ? `${formatQuota(usedAmount)} / ${formatQuota(totalAmount)}`
                    : t('Unlimited')}
                </span>
              </div>
              <Progress
                value={usagePercent}
                aria-label={`${t('Usage')} ${usagePercent}%`}
              />
              <div className='text-muted-foreground flex items-center justify-between gap-3 text-xs'>
                <span>
                  {t('Remaining')} {formatQuota(remainingAmount)}
                </span>
                <span className='font-mono tabular-nums'>{usagePercent}%</span>
              </div>
            </div>

            <Separator />

            <dl className='flex flex-col gap-3 text-xs'>
              <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3'>
                <dt className='text-muted-foreground'>{t('Until')}</dt>
                <dd className='text-right font-medium'>
                  {new Date(subscription.end_time * 1000).toLocaleString()}
                </dd>
              </div>
              {subscription.next_reset_time ? (
                <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3'>
                  <dt className='text-muted-foreground'>{t('Next reset')}</dt>
                  <dd className='text-right font-medium'>
                    {new Date(
                      subscription.next_reset_time * 1000
                    ).toLocaleString()}
                  </dd>
                </div>
              ) : null}
              <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3'>
                <dt className='text-muted-foreground'>{t('Billing Mode')}</dt>
                <dd className='flex justify-end'>
                  <Select
                    items={[
                      {
                        value: 'subscription_first',
                        label: getBillingPreferenceLabel(
                          'subscription_first',
                          t
                        ),
                      },
                      {
                        value: 'wallet_first',
                        label: getBillingPreferenceLabel('wallet_first', t),
                      },
                      {
                        value: 'subscription_only',
                        label: getBillingPreferenceLabel(
                          'subscription_only',
                          t
                        ),
                      },
                      {
                        value: 'wallet_only',
                        label: getBillingPreferenceLabel('wallet_only', t),
                      },
                    ]}
                    value={displayedPreference}
                    onValueChange={(value) => {
                      if (value !== null) handlePreferenceChange(value)
                    }}
                  >
                    <SelectTrigger size='sm' className='max-w-44'>
                      <SelectValue>
                        {getBillingPreferenceLabel(displayedPreference, t)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        <SelectItem value='subscription_first'>
                          {getBillingPreferenceLabel('subscription_first', t)}
                        </SelectItem>
                        <SelectItem value='wallet_first'>
                          {getBillingPreferenceLabel('wallet_first', t)}
                        </SelectItem>
                        <SelectItem value='subscription_only'>
                          {getBillingPreferenceLabel('subscription_only', t)}
                        </SelectItem>
                        <SelectItem value='wallet_only'>
                          {getBillingPreferenceLabel('wallet_only', t)}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('Subscribe to a plan for model access')}
          </p>
        )}

        <div className='flex justify-end'>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={refreshing}
                  onClick={handleRefresh}
                />
              }
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                data-icon='inline-start'
                className={cn(refreshing && 'animate-spin')}
              />
              {t('Refresh')}
            </TooltipTrigger>
            <TooltipContent>{t('Refresh')}</TooltipContent>
          </Tooltip>
        </div>
      </Dialog>
    </>
  )
}
