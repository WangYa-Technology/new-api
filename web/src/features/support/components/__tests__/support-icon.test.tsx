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
import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { SupportIcon } from '../support-icon'

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: (name: string) =>
    name === 'OpenAI' ? (
      <svg data-testid='openai-icon' />
    ) : (
      <span>{name[0]}</span>
    ),
}))

describe('SupportIcon', () => {
  test('renders a configured @lobehub/icons key', () => {
    const { container } = render(<SupportIcon name='OpenAI' />)

    expect(container.querySelector('svg')).not.toBeNull()
  })

  test('falls back without throwing when a configured key is unavailable', () => {
    const { container } = render(<SupportIcon name='UnavailableIcon' />)

    expect(container).toHaveTextContent('U')
  })

  test('renders an uploaded image as a decorative icon', () => {
    const icon = 'data:image/png;base64,iVBORw0KGgo='
    const { container } = render(<SupportIcon name={icon} />)

    expect(container.querySelector('img')).toHaveAttribute('src', icon)
    expect(container.querySelector('img')).toHaveAttribute('alt', '')
  })
})
