import { zodResolver } from '@hookform/resolvers/zod'
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '@/features/auth/secure-verification'
import { api } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { requireServerSuccess } from '@/lib/server-error-message'

const schema = z.object({
  id: z.number(),
  enabled: z.boolean(),
  sandbox: z.boolean(),
  app_id: z.string().regex(/^\d{16,32}$/),
  seller_id: z.string().regex(/^\d{16,32}$/),
  private_key: z.string(),
  public_key: z.string().min(1),
  notify_base_url: z.string().url(),
  return_url: z.string().url(),
  unit_price: z.string().regex(/^\d{1,7}(\.\d{1,6})?$/),
  min_topup: z.number().int().min(1).max(1000000),
  page_pay: z.boolean(),
  wap_pay: z.boolean(),
})
type Config = z.infer<typeof schema>
type ConfigResult = {
  config: Omit<Config, 'private_key'>
  has_private_key: boolean
}

export function AlipaySettingsSection() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['alipay-config'],
    queryFn: async (): Promise<ConfigResult> =>
      requireServerSuccess((await api.get('/api/option/alipay')).data).data,
  })
  if (query.isPending) return <LoadingState />
  if (!query.data) {
    return (
      <Button type='button' onClick={() => void query.refetch()}>
        {t('Retry')}
      </Button>
    )
  }
  return <AlipayConfigForm key={query.data.config.id} data={query.data} />
}

function AlipayConfigForm(props: { data: ConfigResult }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const verification = useSecureVerification()
  const form = useForm<Config>({
    resolver: zodResolver(schema, {
      error: () => t('Correct the invalid settings before saving.'),
    }),
    defaultValues: { ...props.data.config, private_key: '' },
  })
  const save = useMutation({
    mutationFn: async (values: Config) => {
      // The proof binds the exact serialized request, including credential changes.
      const body = JSON.stringify(values)
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body)
      )
      const configHash = Array.from(new Uint8Array(digest), (value) =>
        value.toString(16).padStart(2, '0')
      ).join('')
      const proof = await verification.requestVerification({
        scope: 'payment.alipay.configure',
        context: { config_hash: configHash },
      })
      if (!proof) return false
      requireServerSuccess(
        (
          await api.put('/api/option/alipay', body, {
            headers: {
              'Content-Type': 'application/json',
              'X-Security-Proof': proof.proof_token,
            },
          })
        ).data
      )
      return true
    },
    onSuccess: async (saved) => {
      if (!saved) return
      form.setValue('private_key', '')
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({ queryKey: ['alipay-config'] })
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <>
      <div className='space-y-5' data-no-autosubmit='true'>
        <div>
          <h3 className='text-lg font-medium'>{t('Alipay')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Receive wallet topups directly through Alipay. Payments are charged in CNY.'
            )}
          </p>
        </div>
        <p className='text-muted-foreground text-sm'>
          {t('Uses RSA2 public keys. Certificate mode is not supported.')}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Alipay topup amounts use the site display currency and the shared recharge price. In CNY mode, entering 100 credits CNY 100 before discounts.'
          )}
        </p>
        <Form {...form}>
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='enabled'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between'>
                  <FormLabel>{t('Enabled')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='sandbox'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between'>
                  <FormLabel>{t('Alipay sandbox')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='app_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Alipay App ID')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='seller_id'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Alipay Seller ID')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='private_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Application private key')}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      autoComplete='off'
                      placeholder={
                        props.data.has_private_key
                          ? t('Leave blank to keep the saved key')
                          : ''
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='public_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Alipay public key')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='notify_base_url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Public callback base URL')}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder='https://api.example.com' />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='return_url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Payment return URL')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder='https://example.com/wallet'
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='min_topup'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Minimum Topup')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='number'
                      min={1}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='page_pay'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between'>
                  <FormLabel>{t('Desktop website payment')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='wap_pay'
              render={({ field }) => (
                <FormItem className='flex items-center justify-between'>
                  <FormLabel>{t('Mobile website payment')}</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </Form>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Enable only payment products approved for this application. Disabling new payments keeps existing orders active.'
          )}
        </p>
        <Button
          type='button'
          disabled={save.isPending}
          onClick={form.handleSubmit((values) => save.mutate(values))}
        >
          {t('Save Alipay configuration')}
        </Button>
      </div>
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
