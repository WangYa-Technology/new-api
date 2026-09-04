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
import { describe, expect, test, vi } from 'vitest'

import {
  getPublicPlans,
  getSelfSubscriptionFull,
} from '@/features/subscriptions/api'
import type { PlanRecord } from '@/features/subscriptions/types'

import { SubscriptionPlansCard } from '../subscription-plans-card'

vi.mock('@/features/subscriptions/api', () => ({
  getPublicPlans: vi.fn(),
  getSelfSubscriptionFull: vi.fn(),
  updateBillingPreference: vi.fn(),
}))

const subtitle =
  'Includes priority model access, monthly quota renewals, and guided onboarding for your whole team.'

const plan: PlanRecord = {
  plan: {
    id: 1,
    title: 'Professional',
    subtitle,
    price_amount: 20,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'never',
    enabled: true,
    sort_order: 0,
    allow_balance_pay: true,
    allow_wallet_overflow: true,
    max_purchase_per_user: 0,
    total_amount: 100000,
  },
}

describe('subscription plans card', () => {
  test('keeps a long plan subtitle visible as a prominent, wrapping explanation', async () => {
    vi.mocked(getPublicPlans).mockResolvedValue({
      success: true,
      data: [plan],
    })
    vi.mocked(getSelfSubscriptionFull).mockResolvedValue({
      success: true,
      data: {
        subscriptions: [],
        all_subscriptions: [],
        billing_preference: 'wallet_first',
      },
    })

    render(<SubscriptionPlansCard embedded topupInfo={null} />)

    const description = await screen.findByText(subtitle)
    const callout = screen.getByRole('note')

    expect(description).toBeVisible()
    expect(description).not.toHaveClass('truncate')
    expect(description).toHaveClass('break-words', 'text-sm', 'leading-5')
    expect(callout).toHaveClass(
      'border-l-2',
      'border-primary/50',
      'bg-primary/5'
    )
  })

  test('can render purchase plans without repeating the subscription overview', async () => {
    vi.mocked(getPublicPlans).mockResolvedValue({
      success: true,
      data: [plan],
    })
    vi.mocked(getSelfSubscriptionFull).mockResolvedValue({
      success: true,
      data: {
        subscriptions: [],
        all_subscriptions: [],
        billing_preference: 'wallet_first',
      },
    })

    render(
      <SubscriptionPlansCard embedded showOverview={false} topupInfo={null} />
    )

    expect(await screen.findByText('Professional')).toBeVisible()
    expect(screen.queryByText('My Subscriptions')).not.toBeInTheDocument()
  })
})
