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

export const SUPPORT_ICON_OPTIONS = [
  'message',
  'instagram',
  'send',
  'twitter',
  'github',
  'globe',
  'book',
  'mail',
  'help',
] as const

export type BuiltInSupportIcon = (typeof SUPPORT_ICON_OPTIONS)[number]

export const SUPPORT_ICON_MAX_FILE_SIZE = 100 * 1024
export const SUPPORT_ICON_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

const supportIconDataUrlPattern =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/
const supportIconMaxDataUrlLength =
  'data:image/jpeg;base64,'.length +
  Math.ceil(SUPPORT_ICON_MAX_FILE_SIZE / 3) * 4

export function isUploadedSupportIcon(icon: string): boolean {
  return (
    icon.length <= supportIconMaxDataUrlLength &&
    supportIconDataUrlPattern.test(icon)
  )
}

const lobeHubIconSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)?$/)

const uploadedSupportIconSchema = z
  .string()
  .refine((value) => isUploadedSupportIcon(value))

export const supportIconSchema = z.union([
  z.enum(SUPPORT_ICON_OPTIONS),
  lobeHubIconSchema,
  uploadedSupportIconSchema,
])

export const supportLinkSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  label: z.string().max(120).optional(),
  description: z.string().max(240).optional(),
  url: z.url().refine((value) => /^https?:\/\//i.test(value)),
  icon: supportIconSchema,
})

export const supportCategorySchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(240).optional(),
  items: z.array(supportLinkSchema).max(30),
})

export const supportConfigSchema = z.array(supportCategorySchema).max(20)

export type SupportIcon = z.infer<typeof supportIconSchema>
export type SupportLink = z.infer<typeof supportLinkSchema>
export type SupportCategory = z.infer<typeof supportCategorySchema>

export type SupportResponse = {
  success: boolean
  message: string
  data: unknown
}
