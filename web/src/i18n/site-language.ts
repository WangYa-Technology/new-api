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
import LanguageDetector from 'i18next-browser-languagedetector'

import {
  convertDetectedLanguage,
  INTERFACE_LANGUAGE_OPTIONS,
} from './languages'

/** An explicit user preference takes precedence over site defaults. */
export function resolveSiteLanguage(
  siteLanguage: unknown,
  browserLanguages: readonly string[],
  preference?: string | null
): string {
  const supported = INTERFACE_LANGUAGE_OPTIONS.map(
    (language) => language.code as string
  )
  if (preference) {
    const language = convertDetectedLanguage(preference)
    const match = supported.find(
      (code) => code === language || code === language.split('-')[0]
    )
    if (match) return match
  }
  if (
    typeof siteLanguage === 'string' &&
    siteLanguage !== 'auto' &&
    siteLanguage !== ''
  ) {
    return supported.includes(siteLanguage) ? siteLanguage : 'en'
  }
  for (const value of browserLanguages) {
    const language = convertDetectedLanguage(value)
    const match = supported.find(
      (code) => code === language || code === language.split('-')[0]
    )
    if (match) return match
  }
  return 'en'
}

export function getLanguagePreference(): string | null {
  try {
    return window.localStorage.getItem('i18nextLng')
  } catch {
    return null
  }
}

export function rememberLanguagePreference(language: string): void {
  try {
    window.localStorage.setItem('i18nextLng', language)
  } catch {
    // Language switching remains available when browser storage is disabled.
  }
}

export function createSiteLanguageDetector(): LanguageDetector {
  const detector = new LanguageDetector()
  detector.addDetector({
    name: 'siteDefault',
    lookup: () => {
      let siteLanguage: unknown
      try {
        siteLanguage = JSON.parse(
          window.localStorage.getItem('status') || '{}'
        )?.default_language
      } catch {
        // Missing or unusable cache falls back to browser detection.
      }
      return resolveSiteLanguage(
        siteLanguage,
        navigator.languages?.length ? navigator.languages : [navigator.language]
      )
    },
  })
  return detector
}
