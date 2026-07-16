package jiekou

const ChannelName = "jiekou-seedance"

const (
	ModelSeedance20         = "seedance-2.0"
	ModelSeedance20Fast     = "seedance-2.0-fast"
	ModelSeedance15ProT2V   = "seedance-v1.5-pro-t2v"
	ModelSeedance15ProI2V   = "seedance-v1.5-pro-i2v"
	seedance20UpstreamModel = "seedance-2.0"
	defaultDuration         = 5
	defaultResolution       = "720p"
	defaultAdaptiveRatio    = "adaptive"
	taskResultEndpoint      = "/v3/async/task-result"
)

var ModelList = []string{
	ModelSeedance20,
	ModelSeedance20Fast,
	ModelSeedance15ProT2V,
	ModelSeedance15ProI2V,
}

var allowedRatios = stringSet("16:9", "4:3", "1:1", "3:4", "9:16", "21:9", defaultAdaptiveRatio)

type modelConfig struct {
	upstreamModel       string
	imageRequired       bool
	imageAllowed        bool
	supportsServiceTier bool
	fast                bool
	minDuration         int
	maxDuration         int
	allowedResolution   map[string]struct{}
	basePrice           float64
}

var modelConfigs = map[string]modelConfig{
	ModelSeedance20: {
		upstreamModel:     seedance20UpstreamModel,
		imageAllowed:      true,
		minDuration:       4,
		maxDuration:       15,
		allowedResolution: stringSet("480p", "720p", "1080p"),
		basePrice:         0.1512,
	},
	ModelSeedance20Fast: {
		upstreamModel:     seedance20UpstreamModel,
		imageAllowed:      true,
		fast:              true,
		minDuration:       4,
		maxDuration:       15,
		allowedResolution: stringSet("480p", "720p"),
		basePrice:         0.121,
	},
	ModelSeedance15ProT2V: {
		upstreamModel:       ModelSeedance15ProT2V,
		supportsServiceTier: true,
		minDuration:         4,
		maxDuration:         12,
		allowedResolution:   stringSet("480p", "720p", "1080p"),
		basePrice:           0.052,
	},
	ModelSeedance15ProI2V: {
		upstreamModel:       ModelSeedance15ProI2V,
		supportsServiceTier: true,
		imageRequired:       true,
		imageAllowed:        true,
		minDuration:         4,
		maxDuration:         12,
		allowedResolution:   stringSet("480p", "720p", "1080p"),
		basePrice:           0.052,
	},
}

func stringSet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}
