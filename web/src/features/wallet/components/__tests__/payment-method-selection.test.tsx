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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'

import type { PaymentMethod, TopupInfo } from '../../types'
import { RechargeFormCard } from '../recharge-form-card'

const paymentMethods: PaymentMethod[] = [
  {
    name: 'Bank transfer',
    type: 'bank-transfer',
    icon: 'https://example.com/bank-transfer.svg',
  },
  {
    name: 'Card payment',
    type: 'card-payment',
    icon: 'https://example.com/card-payment.svg',
  },
]

const topupInfo: TopupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  pay_methods: paymentMethods,
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [],
  discount: {},
  enable_redemption: false,
}

function PaymentMethodFixture() {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    paymentMethods[0]
  )

  return (
    <RechargeFormCard
      embedded
      topupInfo={topupInfo}
      presetAmounts={[]}
      selectedPreset={null}
      onSelectPreset={vi.fn()}
      topupAmount={10}
      onTopupAmountChange={vi.fn()}
      paymentAmount={10}
      calculating
      onPaymentMethodSelect={setSelectedPaymentMethod}
      selectedPaymentMethod={selectedPaymentMethod}
      selectedWaffoMethodIndex={null}
      redemptionCode=''
      onRedemptionCodeChange={vi.fn()}
      onRedeem={vi.fn()}
      redeeming={false}
      showRedemption={false}
    />
  )
}

describe('recharge payment method selection', () => {
  test('keeps payment icons visible and allows selection while its amount recalculates', async () => {
    const user = userEvent.setup()

    render(<PaymentMethodFixture />)

    const bankTransfer = screen.getByRole('radio', { name: 'Bank transfer' })
    const cardPayment = screen.getByRole('radio', { name: 'Card payment' })

    expect(screen.getByRole('img', { name: 'Bank transfer' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Card payment' })).toBeVisible()
    expect(cardPayment).toBeEnabled()

    await user.click(cardPayment)

    expect(bankTransfer).toHaveAttribute('aria-checked', 'false')
    expect(cardPayment).toHaveAttribute('aria-checked', 'true')
    expect(cardPayment).toHaveClass('border-primary', 'ring-1')
    expect(screen.getByRole('img', { name: 'Bank transfer' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Card payment' })).toBeVisible()
  })
})
