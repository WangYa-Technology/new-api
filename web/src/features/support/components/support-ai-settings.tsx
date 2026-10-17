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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { supportGet } from '../chat-api'

const schema = z.object({
  base_url: z.string().max(2000),
  api_key: z.string().max(4096),
  revision: z.number(),
  enabled: z.boolean(),
  model: z.string().max(200),
  daily_limit_enabled: z.boolean(),
  daily_requests: z.number().int().min(1).max(10000),
  welcome_message: z.string().max(500),
})
type AIConfig = z.infer<typeof schema>
interface AISettings {
  config: AIConfig
  credentials_configured: boolean
  default_model: string
}
function AISettingsForm(props: { initial: AISettings }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<AIConfig>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...props.initial.config,
      daily_limit_enabled: props.initial.config.daily_limit_enabled ?? false,
      daily_requests: props.initial.config.daily_requests || 200,
      base_url: props.initial.config.base_url ?? '',
      api_key: '',
    },
  })
  const save = useMutation({
    mutationFn: async (values: AIConfig) =>
      requireServerSuccess(
        (await api.put('/api/support-chat/ai-settings', values)).data
      ).data as AISettings,
    onSuccess: async (data) => {
      form.reset({
        ...data.config,
        daily_limit_enabled: data.config.daily_limit_enabled ?? false,
        daily_requests: data.config.daily_requests || 200,
        api_key: '',
      })
      await client.invalidateQueries({ queryKey: ['support-chat'] })
    },
  })
  return (
    <form
      className='space-y-4'
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <div className='flex items-center justify-between'>
        <Label htmlFor='support-ai-enabled'>{t('AI support')}</Label>
        <Switch
          id='support-ai-enabled'
          checked={form.watch('enabled')}
          onCheckedChange={(value) =>
            form.setValue('enabled', value, { shouldDirty: true })
          }
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='support-ai-url'>{t('API URL')}</Label>
        <Input
          id='support-ai-url'
          placeholder='https://api.example.com/v1'
          maxLength={2000}
          {...form.register('base_url')}
        />
      </div>
      <div className='space-y-2'>
        <Label htmlFor='support-ai-key'>{t('API Key')}</Label>
        <PasswordInput
          id='support-ai-key'
          autoComplete='new-password'
          maxLength={4096}
          {...form.register('api_key')}
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Leave the key blank to keep it unchanged. Enter a new key when changing the API URL.'
          )}
        </p>
      </div>
      {!props.initial.credentials_configured && (
        <p role='status'>
          {t(
            'AI credentials are not configured. Conversations will go to human support.'
          )}
        </p>
      )}
      <div className='space-y-2'>
        <Label htmlFor='support-ai-model'>{t('Model')}</Label>
        <Input
          id='support-ai-model'
          placeholder={props.initial.default_model}
          {...form.register('model')}
        />
      </div>
      <div className='flex items-center justify-between gap-3'>
        <Label htmlFor='support-ai-limit-enabled'>
          {t('Enable daily AI request limit')}
        </Label>
        <Switch
          id='support-ai-limit-enabled'
          checked={form.watch('daily_limit_enabled')}
          onCheckedChange={(enabled) => {
            form.setValue('daily_limit_enabled', enabled, { shouldDirty: true })
            const limit = form.getValues('daily_requests')
            if (
              !enabled &&
              (!Number.isInteger(limit) || limit < 1 || limit > 10000)
            ) {
              form.setValue('daily_requests', 200, { shouldDirty: true })
            }
          }}
        />
      </div>
      {form.watch('daily_limit_enabled') && (
        <>
          <div className='space-y-2'>
            <Label htmlFor='support-ai-budget'>
              {t('Daily AI request limit (UTC)')}
            </Label>
            <Input
              id='support-ai-budget'
              type='number'
              min={1}
              max={10000}
              {...form.register('daily_requests', { valueAsNumber: true })}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Failed requests count toward the limit. Also set a spending limit on the dedicated provider key.'
            )}
          </p>
        </>
      )}
      <div className='space-y-2'>
        <Label htmlFor='support-welcome'>{t('Welcome message')}</Label>
        <Textarea
          id='support-welcome'
          maxLength={500}
          {...form.register('welcome_message')}
        />
      </div>
      {!!Object.keys(form.formState.errors).length && (
        <p role='alert'>{t('Please check the form values.')}</p>
      )}
      <Button
        type='submit'
        disabled={save.isPending || !form.formState.isDirty}
      >
        {t('Save')}
      </Button>
      {save.isSuccess && !form.formState.isDirty && (
        <p role='status'>{t('Saved successfully')}</p>
      )}
    </form>
  )
}
export function SupportAISettingsEditor() {
  const { t } = useTranslation()
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['support-chat', 'ai-settings', userID],
    queryFn: () => supportGet<AISettings>('ai-settings'),
    enabled: open,
  })
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('AI settings')}
      </Button>
      <Dialog title={t('AI settings')} open={open} onOpenChange={setOpen}>
        {query.isPending && <LoadingState />}
        {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
        {query.data && <AISettingsForm initial={query.data} />}
      </Dialog>
    </>
  )
}
