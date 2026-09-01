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
import { BookOpen } from 'lucide-react'

import {
  IconDiscord,
  IconGithub,
  IconGmail,
  IconTelegram,
} from '@/assets/brand-icons'
import { cn } from '@/lib/utils'

import type { FooterSocialIconName } from '../types'

const FOOTER_SOCIAL_ICONS: Record<
  FooterSocialIconName,
  React.ComponentType<{ className?: string }>
> = {
  github: IconGithub,
  documentation: BookOpen,
  discord: IconDiscord,
  telegram: IconTelegram,
  email: IconGmail,
}

type FooterSocialIconProps = {
  name: FooterSocialIconName
  className?: string
}

export function FooterSocialIcon(props: FooterSocialIconProps) {
  const Icon = FOOTER_SOCIAL_ICONS[props.name]
  return <Icon className={cn('size-4', props.className)} />
}
