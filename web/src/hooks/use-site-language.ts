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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { getSavedLanguage } from '@/features/auth/lib/auth-redirect'
import {
  getLanguagePreference,
  resolveSiteLanguage,
} from '@/i18n/site-language'
import { useAuthStore } from '@/stores/auth-store'

import { useStatus } from './use-status'

export function useSiteLanguage(): void {
  const { i18n } = useTranslation()
  const { status } = useStatus()
  const user = useAuthStore((state) => state.auth.user)
  const accountLanguage = user ? getSavedLanguage(user) : undefined
  const siteLanguage = status?.default_language

  useEffect(() => {
    const applyLanguage = () => {
      const language = resolveSiteLanguage(
        siteLanguage,
        navigator.languages?.length
          ? navigator.languages
          : [navigator.language],
        getLanguagePreference() || accountLanguage
      )
      if (i18n.language !== language) void i18n.changeLanguage(language)
    }
    applyLanguage()
    window.addEventListener('languagechange', applyLanguage)
    return () => window.removeEventListener('languagechange', applyLanguage)
  }, [siteLanguage, accountLanguage, i18n])
}
