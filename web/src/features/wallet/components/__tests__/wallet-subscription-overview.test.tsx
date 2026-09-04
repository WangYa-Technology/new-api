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
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'

import {
  getPublicPlans,
  getSelfSubscriptionFull,
} from '@/features/subscriptions/api'
import type {
  PlanRecord,
  UserSubscriptionRecord,
} from '@/features/subscriptions/types'

import { WalletSubscriptionOverview } from '../wallet-subscription-overview'

vi.mock('@/features/subscriptions/api', () => ({
  getPublicPlans: vi.fn(),
  getSelfSubscriptionFull: vi.fn(),
  updateBillingPreference: vi.fn(),
}))

const plan: PlanRecord = {
  plan: {
    id: 2,
    title: 'Professional',
    price_amount: 30,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    quota_reset_period: 'monthly',
    enabled: true,
    sort_order: 0,
    allow_balance_pay: true,
    allow_wallet_overflow: false,
    max_purchase_per_user: 0,
    total_amount: 400000,
  },
}

const activeSubscription: UserSubscriptionRecord = {
  subscription: {
    id: 2,
    user_id: 1,
    plan_id: 2,
    status: 'active',
    start_time: 1788423533,
    end_time: 1791015533,
    amount_total: 400000,
    amount_used: 100000,
    next_reset_time: 1790841600,
  },
}

describe('wallet subscription overview', () => {
  test('shows a compact active subscription summary and opens details on click', async () => {
    const user = userEvent.setup()
    vi.mocked(getPublicPlans).mockResolvedValue({
      success: true,
      data: [plan],
    })
    vi.mocked(getSelfSubscriptionFull).mockResolvedValue({
      success: true,
      data: {
        subscriptions: [activeSubscription],
        all_subscriptions: [activeSubscription],
        billing_preference: 'subscription_first',
      },
    })

    render(<WalletSubscriptionOverview />)

    const summary = await screen.findByRole('button', {
      name: /My Subscriptions/,
    })
    expect(within(summary).getByText('1 active')).toBeVisible()
    expect(within(summary).getByText('Professional')).toBeVisible()
    expect(within(summary).getByText('25%')).toBeVisible()
    expect(screen.queryByText('Next reset')).not.toBeInTheDocument()

    await user.click(summary)

    const details = await screen.findByRole('dialog', {
      name: 'My Subscriptions',
    })
    expect(
      within(details).getByRole('heading', { name: 'Professional' })
    ).toBeVisible()
    expect(within(details).getByText(/Subscription #2/)).toBeVisible()
    expect(within(details).getByText('Active')).toBeVisible()
    expect(within(details).getByText('Next reset')).toBeVisible()
  })
})
