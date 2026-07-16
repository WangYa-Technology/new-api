package jiekou

import "math"

// Prices are USD per generated second from Jiekou's live model_api SKU catalog.
// Keep these values and setting/ratio_setting.defaultModelPrice in sync.
var perSecondPrices = map[string]map[string]float64{
	ModelSeedance20: {
		"480p":  0.0703,
		"720p":  0.1512,
		"1080p": 0.3742,
	},
	ModelSeedance20Fast: {
		"480p": 0.0562,
		"720p": 0.121,
	},
	ModelSeedance15ProT2V: {
		"480p":  0.024,
		"720p":  0.052,
		"1080p": 0.116,
	},
	ModelSeedance15ProI2V: {
		"480p":  0.024,
		"720p":  0.052,
		"1080p": 0.116,
	},
}

var referenceVideoPerSecondPrices = map[string]map[string]float64{
	ModelSeedance20: {
		"480p":  0.0432,
		"720p":  0.0929,
		"1080p": 0.2284,
	},
	ModelSeedance20Fast: {
		"480p": 0.0331,
		"720p": 0.0713,
	},
}

// Jiekou applies these documented minimum charges when Seedance 2.0 receives
// reference video input. Slice indexes are output durations in seconds.
var referenceVideoMinimumPrices = map[string]map[string][]float64{
	ModelSeedance20: {
		"480p":  {0, 0, 0, 0, 0.30, 0.39, 0.43, 0.52, 0.61, 0.65, 0.73, 0.82, 0.86, 0.95, 1.04, 1.08},
		"720p":  {0, 0, 0, 0, 0.65, 0.84, 0.93, 1.11, 1.30, 1.39, 1.58, 1.76, 1.86, 2.04, 2.23, 2.32},
		"1080p": {0, 0, 0, 0, 1.64, 2.06, 2.47, 2.88, 3.29, 3.70, 4.11, 4.52, 4.93, 5.35, 5.76, 6.17},
	},
	ModelSeedance20Fast: {
		"480p": {0, 0, 0, 0, 0.23, 0.30, 0.33, 0.40, 0.46, 0.50, 0.56, 0.63, 0.66, 0.73, 0.79, 0.83},
		"720p": {0, 0, 0, 0, 0.50, 0.64, 0.71, 0.85, 1.00, 1.07, 1.21, 1.35, 1.43, 1.57, 1.71, 1.78},
	},
}

func billingRatios(payload *submitRequest, modelName string) map[string]float64 {
	config := modelConfigs[modelName]
	unitPrice := perSecondPrices[modelName][payload.Resolution]

	if config.supportsServiceTier && payload.GenerateAudio != nil && !*payload.GenerateAudio {
		unitPrice /= 2
	}

	charge := unitPrice * float64(payload.Duration)
	if len(payload.ReferenceVideos) > 0 {
		charge = referenceVideoPerSecondPrices[modelName][payload.Resolution] * float64(payload.Duration)
		minimums := referenceVideoMinimumPrices[modelName][payload.Resolution]
		if payload.Duration < len(minimums) {
			charge = math.Max(charge, minimums[payload.Duration])
		}
	}

	ratios := map[string]float64{"charge": charge / config.basePrice}
	if payload.ServiceTier == "flex" {
		ratios["service_tier"] = 0.5
	}
	return ratios
}
