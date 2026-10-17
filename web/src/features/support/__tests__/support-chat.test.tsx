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
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { FAQPanel } from '@/features/dashboard/components/overview/faq-panel'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { api, getStatus } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  loadSupportTranscript,
  refreshSupportHistory,
  type SupportHistory,
} from '../chat-api'
import { SupportAISettingsEditor } from '../components/support-ai-settings'
import { SupportChat } from '../components/support-chat'
import {
  SupportKnowledgeEditor,
  SupportSources,
} from '../components/support-knowledge'
import { SupportOrders } from '../components/support-orders'
import { SupportQuickReplies } from '../components/support-quick-replies'
import { SupportWidget } from '../components/support-widget'
import { SupportWorkbench } from '../components/support-workbench'
import { encodeOrderMessage, parseOrderMessage } from '../order-message'

vi.mock('@/lib/api', () => ({
  getStatus: vi.fn(),
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}))
const history = {
  conversation: {
    id: 'legacy-7',
    title: 'Connection help',
    preview: 'Your request has been received',
    updated_at: 1700000000,
    user_id: 7,
    status: 'ai',
    agent_id: 0,
    version: 1,
    last_message_id: 0,
    user_read_id: 0,
    staff_read_id: 0,
  },
  messages: [],
}
function renderChat(userID?: number, compact = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <SupportChat userID={userID} compact={compact} />
    </QueryClientProvider>
  )
}
beforeEach(() => {
  vi.mocked(getStatus).mockResolvedValue({
    faq_enabled: true,
    faq: [
      {
        id: 1,
        question: 'How do I create an API key?',
        answer: 'Open the API keys page and create a key.',
      },
    ],
  })
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: history },
  })
  vi.mocked(api.post).mockResolvedValue({ data: { success: true } })
})
afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Support chat', () => {
  test('an empty conversation disables sending until the user enters a message', async () => {
    renderChat()
    expect(await screen.findByText('How can we help you?')).toBeVisible()
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Help me connect' },
    })
    fireEvent.click(send)
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/support-chat/action',
        expect.objectContaining({
          action: 'send',
          body: 'Help me connect',
          request_id: expect.any(String),
        }),
        expect.any(Object)
      )
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('')
    )
  })
  test('requesting a person sends the current version for a safe handoff', async () => {
    renderChat()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Talk to a person' })
    )
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/support-chat/action',
        { action: 'handoff', version: 1, thread_id: undefined },
        expect.any(Object)
      )
    )
  })
  test('failed sending preserves the draft and request identifier for retry', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'))
    renderChat()
    const textbox = await screen.findByRole('textbox', { name: 'Message' })
    fireEvent.change(textbox, { target: { value: 'Keep this draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    )
    expect(textbox).toHaveValue('Keep this draft')
    const first = vi.mocked(api.post).mock.calls[0][1]
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.post).mock.calls[1][1]).toEqual(first)
  })
  test('resolved conversations require reopening before another message can be sent', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          conversation: { ...history.conversation, status: 'resolved' },
        },
      },
    })
    renderChat()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Reopen conversation' })
    )
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/support-chat/action',
        expect.objectContaining({ action: 'reopen', version: 1 }),
        expect.any(Object)
      )
    )
  })
  test('reconnection recovers a gap larger than one page and deduplicates cached history', async () => {
    const message = (id: number) => ({
      id,
      sender: 'user' as const,
      body: `Message ${id}`,
      created_at: 1700000000,
    })
    const previous: SupportHistory = {
      conversation: { ...history.conversation, status: 'ai' },
      messages: [message(1), message(2)],
      hasMore: false,
    }
    vi.mocked(api.get).mockImplementation(async (url) => {
      const start = url.includes('before=103') ? 3 : 103
      return {
        data: {
          success: true,
          data: {
            ...history,
            messages: Array.from({ length: 100 }, (_, index) =>
              message(start + index)
            ),
          },
        },
      }
    })
    // The overlap page terminates gap recovery without discarding earlier history.
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            ...history,
            messages: Array.from({ length: 100 }, (_, index) =>
              message(103 + index)
            ),
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            ...history,
            messages: Array.from({ length: 100 }, (_, index) =>
              message(3 + index)
            ),
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { ...history, messages: [message(1), message(2)] },
        },
      })
    const result = await refreshSupportHistory(
      'history?thread_id=legacy-7',
      previous
    )
    expect(result.messages.map((item) => item.id)).toEqual(
      Array.from({ length: 202 }, (_, index) => index + 1)
    )
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/support-chat/history?thread_id=legacy-7&before=3'
    )
  })
  test('switching conversations preserves each draft independently', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <SupportChat key='first' threadID='first' />
      </QueryClientProvider>
    )
    fireEvent.change(await screen.findByRole('textbox', { name: 'Message' }), {
      target: { value: 'First draft' },
    })
    view.rerender(
      <QueryClientProvider client={client}>
        <SupportChat key='second' threadID='second' />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveValue(
      ''
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Second draft' },
    })
    view.rerender(
      <QueryClientProvider client={client}>
        <SupportChat key='first' threadID='first' />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('textbox', { name: 'Message' })).toHaveValue(
      'First draft'
    )
  })
  test('waiting conversations show the saved-message state and disable another handoff', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          conversation: { ...history.conversation, status: 'waiting' },
        },
      },
    })
    renderChat()
    expect(
      await screen.findByText(
        'Your message is saved. Our team will reply here.'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Talk to a person' })
    ).toBeDisabled()
  })
  test('the owning agent can send a private note and transfer the conversation', async () => {
    const original = useAuthStore.getState()
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 9, username: 'agent', role: 100 } },
    })
    try {
      vi.mocked(api.get).mockImplementation(async (url) => ({
        data: {
          success: true,
          data: url.endsWith('/agents')
            ? [{ id: 10, name: 'Next agent', username: 'next' }]
            : {
                ...history,
                messages: [
                  {
                    id: 1,
                    sender: 'note',
                    body: 'Existing private note',
                    actor_id: 9,
                    created_at: 1700000000,
                  },
                ],
                conversation: {
                  ...history.conversation,
                  status: 'human',
                  agent_id: 9,
                },
              },
        },
      }))
      renderChat(7)
      fireEvent.change(
        await screen.findByRole('textbox', { name: 'Message' }),
        { target: { value: 'Public reply draft' } }
      )
      const actions = screen.getByRole('group', { name: 'Actions' })
      expect(
        within(actions).getByRole('button', { name: 'Internal note' })
      ).toBeVisible()
      expect(
        within(actions).getByRole('button', { name: 'Take over' })
      ).toBeVisible()
      expect(
        within(actions).getByRole('button', { name: 'Resolve' })
      ).toHaveClass('bg-primary', 'text-primary-foreground')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Internal note' })
      )
      expect(
        await screen.findByRole('textbox', { name: 'Internal note' })
      ).toHaveValue('Existing private note')
      fireEvent.change(
        await screen.findByRole('textbox', { name: 'Internal note' }),
        {
          target: { value: 'Private investigation' },
        }
      )
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/api/support-chat/users/7',
          expect.objectContaining({
            action: 'note',
            body: 'Private investigation',
          }),
          expect.any(Object)
        )
      )
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      )
      expect(
        screen.queryByRole('button', { name: 'Reply to user' })
      ).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
        'Public reply draft'
      )
      expect(
        screen.queryByRole('combobox', { name: 'Transfer to' })
      ).not.toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'Transfer conversation' })
      )
      fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Next agent' })
      )
      await waitFor(() =>
        expect(api.post).toHaveBeenCalledWith(
          '/api/support-chat/users/7',
          expect.objectContaining({
            action: 'transfer',
            target_id: 10,
            version: 1,
          }),
          expect.any(Object)
        )
      )
    } finally {
      useAuthStore.setState(original)
    }
  })
  test('selecting a customer fills the three-column workbench with inline orders and scoped recent usage', async () => {
    const original = useAuthStore.getState()
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 9, username: 'admin', role: 100 } },
    })
    try {
      vi.mocked(api.get).mockImplementation(async (url) => {
        let data: unknown = {
          ...history,
          conversation: { ...history.conversation, status: 'waiting' },
        }
        if (url.includes('/queue?')) {
          data = {
            items: [{ ...history.conversation, status: 'waiting' }],
            counts: { waiting: 0, mine: 2, all: 4, resolved: 1 },
            total: 1,
          }
        }
        if (url.endsWith('/profile')) {
          data = {
            username: 'alice',
            display_name: 'Alice',
            email: 'alice@example.com',
            status: 1,
            can_view_orders: true,
          }
        }
        if (url.endsWith('/orders') || url.endsWith('/agents')) data = []
        if (url.startsWith('/api/log?')) {
          data = {
            items: url.includes('type=2')
              ? [
                  {
                    id: 1,
                    user_id: 7,
                    model_name: 'customer-model',
                    created_at: 1700000000,
                    type: 2,
                    request_id: 'request-7',
                  },
                ]
              : [
                  {
                    id: 2,
                    user_id: 8,
                    model_name: 'another-customer-model',
                    created_at: 1700000001,
                    type: 5,
                  },
                ],
            total: 1,
          }
        }
        return { data: { success: true, data } }
      })
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={client}>
          <SupportWorkbench />
        </QueryClientProvider>
      )
      const category = screen.getByRole('group', { name: 'Messages' })
      expect(
        within(category).getByRole('button', { name: 'Waiting for support' })
      ).toHaveAttribute('aria-pressed', 'true')
      for (const name of [
        'Waiting for support',
        'Assigned to me',
        'All',
        'Resolved',
      ]) {
        expect(
          within(category).getByRole('button', { name })
        ).toHaveTextContent(name)
      }
      await userEvent.click(
        within(category).getByRole('button', { name: 'All' })
      )
      expect(
        within(category).getByRole('button', { name: 'All' })
      ).toHaveAttribute('aria-pressed', 'true')
      expect(category.closest('aside')).toBeNull()
      await waitFor(() => {
        for (const [name, count] of [
          ['Waiting for support', '0'],
          ['Assigned to me', '2'],
          ['All', '4'],
          ['Resolved', '1'],
        ]) {
          expect(
            within(within(category).getByRole('button', { name })).getByText(
              count
            )
          ).toBeVisible()
        }
      })
      const details = screen.getByRole('complementary', {
        name: 'User information',
      })
      expect(
        within(details).getByText('Select a conversation to view user details')
      ).toBeVisible()
      const customerRow = await screen.findByRole('button', { name: /Alice/ })
      expect(customerRow).toHaveClass('h-10', 'flex-row')
      expect(
        within(customerRow).queryByText(history.conversation.preview)
      ).not.toBeInTheDocument()
      expect(within(customerRow).getByText('Waiting for support')).toBeVisible()
      fireEvent.click(customerRow)
      expect(
        await within(details).findByText('alice@example.com')
      ).toBeVisible()
      expect(await within(details).findByText('No orders found')).toBeVisible()
      expect(await within(details).findByText('customer-model')).toBeVisible()
      expect(
        within(details).queryByText('another-customer-model')
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('log', { name: 'Support messages' })).toHaveClass(
        'flex-1',
        'min-h-0'
      )
      expect(api.get).toHaveBeenCalledWith(
        expect.stringContaining('username=alice')
      )
    } finally {
      useAuthStore.setState(original)
    }
  })
  test('an empty workbench centers its message and hides unnecessary pagination', async () => {
    const original = useAuthStore.getState()
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 9, username: 'admin', role: 100 } },
    })
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { items: [], total: 0 } },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    try {
      render(
        <QueryClientProvider client={client}>
          <SupportWorkbench />
        </QueryClientProvider>
      )
      expect(await screen.findByText('No conversations yet')).toHaveClass(
        'h-full',
        'items-center',
        'justify-center',
        'text-center'
      )
      expect(
        screen.queryByRole('button', { name: 'Previous page' })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Next page' })
      ).not.toBeInTheDocument()
    } finally {
      client.clear()
      useAuthStore.setState(original)
    }
  })
  test('the workbench has a distinct admin sidebar entry that requires permission', () => {
    const original = useAuthStore.getState()
    try {
      useAuthStore.setState({
        auth: {
          ...original.auth,
          user: { id: 9, username: 'admin', role: 100 },
        },
      })
      const admin = renderHook(() => useSidebarData())
      expect(
        admin.result.current.navGroups.find((group) => group.id === 'admin')
          ?.items
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: '/support-workbench' }),
        ])
      )
      expect(
        admin.result.current.navGroups.find((group) => group.id === 'personal')
          ?.items
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ url: '/support' })])
      )
      admin.unmount()
      useAuthStore.setState({
        auth: { ...original.auth, user: { id: 7, username: 'user', role: 1 } },
      })
      const regular = renderHook(() => useSidebarData())
      expect(
        regular.result.current.navGroups.flatMap((group) => group.items)
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ url: '/support-workbench' }),
        ])
      )
    } finally {
      useAuthStore.setState(original)
    }
  })
  test('staff must own the conversation before sending a human reply', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          conversation: {
            ...history.conversation,
            status: 'human',
            agent_id: 999,
          },
        },
      },
    })
    renderChat(7)
    expect(
      await screen.findByRole('textbox', { name: 'Message' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled()
  })
  test('a failed detail request still allows returning to the conversation list', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    const back = vi.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportChat compact threadID='legacy-7' onBack={back} />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(back).toHaveBeenCalledOnce()
  })
  test.each([true, false])(
    'messages align with the current viewer when staff view is %s',
    async (staff) => {
      const original = useAuthStore.getState()
      useAuthStore.setState({
        auth: {
          ...original.auth,
          user: {
            id: staff ? 9 : 7,
            username: 'viewer',
            role: staff ? 100 : 1,
          },
        },
      })
      const messages = [
        {
          id: 1,
          sender: 'user',
          actor_id: 7,
          body: 'Customer message',
          created_at: 1700000000,
        },
        {
          id: 2,
          sender: 'agent',
          actor_id: 9,
          body: 'My reply',
          created_at: 1700000001,
        },
        {
          id: 3,
          sender: 'agent',
          actor_id: 8,
          body: 'Other agent reply',
          created_at: 1700000002,
        },
        {
          id: 4,
          sender: 'ai',
          actor_id: 0,
          body: 'AI reply',
          created_at: 1700000003,
        },
      ]
      vi.mocked(api.get).mockImplementation(async (url) => ({
        data: {
          success: true,
          data: url.endsWith('/agents') ? [] : { ...history, messages },
        },
      }))
      try {
        renderChat(staff ? 7 : undefined)
        const customer = await screen.findByText('Customer message')
        expect(customer.closest('.group')).toHaveClass(
          staff ? 'is-assistant' : 'is-user'
        )
        expect(screen.getByText('My reply').closest('.group')).toHaveClass(
          staff ? 'is-user' : 'is-assistant'
        )
        expect(
          screen.getByText('Other agent reply').closest('.group')
        ).toHaveClass('is-assistant')
        expect(screen.getByText('AI reply').closest('.group')).toHaveClass(
          'is-assistant'
        )
      } finally {
        useAuthStore.setState(original)
      }
    }
  )
  test('legacy agent replies without an actor align to the conversation owner', async () => {
    const original = useAuthStore.getState()
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 9, username: 'agent', role: 100 } },
    })
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url.endsWith('/agents')
          ? []
          : {
              ...history,
              conversation: {
                ...history.conversation,
                status: 'resolved',
                agent_id: 9,
              },
              messages: [
                {
                  id: 2,
                  sender: 'agent',
                  actor_id: 0,
                  body: 'Legacy reply',
                  created_at: 1700000000,
                },
              ],
            },
      },
    }))
    try {
      renderChat(7)
      expect(
        (await screen.findByText('Legacy reply')).closest('.group')
      ).toHaveClass('is-user')
    } finally {
      useAuthStore.setState(original)
    }
  })
  test('short message bubbles fit their text instead of stretching to sender metadata', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          messages: [
            { id: 1, sender: 'user', body: '你好', created_at: 1700000000 },
            { id: 2, sender: 'agent', body: '好的', created_at: 1700000001 },
          ],
        },
      },
    })
    renderChat()
    const userMessage = await screen.findByText('你好')
    const agentMessage = screen.getByText('好的')
    expect(userMessage.textContent).toBe('你好')
    expect(agentMessage.textContent).toBe('好的')
    expect(userMessage.parentElement).toHaveClass(
      'w-fit',
      'group-[.is-user]:ml-auto'
    )
    expect(agentMessage.parentElement).toHaveClass('w-fit')
  })
  test('conversation search filters matching messages and closing it restores the transcript', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          messages: [
            {
              id: 1,
              sender: 'user',
              body: 'Connection question',
              created_at: 1700000000,
            },
            {
              id: 2,
              sender: 'agent',
              body: 'Please check your settings',
              created_at: 1700000001,
            },
          ],
        },
      },
    })
    renderChat(undefined, true)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Search conversation' })
    )
    const search = await screen.findByRole('textbox', {
      name: 'Search conversation',
    })
    fireEvent.change(search, { target: { value: 'SETTINGS' } })
    expect(await screen.findByText('Please check your settings')).toBeVisible()
    expect(screen.queryByText('Connection question')).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'not present' } })
    expect(await screen.findByText('No results found')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(await screen.findByText('Connection question')).toBeVisible()
    expect(screen.getByText('Please check your settings')).toBeVisible()
  })
  test('full transcript reads older pages within the same conversation', async () => {
    const latest = Array.from({ length: 100 }, (_, index) => ({
      id: index + 2,
      sender: 'user',
      body: `Message ${index + 2}`,
      created_at: 1700000000,
    }))
    vi.mocked(api.get)
      .mockResolvedValueOnce({
        data: { success: true, data: { ...history, messages: latest } },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            ...history,
            messages: [
              {
                id: 1,
                sender: 'user',
                body: 'Oldest message',
                created_at: 1700000000,
              },
            ],
          },
        },
      })
    const transcript = await loadSupportTranscript(undefined, 'legacy-7')
    expect(transcript).toHaveLength(101)
    expect(transcript[0].body).toBe('Oldest message')
    expect(transcript[100].id).toBe(101)
    expect(api.get).toHaveBeenLastCalledWith(
      '/api/support-chat/history?thread_id=legacy-7&before=2'
    )
  })
  test('download transcript exports conversation text as a file', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:transcript')
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL
        static revokeObjectURL = vi.fn()
      }
    )
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: {
          ...history,
          messages: [
            {
              id: 1,
              sender: 'agent',
              body: 'Saved reply',
              created_at: 1700000000,
            },
          ],
        },
      },
    })
    renderChat(undefined, true)
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Download transcript' })
    )
    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)), {
        once: true,
      })
      reader.readAsText(blob)
    })
    expect(text).toContain('Human support')
    expect(text).toContain('Saved reply')
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe(
      'support-conversation.txt'
    )
  })
  test('history failures expose an actionable retry', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    renderChat()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
  })
})

