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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { useUpdateOption } from '../../hooks/use-update-option'
import { SupportSection } from '../support-section'

vi.mock('../../hooks/use-update-option', () => ({
  useUpdateOption: vi.fn(),
}))

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: (name: string) => <svg data-icon-name={name} />,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('SupportSection', () => {
  test('adds a category and saves the complete support configuration', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ success: true, message: '' })
    vi.mocked(useUpdateOption).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateOption>)
    const user = userEvent.setup()

    render(<SupportSection data='[]' />)
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(
      within(dialog).getByLabelText('Category title'),
      'Community'
    )
    await user.type(
      within(dialog).getByLabelText('Category description'),
      'Talk with the team'
    )
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('heading', { name: 'Community' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    expect(mutateAsync).toHaveBeenCalledOnce()
    const request = mutateAsync.mock.calls[0][0]
    expect(request.key).toBe('console_setting.support_links')
    expect(JSON.parse(request.value)).toMatchObject([
      {
        title: 'Community',
        description: 'Talk with the team',
        items: [],
      },
    ])
  })

  test('only offers image upload and requires an uploaded icon', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ success: true, message: '' })
    vi.mocked(useUpdateOption).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateOption>)
    const user = userEvent.setup()

    render(
      <SupportSection
        data={JSON.stringify([
          {
            id: 'community',
            title: 'Community',
            description: '',
            items: [],
          },
        ])}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Add link' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Link title'), 'OpenAI')
    await user.type(
      within(dialog).getByLabelText('Destination URL'),
      'https://example.com/openai'
    )
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument()
    expect(
      within(dialog).queryByPlaceholderText('OpenAI, Anthropic, etc.')
    ).not.toBeInTheDocument()
    expect(
      within(dialog).getByLabelText('Icon', { selector: 'input[type=file]' })
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(
      await within(dialog).findByText('Please upload an icon')
    ).toBeVisible()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  test('uploads, previews, and saves a custom support icon', async () => {
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ success: true, message: '' })
    vi.mocked(useUpdateOption).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateOption>)
    const user = userEvent.setup()

    render(
      <SupportSection
        data={JSON.stringify([
          {
            id: 'community',
            title: 'Community',
            description: '',
            items: [],
          },
        ])}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Add link' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Link title'), 'Custom')
    await user.type(
      within(dialog).getByLabelText('Destination URL'),
      'https://example.com/custom'
    )
    const iconFile = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'support.png',
      { type: 'image/png' }
    )
    await user.upload(
      within(dialog).getByLabelText('Icon', { selector: 'input[type=file]' }),
      iconFile
    )

    await waitFor(() => {
      expect(
        within(dialog).getByTestId('support-icon-preview').querySelector('img')
      ).not.toBeNull()
    })
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Save settings' }))

    const request = mutateAsync.mock.calls[0][0]
    expect(JSON.parse(request.value)[0].items[0].icon).toMatch(
      /^data:image\/png;base64,/
    )
  })
})
