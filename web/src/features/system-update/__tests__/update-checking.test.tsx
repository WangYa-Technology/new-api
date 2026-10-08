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
import {
  focusManager,
  onlineManager,
  QueryClientProvider,
  type QueryClient,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { UpdateCheckerSection } from '@/features/system-settings/maintenance/update-checker-section'
import { api } from '@/lib/api'
import { createAppQueryClient } from '@/lib/query-client'
import { ROLE } from '@/lib/roles'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { SystemUpdateAction } from '../system-update-action'

const fetchMock = vi.fn<typeof fetch>()
let client: QueryClient

function Wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'admin', role: ROLE.ADMIN })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  client = createAppQueryClient()
  client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.35' })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { version: 'v1.0.0-rc.35' } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  useAuthStore.getState().auth.reset()
  localStorage.clear()
  focusManager.setFocused(undefined)
  onlineManager.setOnline(true)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test.each([null, ROLE.USER])(
  'hides the administrator version entry for role %s',
  (role) => {
    useAuthStore
      .getState()
      .auth.setUser(role === null ? null : { id: 2, username: 'user', role })
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test.each([ROLE.ADMIN, ROLE.SUPER_ADMIN])(
  'shows only current version details for administrator role %s',
  async (role) => {
    useAuthStore.getState().auth.setUser({ id: 1, username: 'admin', role })
    const user = userEvent.setup()
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    const trigger = screen.getByRole('button', {
      name: 'Current version: v1.0.0-rc.35',
    })
    trigger.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', {
      name: 'Current version',
    })
    expect(within(dialog).getByText('v1.0.0-rc.35')).toBeVisible()
    expect(within(dialog).queryByText('Latest version')).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: 'Check again' })
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
    expect(
      dialog.querySelector(
        'a[href="https://github.com/QuantumNous/new-api/releases/tag/v1.0.0-rc.36"]'
      )
    ).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(trigger).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test.each(['', 'v0.0.0', '0.0.0', '   '])(
  'shows an unknown version for unavailable server version %s',
  async (version) => {
    client.setQueryData(STATUS_QUERY_KEY, { version })
    render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
    await userEvent.click(
      screen.getByRole('button', { name: 'Current version: Unknown version' })
    )
    expect(
      within(screen.getByRole('dialog')).getByText('Unknown version')
    ).toBeVisible()
    expect(fetchMock).not.toHaveBeenCalled()
  }
)

test('maintenance displays only the current version and follows status changes', async () => {
  render(<UpdateCheckerSection currentVersion='v1.0.0-rc.34' />, {
    wrapper: Wrapper,
  })
  expect(screen.getByText('v1.0.0-rc.35')).toBeVisible()
  expect(screen.queryByText('Uptime since')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  act(() => client.setQueryData(STATUS_QUERY_KEY, { version: 'v1.0.0-rc.36' }))
  expect(await screen.findByText('v1.0.0-rc.36')).toBeVisible()
  expect(fetchMock).not.toHaveBeenCalled()
})

test('uses the supplied version when server status has no version', () => {
  client.setQueryData(STATUS_QUERY_KEY, {})
  render(<UpdateCheckerSection currentVersion='v1.2.3' />, { wrapper: Wrapper })
  expect(screen.getByText('v1.2.3')).toBeVisible()
})

test('shows the full current version in the dialog and tooltip while truncating the header label', async () => {
  const version = 'v1.0.0+long-build-metadata-for-a-custom-deployment'
  client.setQueryData(STATUS_QUERY_KEY, { version })
  render(<SystemUpdateAction presentation='version' />, { wrapper: Wrapper })
  const trigger = screen.getByRole('button', {
    name: `Current version: ${version}`,
  })
  expect(trigger).toHaveAttribute('title', `Current version: ${version}`)
  expect(within(trigger).getByText(version)).toHaveClass('truncate', 'max-w-32')
  await userEvent.click(trigger)
  expect(within(screen.getByRole('dialog')).getByText(version)).toBeVisible()
  act(() => client.setQueryData(STATUS_QUERY_KEY, { version: 'v2.0.0' }))
  expect(
    await within(screen.getByRole('dialog')).findByText('v2.0.0')
  ).toBeVisible()
})

test('never checks releases on mount, hourly intervals, focus or reconnect even with a cached update error', async () => {
  vi.useFakeTimers()
  localStorage.setItem(
    'system-update:v1',
    JSON.stringify({
      state: {
        snapshot: {
          release: { tag_name: 'v9.0.0' },
          lastAttemptAt: 0,
          lastCheckedAt: 0,
          error: 'rate-limit',
        },
      },
      version: 0,
    })
  )
  render(
    <>
      <SystemUpdateAction presentation='version' />
      <UpdateCheckerSection />
    </>,
    { wrapper: Wrapper }
  )
  await act(async () => {
    focusManager.setFocused(false)
    onlineManager.setOnline(false)
    await vi.advanceTimersByTimeAsync(3_600_001)
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(fetchMock).not.toHaveBeenCalled()
  expect(fetchMock).not.toHaveBeenCalledWith(
    'https://api.github.com/repos/QuantumNous/new-api/releases?per_page=100',
    expect.anything()
  )
  expect(screen.queryByText('Update available')).not.toBeInTheDocument()
  expect(
    screen.queryByText('GitHub rate limit reached. Try again later.')
  ).not.toBeInTheDocument()
})
