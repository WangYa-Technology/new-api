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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { getAllLogs } from '@/features/usage-logs/api'
import type { UsageLog } from '@/features/usage-logs/data/schema'
import { toIntlLocale } from '@/i18n/languages'
import { ROLE } from '@/lib/roles'
import { requireServerSuccess } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { useSupportCustomer } from '../use-support-customer'
import { SupportOrders } from './support-orders'

export function SupportCustomerDetails(props: {
  userID: number
  threadID: string
}) {
  const { t } = useTranslation()
  const profile = useSupportCustomer(props.userID)
  return (
    <>
      {profile.isPending && <LoadingState />}
      {profile.isError && <ErrorState onRetry={() => void profile.refetch()} />}
      {profile.data && (
        <>
          <section className='space-y-4 border-b p-4'>
            <div className='flex items-center gap-3'>
              <span className='bg-muted flex size-11 shrink-0 items-center justify-center rounded-full font-semibold'>
                {(profile.data.display_name || profile.data.username)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <div className='min-w-0'>
                <h3 className='truncate font-semibold'>
                  {profile.data.display_name || profile.data.username}
                </h3>
                <p className='text-muted-foreground text-xs'>#{props.userID}</p>
              </div>
            </div>
            <h3 className='text-sm font-semibold'>{t('User information')}</h3>
            <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm'>
              <dt className='text-muted-foreground'>{t('Username')}</dt>
              <dd className='text-right break-all'>{profile.data.username}</dd>
              <dt className='text-muted-foreground'>{t('Email')}</dt>
              <dd className='text-right break-all'>
                {profile.data.email || '—'}
              </dd>
              <dt className='text-muted-foreground'>{t('Status')}</dt>
              <dd className='text-right'>
                <Badge variant='secondary'>
                  {profile.data.status === 1 ? t('Enabled') : t('Disabled')}
                </Badge>
              </dd>
            </dl>
          </section>
          {profile.data.can_view_orders && (
            <section className='space-y-3 border-b p-4'>
              <h3 className='text-sm font-semibold'>{t('Orders')}</h3>
              <SupportOrders
                userID={props.userID}
                threadID={props.threadID}
                embedded
              />
            </section>
          )}
          <SupportRecentUsage
            userID={props.userID}
            username={profile.data.username}
          />
        </>
      )}
    </>
  )
}

function SupportRecentUsage(props: { userID: number; username: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const user = useAuthStore((state) => state.auth.user)
  const allowed = (user?.role ?? 0) >= ROLE.ADMIN
  const logs = useQuery({
    queryKey: [
      'support-chat',
      'recent-usage',
      user?.id,
      props.userID,
      props.username,
    ],
    queryFn: async () => {
      const responses = await Promise.all(
        [2, 5].map((type) =>
          getAllLogs({ username: props.username, type, p: 1, page_size: 5 })
        )
      )
      const items = responses.flatMap(
        (response) =>
          (requireServerSuccess(response).data?.items ?? []) as UsageLog[]
      )
      // The existing admin log API owns authorization. Filter by immutable user ID
      // as well, so renamed/reused usernames cannot mix another customer's data.
      return items
        .filter((item) => item.user_id === props.userID)
        .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
        .slice(0, 5)
    },
    enabled: allowed && !!props.username,
    staleTime: 15000,
    refetchInterval: 30000,
  })
  if (!allowed) return null
  return (
    <section className='space-y-3 p-4'>
      <h3 className='text-sm font-semibold'>{t('Recent usage')}</h3>
      {logs.isPending && <LoadingState />}
      {logs.isError && <ErrorState onRetry={() => void logs.refetch()} />}
      {logs.data?.length === 0 && (
        <p className='text-muted-foreground text-sm'>{t('No recent usage')}</p>
      )}
      <ul className='divide-y'>
        {logs.data?.map((log) => (
          <li key={log.id} className='space-y-2 py-3 first:pt-0'>
            <div className='flex items-start justify-between gap-2'>
              <span className='min-w-0 text-sm font-medium break-all'>
                {log.model_name || '—'}
              </span>
              <Badge variant={log.type === 5 ? 'destructive' : 'secondary'}>
                {log.type === 5 ? t('Failed') : t('Success')}
              </Badge>
            </div>
            <time
              className='text-muted-foreground text-xs'
              dateTime={new Date(log.created_at * 1000).toISOString()}
            >
              {new Date(log.created_at * 1000).toLocaleString(locale)}
            </time>
            {log.request_id && (
              <p className='text-muted-foreground text-xs break-all'>
                {t('Request ID')}: {log.request_id}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
