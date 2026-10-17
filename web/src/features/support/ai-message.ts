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

const answerSchema = z.object({
  type: z.literal('support_answer'),
  answer: z.string(),
  interrupted: z.boolean().optional(),
  sources: z.array(z.string()).max(5),
})
export function parseSupportAnswer(body: string) {
  if (!body.startsWith('{')) return null
  try {
    const parsed = answerSchema.safeParse(JSON.parse(body))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
