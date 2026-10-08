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
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { STATUS_QUERY_KEY, type StatusData } from '@/lib/status-query'

import { ApiAddresses } from '../api-addresses'
import { ApiKeysProvider } from '../api-keys-provider'

let client: QueryClient

beforeEach(() => {
  localStorage.clear()
  client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderAddresses(status: StatusData) {
  client.setQueryData(STATUS_QUERY_KEY, status)
  return render(
    <QueryClientProvider client={client}>
      <ApiKeysProvider>
        <ApiAddresses />
      </ApiKeysProvider>
    </QueryClientProvider>
  )
}

it('shows every configured address and copies only the chosen visible URL', async () => {
  const user = userEvent.setup()
  const writeText = vi.spyOn(navigator.clipboard, 'writeText')
  renderAddresses({
    server_address: 'https://console.example.com',
    api_info_enabled: true,
    api_info: [
      {
        route: 'Global',
        description: 'Worldwide access',
        url: 'https://api.example.com/v1',
        color: 'blue',
      },
      {
        route: 'Asia',
        description: 'Regional access',
        url: 'https://asia.example.com/gateway/v1/',
        color: 'green',
      },
    ],
  })

  const dialog = screen.getByRole('list', { name: 'API Addresses' })
  const rows = within(dialog).getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(rows[0]).toHaveTextContent('Global')
  expect(within(rows[0]).getByText('Global')).toHaveAttribute(
    'data-slot',
    'badge'
  )
  expect(within(rows[0]).getByText('Global')).toHaveClass(
    'bg-chart-1/10',
    'text-chart-1'
  )
  expect(within(rows[0]).getByText('Global')).toHaveAttribute(
    'title',
    'Worldwide access'
  )
  expect(within(rows[0]).getByText('https://api.example.com/v1')).toBeVisible()
  expect(
    within(rows[0]).getByText('https://api.example.com/v1').parentElement
  ).toHaveClass('group-data-[size=xs]/item:gap-2')
  expect(
    within(rows[0]).getByText('https://api.example.com/v1').parentElement
  ).not.toHaveClass('group-data-[size=xs]/item:gap-0')
  expect(rows[1]).toHaveTextContent('Asia')
  expect(within(rows[1]).getByText('Asia')).toHaveAttribute(
    'data-slot',
    'badge'
  )
  expect(within(rows[1]).getByText('Asia')).toHaveClass(
    'bg-success/10',
    'text-success'
  )
  expect(within(rows[1]).getByText('Asia')).toHaveAttribute(
    'title',
    'Regional access'
  )
  expect(
    within(rows[1]).getByText('https://asia.example.com/gateway/v1/')
  ).toBeVisible()
  expect(writeText).not.toHaveBeenCalled()

  await user.click(
    within(rows[1]).getByRole('button', {
      name: 'Copy API URL: https://asia.example.com/gateway/v1/',
    })
  )
  expect(writeText).toHaveBeenCalledWith('https://asia.example.com/gateway/v1/')
  expect(
    await within(rows[1]).findByRole('button', { name: 'Copied' })
  ).toBeVisible()
  expect(
    within(rows[0]).getByRole('button', {
      name: 'Copy API URL: https://api.example.com/v1',
    })
  ).toBeVisible()
})

it.each([
  {
    status: {
      api_info: [],
      server_address: 'https://gateway.example.com/proxy/',
    },
    label: 'Default API address',
    url: 'https://gateway.example.com/proxy/',
  },
  {
    status: { api_info: [] },
    label: 'Current domain',
    url: window.location.origin,
  },
  {
    status: {
      api_info_enabled: false,
      api_info: [
        {
          route: 'Hidden',
          description: 'Disabled address',
          url: 'https://hidden.example.com',
          color: 'blue',
        },
      ],
      server_address: 'https://gateway.example.com',
    },
    label: 'Default API address',
    url: 'https://gateway.example.com',
  },
])(
  'shows and copies the fallback $label when no configured addresses are available',
  async ({ status, label, url }) => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderAddresses(status)

    const list = screen.getByRole('list', { name: 'API Addresses' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText(label)).toBeVisible()
    expect(within(list).getByText(url)).toBeVisible()
    expect(within(list).queryByText('Default')).not.toBeInTheDocument()
    await user.tab()
    expect(
      within(list).getByRole('button', {
        name: `Copy API URL: ${url}`,
      })
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(writeText).toHaveBeenCalledWith(url)
  }
)

it('keeps long addresses readable without widening the endpoint strip and updates when configuration changes', async () => {
  const user = userEvent.setup()
  const url =
    'https://regional-api-gateway.example.com/organization/production/openai-compatible/v1/'
  renderAddresses({
    api_info: [
      {
        route: 'Regional gateway',
        description: 'Regional production gateway',
        url,
        color: 'blue',
      },
    ],
  })
  const dialog = screen.getByRole('list', { name: 'API Addresses' })
  expect(dialog).toHaveClass(
    'flex-row',
    'flex-wrap',
    'max-h-40',
    'overflow-y-auto',
    'justify-end',
    'ml-auto'
  )
  expect(within(dialog).getByRole('listitem')).toHaveClass(
    'max-w-full',
    'min-w-0',
    'border',
    'border-input',
    'bg-muted',
    'rounded-md',
    'px-2.5',
    'py-0'
  )
  expect(within(dialog).getByText(url)).toHaveClass('break-all')
  expect(within(dialog).getByText(url)).not.toHaveClass('truncate')

  act(() => {
    client.setQueryData(STATUS_QUERY_KEY, {
      api_info: [
        {
          route: 'Replacement',
          description: 'Updated gateway',
          url: 'https://new.example.com',
          color: 'blue',
        },
      ],
    })
  })
  expect(
    await within(dialog).findByText('https://new.example.com')
  ).toBeVisible()
  expect(within(dialog).queryByText(url)).not.toBeInTheDocument()
  await user.click(
    within(dialog).getByRole('button', {
      name: 'Copy API URL: https://new.example.com',
    })
  )
  expect(await navigator.clipboard.readText()).toBe('https://new.example.com')
})

it('does not add a default badge when an address matches the server address', () => {
  renderAddresses({
    server_address: 'https://default.example.com/',
    api_info: [
      {
        route: 'Backup',
        description: '',
        url: 'https://backup.example.com',
        color: 'blue',
      },
      {
        route: 'Primary',
        description: '',
        url: 'https://default.example.com',
        color: 'green',
      },
    ],
  })
  const rows = screen.getAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Backup')
  expect(within(rows[0]).queryByText('Default')).not.toBeInTheDocument()
  expect(within(rows[1]).queryByText('Default')).not.toBeInTheDocument()
})

it.each([false, true])(
  'replaces the latency button with progress and its result and prevents repeated tests (failure: %s)',
  async (failure) => {
    const user = userEvent.setup()
    let finish!: () => void
    const response = new Promise<Response>((resolve, reject) => {
      finish = () =>
        failure ? reject(new Error('Offline')) : resolve(new Response())
    })
    const fetch = vi.fn().mockReturnValue(response)
    vi.stubGlobal('fetch', fetch)
    renderAddresses({ server_address: 'https://api.example.com/v1' })
    const test = screen.getByRole('button', {
      name: 'Test Latency: https://api.example.com/v1',
    })
    expect(fetch).not.toHaveBeenCalled()
    await user.dblClick(test)
    expect(test).toBeDisabled()
    expect(test).toHaveTextContent('Testing...')
    expect(screen.getByRole('status')).toHaveTextContent('Testing...')
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/v1', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache',
    })
    await act(async () => finish())
    expect(test).toBeDisabled()
    expect(test).toHaveTextContent(failure ? 'Test failed' : /\d+ ms/)
    expect(screen.getByRole('status')).toHaveTextContent(
      failure ? 'Test failed' : /\d+ ms/
    )
    await user.click(test)
    expect(fetch).toHaveBeenCalledTimes(1)
    const copy = screen.getByRole('button', {
      name: 'Copy API URL: https://api.example.com/v1',
    })
    expect(copy).toBeEnabled()
    await user.click(copy)
    expect(await navigator.clipboard.readText()).toBe(
      'https://api.example.com/v1'
    )
  }
)
