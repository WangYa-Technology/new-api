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
import { describe, expect, it } from 'vitest'

import { QUOTA_TYPES } from '../constants'
import { filterByQuotaType } from '../lib/filters'
import { isPerSecondModel } from '../lib/model-helpers'
import type { PricingModel } from '../types'

function pricingModel(
  modelName: string,
  quotaType: number,
  billingUnit?: 'request' | 'second'
): PricingModel {
  return {
    id: 1,
    model_name: modelName,
    quota_type: quotaType,
    billing_unit: billingUnit,
    model_ratio: 0,
    completion_ratio: 0,
    model_price: 0.1,
    enable_groups: ['default'],
  }
}

describe('pricing billing unit', () => {
  const tokenModel = pricingModel('token-model', 0)
  const requestModel = pricingModel('request-model', 1, 'request')
  const legacyRequestModel = pricingModel('legacy-request-model', 1)
  const secondModel = pricingModel('second-model', 1, 'second')
  const models = [tokenModel, requestModel, legacyRequestModel, secondModel]

  it('recognizes only fixed prices explicitly marked per second', () => {
    expect(isPerSecondModel(secondModel)).toBe(true)
    expect(isPerSecondModel(requestModel)).toBe(false)
    expect(isPerSecondModel(legacyRequestModel)).toBe(false)
    expect(isPerSecondModel(tokenModel)).toBe(false)
  })

  it('keeps per-second models out of the per-request filter', () => {
    expect(filterByQuotaType(models, QUOTA_TYPES.REQUEST)).toEqual([
      requestModel,
      legacyRequestModel,
    ])
    expect(filterByQuotaType(models, QUOTA_TYPES.SECOND)).toEqual([secondModel])
  })
})
