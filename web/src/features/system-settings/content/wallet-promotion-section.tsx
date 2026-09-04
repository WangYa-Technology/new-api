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
import { Save } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createDefaultWalletPromotionConfig,
  createWalletPromotionSchema,
  parseWalletPromotionConfig,
  type WalletPromotionConfig,
} from '@/features/wallet/lib/wallet-promotion'

import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type WalletPromotionSectionProps = {
  data: string
}

export function WalletPromotionSection(props: WalletPromotionSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const schema = useMemo(
    () =>
      createWalletPromotionSchema({
        titleRequired: t('Promotion title is required'),
        titleTooLong: t('Promotion title must be 80 characters or fewer'),
        descriptionTooLong: t(
          'Promotion description must be 240 characters or fewer'
        ),
        actionLabelRequired: t('Action label is required'),
        actionLabelTooLong: t('Action label must be 40 characters or fewer'),
        actionURLTooLong: t('Action URL must be 500 characters or fewer'),
        imageURLTooLong: t('Image URL must be 500 characters or fewer'),
        actionPairRequired: t('Action label and URL must be provided together'),
        actionURLInvalid: t('Enter a valid promotion URL'),
        imageURLInvalid: t('Enter a valid image URL'),
      }),
    [t]
  )
  const form = useForm<WalletPromotionConfig>({
    resolver: zodResolver(schema),
    defaultValues:
      parseWalletPromotionConfig(props.data) ??
      createDefaultWalletPromotionConfig(),
  })

  useEffect(() => {
    form.reset(
      parseWalletPromotionConfig(props.data) ??
        createDefaultWalletPromotionConfig()
    )
  }, [form, props.data])

  const onSubmit = async (values: WalletPromotionConfig) => {
    await updateOption.mutateAsync({
      key: 'console_setting.wallet_promotion',
      value: JSON.stringify(values),
    })
  }

  return (
    <SettingsSection title={t('Wallet promotion')}>
      <Form {...form}>
        <form
          className='flex max-w-2xl flex-col gap-5'
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <p className='text-muted-foreground text-sm'>
            {t('Manage the promotion shown below the wallet balance.')}
          </p>
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <FormItem className='flex flex-row items-center justify-between gap-4 rounded-lg border p-3'>
                <FormLabel className='mb-0'>{t('Show promotion')}</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label={t('Show promotion')}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='title'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Promotion title')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={80} />
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
                <FormLabel>{t('Promotion description')}</FormLabel>
                <FormControl>
                  <Textarea {...field} maxLength={240} />
                </FormControl>
                <FormDescription>
                  {t('Optional, up to 240 characters')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='grid gap-5 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='actionLabel'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Action label')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={40} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='actionUrl'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Action URL')}</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={500} />
                  </FormControl>
                  <FormDescription>
                    {t('Use an internal path or an HTTP(S) URL')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name='imageUrl'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Image URL')}</FormLabel>
                <FormControl>
                  <Input {...field} maxLength={500} />
                </FormControl>
                <FormDescription>
                  {t('Use an HTTP(S) image URL')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type='submit'
            className='self-start'
            disabled={updateOption.isPending}
          >
            <Save data-icon='inline-start' />
            {t('Save settings')}
          </Button>
        </form>
      </Form>
    </SettingsSection>
  )
}
