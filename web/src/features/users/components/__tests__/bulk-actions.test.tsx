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
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  act,
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import type { User } from '../../types'
import { UsersProvider } from '../users-provider'
import { UsersTable } from '../users-table'

let client: QueryClient
const base: User = {
  id: 2,
  username: 'legacy-name',
  email: 'alpha@example.com',
  display_name: '',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}
const users: User[] = [
  { ...base, id: 1, email: 'operator@example.com', role: 100 },
  base,
  { ...base, id: 3, email: 'beta@example.com' },
  { ...base, id: 4, email: 'disabled@example.com', status: 2 },
  { ...base, id: 5, email: 'deleted@example.com', DeletedAt: '2026-01-01' },
  { ...base, id: 6, email: 'admin@example.com', role: 10 },
]

async function renderUsers(data = users, role = 10) {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'operator', role })
  const get = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/verify/methods') {
      return {
        data: {
          success: true,
          data: {
            scope: 'admin.user.manage',
            methods: [{ method: '2fa', available: true }],
            oauth_providers: [],
            password_encryption_enabled: false,
          },
        },
      }
    }
    return {
      data: { success: true, data: { items: data, total: data.length } },
    }
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const route = createRoute({
    getParentRoute: () => auth,
    path: 'users/',
    component: () => (
      <UsersProvider>
        <UsersTable />
      </UsersProvider>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([route])]),
    history: createMemoryHistory({ initialEntries: ['/users/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  await screen.findByRole('checkbox', { name: 'Select all' })
  await waitFor(() =>
    expect(
      screen.getAllByRole('checkbox', { name: 'Select row' })
    ).toHaveLength(data.length)
  )
  return get
}

function mockManagement(manage: (id: number) => Promise<unknown>) {
  return vi.spyOn(api, 'post').mockImplementation(async (url, payload) => {
    if (url === '/api/verify') {
      return {
        data: {
          success: true,
          data: {
            proof_token: `proof-${(payload as { context: { user_id: number } }).context.user_id}`,
            method: '2fa',
            scope: 'admin.user.manage',
            expires_at: Math.floor(Date.now() / 1000) + 60,
          },
        },
      }
    }
    if (url === '/api/user/manage') {
      return manage((payload as { id: number }).id)
    }
    throw new Error(`Unexpected POST ${url}`)
  })
}

async function verifyUser(email: string) {
  await screen.findByText(
    `Confirm your identity before changing the account ${email}.`
  )
  await userEvent.type(
    await screen.findByLabelText('Authenticator code or backup code'),
    '123456'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
}

afterEach(() => {
  cleanup()
  client?.clear()
  vi.restoreAllMocks()
  useAuthStore.getState().auth.reset()
  localStorage.clear()
})

it('shows email instead of username and prevents selecting disabled, deleted, self and peer accounts', async () => {
  await renderUsers()
  expect(screen.getByRole('columnheader', { name: 'Email' })).toBeVisible()
  expect(screen.queryByText('legacy-name')).not.toBeInTheDocument()
  const checkboxes = screen.getAllByRole('checkbox', { name: 'Select row' })
  for (const index of [0, 3, 4, 5]) {
    expect(checkboxes[index]).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(checkboxes[index])
    expect(checkboxes[index]).not.toBeChecked()
  }
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
  expect(checkboxes[1]).toBeChecked()
  expect(checkboxes[2]).toBeChecked()
  expect(
    await screen.findByRole('button', { name: 'Disable selected users' })
  ).toBeEnabled()
})

it('shows a placeholder for an account without email and allows root to select admins', async () => {
  await renderUsers([{ ...base, email: '' }, users[5]], 100)
  expect(
    within(screen.getAllByRole('row')[1]).getAllByRole('cell')[2]
  ).toHaveTextContent('—')
  expect(screen.queryByText('legacy-name')).not.toBeInTheDocument()
  const checkbox = screen.getAllByRole('checkbox', { name: 'Select row' })[1]
  await userEvent.click(checkbox)
  expect(checkbox).toBeChecked()
})

it('requires confirmation, prevents duplicate submission, disables only selected accounts and clears successful selections', async () => {
  const user = userEvent.setup()
  let finish!: () => void
  const pending = new Promise<void>((resolve) => {
    finish = resolve
  })
  const post = mockManagement(async () => {
    await pending
    return { data: { success: true } }
  })
  await renderUsers()
  await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
  await user.click(
    screen.getByRole('button', { name: 'Disable selected users' })
  )
  let dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('alpha@example.com')).toBeVisible()
  expect(within(dialog).getByText('beta@example.com')).toBeVisible()
  expect(post).not.toHaveBeenCalled()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(post).not.toHaveBeenCalled()
  await user.click(
    screen.getByRole('button', { name: 'Disable selected users' })
  )
  dialog = await screen.findByRole('alertdialog')
  const confirm = within(dialog).getByRole('button', {
    name: 'Disable',
  })
  await user.dblClick(confirm)
  await screen.findByLabelText('Authenticator code or backup code')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(post).not.toHaveBeenCalled()
  await verifyUser('alpha@example.com')
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
  await act(async () => finish())
  await verifyUser('beta@example.com')
  await waitFor(() => expect(post).toHaveBeenCalledTimes(4))
  for (const id of [2, 3]) {
    expect(post).toHaveBeenCalledWith(
      '/api/verify',
      expect.objectContaining({
        scope: 'admin.user.manage',
        context: { user_id: id, action: 'disable' },
      }),
      expect.anything()
    )
    expect(post).toHaveBeenCalledWith(
      '/api/user/manage',
      { id, action: 'disable' },
      {
        headers: { 'X-Security-Proof': `proof-${id}` },
        singleUseAuthorization: true,
      }
    )
  }
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  )
  expect(
    screen.queryByRole('button', { name: 'Disable selected users' })
  ).not.toBeInTheDocument()
})

it.each([false, true])(
  'retains only failed users for retry after a partial failure (network: %s)',
  async (networkFailure) => {
    const user = userEvent.setup()
    let fail = true
    const post = mockManagement(async (id) => {
      if (id === 3 && fail) {
        if (networkFailure) throw new Error('Connection lost')
        return { data: { success: false, message: 'Permission changed' } }
      }
      return { data: { success: true } }
    })
    await renderUsers()
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }))
    await user.click(
      screen.getByRole('button', { name: 'Disable selected users' })
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Disable' }))
    await verifyUser('alpha@example.com')
    await verifyUser('beta@example.com')
    await waitFor(() => expect(post).toHaveBeenCalledTimes(4))
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    const checkboxes = screen.getAllByRole('checkbox', { name: 'Select row' })
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes[2]).toBeChecked()
    fail = false
    await user.click(
      screen.getByRole('button', { name: 'Disable selected users' })
    )
    const retry = await screen.findByRole('alertdialog')
    expect(
      within(retry).queryByText('alpha@example.com')
    ).not.toBeInTheDocument()
    await user.click(within(retry).getByRole('button', { name: 'Disable' }))
    await verifyUser('beta@example.com')
    await waitFor(() => expect(post).toHaveBeenCalledTimes(6))
    expect(post).toHaveBeenLastCalledWith(
      '/api/user/manage',
      {
        id: 3,
        action: 'disable',
      },
      {
        headers: { 'X-Security-Proof': 'proof-3' },
        singleUseAuthorization: true,
      }
    )
  }
)

