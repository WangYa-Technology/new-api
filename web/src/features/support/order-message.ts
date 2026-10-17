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
import { z } from 'zod'

const orderMessageSchema = z.object({
  type: z.literal('support_order'),
  version: z.literal(1),
  trade_no: z.string().min(1).max(200),
  order_status: z.enum([
    'pending',
    'paid',
    'paid_review',
    'review_closed',
    'success',
    'expired',
    'failed',
  ]),
  close_reason: z.string().optional(),
  payment_provider: z.string().optional(),
  cancel_requested: z.boolean().optional(),
  close_requested_at: z.number().optional(),
  cancellation_state: z.string().optional(),
  review_resolution: z.string().optional(),
  cache_pending: z.boolean().optional(),
  review_required: z.boolean().optional(),
})

export type SupportOrderMessage = z.infer<typeof orderMessageSchema>

export function encodeOrderMessage(
  order: Omit<SupportOrderMessage, 'type' | 'version' | 'order_status'> & {
    order_status: string
  }
): string {
  return JSON.stringify(
    orderMessageSchema.parse({ ...order, type: 'support_order', version: 1 })
  )
}

export function parseOrderMessage(body: string): SupportOrderMessage | null {
  if (!body.startsWith('{')) return null
  try {
    const result = orderMessageSchema.safeParse(JSON.parse(body))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
