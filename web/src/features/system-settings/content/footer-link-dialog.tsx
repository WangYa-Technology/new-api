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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FooterSocialIcon } from '@/features/footer/components/footer-social-icon'
import {
  FOOTER_SOCIAL_ICON_OPTIONS,
  isFooterLinkUrl,
  type FooterLink,
  type FooterSocialIconName,
  type FooterSocialLink,
} from '@/features/footer/types'

export type FooterLinkFormValues = {
  label: string
  url: string
  icon: FooterSocialIconName
}

type FooterLinkDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'social' | 'column'
  link: FooterLink | FooterSocialLink | null
  onSubmit: (values: FooterLinkFormValues) => void
}

const FOOTER_LINK_FORM_ID = 'footer-link-form'
const FOOTER_ICON_LABELS: Record<FooterSocialIconName, string> = {
  github: 'GitHub',
  documentation: 'Documentation',
  discord: 'Discord',
  telegram: 'Telegram',
  email: 'Email',
}

export function FooterLinkDialog(props: FooterLinkDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        label: z
          .string()
          .trim()
          .min(1, t('Link title is required'))
          .max(80, t('Link title must be 80 characters or fewer')),
        url: z.string().refine(isFooterLinkUrl, t('Enter a valid footer link')),
        icon: z.enum(FOOTER_SOCIAL_ICON_OPTIONS),
      }),
    [t]
  )
  const form = useForm<FooterLinkFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', url: '', icon: 'github' },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      label: props.link?.label ?? '',
      url: props.link?.url ?? '',
      icon: props.link && 'icon' in props.link ? props.link.icon : 'github',
    })
  }, [form, props.link, props.open])

  const isSocial = props.kind === 'social'
  const iconItems = useMemo(
    () =>
      FOOTER_SOCIAL_ICON_OPTIONS.map((icon) => ({
        value: icon,
        label: (
          <span className='flex items-center gap-2'>
            <FooterSocialIcon name={icon} />
            {t(FOOTER_ICON_LABELS[icon])}
          </span>
        ),
      })),
    [t]
  )
  let dialogTitle = props.link ? t('Edit footer link') : t('Add footer link')
  let dialogDescription = t(
    'Configure the label and destination for this footer link.'
  )
  if (isSocial) {
    dialogTitle = props.link ? t('Edit social link') : t('Add social link')
    dialogDescription = t(
      'Configure the label, destination, and icon for this social link.'
    )
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={dialogTitle}
      description={dialogDescription}
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form={FOOTER_LINK_FORM_ID}>
            {props.link ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={FOOTER_LINK_FORM_ID}
          className='space-y-4'
          onSubmit={form.handleSubmit(props.onSubmit)}
        >
          <FormField
            control={form.control}
            name='label'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Link title')}</FormLabel>
                <FormControl>
                  <Input maxLength={80} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='url'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Destination URL')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder='https://example.com'
                    maxLength={500}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {isSocial ? (
            <FormField
              control={form.control}
              name='icon'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Icon')}</FormLabel>
                  <Select
                    items={iconItems}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder={t('Icon')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {FOOTER_SOCIAL_ICON_OPTIONS.map((icon) => (
                          <SelectItem key={icon} value={icon}>
                            <FooterSocialIcon name={icon} />
                            {t(FOOTER_ICON_LABELS[icon])}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </form>
      </Form>
    </Dialog>
  )
}
