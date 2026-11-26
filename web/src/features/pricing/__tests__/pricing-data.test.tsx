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
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { usePricingData } from '../hooks/use-pricing-data'

it('refreshes a cached legacy request price when reopening the pricing page', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const legacy = { model_name: 'seedance-2.0-fast', model_price: 0.121 }
  client.setQueryData(['pricing'], {
    success: true,
    data: [legacy],
    vendors: [],
  })
  const variant = {
    plugin_key: 'video',
    plugin_name: 'Video',
    billing_mode: 'tiered_expr',
    billing_expr: 'tier("video", u("tokens") * 3.29452 / 1000000)',
    billing_usage_schema: { tokens: { type: 'number', unit: 'token' } },
  }
  const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data:
      path === '/api/pricing'
        ? {
            success: true,
            data: [{ ...legacy, billing_plugin_variants: [variant] }],
            vendors: [],
          }
        : { success: true, data: {} },
  }))
  const { result, unmount } = renderHook(() => usePricingData(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  try {
    await waitFor(() =>
      expect(result.current.models[0]?.billing_plugin_variants).toEqual([
        variant,
      ])
    )
  } finally {
    unmount()
    get.mockRestore()
    client.clear()
  }
})
