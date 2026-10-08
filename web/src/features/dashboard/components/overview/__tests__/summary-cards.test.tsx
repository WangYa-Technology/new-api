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
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { SummaryCards } from '../summary-cards'

let client: QueryClient
let todayFails: boolean
let todayEmpty: boolean
let resolveToday: (() => void) | undefined
const now = new Date(2026, 9, 8, 15, 30).getTime()
const midnight = new Date(2026, 9, 8).getTime() / 1000

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  useAuthStore.getState().auth.setUser({
    id: 3,
    username: 'user',
    role: 1,
    quota: 5000000,
    used_quota: 4500000,
    request_count: 10,
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  todayFails = false
  todayEmpty = false
  resolveToday = undefined
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/status') {
      return { data: { data: { display_in_currency: true } } }
    }
    if (url !== '/api/data/self') throw new Error(`Unexpected request: ${url}`)
    const isToday = config?.params.start_timestamp === midnight
    if (isToday) {
      await new Promise<void>((resolve) => {
        resolveToday = resolve
      })
      if (todayFails) throw new Error('Usage unavailable')
      if (todayEmpty) return { data: { success: true, data: [] } }
    }
    return {
      data: {
        success: true,
        data: [
          {
            created_at: midnight + 3600,
            quota: isToday ? 500000 : 1500000,
            count: 2,
          },
        ],
      },
    }
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  useAuthStore.setState(useAuthStore.getInitialState(), true)
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  window.localStorage.clear()
})

async function renderSummary() {
  const router = createRouter({
    routeTree: createRootRoute({ component: SummaryCards }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByText('Consumed in the last 24 hours (USD)')
}

test('switching to today queries local midnight, updates usage, and preserves the 24-hour balance estimate', async () => {
  const user = userEvent.setup()
  await renderSummary()
  expect(screen.getAllByText('$3')).toHaveLength(2)
  expect(screen.getByRole('button', { name: '24H' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await user.click(screen.getByRole('button', { name: 'Today' }))
  await waitFor(() => expect(resolveToday).toBeDefined())
  expect(api.get).toHaveBeenCalledWith('/api/data/self', {
    params: {
      start_timestamp: midnight,
      end_timestamp: now / 1000,
      default_time: 'hour',
    },
  })
  expect(screen.queryByText('$1')).not.toBeInTheDocument()
  expect(screen.getAllByText('$3')).toHaveLength(1)
  resolveToday?.()
  expect(await screen.findByText('Consumed today (USD)')).toBeVisible()
  expect(screen.getByText('$1')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await user.click(screen.getByRole('button', { name: 'Today' }))
  expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(screen.getByText('$3')).toBeVisible()
  expect(screen.getByText('~3 days')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '24H' }))
  expect(
    await screen.findByText('Consumed in the last 24 hours (USD)')
  ).toBeVisible()
  expect(screen.getAllByText('$3')).toHaveLength(2)
})

test('failed today requests show unavailable usage instead of zero', async () => {
  todayFails = true
  const user = userEvent.setup()
  await renderSummary()
  await user.click(screen.getByRole('button', { name: 'Today' }))
  await waitFor(() => expect(resolveToday).toBeDefined())
  resolveToday?.()
  expect(await screen.findByText('--')).toBeVisible()
  expect(screen.queryByText('$0')).not.toBeInTheDocument()
})

test('keyboard selection of today shows zero when the period has no usage', async () => {
  todayEmpty = true
  const user = userEvent.setup()
  await renderSummary()
  screen.getByRole('button', { name: '24H' }).focus()
  await user.keyboard('{ArrowRight}{Enter}')
  await waitFor(() => expect(resolveToday).toBeDefined())
  resolveToday?.()
  expect(await screen.findByText('$0')).toBeVisible()
  expect(screen.getByText('Consumed today (USD)')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Today' })).toHaveFocus()
})