describe('Support entry and workbench', () => {
  const original = useAuthStore.getState()
  afterEach(() => useAuthStore.setState(original))
  test('signed-out visitors do not mount a support entry or fetch conversations', () => {
    useAuthStore.setState({ auth: { ...original.auth, user: null } })
    render(<SupportWidget />)
    expect(
      screen.queryByRole('button', { name: 'Customer support' })
    ).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
  test('users without support permission cannot load the staff queue', () => {
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 7, username: 'user', role: 1 } },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportWorkbench />
      </QueryClientProvider>
    )
    expect(screen.queryByText('Support workbench')).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
  test('knowledge-only permission opens management without fetching customer conversations', () => {
    useAuthStore.setState({
      auth: {
        ...original.auth,
        user: {
          id: 42,
          username: 'editor',
          role: 10,
          permissions: { admin_permissions: { support: { write: true } } },
        },
      },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportWorkbench />
      </QueryClientProvider>
    )
    expect(
      screen.getByRole('button', { name: 'Support knowledge base' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'AI settings' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Messages' })
    ).not.toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })
  test('the round launcher opens a welcome panel and navigates to help and messages', async () => {
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 7, username: 'user', role: 1 } },
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      let data: unknown = {
        ...history,
        conversation: { ...history.conversation, last_message_id: 1 },
        messages: [
          {
            id: 1,
            sender: 'agent',
            body: 'Your request has been received',
            created_at: 1700000000,
          },
        ],
      }
      if (url.includes('/conversations')) {
        data = { items: [history.conversation], total: 1 }
      }
      if (url.endsWith('/knowledge')) {
        data = [
          {
            id: 'faq-1',
            title: 'How do I create an API key?',
            content: 'Open the API keys page and create a key.',
            published: true,
          },
        ]
      }
      if (url.endsWith('/info')) {
        data = {
          enabled: true,
          ai_available: false,
          offline_message: '',
          staff: false,
        }
      }
      if (url.includes('/history?thread_id=') && !url.endsWith('legacy-7')) {
        data = history
      }
      if (url === '/api/support') {
        data = []
      }
      return { data: { success: true, data } }
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportWidget />
      </QueryClientProvider>
    )
    const launcher = await screen.findByRole('button', {
      name: 'Customer support',
    })
    expect(launcher).toHaveClass('rounded-full', 'size-15')
    expect(launcher).not.toHaveTextContent('Customer support')
    fireEvent.click(launcher)
    expect(
      await screen.findByRole('heading', { name: /^Hi there/ })
    ).toBeVisible()
    for (let toggle = 0; toggle < 2; toggle++) {
      const popup = screen
        .getByRole('heading', { name: /^Hi there/ })
        .closest('[data-slot="popover-content"]')
      fireEvent.click(launcher)
      expect(launcher).toHaveAttribute('aria-expanded', 'false')
      expect(popup).not.toBeInTheDocument()
      fireEvent.click(launcher)
      expect(
        await screen.findByRole('heading', { name: /^Hi there/ })
      ).toBeVisible()
      expect(launcher).toHaveAttribute('aria-expanded', 'true')
    }
    expect(
      screen.getByRole('button', { name: /Recent message/ })
    ).toHaveTextContent('Your request has been received')
    for (const [name, href] of [
      ['View model list', '/pricing'],
      ['User Agreement', '/user-agreement'],
      ['Privacy Policy', '/privacy-policy'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }

    expect(
      screen
        .getByRole('tab', { name: 'Home' })
        .closest('[data-slot="popover-content"]')
    ).toHaveStyle({
      width: '400px',
      height: '650px',
    })
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    const navigation = screen.getByRole('tablist', { name: 'Customer support' })
    expect(
      navigation.closest('[data-slot="support-dock-surface"]')
    ).toHaveClass('rounded-full', 'backdrop-blur-2xl', 'flex-1', 'h-[70px]')
    const indicator = navigation.querySelector('[data-slot="tabs-indicator"]')
    expect(indicator).toHaveClass(
      'transition-[transform,width,height]',
      'motion-reduce:transition-none'
    )
    for (const name of ['Home', 'Help', 'Messages']) {
      expect(screen.getByRole('tab', { name })).toHaveClass(
        'rounded-full',
        'h-full'
      )
    }
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Help' }))
    expect(screen.getByRole('tab', { name: 'Help' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute(
      'aria-selected',
      'false'
    )
    expect(navigation.querySelector('[data-slot="tabs-indicator"]')).toBe(
      indicator
    )
    expect(screen.getByRole('heading', { name: 'Help' })).toHaveClass(
      'left-1/2',
      '-translate-x-1/2'
    )
    expect(
      screen.getByRole('heading', { name: 'Help' }).closest('header')
    ).not.toBeNull()
    fireEvent.click(
      await screen.findByRole('button', { name: 'How do I create an API key?' })
    )
    await waitFor(() =>
      expect(
        screen.getByText('Open the API keys page and create a key.')
      ).toBeVisible()
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Messages' }))
    const newConversation = screen.getByRole('button', {
      name: 'Send us a message',
    })
    expect(newConversation).toBeVisible()
    expect(newConversation).toHaveClass(
      'rounded-full',
      'size-[56px]',
      'shrink-0'
    )
    expect(
      newConversation.closest('[data-slot="support-dock-surface"]')
    ).toHaveClass(
      'rounded-full',
      'backdrop-blur-2xl',
      'h-[70px]',
      'p-1.5',
      'bg-background/85',
      'border-border/50'
    )
    expect(newConversation).not.toHaveTextContent('Send us a message')
    expect(screen.getByRole('heading', { name: 'Messages' })).toHaveClass(
      'left-1/2',
      '-translate-x-1/2'
    )
    expect(
      await screen.findByRole('button', { name: /Connection help/ })
    ).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: 'Message' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Connection help/ }))
    expect(
      await screen.findByRole('textbox', { name: 'Message' })
    ).toBeVisible()
    expect(api.get).toHaveBeenCalledWith(
      '/api/support-chat/history?thread_id=legacy-7'
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: 'Draft survives resizing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Expand window' })
    )
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Draft survives resizing'
    )
    expect(
      screen
        .getByRole('textbox', { name: 'Message' })
        .closest('[data-slot="popover-content"]')
    ).toHaveStyle({
      width: '760px',
      height: '760px',
      maxHeight:
        'min(calc(100dvh - var(--app-header-height, 3rem) - 112px), var(--available-height))',
    })
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Collapse window' })
    )
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue(
      'Draft survives resizing'
    )
    expect(
      screen
        .getByRole('textbox', { name: 'Message' })
        .closest('[data-slot="popover-content"]')
    ).toHaveStyle({ width: '400px' })

    expect(
      screen.queryByRole('tab', { name: 'Messages' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Send us a message/ })
    )
    const textbox = await screen.findByRole('textbox', { name: 'Message' })
    expect(
      screen.queryByText('Your request has been received')
    ).not.toBeInTheDocument()
    fireEvent.change(textbox, { target: { value: 'A separate question' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/api/support-chat/action',
        expect.objectContaining({
          action: 'send',
          body: 'A separate question',
          thread_id: expect.any(String),
        }),
        expect.any(Object)
      )
    )
    const sent = vi
      .mocked(api.post)
      .mock.calls.find(
        (call) => (call[1] as { action: string }).action === 'send'
      )?.[1] as {
      thread_id: string
    }
    expect(sent.thread_id).not.toBe('legacy-7')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('tab', { name: 'Messages' })
      ).not.toBeInTheDocument()
    )
    expect(launcher).toHaveAttribute('aria-expanded', 'false')
  })
  test('root can save quick replies and waiting message', async () => {
    useAuthStore.setState({
      auth: { ...original.auth, user: { id: 1, username: 'root', role: 100 } },
    })
    vi.mocked(api.get).mockImplementation(async (url) => {
      let data: unknown = { items: [], total: 0 }
      if (url.endsWith('/settings')) {
        data = { enabled: true, knowledge: '', offline_message: '' }
      }
      if (url.endsWith('/knowledge')) {
        data = [
          {
            id: 'faq-1',
            title: 'How do I create an API key?',
            content: 'Open the API keys page and create a key.',
            published: true,
          },
        ]
      }
      if (url.endsWith('/info')) {
        data = { enabled: true, ai_available: false, staff: true }
      }
      return { data: { success: true, data } }
    })
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportWorkbench />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Support settings' }))
    await screen.findByRole('textbox', { name: 'Waiting message' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Waiting message' }), {
      target: { value: 'We will reply soon' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add quick reply' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick reply' }), {
      target: { value: 'Checking your order' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add quick reply' }))
    fireEvent.change(
      screen.getAllByRole('textbox', { name: 'Quick reply' })[1],
      { target: { value: 'Please share a screenshot.' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/api/support-chat/settings', {
        quick_replies: ['Checking your order', 'Please share a screenshot.'],
        enabled: true,
        knowledge: '',
        offline_message: 'We will reply soon',
      })
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved successfully'
    )
  })
})

describe('Support FAQ', () => {
  test.each([true, false])(
    'empty or disabled FAQ shows an empty state (enabled: %s)',
    async (enabled) => {
      vi.mocked(getStatus).mockResolvedValue({
        faq_enabled: enabled,
        faq: enabled
          ? []
          : [{ id: 1, question: 'Hidden question', answer: 'Hidden answer' }],
      })
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={client}>
          <FAQPanel compact />
        </QueryClientProvider>
      )
      expect(await screen.findByText('No FAQ entries available')).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Hidden question' })
      ).not.toBeInTheDocument()
    }
  )
})

