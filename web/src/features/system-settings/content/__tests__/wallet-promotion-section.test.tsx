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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useUpdateOption } from '../../hooks/use-update-option'
import { WalletPromotionSection } from '../wallet-promotion-section'

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('WalletPromotionSection', () => {
  test('saves the enabled wallet promotion as a complete configuration', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ success: true, message: '' })
    vi.mocked(useUpdateOption).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateOption>)
    const user = userEvent.setup()

    render(<WalletPromotionSection data='' />)

    await user.click(screen.getByRole('switch', { name: 'Show promotion' }))
    await user.type(screen.getByLabelText('Promotion title'), 'Welcome bonus')
    await user.type(
      screen.getByLabelText('Promotion description'),
      'New accounts receive an extra credit.'
    )
    await user.type(screen.getByLabelText('Action label'), 'Learn more')
    await user.type(screen.getByLabelText('Action URL'), '/offers/welcome')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'console_setting.wallet_promotion',
      value: JSON.stringify({
        enabled: true,
        title: 'Welcome bonus',
        description: 'New accounts receive an extra credit.',
        actionLabel: 'Learn more',
        actionUrl: '/offers/welcome',
        imageUrl: '',
      }),
    })
  })
})
