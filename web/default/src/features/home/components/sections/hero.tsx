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
  BookOpen,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  KeyRound,
  Layers3,
  Route,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

import { HeroTerminalDemo } from '../hero-terminal-demo'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const providerGroups = [
  'DeepSeek',
  'Qwen',
  'Zhipu AI',
  'Doubao',
  'Moonshot AI',
  'Baichuan AI',
  'MiniMax',
  'Tencent Hunyuan',
  'StepFun',
]

const HERO_TARGET_ROTATION_MS = 2200

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const [rotatingTargetIndex, setRotatingTargetIndex] = useState(0)
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const rotatingTargets = [t('AI models'), t('AI agents'), t('AI teams')]

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (motionQuery.matches) {
      return
    }

    const intervalId = window.setInterval(() => {
      setRotatingTargetIndex((currentIndex) => {
        return (currentIndex + 1) % rotatingTargets.length
      })
    }, HERO_TARGET_ROTATION_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [rotatingTargets.length])

  const renderDocsButton = () => {
    if (docsUrl.startsWith('http')) {
      return (
        <Button
          variant='outline'
          className='border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground h-11 rounded-full px-5 text-sm font-semibold shadow-sm backdrop-blur transition'
          render={
            <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
          }
        >
          <BookOpen className='size-4' />
          {t('View Docs')}
        </Button>
      )
    }

    return (
      <Button
        variant='outline'
        className='border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground h-11 rounded-full px-5 text-sm font-semibold shadow-sm backdrop-blur transition'
        render={<Link to={docsUrl} />}
      >
        <BookOpen className='size-4' />
        {t('View Docs')}
      </Button>
    )
  }

  return (
    <section
      id='platform'
      className={cn(
        'bg-background text-foreground relative isolate scroll-mt-24 overflow-hidden px-4 pt-24 pb-12 sm:px-6 md:pt-32 md:pb-16',
        props.className
      )}
    >
      <div
        aria-hidden
        className='absolute inset-0 -z-10 bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--primary)_18%,transparent)_1px,transparent_1.6px)] [mask-image:linear-gradient(to_bottom,black_0%,black_62%,transparent_100%)] bg-[size:42px_42px] opacity-70'
      />
      <div
        aria-hidden
        className='absolute inset-x-0 top-0 -z-10 h-44 bg-gradient-to-b from-background via-background/75 to-transparent'
      />

      <div className='mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(520px,1.08fr)] lg:items-center'>
        <div className='max-w-3xl'>
          <AnimateInView
            delay={60}
            threshold={0.02}
            className='mb-6 flex flex-wrap items-center gap-2.5'
          >
            <span className='border-border bg-card text-card-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur'>
              <ShieldCheck className='text-primary size-3.5' />
              {t('AI infrastructure, simplified')}
            </span>
            <span className='border-border bg-card text-card-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur'>
              <CheckCircle2 className='text-primary size-3.5' />
              {t('OpenAI and Anthropic compatible')}
            </span>
          </AnimateInView>

          <AnimateInView
            delay={140}
            threshold={0.02}
            as='span'
            className='block'
          >
            <h1 className='text-foreground max-w-4xl text-3xl leading-tight font-semibold tracking-normal sm:text-4xl lg:text-5xl'>
              <span className='block'>{t('One AI gateway for')}</span>
              <span className='text-primary mt-1 inline-flex min-w-[4.4em] overflow-hidden align-baseline sm:mt-2'>
                <span
                  key={rotatingTargets[rotatingTargetIndex]}
                  className='hero-title-word block'
                >
                  {rotatingTargets[rotatingTargetIndex]}
                </span>
              </span>
            </h1>
          </AnimateInView>

          <AnimateInView delay={220} threshold={0.02}>
            <p className='text-muted-foreground mt-6 max-w-2xl text-base leading-8 md:text-lg'>
              {t(
                'Point OpenAI-compatible SDKs and agent tools to one base URL. Route by model alias across domestic and global providers, track usage, manage credits, and keep every request visible.'
              )}
            </p>
          </AnimateInView>

          <AnimateInView
            delay={300}
            threshold={0.02}
            className='mt-8 flex flex-wrap items-center gap-3'
          >
            {props.isAuthenticated ? (
              <Button
                className='bg-primary text-primary-foreground hover:bg-primary/90 group h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_18px_40px_-18px_color-mix(in_oklch,var(--primary)_72%,transparent)]'
                render={<Link to='/dashboard' />}
              >
                {t('Open Console')}
                <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </Button>
            ) : (
              <Button
                className='bg-primary text-primary-foreground hover:bg-primary/90 group h-11 rounded-xl px-5 text-sm font-semibold shadow-[0_18px_40px_-18px_color-mix(in_oklch,var(--primary)_72%,transparent)]'
                render={<Link to='/sign-up' />}
              >
                {t('Get API Key')}
                <ArrowRight className='size-4 transition-transform group-hover:translate-x-0.5' />
              </Button>
            )}
            {renderDocsButton()}
            <Button
              variant='ghost'
              className='text-muted-foreground hover:bg-accent hover:text-accent-foreground h-11 rounded-xl px-4 text-sm font-semibold'
              render={<Link to='/pricing' />}
            >
              {t('Compare models')}
            </Button>
          </AnimateInView>

          <AnimateInView
            delay={380}
            threshold={0.02}
            className='text-muted-foreground mt-8 grid max-w-2xl grid-cols-2 gap-3 text-sm sm:grid-cols-4'
          >
            {[
              { icon: KeyRound, label: t('One API key') },
              { icon: Route, label: t('Smart routing') },
              { icon: Gauge, label: t('Usage visibility') },
              { icon: CircleDollarSign, label: t('Cost control') },
            ].map((item) => (
              <div key={item.label} className='flex items-center gap-2'>
                <item.icon className='text-primary size-4' />
                <span>{item.label}</span>
              </div>
            ))}
          </AnimateInView>
        </div>

        <AnimateInView
          delay={260}
          threshold={0.02}
          animation='fade-left'
          className='relative min-w-0'
        >
          <div className='border-border bg-card text-card-foreground absolute -top-5 right-5 z-10 hidden rounded-2xl border px-4 py-3 shadow-[0_18px_55px_-35px_color-mix(in_oklch,var(--primary)_42%,transparent)] transition-transform duration-500 hover:-translate-y-1 lg:block'>
            <p className='text-muted-foreground text-xs font-semibold'>
              {t('Gateway online')}
            </p>
            <p className='text-card-foreground mt-1 flex items-center gap-2 text-sm font-semibold'>
              <span className='size-2 rounded-full bg-emerald-500' />
              {t('Healthy routing')}
            </p>
          </div>
          <HeroTerminalDemo className='lg:translate-y-3' />
          <div className='mt-5 grid gap-3 sm:grid-cols-3'>
            {[
              {
                icon: KeyRound,
                title: t('Keys'),
                desc: t('Scoped credentials'),
              },
              {
                icon: Layers3,
                title: t('Models'),
                desc: t('Provider routing'),
              },
              { icon: Gauge, title: t('Cost'), desc: t('Quota and billing') },
            ].map((item, index) => (
              <div
                key={item.title}
                className='border-border bg-card text-card-foreground rounded-2xl border px-4 py-3 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-35px_color-mix(in_oklch,var(--primary)_42%,transparent)]'
                style={{ transitionDelay: `${index * 40}ms` }}
              >
                <item.icon className='text-primary mb-2 size-4' />
                <p className='text-card-foreground text-sm font-semibold'>
                  {item.title}
                </p>
                <p className='text-muted-foreground text-xs'>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </AnimateInView>
      </div>

      <div id='models' className='mx-auto mt-14 max-w-7xl scroll-mt-24'>
        <AnimateInView>
          <div className='border-primary/20 bg-[color-mix(in_oklch,var(--card)_88%,var(--foreground)_6%)] text-card-foreground rounded-2xl border px-4 py-4 shadow-[0_18px_55px_-45px_color-mix(in_oklch,var(--foreground)_45%,transparent)] backdrop-blur'>
            <p className='text-foreground mb-3 text-center text-xs font-bold tracking-[0.18em] uppercase'>
              {t('Route requests across China-first model providers')}
            </p>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8'>
              {providerGroups.map((provider) => (
                <div
                  key={provider}
                  className='border-primary/20 bg-[color-mix(in_oklch,var(--background)_78%,var(--foreground)_9%)] text-foreground rounded-xl border px-3 py-2 text-center text-xs font-bold shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_10%,transparent)]'
                >
                  {t(provider)}
                </div>
              ))}
            </div>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