describe('Support order replies', () => {
  test.each(['resolved', 'waiting', 'other-agent', 'owned'])(
    'order sending respects %s state and retries the same reply',
    async (state) => {
      const original = useAuthStore.getState()
      useAuthStore.setState({
        auth: {
          ...original.auth,
          user: { id: 9, username: 'admin', role: 100 },
        },
      })
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
      client.setQueryData(['support-chat', 'history', 9, 7, 'thread-7'], {
        ...history,
        conversation: {
          ...history.conversation,
          id: 'thread-7',
          status:
            state === 'owned' || state === 'other-agent' ? 'human' : state,
          agent_id: state === 'other-agent' ? 8 : 9,
        },
      })
      vi.mocked(api.get).mockResolvedValue({
        data: {
          success: true,
          data: [{ trade_no: 'ANT-order-7', order_status: 'expired' }],
        },
      })
      try {
        render(
          <QueryClientProvider client={client}>
            <SupportOrders userID={7} threadID='thread-7' embedded />
          </QueryClientProvider>
        )
        const button = await screen.findByRole('button', {
          name: 'Send to chat',
        })
        if (state !== 'owned') {
          expect(button).toBeDisabled()
          expect(api.post).not.toHaveBeenCalled()
          return
        }
        vi.mocked(api.post).mockRejectedValueOnce(new Error('Connection lost'))
        fireEvent.click(button)
        fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
        expect(
          await screen.findByRole('button', { name: 'Sent to chat' })
        ).toBeDisabled()
        expect(api.post).toHaveBeenCalledTimes(2)
        const first = vi.mocked(api.post).mock.calls[0]
        expect(first).toEqual([
          '/api/support-chat/users/7',
          {
            thread_id: 'thread-7',
            action: 'reply',
            body: encodeOrderMessage({
              trade_no: 'ANT-order-7',
              order_status: 'expired',
            }),
            request_id: expect.any(String),
          },
          { timeout: 40000 },
        ])
        expect(vi.mocked(api.post).mock.calls[1]).toEqual(first)
      } finally {
        client.clear()
        useAuthStore.setState(original)
      }
    }
  )
})

