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
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function Stats() {
  const { t } = useTranslation()

  const stats = [
    { value: '40+', label: t('provider adapters') },
    { value: '1', label: t('OpenAI-compatible endpoint') },
    { value: '3', label: t('database engines') },
    { value: '24/7', label: t('usage and billing visibility') },
  ]

  return (
    <section className='bg-background text-foreground px-4 py-10 sm:px-6'>
      <div className='mx-auto grid max-w-7xl gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        {stats.map((stat, index) => (
          <AnimateInView
            key={stat.label}
            delay={index * 80}
            threshold={0.25}
            className='bg-card text-card-foreground border-border rounded-2xl border px-5 py-5 shadow-sm'
          >
            <div className='text-card-foreground text-3xl font-semibold tracking-tight'>
              {stat.value}
            </div>
            <div className='text-muted-foreground mt-1 text-sm'>
              {stat.label}
            </div>
          </AnimateInView>
        ))}
      </div>
    </section>
  )
}
