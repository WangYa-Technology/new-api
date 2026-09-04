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
import { describe, expect, test, vi } from 'vitest'

import type { TopupInfo } from '../../types'
import { RedemptionCodeCard } from '../redemption-code-card'

const topupInfo: TopupInfo = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  pay_methods: [],
  min_topup: 1,
  stripe_min_topup: 1,
  amount_options: [],
  discount: {},
  enable_redemption: true,
}

describe('redemption code card', () => {
  test('shows the code form on the wallet page and forwards redemption', async () => {
    const onRedemptionCodeChange = vi.fn()
    const onRedeem = vi.fn()
    const user = userEvent.setup()

    render(
      <RedemptionCodeCard
        topupInfo={topupInfo}
        redemptionCode=''
        onRedemptionCodeChange={onRedemptionCodeChange}
        onRedeem={onRedeem}
        redeeming={false}
        topupLink='https://example.com/codes'
      />
    )

    const input = screen.getByRole('textbox', { name: 'Have a Code?' })
    expect(screen.getByRole('link', { name: /Get one here/ })).toHaveAttribute(
      'href',
      'https://example.com/codes'
    )

    await user.type(input, 'WELCOME')
    expect(onRedemptionCodeChange).toHaveBeenLastCalledWith('E')

    await user.click(screen.getByRole('button', { name: 'Redeem' }))
    expect(onRedeem).toHaveBeenCalledOnce()
  })

  test('shows the compliance notice instead of an input when redemption is disabled', () => {
    render(
      <RedemptionCodeCard
        topupInfo={{ ...topupInfo, enable_redemption: false }}
        redemptionCode=''
        onRedemptionCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        redeeming={false}
      />
    )

    expect(
      screen.getByText(
        'Redemption codes are disabled until the administrator confirms compliance terms.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText('Enter your redemption code')
    ).not.toBeInTheDocument()
  })
})
