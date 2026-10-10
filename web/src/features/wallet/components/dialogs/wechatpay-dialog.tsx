import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getWechatPayOrderStatus, type WechatPayCheckout } from '../../api'
import { formatCurrency } from '../../lib/format'

export function WechatPayDialog(props: {
  checkout: WechatPayCheckout | null
  onClose: () => void
  onPaid: () => void
}) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  const checkout = props.checkout
  const onPaid = props.onPaid
  const expired = !!checkout && now >= checkout.expires_at * 1000
  const query = useQuery({
    queryKey: ['wechatpay-order', checkout?.trade_no],
    enabled: !!checkout,
    queryFn: async () =>
      requireServerSuccess(
        await getWechatPayOrderStatus(checkout?.trade_no || '')
      ).data,
    retry: false,
    refetchInterval: (q) =>
      ['success', 'expired'].includes(q.state.data?.status || '')
        ? false
        : 5000,
  })
  const paid = query.data?.status === 'success'
  useEffect(() => {
    if (!checkout) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [checkout])
  useEffect(() => {
    if (paid) onPaid()
  }, [paid, onPaid])
  return (
    <Dialog
      open={!!checkout}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('WeChat Pay')}
      description={t(
        'Scan with WeChat to pay. Your balance updates after payment is verified.'
      )}
      contentClassName='sm:max-w-md'
    >
      <div className='flex flex-col items-center gap-4'>
        <p className='text-2xl font-semibold'>
          CNY {formatCurrency(checkout?.amount || 0)}
        </p>
        {paid && <p role='status'>{t('Payment successful')}</p>}
        {!paid && (expired || query.data?.status === 'expired') && (
          <p role='status'>
            {t('Payment QR code expired. Please create a new order.')}
          </p>
        )}
        {checkout && !paid && !expired && query.data?.status !== 'expired' && (
          <div className='rounded-lg bg-white p-4'>
            <QRCodeSVG
              value={checkout.code_url}
              size={224}
              title={t('WeChat Pay QR code')}
            />
          </div>
        )}
        {query.isError && (
          <p role='alert'>
            {t(
              'Unable to check payment status. Please retry or check order history.'
            )}
          </p>
        )}
        {!paid && (
          <Button
            type='button'
            variant='outline'
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t('Check payment status')}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
