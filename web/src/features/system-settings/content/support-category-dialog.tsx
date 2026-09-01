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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { SupportCategory } from '@/features/support/types'

export type SupportCategoryFormValues = {
  title: string
  description: string
}

type SupportCategoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: SupportCategory | null
  onSubmit: (values: SupportCategoryFormValues) => void
}

const SUPPORT_CATEGORY_FORM_ID = 'support-category-form'

export function SupportCategoryDialog(props: SupportCategoryDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('Category title is required'))
          .max(80, t('Category title must be 80 characters or fewer')),
        description: z
          .string()
          .max(240, t('Description must be 240 characters or fewer')),
      }),
    [t]
  )
  const form = useForm<SupportCategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', description: '' },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({
      title: props.category?.title ?? '',
      description: props.category?.description ?? '',
    })
  }, [form, props.category, props.open])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.category ? t('Edit support category') : t('Add support category')
      }
      description={t(
        'Set the heading and optional description shown above a group of support links.'
      )}
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form={SUPPORT_CATEGORY_FORM_ID}>
            {props.category ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={SUPPORT_CATEGORY_FORM_ID}
          className='space-y-4'
          onSubmit={form.handleSubmit(props.onSubmit)}
        >
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Category title')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t('Community')}
                    maxLength={80}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='description'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Category description')}</FormLabel>
                <FormControl>
                  <Textarea rows={3} maxLength={240} {...field} />
                </FormControl>
                <FormDescription>
                  {t('Optional, up to 240 characters')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
