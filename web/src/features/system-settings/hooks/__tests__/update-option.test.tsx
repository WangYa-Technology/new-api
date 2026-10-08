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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useDashboardContentVisibility } from '@/features/dashboard/hooks/use-status-data'
import { useSiteLanguage } from '@/hooks/use-site-language'
import { rememberLanguagePreference } from '@/i18n/site-language'
import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { useUpdateOption } from '../use-update-option'

let client: QueryClient

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

afterEach(() => {
  cleanup()
  client.clear()
  vi.restoreAllMocks()
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

test.each([
  ['api_info_enabled', 'apiInfo'],
  ['announcements_enabled', 'announcements'],
  ['uptime_kuma_enabled', 'uptimeKuma'],
  ['faq_enabled', 'faq'],
] as const)(
  'saving %s immediately updates overview visibility and its persisted cache',
  async (flag, panel) => {
    let enabled = true
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      if (url !== '/api/status') throw new Error(`Unexpected GET ${url}`)
      return { data: { success: true, data: { [flag]: enabled } } }
    })
    vi.spyOn(api, 'put').mockImplementation(async (_url, request) => {
      enabled = (request as { value: boolean }).value
      return { data: { success: true } }
    })
    const { result } = renderHook(
      () => ({
        visibility: useDashboardContentVisibility(),
        update: useUpdateOption(),
      }),
      {
        wrapper: (props: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            {props.children}
          </QueryClientProvider>
        ),
      }
    )
    await waitFor(() =>
      expect(window.localStorage.getItem('status')).not.toBeNull()
    )
    expect(result.current.visibility[panel]).toBe(true)

    await act(async () => {
      await result.current.update.mutateAsync({
        key: `console_setting.${flag}`,
        value: false,
      })
    })
    await waitFor(() => expect(result.current.visibility[panel]).toBe(false), {
      timeout: 1000,
    })
    expect(
      JSON.parse(window.localStorage.getItem('status') ?? '{}')[flag]
    ).toBe(false)

    await act(async () => {
      await result.current.update.mutateAsync({
        key: `console_setting.${flag}`,
        value: true,
      })
    })
    await waitFor(() => expect(result.current.visibility[panel]).toBe(true))
    expect(
      JSON.parse(window.localStorage.getItem('status') ?? '{}')[flag]
    ).toBe(true)
  }
)

test('saving the site language refreshes active defaults without overriding an explicit user choice', async () => {
  let language = 'auto'
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP'])
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url !== '/api/status') throw new Error(`Unexpected GET ${url}`)
    return { data: { success: true, data: { default_language: language } } }
  })
  vi.spyOn(api, 'put').mockImplementation(async (_url, request) => {
    language = (request as { value: string }).value
    return { data: { success: true } }
  })
  const i18n = createInstance()
  await i18n.init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
  })
  const { result } = renderHook(
    () => {
      useSiteLanguage()
      return useUpdateOption()
    },
    {
      wrapper: (props: { children: ReactNode }) => (
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={client}>
            {props.children}
          </QueryClientProvider>
        </I18nextProvider>
      ),
    }
  )
  await waitFor(() => expect(i18n.language).toBe('ja'))
  await act(async () => {
    await result.current.mutateAsync({
      key: 'console_setting.default_language',
      value: 'zhTW',
    })
  })
  await waitFor(() => expect(i18n.language).toBe('zhTW'))
  expect(
    JSON.parse(localStorage.getItem('status') || '{}').default_language
  ).toBe('zhTW')
  expect(localStorage.getItem('i18nextLng')).toBeNull()
  await act(async () => {
    await result.current.mutateAsync({
      key: 'console_setting.default_language',
      value: 'auto',
    })
  })
  await waitFor(() => expect(i18n.language).toBe('ja'))
  rememberLanguagePreference('fr')
  await act(async () => {
    await i18n.changeLanguage('fr')
  })
  await act(async () => {
    await result.current.mutateAsync({
      key: 'console_setting.default_language',
      value: 'vi',
    })
  })
  await waitFor(() =>
    expect(
      JSON.parse(localStorage.getItem('status') || '{}').default_language
    ).toBe('vi')
  )
  expect(i18n.language).toBe('fr')
})
