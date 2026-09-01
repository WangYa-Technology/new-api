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
import {
  BookOpen,
  AtSign,
  Camera,
  CircleHelp,
  Code2,
  Globe2,
  Mail,
  MessageCircle,
  Send,
  type LucideIcon,
} from 'lucide-react'

import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  isUploadedSupportIcon,
  type BuiltInSupportIcon,
  type SupportIcon as SupportIconName,
} from '../types'

const SUPPORT_ICONS: Record<BuiltInSupportIcon, LucideIcon> = {
  message: MessageCircle,
  instagram: Camera,
  send: Send,
  twitter: AtSign,
  github: Code2,
  globe: Globe2,
  book: BookOpen,
  mail: Mail,
  help: CircleHelp,
}

type SupportIconProps = {
  name: SupportIconName
  className?: string
}

export function SupportIcon(props: SupportIconProps) {
  if (isUploadedSupportIcon(props.name)) {
    return (
      <img
        src={props.name}
        alt=''
        className={cn('object-contain', props.className)}
        aria-hidden='true'
      />
    )
  }

  const BuiltInIcon = SUPPORT_ICONS[props.name as BuiltInSupportIcon]
  if (BuiltInIcon) {
    return <BuiltInIcon className={props.className} aria-hidden='true' />
  }

  return (
    <span
      className={cn('inline-flex items-center justify-center', props.className)}
      aria-hidden='true'
    >
      {getLobeIcon(props.name, 20)}
    </span>
  )
}
