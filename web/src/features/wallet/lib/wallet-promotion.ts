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

type WalletPromotionValidationMessages = {
  titleRequired: string
  titleTooLong: string
  descriptionTooLong: string
  actionLabelRequired: string
  actionLabelTooLong: string
  actionURLTooLong: string
  imageURLTooLong: string
  actionPairRequired: string
  actionURLInvalid: string
  imageURLInvalid: string
}

const defaultValidationMessages: WalletPromotionValidationMessages = {
  titleRequired: 'Promotion title is required',
  titleTooLong: 'Promotion title must be 80 characters or fewer',
  descriptionTooLong: 'Promotion description must be 240 characters or fewer',
  actionLabelRequired: 'Action label is required',
  actionLabelTooLong: 'Action label must be 40 characters or fewer',
  actionURLTooLong: 'Action URL must be 500 characters or fewer',
  imageURLTooLong: 'Image URL must be 500 characters or fewer',
  actionPairRequired: 'Action label and URL must be provided together',
  actionURLInvalid: 'Enter a valid promotion URL',
  imageURLInvalid: 'Enter a valid image URL',
}

export function isWalletPromotionActionURL(value: string): boolean {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 500 ||
    /[\r\n\\]/.test(value)
  ) {
    return false
  }
  if (value.startsWith('/')) return !value.startsWith('//')

  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.host !== ''
  } catch {
    return false
  }
}

export function isWalletPromotionImageURL(value: string): boolean {
  if (
    !value ||
    value !== value.trim() ||
    value.length > 500 ||
    /[\r\n\\]/.test(value)
  ) {
    return false
  }

  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.host !== ''
  } catch {
    return false
  }
}

export function createWalletPromotionSchema(
  messages: WalletPromotionValidationMessages = defaultValidationMessages
) {
  return z
    .object({
      enabled: z.boolean(),
      title: z.string().max(80, messages.titleTooLong),
      description: z.string().max(240, messages.descriptionTooLong),
      actionLabel: z.string().max(40, messages.actionLabelTooLong),
      actionUrl: z.string().max(500, messages.actionURLTooLong),
      imageUrl: z.string().max(500, messages.imageURLTooLong),
    })
    .superRefine((values, context) => {
      if (values.enabled && !values.title.trim()) {
        context.addIssue({
          code: 'custom',
          message: messages.titleRequired,
          path: ['title'],
        })
      }

      const hasActionLabel = values.actionLabel !== ''
      const hasActionURL = values.actionUrl !== ''
      if (hasActionLabel !== hasActionURL) {
        context.addIssue({
          code: 'custom',
          message: messages.actionPairRequired,
          path: hasActionLabel ? ['actionUrl'] : ['actionLabel'],
        })
      }
      if (hasActionLabel && !values.actionLabel.trim()) {
        context.addIssue({
          code: 'custom',
          message: messages.actionLabelRequired,
          path: ['actionLabel'],
        })
      }
      if (hasActionURL && !isWalletPromotionActionURL(values.actionUrl)) {
        context.addIssue({
          code: 'custom',
          message: messages.actionURLInvalid,
          path: ['actionUrl'],
        })
      }
      if (values.imageUrl && !isWalletPromotionImageURL(values.imageUrl)) {
        context.addIssue({
          code: 'custom',
          message: messages.imageURLInvalid,
          path: ['imageUrl'],
        })
      }
    })
}

export const walletPromotionSchema = createWalletPromotionSchema()

export type WalletPromotionConfig = z.infer<typeof walletPromotionSchema>

export function parseWalletPromotionConfig(
  value: unknown
): WalletPromotionConfig | null {
  let parsed = value
  if (typeof value === 'string') {
    if (!value.trim()) return null
    try {
      parsed = JSON.parse(value)
    } catch {
      return null
    }
  }

  const result = walletPromotionSchema.safeParse(parsed)
  return result.success ? result.data : null
}

export function createDefaultWalletPromotionConfig(): WalletPromotionConfig {
  return {
    enabled: false,
    title: '',
    description: '',
    actionLabel: '',
    actionUrl: '',
    imageUrl: '',
  }
}
