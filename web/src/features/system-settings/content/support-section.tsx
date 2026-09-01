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
import { ArrowDown, ArrowUp, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SupportIcon } from '@/features/support/components/support-icon'
import { parseSupportConfig } from '@/features/support/lib/support-config'
import type { SupportCategory, SupportLink } from '@/features/support/types'

import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  SupportCategoryDialog,
  type SupportCategoryFormValues,
} from './support-category-dialog'
import {
  SupportLinkDialog,
  type SupportLinkFormValues,
} from './support-link-dialog'

type SupportSectionProps = {
  data: string
}

type DeleteTarget =
  | { type: 'category'; categoryId: string }
  | { type: 'link'; categoryId: string; linkId: string }

type IconActionProps = {
  label: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}

function IconAction(props: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            size='icon-sm'
            variant={props.destructive ? 'destructive' : 'ghost'}
            aria-label={props.label}
            onClick={props.onClick}
            disabled={props.disabled}
          />
        }
      >
        {props.icon}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

function moveEntry<T>(entries: T[], index: number, offset: -1 | 1): T[] {
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= entries.length) return entries
  const next = [...entries]
  const [entry] = next.splice(index, 1)
  next.splice(targetIndex, 0, entry)
  return next
}

export function SupportSection(props: SupportSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [categories, setCategories] = useState<SupportCategory[]>([])
  const [hasChanges, setHasChanges] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] =
    useState<SupportCategory | null>(null)
  const [editingLink, setEditingLink] = useState<SupportLink | null>(null)
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)

  useEffect(() => {
    setCategories(parseSupportConfig(props.data))
    setHasChanges(false)
  }, [props.data])

  const openCategoryDialog = (category: SupportCategory | null) => {
    setEditingCategory(category)
    setCategoryDialogOpen(true)
  }

  const submitCategory = (values: SupportCategoryFormValues) => {
    if (editingCategory) {
      setCategories((current) =>
        current.map((category) =>
          category.id === editingCategory.id
            ? { ...category, ...values }
            : category
        )
      )
    } else {
      setCategories((current) => [
        ...current,
        {
          id: nanoid(),
          title: values.title,
          description: values.description,
          items: [],
        },
      ])
    }
    setHasChanges(true)
    setCategoryDialogOpen(false)
  }

  const openLinkDialog = (categoryId: string, link: SupportLink | null) => {
    setActiveCategoryId(categoryId)
    setEditingLink(link)
    setLinkDialogOpen(true)
  }

  const submitLink = (values: SupportLinkFormValues) => {
    if (!activeCategoryId) return
    setCategories((current) =>
      current.map((category) => {
        if (category.id !== activeCategoryId) return category
        if (editingLink) {
          return {
            ...category,
            items: category.items.map((link) =>
              link.id === editingLink.id ? { ...link, ...values } : link
            ),
          }
        }
        return {
          ...category,
          items: [...category.items, { id: nanoid(), ...values }],
        }
      })
    )
    setHasChanges(true)
    setLinkDialogOpen(false)
  }

  const moveCategory = (index: number, offset: -1 | 1) => {
    setCategories((current) => moveEntry(current, index, offset))
    setHasChanges(true)
  }

  const moveLink = (categoryId: string, index: number, offset: -1 | 1) => {
    setCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? { ...category, items: moveEntry(category.items, index, offset) }
          : category
      )
    )
    setHasChanges(true)
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.type === 'category') {
      setCategories((current) =>
        current.filter((category) => category.id !== deleteTarget.categoryId)
      )
    } else {
      setCategories((current) =>
        current.map((category) =>
          category.id === deleteTarget.categoryId
            ? {
                ...category,
                items: category.items.filter(
                  (link) => link.id !== deleteTarget.linkId
                ),
              }
            : category
        )
      )
    }
    setHasChanges(true)
    setDeleteTarget(null)
  }

  const save = async () => {
    const result = await updateOption.mutateAsync({
      key: 'console_setting.support_links',
      value: JSON.stringify(categories),
    })
    if (result.success) setHasChanges(false)
  }

  return (
    <SettingsSection title={t('Support page')}>
      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-muted-foreground max-w-2xl text-sm'>
            {t(
              'Manage the categories and external links shown on the support page.'
            )}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={() => openCategoryDialog(null)}
              disabled={categories.length >= 20}
            >
              <Plus />
              {t('Add category')}
            </Button>
            <Button
              size='sm'
              onClick={save}
              disabled={!hasChanges || updateOption.isPending}
            >
              <Save />
              {updateOption.isPending ? t('Saving...') : t('Save settings')}
            </Button>
          </div>
        </div>

        {categories.length === 0 ? (
          <Empty className='min-h-48 border'>
            <EmptyHeader>
              <EmptyTitle>{t('No support categories')}</EmptyTitle>
              <EmptyDescription>
                {t(
                  'Add a category, then add the links users can open from it.'
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className='space-y-3'>
            {categories.map((category, categoryIndex) => (
              <section key={category.id} className='rounded-lg border'>
                <div className='bg-muted/40 flex flex-wrap items-start justify-between gap-3 border-b p-3'>
                  <div className='min-w-0 flex-1'>
                    <h3 className='text-sm font-semibold break-words'>
                      {category.title}
                    </h3>
                    {category.description ? (
                      <p className='text-muted-foreground mt-1 text-xs break-words'>
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                  <div className='flex items-center gap-1'>
                    <IconAction
                      label={t('Move category up')}
                      icon={<ArrowUp />}
                      onClick={() => moveCategory(categoryIndex, -1)}
                      disabled={categoryIndex === 0}
                    />
                    <IconAction
                      label={t('Move category down')}
                      icon={<ArrowDown />}
                      onClick={() => moveCategory(categoryIndex, 1)}
                      disabled={categoryIndex === categories.length - 1}
                    />
                    <IconAction
                      label={t('Edit category')}
                      icon={<Pencil />}
                      onClick={() => openCategoryDialog(category)}
                    />
                    <IconAction
                      label={t('Delete category')}
                      icon={<Trash2 />}
                      destructive
                      onClick={() =>
                        setDeleteTarget({
                          type: 'category',
                          categoryId: category.id,
                        })
                      }
                    />
                  </div>
                </div>

                <div className='space-y-2 p-3'>
                  {category.items.map((link, linkIndex) => (
                    <div
                      key={link.id}
                      className='flex min-w-0 items-center gap-3 rounded-lg border p-3'
                    >
                      <span className='bg-primary/8 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
                        <SupportIcon name={link.icon} className='size-4' />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate text-sm font-medium'>
                          {link.title}
                        </p>
                        <p className='text-muted-foreground truncate text-xs'>
                          {link.label || link.url}
                        </p>
                      </div>
                      <div className='flex items-center gap-1'>
                        <IconAction
                          label={t('Move link up')}
                          icon={<ArrowUp />}
                          onClick={() => moveLink(category.id, linkIndex, -1)}
                          disabled={linkIndex === 0}
                        />
                        <IconAction
                          label={t('Move link down')}
                          icon={<ArrowDown />}
                          onClick={() => moveLink(category.id, linkIndex, 1)}
                          disabled={linkIndex === category.items.length - 1}
                        />
                        <IconAction
                          label={t('Edit link')}
                          icon={<Pencil />}
                          onClick={() => openLinkDialog(category.id, link)}
                        />
                        <IconAction
                          label={t('Delete link')}
                          icon={<Trash2 />}
                          destructive
                          onClick={() =>
                            setDeleteTarget({
                              type: 'link',
                              categoryId: category.id,
                              linkId: link.id,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    size='sm'
                    variant='ghost'
                    onClick={() => openLinkDialog(category.id, null)}
                    disabled={category.items.length >= 30}
                  >
                    <Plus />
                    {t('Add link')}
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <SupportCategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        onSubmit={submitCategory}
      />
      <SupportLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        link={editingLink}
        onSubmit={submitLink}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={
          deleteTarget?.type === 'category'
            ? t('Delete support category?')
            : t('Delete support link?')
        }
        desc={
          deleteTarget?.type === 'category'
            ? t(
                'The category and all links inside it will be removed after you save.'
              )
            : t('The link will be removed after you save.')
        }
        confirmText={t('Delete')}
        destructive
        handleConfirm={confirmDelete}
      />
    </SettingsSection>
  )
}
