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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  KeyRound,
  PlugZap,
  ScrollText,
  Settings2,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      num: '01',
      icon: KeyRound,
      title: t('Create an API key'),
      desc: t(
        'Generate scoped credentials for an app, agent, teammate, or customer group.'
      ),
    },
    {
      num: '02',
      icon: Settings2,
      title: t('Set your base URL'),
      desc: t(
        'Point existing SDKs and tools to the OpenAI-compatible endpoint without rewriting clients.'
      ),
    },
    {
      num: '03',
      icon: PlugZap,
      title: t('Choose a model alias'),
      desc: t(
        'Route the same request shape to DeepSeek, Qwen, Kimi, Doubao, Hunyuan, and fallback channels.'
      ),
    },
    {
      num: '04',
      icon: ScrollText,
      title: t('Monitor usage live'),
      desc: t(
        'Review latency, quota impact, token usage, billing records, and channel health in real time.'
      ),
    },
  ]

  return (
    <section
      id='how-it-works'
      className='bg-background text-foreground relative z-10 scroll-mt-24 px-4 py-20 sm:px-6 md:py-28'
    >
      <div className='mx-auto max-w-7xl'>
        <div className='grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start'>
          <AnimateInView>
            <p className='text-primary mb-3 text-xs font-bold tracking-[0.2em] uppercase'>
              {t('Start in minutes')}
            </p>
            <h2 className='text-foreground text-3xl leading-tight font-semibold tracking-tight md:text-4xl'>
              {t('Use the tools you already have')}
            </h2>
            <p className='text-muted-foreground mt-4 max-w-xl text-base leading-7'>
              {t(
                'Keep familiar SDKs, prompts, and agent workflows. New API handles keys, model routing, limits, logs, and billing behind one compatible endpoint.'
              )}
            </p>
            <Button
              className='bg-primary text-primary-foreground group mt-7 h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_18px_40px_-18px_color-mix(in_oklch,var(--primary)_70%,transparent)] hover:bg-primary/90'
              render={<Link to='/sign-up' />}
            >
              {t('Start setup')}
              <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
            </Button>
          </AnimateInView>

          <div className='grid gap-4 sm:grid-cols-2'>
            {steps.map((step, index) => (
              <AnimateInView
                key={step.num}
                delay={index * 80}
                animation='fade-up'
                className='bg-card text-card-foreground border-border rounded-2xl border p-5 shadow-sm'
              >
                <div className='mb-6 flex items-center justify-between'>
                  <span className='text-muted-foreground font-mono text-xs font-semibold'>
                    {step.num}
                  </span>
                  <span className='bg-primary/10 text-primary border-primary/15 flex size-10 items-center justify-center rounded-2xl border'>
                    <step.icon className='size-5' strokeWidth={1.8} />
                  </span>
                </div>
                <h3 className='text-card-foreground text-base font-semibold'>
                  {step.title}
                </h3>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                  {step.desc}
                </p>
              </AnimateInView>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
