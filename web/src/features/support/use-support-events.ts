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
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getFreshAuthHeaders } from '@/lib/api'

// SSE is an invalidation signal. History queries recover authoritative messages.
export function useSupportEvents(enabled: boolean, staff = false) {
  const client = useQueryClient()
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function connect() {
      try {
        const headers = await getFreshAuthHeaders()
        if (abort.signal.aborted) return
        const response = await fetch(
          `/api/support-chat/events${staff ? '?staff=true' : ''}`,
          {
            headers,
            credentials: 'include',
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]),
          }
        )
        if (!response.ok || !response.body) {
          throw new Error('Support stream unavailable')
        }
        setConnected(true)
        void client.invalidateQueries({ queryKey: ['support-chat'] })
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let pending = ''
        while (!abort.signal.aborted) {
          const chunk = await reader.read()
          if (chunk.done) break
          pending += decoder
            .decode(chunk.value, { stream: true })
            .replaceAll('\r\n', '\n')
          const end = pending.lastIndexOf('\n\n')
          if (end !== -1) {
            pending = pending.slice(end + 2)
            void client.invalidateQueries({ queryKey: ['support-chat'] })
          }
        }
      } catch {
        if (!abort.signal.aborted) setConnected(false)
        // Existing query polling remains active when streaming is unavailable.
      } finally {
        if (!abort.signal.aborted) {
          timer = setTimeout(() => void connect(), 1000)
        }
      }
    }
    void connect()
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [client, enabled, staff])
  return enabled && connected
}
