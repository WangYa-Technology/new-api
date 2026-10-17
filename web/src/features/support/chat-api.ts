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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface SupportConversation {
  id: string
  title: string
  preview: string
  waiting_since?: number
  unread_count?: number
  updated_at: number
  user_id: number
  status: 'ai' | 'waiting' | 'human' | 'resolved'
  agent_id: number
  version: number
  last_message_id: number
  user_read_id: number
  staff_read_id: number
}
export interface SupportMessage {
  id: number
  sender: 'user' | 'ai' | 'agent' | 'note' | 'event'
  actor_id?: number
  target_id?: number
  body: string
  created_at: number
}
export interface SupportHistory {
  ai_draft?: string | null
  conversation: SupportConversation
  messages: SupportMessage[]
  hasMore?: boolean
}
export interface SupportSettings {
  quick_replies: string[]
  enabled: boolean
  knowledge: string
  offline_message: string
}
export interface SupportInfo {
  welcome_message?: string
  quick_replies?: string[]
  enabled: boolean
  ai_available: boolean
  offline_message: string
  staff: boolean
}
export async function supportGet<T>(path: string): Promise<T> {
  const response = await api.get(`/api/support-chat/${path}`)
  return requireServerSuccess(response.data).data as T
}
export async function supportAction(
  userID: number | undefined,
  input: {
    thread_id?: string
    action: string
    body?: string
    request_id?: string
    version?: number
    through?: number
    target_id?: number
  }
): Promise<void> {
  const response = await api.post(
    `/api/support-chat/${userID ? `users/${userID}` : 'action'}`,
    input,
    { timeout: 40000 }
  )
  requireServerSuccess(response.data)
}
export async function saveSupportSettings(
  settings: SupportSettings
): Promise<void> {
  requireServerSuccess(
    (await api.put('/api/support-chat/settings', settings)).data
  )
}

// Read every page of this conversation for search and export, without changing
// the normal lightweight polling query. New arrivals appear on the next refresh.
export async function loadSupportTranscript(
  userID?: number,
  threadID?: string
): Promise<SupportMessage[]> {
  const params = new URLSearchParams()
  if (threadID) params.set('thread_id', threadID)
  const path = userID ? `users/${userID}` : 'history'
  let messages: SupportMessage[] = []
  for (;;) {
    const page = await supportGet<SupportHistory>(`${path}?${params}`)
    messages = [...page.messages, ...messages]
    if (page.messages.length < 100) return messages
    params.set('before', String(page.messages[0].id))
  }
}

// Recover gaps larger than one page after reconnect, then retain older pages.
export async function refreshSupportHistory(
  path: string,
  previous?: SupportHistory
): Promise<SupportHistory> {
  const latest = await supportGet<SupportHistory>(path)
  let fetched = latest.messages
  const lastKnown = previous?.messages.at(-1)?.id
  let page = latest.messages
  while (lastKnown && page.length === 100 && page[0].id > lastKnown) {
    const older = await supportGet<SupportHistory>(
      `${path}${path.includes('?') ? '&' : '?'}before=${page[0].id}`
    )
    page = older.messages
    fetched = [...page, ...fetched]
  }
  const merged = new Map(
    (previous?.messages ?? []).map((message) => [message.id, message])
  )
  for (const message of fetched) merged.set(message.id, message)
  return {
    ...latest,
    messages: [...merged.values()].sort((a, b) => a.id - b.id),
    hasMore: previous?.hasMore ?? page.length === 100,
  }
}
