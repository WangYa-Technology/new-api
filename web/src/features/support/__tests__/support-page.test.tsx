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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { Support } from '..'
import { getSupportLinks } from '../api'

vi.mock('../api', () => ({ getSupportLinks: vi.fn() }))

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: (name: string) => <svg data-icon-name={name} />,
}))

function renderSupport() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <Support />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Support', () => {
  test('renders configured categories in a responsive link grid with secure external links', async () => {
    vi.mocked(getSupportLinks).mockResolvedValue({
      success: true,
      message: '',
      data: [
        {
          id: 'community',
          title: 'Community',
          description: 'Meet the team',
          items: [
            {
              id: 'github',
              title: 'GitHub',
              label: 'Project repository',
              description: 'Source and issues',
              url: 'https://github.com/QuantumNous/new-api',
              icon: 'github',
            },
          ],
        },
      ],
    })

    renderSupport()

    expect(
      await screen.findByRole('heading', { name: 'Community' })
    ).toBeVisible()
    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByTestId('support-link-grid')).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-3'
    )
  })

  test('shows an empty state when the configuration is absent', async () => {
    vi.mocked(getSupportLinks).mockResolvedValue({
      success: true,
      message: '',
      data: [],
    })

    renderSupport()

    expect(
      await screen.findByText('No support resources available')
    ).toBeVisible()
  })
})
