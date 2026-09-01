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
import { render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import type { TopupInfo } from '../../types'
import { RechargeFormCard } from '../recharge-form-card'

const topupInfo: TopupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  pay_methods: [{ name: '本地测试支付', type: 'testpay' }],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [10, 50],
  discount: { 10: 0.95, 50: 0.05 },
  enable_redemption: false,
}

describe('preset amount display', () => {
  beforeAll(async () => {
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
    await i18next.changeLanguage('zh')
  })

  afterAll(async () => {
    await i18next.changeLanguage('en')
  })

  test('localizes discount pricing and keeps it readable in a narrow panel', () => {
    render(
      <RechargeFormCard
        topupInfo={topupInfo}
        presetAmounts={[
          { value: 10, discount: 0.95 },
          { value: 50, discount: 0.05 },
        ]}
        selectedPreset={null}
        onSelectPreset={vi.fn()}
        topupAmount={1}
        onTopupAmountChange={vi.fn()}
        paymentAmount={1}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
      />
    )

    const discountedCard = screen.getByRole('button', { name: /^\$50 / })
    expect(within(discountedCard).getByText('优惠 95%')).toBeInTheDocument()
    expect(within(discountedCard).getByText('实付 $2.5')).toBeInTheDocument()
    expect(within(discountedCard).getAllByText('$50')).toHaveLength(2)
    expect(discountedCard).toHaveClass('h-[76px]')
    expect(discountedCard.parentElement).toHaveClass('sm:grid-cols-3')
    expect(discountedCard.parentElement).not.toHaveClass('md:grid-cols-4')
    expect(screen.getByLabelText('自定义金额')).toHaveAttribute(
      'placeholder',
      '最低 1'
    )
    expect(discountedCard).not.toHaveTextContent(/Pay|Save|OFF/)
  })

  test('highlights discounts and keeps preset borders visible', () => {
    render(
      <RechargeFormCard
        topupInfo={topupInfo}
        presetAmounts={[
          { value: 10, discount: 0.95 },
          { value: 50, discount: 0.05 },
        ]}
        selectedPreset={50}
        onSelectPreset={vi.fn()}
        topupAmount={50}
        onTopupAmountChange={vi.fn()}
        paymentAmount={2.5}
        calculating={false}
        onPaymentMethodSelect={vi.fn()}
        paymentLoading={null}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
      />
    )

    const regularCard = screen.getByRole('button', { name: /^\$10 / })
    const selectedCard = screen.getByRole('button', { name: /^\$50 / })
    const discountBadge = within(selectedCard).getByText('优惠 95%')

    expect(discountBadge).toHaveClass(
      'border-success/30',
      'bg-success/10',
      'text-success'
    )
    expect(regularCard).toHaveClass('border-border', 'shadow-xs')
    expect(selectedCard).toHaveClass(
      'border-primary',
      'ring-1',
      'ring-primary/20'
    )
  })
})
