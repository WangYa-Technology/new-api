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
  BarChart3,
  Braces,
  CircleDollarSign,
  GitBranch,
  KeyRound,
  LockKeyhole,
  ScrollText,
  ServerCog,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function Features() {
  const { t } = useTranslation()

  const features = [
    {
      icon: Braces,
      title: t('Drop-in API compatibility'),
      desc: t(
        'Keep your existing OpenAI-style clients, agent runtimes, and tools. Change the base URL and token, then continue shipping.'
      ),
    },
    {
      icon: GitBranch,
      title: t('Model aliases and routing'),
      desc: t(
        'Expose simple model names to users while routing traffic to DeepSeek, Qwen, Kimi, Doubao, Hunyuan, and other upstream channels.'
      ),
    },
    {
      icon: ScrollText,
      title: t('Request-level observability'),
      desc: t(
        'See status, latency, tokens, quota impact, model, channel, and user activity for every relay request.'
      ),
    },
    {
      icon: CircleDollarSign,
      title: t('Credits, limits, and billing'),
      desc: t(
        'Define groups, pricing ratios, quotas, subscriptions, and recharge flows so usage stays predictable.'
      ),
    },
    {
      icon: LockKeyhole,
      title: t('Enterprise access control'),
      desc: t(
        'Issue scoped keys, assign groups, configure model permissions, and protect admin workflows.'
      ),
    },
    {
      icon: ServerCog,
      title: t('Self-hosted operations'),
      desc: t(
        'Run on SQLite, MySQL, or PostgreSQL with Redis support and operational settings built in.'
      ),
    },
  ]

  return (
    <section className='bg-background text-foreground border-border relative z-10 overflow-hidden border-y px-4 py-20 sm:px-6 md:py-28'>
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--card)_76%,transparent),color-mix(in_oklch,var(--primary)_5%,var(--background))_46%,color-mix(in_oklch,var(--card)_82%,transparent))]'
      />
      <div
        aria-hidden
        className='absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent'
      />
      <div className='mx-auto max-w-7xl'>
        <AnimateInView className='mx-auto mb-12 max-w-3xl text-center'>
          <p className='text-primary mb-3 text-xs font-bold tracking-[0.2em] uppercase'>
            {t('Router capabilities')}
          </p>
          <h2 className='text-foreground text-3xl leading-tight font-semibold tracking-tight md:text-4xl'>
            {t('One router for apps, agents, and internal tools')}
          </h2>
          <p className='text-muted-foreground mx-auto mt-4 max-w-2xl text-base leading-7'>
            {t(
              'Connect once, switch models freely, and manage credentials, routing, billing, and support workflows from one console.'
            )}
          </p>
        </AnimateInView>

        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {features.map((feature, index) => (
            <AnimateInView
              key={feature.title}
              delay={index * 80}
              animation='fade-up'
              className='bg-card text-card-foreground border-border hover:border-primary/35 group relative overflow-hidden rounded-[1.65rem] border p-6 shadow-[0_18px_55px_-45px_color-mix(in_oklch,var(--primary)_32%,transparent)] transition duration-500 hover:-translate-y-1.5 hover:shadow-[0_28px_80px_-48px_color-mix(in_oklch,var(--primary)_42%,transparent)]'
            >
              <div
                aria-hidden
                className='absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100'
              />
              <div
                aria-hidden
                className='bg-primary/10 group-hover:bg-primary/15 absolute -right-10 -bottom-12 size-36 rounded-full blur-3xl transition duration-500'
              />
              <div className='bg-primary/10 text-primary border-primary/15 group-hover:border-primary/30 relative mb-5 flex size-12 items-center justify-center rounded-2xl border shadow-[0_12px_30px_-18px_color-mix(in_oklch,var(--primary)_65%,transparent)] transition duration-500 group-hover:scale-105'>
                <feature.icon className='size-5' strokeWidth={1.7} />
              </div>
              <h3 className='text-card-foreground relative text-base font-semibold'>
                {feature.title}
              </h3>
              <p className='text-muted-foreground relative mt-2 text-sm leading-6'>
                {feature.desc}
              </p>
            </AnimateInView>
          ))}
        </div>

        <AnimateInView
          animation='fade-up'
          className='bg-card text-card-foreground border-border mt-10 grid overflow-hidden rounded-[2rem] border shadow-[0_34px_95px_-58px_color-mix(in_oklch,var(--primary)_42%,transparent)] lg:grid-cols-[0.85fr_1.15fr]'
        >
          <div className='p-7 md:p-9'>
            <p className='text-primary mb-3 text-xs font-bold tracking-[0.18em] uppercase'>
              {t('Operational visibility')}
            </p>
            <h3 className='text-card-foreground max-w-md text-2xl leading-tight font-semibold tracking-tight md:text-3xl'>
              {t('Know what happened to every request')}
            </h3>
            <p className='text-muted-foreground mt-4 max-w-lg text-sm leading-7'>
              {t(
                'Track routing decisions, user activity, channel health, quota impact, and billing changes so support and engineering can debug from the same timeline.'
              )}
            </p>
          </div>
          <div className='border-border bg-muted/35 border-t p-5 lg:border-t-0 lg:border-l'>
            <div className='grid gap-3 sm:grid-cols-3'>
              {[
                {
                  icon: BarChart3,
                  title: t('Live metrics'),
                  value: '142ms',
                },
                {
                  icon: KeyRound,
                  title: t('Key scopes'),
                  value: 'Team',
                },
                {
                  icon: GitBranch,
                  title: t('Fallback'),
                  value: 'Ready',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className='bg-card text-card-foreground border-border hover:border-primary/35 rounded-2xl border p-4 shadow-sm transition duration-300 hover:-translate-y-1'
                >
                  <item.icon className='text-primary mb-5 size-5' />
                  <p className='text-muted-foreground text-xs'>
                    {item.title}
                  </p>
                  <p className='text-card-foreground mt-1 text-xl font-semibold'>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
