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
import { Link2 } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

import { ReactIconByName } from './react-icon-by-name'

type OAuthProviderIconProps = {
  icon?: string | null
  className?: string
  fallbackClassName?: string
}

const REACT_ICON_PACK_PREFIXES: Record<string, string> = {
  ai: 'Ai',
  bi: 'Bi',
  bs: 'Bs',
  cg: 'Cg',
  ci: 'Ci',
  di: 'Di',
  fa: 'Fa',
  fa6: 'Fa',
  fc: 'Fc',
  fi: 'Fi',
  gi: 'Gi',
  go: 'Go',
  gr: 'Gr',
  hi: 'Hi',
  hi2: 'Hi',
  im: 'Im',
  io: 'Io',
  io5: 'Io',
  lia: 'Lia',
  lu: 'Lu',
  md: 'Md',
  pi: 'Pi',
  ri: 'Ri',
  rx: 'Rx',
  si: 'Si',
  sl: 'Sl',
  tb: 'Tb',
  tfi: 'Tfi',
  ti: 'Ti',
  vsc: 'Vsc',
  wi: 'Wi',
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

function isEmojiLike(value: string): boolean {
  return [...value].length <= 4 && /[^\w:-]/u.test(value)
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function normalizeReactIconName(icon: string): string | null {
  const [rawPrefix, rawName] = icon.includes(':') ? icon.split(':', 2) : []
  if (rawPrefix && rawName) {
    const prefix = REACT_ICON_PACK_PREFIXES[rawPrefix.toLowerCase()]
    if (!prefix) return null
    if (/^[A-Z][A-Za-z0-9]*$/.test(rawName)) return rawName
    const iconName = toPascalCase(rawName)
    return iconName ? `${prefix}${iconName}` : null
  }

  if (/^[A-Z][A-Za-z0-9]*$/.test(icon)) return icon

  const iconName = toPascalCase(icon)
  return iconName ? `Si${iconName}` : null
}

function FallbackIcon(props: ComponentProps<'svg'>) {
  return <Link2 aria-hidden='true' {...props} />
}

export function OAuthProviderIcon(props: OAuthProviderIconProps) {
  const raw = props.icon?.trim()
  const className = cn('h-4 w-4 shrink-0', props.className)

  if (!raw) {
    return <FallbackIcon className={cn(className, props.fallbackClassName)} />
  }

  if (isHttpUrl(raw)) {
    return (
      <img
        src={raw}
        alt=''
        className={cn('rounded-sm object-contain', className)}
        onError={(event) => {
          event.currentTarget.style.display = 'none'
        }}
      />
    )
  }

  if (isEmojiLike(raw)) {
    return (
      <span
        aria-hidden='true'
        className={cn('inline-flex items-center justify-center', className)}
      >
        {raw}
      </span>
    )
  }

  const iconName = normalizeReactIconName(raw)
  if (!iconName) {
    return <FallbackIcon className={cn(className, props.fallbackClassName)} />
  }

  return (
    <ReactIconByName name={iconName} className={className} aria-hidden='true' />
  )
}