it('does not transfer a selection to a different user when the page data changes', async () => {
  const user = userEvent.setup()
  const get = await renderUsers([base])
  await user.click(screen.getByRole('checkbox', { name: 'Select row' }))
  get.mockResolvedValue({
    data: {
      success: true,
      data: {
        items: [{ ...base, id: 9, email: 'other@example.com' }],
        total: 1,
      },
    },
  })
  await act(async () => {
    await client.invalidateQueries({ queryKey: ['users'] })
  })
  await screen.findByText('other@example.com')
  expect(screen.getByRole('checkbox', { name: 'Select row' })).not.toBeChecked()
  expect(
    screen.queryByRole('button', { name: 'Disable selected users' })
  ).not.toBeInTheDocument()
})

it('cancelling verification stops the batch and preserves remaining selections', async () => {
  const post = mockManagement(async () => ({ data: { success: true } }))
  await renderUsers()
  await userEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
  await userEvent.click(
    screen.getByRole('button', { name: 'Disable selected users' })
  )
  await userEvent.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: 'Disable',
    })
  )
  await verifyUser('alpha@example.com')
  await screen.findByText(
    'Confirm your identity before changing the account beta@example.com.'
  )
  await userEvent.keyboard('{Escape}')
  const dialog = await screen.findByRole('alertdialog')
  expect(
    within(dialog).queryByText('alpha@example.com')
  ).not.toBeInTheDocument()
  expect(within(dialog).getByText('beta@example.com')).toBeVisible()
  expect(post).toHaveBeenCalledTimes(2)
  const rows = screen.getAllByRole('checkbox', {
    name: 'Select row',
    hidden: true,
  })
  expect(rows[1]).not.toBeChecked()
  expect(rows[2]).toBeChecked()
})
