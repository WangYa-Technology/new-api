package jiekou

const ChannelName = "jiekou-seedance"

const (
	ModelSeedance20         = "seedance-2.0"
	ModelSeedance20Fast     = "seedance-2.0-fast"
	ModelSeedance15ProT2V   = "seedance-v1.5-pro-t2v"
	ModelSeedance15ProI2V   = "seedance-v1.5-pro-i2v"
	ModelSeedanceV1ProT2V   = "seedance-v1-pro-t2v"
	ModelSeedanceV1ProI2V   = "seedance-v1-pro-i2v"
	ModelSeedanceV1LiteT2V  = "seedance-v1-lite-t2v"
	ModelSeedanceV1LiteI2V  = "seedance-v1-lite-i2v"
	seedance20UpstreamModel = "seedance-2.0"
	defaultDuration         = 5
	defaultResolution       = "720p"
	defaultAspectRatio      = "16:9"
	defaultAdaptiveRatio    = "adaptive"
	taskResultEndpoint      = "/v3/async/task-result"
)

var ModelList = []string{
	ModelSeedance20,
	ModelSeedance20Fast,
	ModelSeedance15ProT2V,
	ModelSeedance15ProI2V,
	ModelSeedanceV1ProT2V,
	ModelSeedanceV1ProI2V,
	ModelSeedanceV1LiteT2V,
	ModelSeedanceV1LiteI2V,
}

type modelConfig struct {
	upstreamModel       string
	imageRequired       bool
	imageAllowed        bool
	usesAspectRatio     bool
	supportsServiceTier bool
	fast                bool
	minDuration         int
	maxDuration         int
	allowedDurations    map[int]struct{}
	allowedResolution   map[string]struct{}
}

var modelConfigs = map[string]modelConfig{
	ModelSeedance20: {
		upstreamModel:     seedance20UpstreamModel,
		imageAllowed:      true,
		minDuration:       4,
		maxDuration:       15,
		allowedResolution: stringSet("480p", "720p", "1080p"),
	},
	ModelSeedance20Fast: {
		upstreamModel:     seedance20UpstreamModel,
		imageAllowed:      true,
		fast:              true,
		minDuration:       4,
		maxDuration:       15,
		allowedResolution: stringSet("480p", "720p"),
	},
	ModelSeedance15ProT2V: {
		upstreamModel:       ModelSeedance15ProT2V,
		supportsServiceTier: true,
		minDuration:         4,
		maxDuration:         12,
		allowedResolution:   stringSet("480p", "720p"),
	},
	ModelSeedance15ProI2V: {
		upstreamModel:       ModelSeedance15ProI2V,
		supportsServiceTier: true,
		imageRequired:       true,
		imageAllowed:        true,
		minDuration:         4,
		maxDuration:         12,
		allowedResolution:   stringSet("480p", "720p"),
	},
	ModelSeedanceV1ProT2V: {
		upstreamModel:     ModelSeedanceV1ProT2V,
		usesAspectRatio:   true,
		allowedDurations:  intSet(5, 10),
		allowedResolution: stringSet("480p", "720p", "1080p"),
	},
	ModelSeedanceV1ProI2V: {
		upstreamModel:     ModelSeedanceV1ProI2V,
		imageRequired:     true,
		imageAllowed:      true,
		usesAspectRatio:   true,
		allowedDurations:  intSet(5, 10),
		allowedResolution: stringSet("480p", "720p", "1080p"),
	},
	ModelSeedanceV1LiteT2V: {
		upstreamModel:     ModelSeedanceV1LiteT2V,
		usesAspectRatio:   true,
		allowedDurations:  intSet(5, 10),
		allowedResolution: stringSet("480p", "720p", "1080p"),
	},
	ModelSeedanceV1LiteI2V: {
		upstreamModel:     ModelSeedanceV1LiteI2V,
		imageRequired:     true,
		imageAllowed:      true,
		usesAspectRatio:   true,
		allowedDurations:  intSet(5, 10),
		allowedResolution: stringSet("480p", "720p", "1080p"),
	},
}

func stringSet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func intSet(values ...int) map[int]struct{} {
	result := make(map[int]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}