test('order messages preserve the order reference and reject malformed card content', () => {
  const body = encodeOrderMessage({
    trade_no: 'ALI-card-7',
    order_status: 'pending',
  })
  expect(parseOrderMessage(body)).toEqual({
    type: 'support_order',
    version: 1,
    trade_no: 'ALI-card-7',
    order_status: 'pending',
  })
  expect(parseOrderMessage('Order number: ALI-card-7')).toBeNull()
  expect(parseOrderMessage('{bad json')).toBeNull()
  expect(
    parseOrderMessage(
      '{"type":"support_order","version":1,"trade_no":"","order_status":"pending"}'
    )
  ).toBeNull()
})

test.each([false, true])(
  'order cards link to the matching order page when staff view is %s',
  async (staff) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: {
        success: true,
        data: url.endsWith('/agents')
          ? []
          : {
              ...history,
              messages: [
                {
                  id: 1,
                  sender: 'agent',
                  actor_id: 9,
                  body: encodeOrderMessage({
                    trade_no: 'ALI-card-7',
                    order_status: 'pending',
                  }),
                  created_at: 1700000000,
                },
              ],
            },
      },
    }))
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => <SupportChat userID={staff ? 7 : undefined} />,
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    const card = await screen.findByRole('link', { name: /ALI-card-7/ })
    expect(card).toHaveAttribute(
      'href',
      `${staff ? '/site-orders' : '/my-orders'}?order=ALI-card-7`
    )
    expect(within(card).getByText('Awaiting payment')).toBeVisible()
    expect(within(card).getByText('View details')).toBeVisible()
    client.clear()
  }
)

