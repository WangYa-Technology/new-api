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
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Markdown } from '@/components/ui/markdown'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FAQPanel } from '@/features/dashboard/components/overview/faq-panel'
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { supportGet } from '../chat-api'

export interface SupportArticle {
  id: string
  title: string
  content: string
  published: boolean
}
const knowledgeSchema = z.object({
  revision: z.number(),
  articles: z
    .array(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(150),
        content: z.string().trim().min(1).max(4000),
        published: z.boolean(),
      })
    )
    .max(100),
})
type Knowledge = z.infer<typeof knowledgeSchema>

function KnowledgeForm(props: { initial: Knowledge }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const form = useForm<Knowledge>({
    resolver: zodResolver(knowledgeSchema),
    defaultValues: props.initial,
  })
  const articles = useFieldArray({
    control: form.control,
    name: 'articles',
    keyName: 'fieldKey',
  })
  const save = useMutation({
    mutationFn: async (values: Knowledge) =>
      requireServerSuccess(
        (await api.put('/api/support-chat/knowledge-settings', values)).data
      ).data as Knowledge,
    onSuccess: async (values) => {
      form.reset(values)
      await client.invalidateQueries({ queryKey: ['support-chat'] })
    },
  })
  return (
    <form
      className='space-y-4'
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
    >
      <p className='text-muted-foreground text-sm'>
        {t(
          'Published articles appear in Help and are used by AI. Drafts stay private. Existing FAQ entries are included automatically.'
        )}
      </p>
      {articles.fields.map((article, index) => (
        <fieldset
          key={article.fieldKey}
          className='space-y-3 rounded-lg border p-3'
          disabled={save.isPending}
        >
          <Label htmlFor={`article-title-${article.id}`}>{t('Title')}</Label>
          <Input
            id={`article-title-${article.id}`}
            maxLength={150}
            {...form.register(`articles.${index}.title`)}
          />
          <Label htmlFor={`article-content-${article.id}`}>
            {t('Content')}
          </Label>
          <Textarea
            id={`article-content-${article.id}`}
            rows={6}
            maxLength={4000}
            {...form.register(`articles.${index}.content`)}
          />
          <div className='flex items-center gap-2'>
            <Switch
              id={`article-published-${article.id}`}
              checked={form.watch(`articles.${index}.published`)}
              onCheckedChange={(value) =>
                form.setValue(`articles.${index}.published`, value, {
                  shouldDirty: true,
                })
              }
            />
            <Label htmlFor={`article-published-${article.id}`}>
              {t('Published')}
            </Label>
            <Button
              type='button'
              variant='ghost'
              className='ml-auto'
              onClick={() => articles.remove(index)}
            >
              {t('Remove')}
            </Button>
          </div>
        </fieldset>
      ))}
      <div className='flex gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={save.isPending || articles.fields.length >= 100}
          onClick={() =>
            articles.append({
              id: crypto.randomUUID(),
              title: '',
              content: '',
              published: false,
            })
          }
        >
          {t('Add article')}
        </Button>
        <Button
          type='submit'
          disabled={save.isPending || !form.formState.isDirty}
        >
          {t('Save')}
        </Button>
      </div>
      {!!Object.keys(form.formState.errors).length && (
        <p role='alert'>
          {t('Complete the article title and content before saving.')}
        </p>
      )}
      {save.isSuccess && !form.formState.isDirty && (
        <p role='status'>{t('Saved successfully')}</p>
      )}
    </form>
  )
}

export function SupportKnowledgeEditor() {
  const { t } = useTranslation()
  const userID = useAuthStore((state) => state.auth.user?.id)
  const [open, setOpen] = useState(false)
  const query = useQuery({
    queryKey: ['support-chat', 'knowledge-settings', userID],
    queryFn: () => supportGet<Knowledge>('knowledge-settings'),
    enabled: open,
  })
  return (
    <>
      <Button variant='outline' onClick={() => setOpen(true)}>
        {t('Support knowledge base')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t('Support knowledge base')}
      >
        {query.isPending && <LoadingState />}
        {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
        {query.data && <KnowledgeForm initial={query.data} />}
      </Dialog>
    </>
  )
}

export function SupportHelp() {
  const query = useQuery({
    queryKey: ['support-chat', 'knowledge'],
    queryFn: () => supportGet<SupportArticle[]>('knowledge'),
  })
  if (query.isPending) return <LoadingState />
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  return (
    <FAQPanel
      compact
      items={query.data.map((article) => ({
        id: article.id,
        question: article.title,
        answer: article.content,
      }))}
    />
  )
}

export function SupportSources(props: { sources: string[] }) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>()
  const query = useQuery({
    queryKey: ['support-chat', 'knowledge'],
    queryFn: () => supportGet<SupportArticle[]>('knowledge'),
    enabled: !!selected,
  })
  const article = query.data?.find((item) => item.id === selected)
  return (
    <>
      <div className='mt-2 flex flex-wrap gap-1'>
        {[...new Set(props.sources)].map((id, index) => (
          <Button
            key={id}
            size='sm'
            variant='outline'
            onClick={() => setSelected(id)}
          >
            {t('Source {{number}}', { number: index + 1 })}
          </Button>
        ))}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(undefined)
        }}
        title={article?.title ?? t('Support knowledge base')}
      >
        {query.isPending && <LoadingState />}
        {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
        {query.isSuccess &&
          (article ? (
            <Markdown>{article.content}</Markdown>
          ) : (
            <p>{t('This article is no longer available.')}</p>
          ))}
      </Dialog>
    </>
  )
}
