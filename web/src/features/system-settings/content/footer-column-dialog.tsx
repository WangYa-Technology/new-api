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
import type { FooterColumn } from '@/features/footer/types'

export type FooterColumnFormValues = {
  title: string
}

type FooterColumnDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  column: FooterColumn | null
  onSubmit: (values: FooterColumnFormValues) => void
}

const FOOTER_COLUMN_FORM_ID = 'footer-column-form'

export function FooterColumnDialog(props: FooterColumnDialogProps) {
  const { t } = useTranslation()
  const schema = useMemo(
    () =>
      z.object({
        title: z
          .string()
          .trim()
          .min(1, t('Column title is required'))
          .max(80, t('Column title must be 80 characters or fewer')),
      }),
    [t]
  )
  const form = useForm<FooterColumnFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '' },
  })

  useEffect(() => {
    if (!props.open) return
    form.reset({ title: props.column?.title ?? '' })
  }, [form, props.column, props.open])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.column ? t('Edit column') : t('Add column')}
      description={t('Set the heading shown above a group of footer links.')}
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='submit' form={FOOTER_COLUMN_FORM_ID}>
            {props.column ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={FOOTER_COLUMN_FORM_ID}
          onSubmit={form.handleSubmit(props.onSubmit)}
        >
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Column title')}</FormLabel>
                <FormControl>
                  <Input maxLength={80} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
