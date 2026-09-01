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
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'

import { Footer } from '../footer'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={props.to} className={props.className}>
      {props.children}
    </a>
  ),
}))

vi.mock('@/hooks/use-status', () => ({ useStatus: vi.fn() }))
vi.mock('@/hooks/use-system-config', () => ({ useSystemConfig: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('Footer', () => {
  test('renders configured left links and right columns from public status', () => {
    vi.mocked(useSystemConfig).mockReturnValue({
      systemName: 'Gateway',
      logo: '/logo.png',
      footerHtml: '',
    } as ReturnType<typeof useSystemConfig>)
    vi.mocked(useStatus).mockReturnValue({
      status: {
        footer_config: {
          description: 'Custom gateway description',
          socialLinks: [
            {
              id: 'community',
              label: 'Community portal',
              url: 'https://example.com/community',
              icon: 'discord',
            },
          ],
          columns: [
            {
              id: 'resources',
              title: 'Resources',
              links: [
                {
                  id: 'status',
                  label: 'Service status',
                  url: '/status',
                },
              ],
            },
          ],
        },
      },
      loading: false,
      error: null,
    } as ReturnType<typeof useStatus>)

    render(<Footer />)

    expect(screen.getByText('Custom gateway description')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Community portal' })
    ).toHaveAttribute('href', 'https://example.com/community')
    expect(screen.getByText('Resources')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Service status' })
    ).toHaveAttribute('href', '/status')
  })
})
