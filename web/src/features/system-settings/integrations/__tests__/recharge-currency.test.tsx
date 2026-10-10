import { act, fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, expect, test, vi } from 'vitest'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { AmountDiscountVisualEditor } from '../amount-discount-visual-editor'
import { AmountOptionsVisualEditor } from '../amount-options-visual-editor'

const original = useSystemConfigStore.getState().config.currency

afterEach(async () => {
  useSystemConfigStore.getState().setConfig({ currency: original })
  await i18next.changeLanguage('en')
})

test('preset amounts follow site currency without converting saved amounts', () => {
  const onChange = vi.fn()
  useSystemConfigStore
    .getState()
    .setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  render(<AmountOptionsVisualEditor value='[10,100]' onChange={onChange} />)
  expect(screen.getByText('¥10')).toBeInTheDocument()
  expect(screen.getByText('¥100')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /¥10$/ }))
  expect(JSON.parse(onChange.mock.calls[0][0])).toEqual([100])
  act(() =>
    useSystemConfigStore
      .getState()
      .setConfig({
        currency: {
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CUSTOM',
          customCurrencySymbol: '€',
          customCurrencyExchangeRate: 0.9,
        },
      })
  )
  expect(screen.getByText('€ 100')).toBeInTheDocument()
  act(() =>
    useSystemConfigStore
      .getState()
      .setConfig({ currency: DEFAULT_CURRENCY_CONFIG })
  )
  expect(screen.getByText('$100')).toBeInTheDocument()
})

test('discount thresholds use the same CNY amounts as the presets', () => {
  useSystemConfigStore
    .getState()
    .setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7,
      },
    })
  render(<AmountDiscountVisualEditor value='{"100":0.9}' onChange={vi.fn()} />)
  expect(screen.getAllByText('¥100')).toHaveLength(2)
  expect(screen.queryByText('$100')).not.toBeInTheDocument()
})

test.each(['zhCN', 'zhTW', 'en', 'fr', 'ja', 'ru', 'vi', 'invalid'])(
  'CNY presets remain correct with interface language %s',
  async (language) => {
    await i18next.changeLanguage(language)
    useSystemConfigStore
      .getState()
      .setConfig({
        currency: {
          ...DEFAULT_CURRENCY_CONFIG,
          quotaDisplayType: 'CNY',
          usdExchangeRate: 7,
        },
      })
    render(<AmountOptionsVisualEditor value='[100]' onChange={vi.fn()} />)
    expect(screen.getByText('¥100')).toBeInTheDocument()
    await act(() => i18next.changeLanguage('en'))
    expect(screen.getByText('¥100')).toBeInTheDocument()
  }
)