test('selecting a configured quick reply sends it directly and retries without duplicates', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        quick_replies: ['Checking your order', 'Please share a screenshot.'],
      },
    },
  })
  vi.mocked(api.post).mockRejectedValueOnce(new Error('Connection lost'))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SupportQuickReplies userID={7} threadID='thread-7' disabled={false} />
    </QueryClientProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Quick reply' }))
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Checking your order' })
  )
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Quick reply' }))
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Retry: Checking your order' })
  )
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
  expect(vi.mocked(api.post).mock.calls[0]).toEqual([
    '/api/support-chat/users/7',
    {
      action: 'reply',
      thread_id: 'thread-7',
      body: 'Checking your order',
      request_id: expect.any(String),
    },
    { timeout: 40000 },
  ])
  expect(vi.mocked(api.post).mock.calls[1]).toEqual(
    vi.mocked(api.post).mock.calls[0]
  )
  client.clear()
})

describe('Support knowledge', () => {
  test('published sources open the current article and unavailable sources show a fallback', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'published',
            title: 'Connection guide',
            content: 'Use the API keys page.',
            published: true,
          },
        ],
      },
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportSources sources={['published', 'withdrawn']} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Source 1' }))
    expect(await screen.findByText('Use the API keys page.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Source 2' }))
    expect(
      await screen.findByText('This article is no longer available.')
    ).toBeVisible()
  })
  test('a knowledge editor saves a draft with its revision and explicit publication state', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: { revision: 3, articles: [] } },
    })
    vi.mocked(api.put).mockImplementation(async (_url, body) => ({
      data: { success: true, data: { ...(body as object), revision: 4 } },
    }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SupportKnowledgeEditor />
      </QueryClientProvider>
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Support knowledge base' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Add article' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Connection guide' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Content' }), {
      target: { value: 'Use the API keys page.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/support-chat/knowledge-settings',
        expect.objectContaining({
          revision: 3,
          articles: [
            expect.objectContaining({
              title: 'Connection guide',
              published: false,
            }),
          ],
        })
      )
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved successfully'
    )
  })
})

