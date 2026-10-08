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
import { createInstance } from 'i18next'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  createSiteLanguageDetector,
  resolveSiteLanguage,
  rememberLanguagePreference,
} from '../site-language'

beforeEach(() => {
  vi.resetModules()
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('interface language detection', () => {
  test.each([
    ['en-US', 'en'],
    ['zh-CN', 'zhCN'],
    ['zh-TW', 'zhTW'],
    ['fr-FR', 'fr'],
    ['ru-RU', 'ru'],
    ['ja-JP', 'ja'],
    ['vi-VN', 'vi'],
    ['de-DE', 'en'],
    ['', 'en'],
  ])(
    'uses browser language %s with English fallback: %s',
    async (locale, expected) => {
      vi.spyOn(navigator, 'languages', 'get').mockReturnValue(
        locale ? [locale] : []
      )
      vi.spyOn(navigator, 'language', 'get').mockReturnValue(locale)
      const { default: configuredI18n } = await import('../config')
      window.localStorage.removeItem('i18nextLng')
      const i18n = createInstance()
      await i18n
        .use(createSiteLanguageDetector())
        .init({ ...configuredI18n.options, lng: undefined, debug: false })
      expect(i18n.resolvedLanguage).toBe(expected)
    }
  )

  test('keeps the saved user choice ahead of the browser language', async () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP'])
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP')
    const { default: configuredI18n } = await import('../config')
    window.localStorage.setItem('i18nextLng', 'fr')
    const i18n = createInstance()
    await i18n
      .use(createSiteLanguageDetector())
      .init({ ...configuredI18n.options, lng: undefined, debug: false })
    expect(i18n.resolvedLanguage).toBe('fr')
  })
})

test.each(['en', 'zhCN', 'zhTW', 'fr', 'ru', 'ja', 'vi'])(
  'uses configured site language %s ahead of browser detection without saving an automatic preference',
  async (language) => {
    localStorage.setItem(
      'status',
      JSON.stringify({ default_language: language })
    )
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['de-DE'])
    const { default: configuredI18n } = await import('../config')
    const instance = createInstance()
    await instance
      .use(createSiteLanguageDetector())
      .init({ ...configuredI18n.options, lng: undefined, debug: false })
    expect(instance.resolvedLanguage).toBe(language)
    expect(localStorage.getItem('i18nextLng')).toBeNull()
  }
)

test('explicit language selection persists and overrides a configured site default', async () => {
  localStorage.setItem('status', JSON.stringify({ default_language: 'zhCN' }))
  rememberLanguagePreference('zhTW')
  const { default: configuredI18n } = await import('../config')
  const instance = createInstance()
  await instance
    .use(createSiteLanguageDetector())
    .init({ ...configuredI18n.options, lng: undefined, debug: false })
  expect(instance.resolvedLanguage).toBe('zhTW')
})

test.each([
  ['auto', ['de-DE', 'fr-FR'], undefined, 'fr'],
  ['auto', ['de-DE'], undefined, 'en'],
  ['auto', [], undefined, 'en'],
  ['ja', ['fr-FR'], 'vi', 'vi'],
  ['unsupported', ['zh-CN'], undefined, 'en'],
  [undefined, ['zh-TW'], undefined, 'zhTW'],
  ['auto', ['zh-Hant-HK'], undefined, 'zhTW'],
] as const)(
  'resolves %s, %j and preference %s as %s',
  (site, browser, preference, expected) => {
    expect(resolveSiteLanguage(site, browser, preference)).toBe(expected)
  }
)
