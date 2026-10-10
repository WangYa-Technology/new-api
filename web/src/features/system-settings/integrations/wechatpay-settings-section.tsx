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
  app_id: z.string().regex(/^wx[a-zA-Z0-9]{16}$/),
  mch_id: z.string().regex(/^\d{8,16}$/),
  serial_no: z.string().regex(/^[a-fA-F0-9]{32,64}$/),
  private_key: z.string(),
  api_v3_key: z.string(),
  public_key_id: z.string().startsWith('PUB_KEY_ID_'),
  public_key: z.string().min(1),
  notify_base_url: z.string().url(),
  min_topup: z.number().int().min(1).max(1000000),
})
type Config = z.infer<typeof schema>
type ConfigResult = {
  config: Omit<Config, 'private_key' | 'api_v3_key'>
  has_private_key: boolean
  has_api_v3_key: boolean
}

export function WechatPaySettingsSection() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['wechatpay-config'],
    queryFn: async (): Promise<ConfigResult> =>
      requireServerSuccess((await api.get('/api/option/wechatpay')).data).data,
  })
  if (query.isPending) return <LoadingState />
  if (!query.data) {
    return (
      <Button type='button' onClick={() => void query.refetch()}>
        {t('Retry')}
      </Button>
    )
  }
  return <WechatPayConfigForm key={query.data.config.id} data={query.data} />
}

function WechatPayConfigForm(props: { data: ConfigResult }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const verification = useSecureVerification()
  const form = useForm<Config>({
    resolver: zodResolver(schema, {
      error: () => t('Correct the invalid settings before saving.'),
    }),
    defaultValues: { ...props.data.config, private_key: '', api_v3_key: '' },
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
        scope: 'payment.wechatpay.configure',
        context: { config_hash: configHash },
      })
      if (!proof) return false
      requireServerSuccess(
        (
          await api.put('/api/option/wechatpay', body, {
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
      form.setValue('api_v3_key', '')
      toast.success(t('Saved successfully'))
      await queryClient.invalidateQueries({ queryKey: ['wechatpay-config'] })
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <>
      <div className='space-y-5' data-no-autosubmit='true'>
        <h3 className='text-lg font-medium'>{t('WeChat Pay')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Accept Native QR payments in CNY using the site currency and shared recharge price.'
          )}
        </p>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Uses WeChat Pay public key mode. Enable Native payment in your merchant account. A public HTTPS callback URL is required.'
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
            {(
              [
                ['app_id', t('WeChat App ID')],
                ['mch_id', t('WeChat merchant ID')],
                ['serial_no', t('Merchant certificate serial number')],
                ['public_key_id', t('WeChat Pay public key ID')],
                ['notify_base_url', t('Public callback base URL')],
              ] as const
            ).map(([name, label]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <FormField
              control={form.control}
              name='api_v3_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('API v3 key')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type='password'
                      autoComplete='off'
                      placeholder={
                        props.data.has_api_v3_key
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
              name='private_key'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Merchant private key')}</FormLabel>
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
                  <FormLabel>{t('WeChat Pay public key')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
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
          </div>
        </Form>
        <Button
          type='button'
          disabled={save.isPending}
          onClick={form.handleSubmit((values) => save.mutate(values))}
        >
          {t('Save WeChat Pay configuration')}
        </Button>
      </div>
      <SecureVerificationDialog {...verification.dialogProps} />
    </>
  )
}