test('AI settings submit endpoint and key and clear the secret field after saving', async () => {
  const config = {
    revision: 0,
    enabled: true,
    base_url: '',
    model: '',
    daily_requests: 200,
    welcome_message: '',
  }
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: { config, credentials_configured: false, default_model: '' },
    },
  })
  vi.mocked(api.put).mockResolvedValue({
    data: {
      success: true,
      data: {
        config: {
          ...config,
          revision: 1,
          base_url: 'https://example.com/v1',
          model: 'support-model',
        },
        credentials_configured: true,
        default_model: '',
      },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <SupportAISettingsEditor />
    </QueryClientProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'AI settings' }))
  await screen.findByLabelText('API URL')
  const limitToggle = screen.getByRole('switch', {
    name: 'Enable daily AI request limit',
  })
  expect(limitToggle).not.toBeChecked()
  expect(
    screen.queryByLabelText('Daily AI request limit (UTC)')
  ).not.toBeInTheDocument()
  fireEvent.click(limitToggle)
  fireEvent.change(screen.getByLabelText('Daily AI request limit (UTC)'), {
    target: { value: '42' },
  })
  fireEvent.click(limitToggle)
  expect(
    screen.queryByLabelText('Daily AI request limit (UTC)')
  ).not.toBeInTheDocument()
  fireEvent.change(await screen.findByLabelText('API URL'), {
    target: { value: 'https://example.com/v1' },
  })
  fireEvent.change(screen.getByLabelText('API Key'), {
    target: { value: 'typed-private-key' },
  })
  fireEvent.change(screen.getByLabelText('Model'), {
    target: { value: 'support-model' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/api/support-chat/ai-settings',
      expect.objectContaining({
        api_key: 'typed-private-key',
        daily_limit_enabled: false,
        daily_requests: 42,
        base_url: 'https://example.com/v1',
        model: 'support-model',
      })
    )
  )
  await waitFor(() => expect(screen.getByLabelText('API Key')).toHaveValue(''))
})

