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
import {
  ArrowRight,
  CalendarClock,
  Crown,
  Loader2,
  Package,
  WalletCards,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { GroupBadge } from '@/components/group-badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { getPaymentIcon } from '@/features/wallet/lib'
import type { PaymentMethod } from '@/features/wallet/types'
import { useSystemConfig } from '@/hooks/use-system-config'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { formatQuota } from '@/lib/format'
import { DEFAULT_CURRENCY_CONFIG } from '@/stores/system-config-store'

import {
  paySubscriptionStripe,
  paySubscriptionCreem,
  paySubscriptionEpay,
  paySubscriptionWaffoPancake,
  paySubscriptionBalance,
} from '../../api'
import { formatDuration, formatResetPeriod } from '../../lib'
import type { PlanRecord } from '../../types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: PlanRecord | null
  enableStripe?: boolean
  enableCreem?: boolean
  enableWaffoPancake?: boolean
  enableOnlineTopUp?: boolean
  epayMethods?: PaymentMethod[]
  purchaseLimit?: number
  purchaseCount?: number
  userQuota?: number
  onPurchaseSuccess?: () => void | Promise<void>
}

export function SubscriptionPurchaseDialog(props: Props) {
  const { t } = useTranslation()
  const { currency } = useSystemConfig()
  const [paying, setPaying] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('')

  useEffect(() => {
    if (!props.open) {
      setSelectedPaymentMethod('')
      return
    }
    if (props.plan?.plan?.allow_balance_pay !== false) {
      setSelectedPaymentMethod('balance')
    } else if (props.enableOnlineTopUp && props.epayMethods?.[0]) {
      setSelectedPaymentMethod(`epay:${props.epayMethods[0].type}`)
    } else if (props.enableStripe && props.plan?.plan?.stripe_price_id) {
      setSelectedPaymentMethod('stripe')
    } else if (props.enableCreem && props.plan?.plan?.creem_product_id) {
      setSelectedPaymentMethod('creem')
    } else if (
      props.enableWaffoPancake &&
      props.plan?.plan?.waffo_pancake_product_id
    ) {
      setSelectedPaymentMethod('waffo_pancake')
    }
  }, [
    props.open,
    props.epayMethods,
    props.enableOnlineTopUp,
    props.enableStripe,
    props.enableCreem,
    props.enableWaffoPancake,
    props.plan,
  ])

  const plan = props.plan?.plan
  if (!plan) return null

  const hasStripe = props.enableStripe && !!plan.stripe_price_id
  const hasCreem = props.enableCreem && !!plan.creem_product_id
  const hasWaffoPancake =
    props.enableWaffoPancake && !!plan.waffo_pancake_product_id
  const hasEpay =
    props.enableOnlineTopUp && (props.epayMethods || []).length > 0
  const hasAnyPayment = hasStripe || hasCreem || hasWaffoPancake || hasEpay
  const selectedEpayMethod = selectedPaymentMethod.startsWith('epay:')
    ? selectedPaymentMethod.slice(5)
    : ''
  const totalAmount = Number(plan.total_amount || 0)
  const price = formatBillingCurrencyFromUSD(Number(plan.price_amount || 0))
  const quotaPerUnit =
    currency?.quotaPerUnit && currency.quotaPerUnit > 0
      ? currency.quotaPerUnit
      : DEFAULT_CURRENCY_CONFIG.quotaPerUnit
  const balanceCost = Math.max(
    0,
    Math.ceil(Number(plan.price_amount || 0) * quotaPerUnit)
  )
  const userQuota = Math.max(0, Number(props.userQuota || 0))
  const allowBalancePay = plan.allow_balance_pay !== false
  const insufficientBalance = userQuota < balanceCost
  const limitReached =
    (props.purchaseLimit || 0) > 0 &&
    (props.purchaseCount || 0) >= (props.purchaseLimit || 0)

  const handlePaymentContinue = () => {
    if (limitReached || paying || !selectedPaymentMethod) return
    switch (selectedPaymentMethod) {
      case 'balance':
        void handlePayBalance()
        break
      case 'stripe':
        void handlePayStripe()
        break
      case 'creem':
        void handlePayCreem()
        break
      case 'waffo_pancake':
        void handlePayWaffoPancake()
        break
      default:
        if (selectedPaymentMethod.startsWith('epay:')) {
          void handlePayEpay()
        }
    }
  }

  const handlePayStripe = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionStripe({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.pay_link) {
        window.open(res.data.pay_link, '_blank')
        toast.success(t('Payment page opened'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const handlePayCreem = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionCreem({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.checkout_url) {
        window.open(res.data.checkout_url, '_blank')
        toast.success(t('Payment page opened'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  // In-tab redirect (not window.open) — user-gesture context is lost
  // across the await, so a popup would be blocked. Same as the wallet hook.
  const handlePayWaffoPancake = async () => {
    setPaying(true)
    try {
      const res = await paySubscriptionWaffoPancake({ plan_id: plan.id })
      if (res.message === 'success' && res.data?.checkout_url) {
        toast.success(t('Redirecting to payment page...'))
        window.location.href = res.data.checkout_url
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const isSafari =
    typeof navigator !== 'undefined' &&
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

  const handlePayEpay = async () => {
    if (!selectedEpayMethod) {
      toast.error(t('Please select a payment method'))
      return
    }
    setPaying(true)
    try {
      const res = await paySubscriptionEpay({
        plan_id: plan.id,
        payment_method: selectedEpayMethod,
      })
      if (res.message === 'success' && res.url) {
        const form = document.createElement('form')
        form.action = res.url
        form.method = 'POST'
        if (!isSafari) {
          form.target = '_blank'
        }
        Object.entries(res.data || {}).forEach(([key, value]) => {
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = key
          input.value = String(value)
          form.appendChild(input)
        })
        document.body.appendChild(form)
        form.submit()
        document.body.removeChild(form)
        toast.success(t('Payment initiated'))
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  const handlePayBalance = async () => {
    if (!allowBalancePay) {
      toast.error(t('This plan does not allow balance redemption'))
      return
    }
    setPaying(true)
    try {
      const res = await paySubscriptionBalance({ plan_id: plan.id })
      if (res.success) {
        toast.success(t('Subscription purchased successfully'))
        void props.onPurchaseSuccess?.()
        props.onOpenChange(false)
      } else {
        toast.error(
          res.message && res.message !== 'success'
            ? res.message
            : t('Payment request failed')
        )
      }
    } catch {
      toast.error(t('Payment request failed'))
    } finally {
      setPaying(false)
    }
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        <>
          <Crown className='h-5 w-5' />
          {t('Purchase Subscription')}
        </>
      }
      contentClassName='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-xl'
      titleClassName='flex items-center gap-2'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <div className='space-y-3 sm:space-y-4'>
        {hasAnyPayment || allowBalancePay ? (
          <div className='space-y-2.5 sm:space-y-3'>
            <p className='text-muted-foreground text-xs font-medium tracking-wider uppercase'>
              {t('Payment Method')}
            </p>
            <div
              role='radiogroup'
              aria-label={t('Payment Method')}
              className='bg-muted/20 flex min-w-0 gap-1 overflow-x-auto rounded-xl border p-1'
            >
              {allowBalancePay && (
                <Button
                  type='button'
                  variant='ghost'
                  role='radio'
                  aria-checked={selectedPaymentMethod === 'balance'}
                  onClick={() => setSelectedPaymentMethod('balance')}
                  disabled={paying || limitReached}
                  className={`min-w-[128px] flex-1 gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    selectedPaymentMethod === 'balance'
                      ? 'border-primary bg-primary/10 text-primary ring-primary/20 shadow-xs ring-1'
                      : 'bg-background hover:border-border hover:bg-background border-transparent'
                  }`}
                >
                  <WalletCards className='h-4 w-4' />
                  {t('Balance')}
                </Button>
              )}
              {hasEpay &&
                props.epayMethods?.map((method) => {
                  const value = `epay:${method.type}`
                  const selected = selectedPaymentMethod === value
                  return (
                    <Button
                      key={value}
                      type='button'
                      variant='ghost'
                      role='radio'
                      aria-checked={selected}
                      onClick={() => setSelectedPaymentMethod(value)}
                      disabled={paying || limitReached}
                      className={`min-w-[128px] flex-1 gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                        selected
                          ? 'border-primary bg-primary/10 text-primary ring-primary/20 shadow-xs ring-1'
                          : 'bg-background hover:border-border hover:bg-background border-transparent'
                      }`}
                    >
                      {getPaymentIcon(
                        method.type,
                        'h-4 w-4',
                        method.icon,
                        method.name
                      )}
                      <span className='truncate'>
                        {method.name || method.type}
                      </span>
                    </Button>
                  )
                })}
              {hasStripe && (
                <Button
                  type='button'
                  variant='ghost'
                  role='radio'
                  aria-checked={selectedPaymentMethod === 'stripe'}
                  onClick={() => setSelectedPaymentMethod('stripe')}
                  disabled={paying || limitReached}
                  className={`min-w-[112px] flex-1 gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    selectedPaymentMethod === 'stripe'
                      ? 'border-primary bg-primary/10 text-primary ring-primary/20 shadow-xs ring-1'
                      : 'bg-background hover:border-border hover:bg-background border-transparent'
                  }`}
                >
                  {getPaymentIcon('stripe', 'h-4 w-4')}
                  Stripe
                </Button>
              )}
              {hasCreem && (
                <Button
                  type='button'
                  variant='ghost'
                  role='radio'
                  aria-checked={selectedPaymentMethod === 'creem'}
                  onClick={() => setSelectedPaymentMethod('creem')}
                  disabled={paying || limitReached}
                  className={`min-w-[112px] flex-1 gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    selectedPaymentMethod === 'creem'
                      ? 'border-primary bg-primary/10 text-primary ring-primary/20 shadow-xs ring-1'
                      : 'bg-background hover:border-border hover:bg-background border-transparent'
                  }`}
                >
                  {getPaymentIcon('creem', 'h-4 w-4')}
                  Creem
                </Button>
              )}
              {hasWaffoPancake && (
                <Button
                  type='button'
                  variant='ghost'
                  role='radio'
                  aria-checked={selectedPaymentMethod === 'waffo_pancake'}
                  onClick={() => setSelectedPaymentMethod('waffo_pancake')}
                  disabled={paying || limitReached}
                  className={`min-w-[150px] flex-1 gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                    selectedPaymentMethod === 'waffo_pancake'
                      ? 'border-primary bg-primary/10 text-primary ring-primary/20 shadow-xs ring-1'
                      : 'bg-background hover:border-border hover:bg-background border-transparent'
                  }`}
                >
                  {getPaymentIcon('waffo_pancake', 'h-4 w-4')}
                  Waffo Pancake
                </Button>
              )}
            </div>
            {selectedPaymentMethod === 'balance' && (
              <div className='bg-muted/20 flex flex-col gap-2 rounded-lg border p-3'>
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-muted-foreground'>{t('Required')}</span>
                  <span>{formatQuota(balanceCost)}</span>
                </div>
                <div className='flex items-center justify-between gap-2 text-xs'>
                  <span className='text-muted-foreground'>
                    {t('Available')}
                  </span>
                  <span>{formatQuota(userQuota)}</span>
                </div>
                {insufficientBalance && (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {t('Insufficient balance')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        ) : null}

        <div className='bg-muted/50 space-y-2.5 rounded-lg border p-3 sm:space-y-3 sm:p-4'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Plan Name')}
            </span>
            <span className='max-w-[200px] truncate text-sm font-medium'>
              {plan.title}
            </span>
          </div>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Validity Period')}
            </span>
            <span className='flex items-center gap-1 text-sm'>
              <CalendarClock className='h-3.5 w-3.5' />
              {formatDuration(plan, t)}
            </span>
          </div>
          {formatResetPeriod(plan, t) !== t('No Reset') && (
            <div className='flex justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('Reset Period')}
              </span>
              <span className='text-sm'>{formatResetPeriod(plan, t)}</span>
            </div>
          )}
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Plan Quota')}
            </span>
            <span className='flex items-center gap-1 text-sm'>
              <Package className='h-3.5 w-3.5' />
              {totalAmount > 0 ? formatQuota(totalAmount) : t('Unlimited')}
            </span>
          </div>
          {plan.upgrade_group && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground text-sm'>
                {t('Upgrade Group')}
              </span>
              <GroupBadge group={plan.upgrade_group} />
            </div>
          )}
          <Separator />
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>{t('Amount Due')}</span>
            <span className='text-primary text-lg font-bold'>{price}</span>
          </div>
        </div>

        {limitReached && (
          <Alert variant='destructive'>
            <AlertDescription>
              {t('Purchase limit reached')} ({props.purchaseCount}/
              {props.purchaseLimit})
            </AlertDescription>
          </Alert>
        )}

        {!hasAnyPayment && !allowBalancePay && (
          <Alert>
            <AlertDescription>
              {t('No payment methods available. Please contact administrator.')}
            </AlertDescription>
          </Alert>
        )}

        {(hasAnyPayment || allowBalancePay) && (
          <Button
            type='button'
            className='h-11 w-full gap-2 text-sm font-semibold sm:h-12'
            onClick={handlePaymentContinue}
            disabled={
              paying ||
              limitReached ||
              !selectedPaymentMethod ||
              (selectedPaymentMethod === 'balance' &&
                (!allowBalancePay || insufficientBalance))
            }
          >
            {paying && <Loader2 className='h-4 w-4 animate-spin' />}
            {t('Continue')}
            {!paying && <ArrowRight className='h-4 w-4' />}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