test('each AI reply offers human handoff for the current conversation', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: {
        ...history,
        messages: [
          {
            id: 1,
            sender: 'ai',
            body: 'First AI reply',
            created_at: 1700000000,
          },
          {
            id: 2,
            sender: 'ai',
            body: 'Second AI reply',
            created_at: 1700000001,
          },
        ],
      },
    },
  })
  renderChat()
  await screen.findByText('Second AI reply')
  expect(screen.getAllByRole('separator')).toHaveLength(2)
  const buttons = screen.getAllByRole('button', { name: 'Talk to a person' })
  expect(buttons).toHaveLength(3)
  fireEvent.click(buttons[2])
  await waitFor(() =>
    expect(api.post).toHaveBeenCalledWith(
      '/api/support-chat/action',
      expect.objectContaining({ action: 'handoff', version: 1 }),
      expect.anything()
    )
  )
})

test('an in-progress AI answer is visible and still allows human handoff', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { ...history, ai_draft: 'Partial answer' } },
  })
  renderChat()
  expect(await screen.findByText('Partial answer')).toBeVisible()
  expect(screen.getByText('Thinking...')).toBeVisible()
  expect(
    screen.getAllByRole('button', { name: 'Talk to a person' }).at(-1)
  ).toBeEnabled()
})
