import { CaptureData, CaptureFormData, MeasurementValidation, LocationBounds } from '../types';

// Global measurement validation ranges
export const MEASUREMENT_RANGES: MeasurementValidation = {
  dbh: { min: 0.1, max: 2000, unit: 'cm' }, // From seedlings to giant sequoias
  height: { min: 0.1, max: 150, unit: 'm' }, // From saplings to tallest trees
  crownDiameter: { min: 0.1, max: 100, unit: 'm' },
  age: { min: 0, max: 5000, unit: 'years' }, // Some trees can live thousands of years
};

// Global location bounds (can be customized per deployment)
export const GLOBAL_BOUNDS: LocationBounds = {
  minLatitude: -90,
  maxLatitude: 90,
  minLongitude: -180,
  maxLongitude: 180,
  region: 'global'
};

// Common tree species data (expandable database)
export const COMMON_SPECIES = [
  {
    id: 'oak-white',
    commonName: 'White Oak',
    scientificName: 'Quercus alba',
    family: 'Fagaceae',
    genus: 'Quercus',
    nativeRegions: ['North America'],
    characteristics: {
      maxHeight: 30,
      maxDbh: 150,
      lifespan: 300,
      growthRate: 'moderate' as const
    },
    carbonSequestrationRate: 22, // kg CO2/year
    economicValuePerKg: 0.05
  },
  {
    id: 'pine-eastern',
    commonName: 'Eastern White Pine',
    scientificName: 'Pinus strobus',
    family: 'Pinaceae',
    genus: 'Pinus',
    nativeRegions: ['North America'],
    characteristics: {
      maxHeight: 50,
      maxDbh: 100,
      lifespan: 200,
      growthRate: 'fast' as const
    },
    carbonSequestrationRate: 18,
    economicValuePerKg: 0.03
  },
  {
    id: 'baobab',
    commonName: 'African Baobab',
    scientificName: 'Adansonia digitata',
    family: 'Malvaceae',
    genus: 'Adansonia',
    nativeRegions: ['Africa'],
    characteristics: {
      maxHeight: 25,
      maxDbh: 1000, // Can get very wide
      lifespan: 2000,
      growthRate: 'slow' as const
    },
    carbonSequestrationRate: 35,
    economicValuePerKg: 0.08
  }
];

// Validation functions
export class TreeDataValidator {
  
  static validateLatitude(lat: number): boolean {
    return lat >= GLOBAL_BOUNDS.minLatitude && lat <= GLOBAL_BOUNDS.maxLatitude;
  }

  static validateLongitude(lon: number): boolean {
    return lon >= GLOBAL_BOUNDS.minLongitude && lon <= GLOBAL_BOUNDS.maxLongitude;
  }

  static validateDBH(dbh: number): boolean {
    return dbh >= MEASUREMENT_RANGES.dbh.min && dbh <= MEASUREMENT_RANGES.dbh.max;
  }

  static validateHeight(height: number): boolean {
    return height >= MEASUREMENT_RANGES.height.min && height <= MEASUREMENT_RANGES.height.max;
  }

  static validateCrownDiameter(diameter: number): boolean {
    return diameter >= MEASUREMENT_RANGES.crownDiameter.min && diameter <= MEASUREMENT_RANGES.crownDiameter.max;
  }

  static validateAge(age: number): boolean {
    return age >= MEASUREMENT_RANGES.age.min && age <= MEASUREMENT_RANGES.age.max;
  }

  static validateGPSAccuracy(accuracy: number): boolean {
    return accuracy >= 0 && accuracy <= 100; // meters
  }

  static validateTemperature(temp: number): boolean {
    return temp >= -50 && temp <= 60; // Celsius, extreme but possible ranges
  }

  static validateHumidity(humidity: number): boolean {
    return humidity >= 0 && humidity <= 100; // percentage
  }

  // Comprehensive validation
  static validateCaptureData(data: CaptureFormData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Required fields
    if (!data.latitude) {
      errors.push('Latitude is required');
    } else if (!this.validateLatitude(data.latitude)) {
      errors.push('Latitude must be between -90 and 90 degrees');
    }

    if (!data.longitude) {
      errors.push('Longitude is required');
    } else if (!this.validateLongitude(data.longitude)) {
      errors.push('Longitude must be between -180 and 180 degrees');
    }

    // Optional field validations
    if (data.altitude !== undefined && (data.altitude < -500 || data.altitude > 9000)) {
      errors.push('Altitude must be between -500m and 9000m');
    }

    if (data.gpsAccuracy !== undefined && !this.validateGPSAccuracy(data.gpsAccuracy)) {
      errors.push('GPS accuracy must be between 0 and 100 meters');
    }

    if (data.dbh !== undefined && !this.validateDBH(data.dbh)) {
      errors.push(`DBH must be between ${MEASUREMENT_RANGES.dbh.min} and ${MEASUREMENT_RANGES.dbh.max} cm`);
    }

    if (data.height !== undefined && !this.validateHeight(data.height)) {
      errors.push(`Height must be between ${MEASUREMENT_RANGES.height.min} and ${MEASUREMENT_RANGES.height.max} meters`);
    }

    if (data.crownDiameter !== undefined && !this.validateCrownDiameter(data.crownDiameter)) {
      errors.push(`Crown diameter must be between ${MEASUREMENT_RANGES.crownDiameter.min} and ${MEASUREMENT_RANGES.crownDiameter.max} meters`);
    }

    if (data.treeAge !== undefined && !this.validateAge(data.treeAge)) {
      errors.push(`Tree age must be between ${MEASUREMENT_RANGES.age.min} and ${MEASUREMENT_RANGES.age.max} years`);
    }

    if (data.temperature !== undefined && !this.validateTemperature(data.temperature)) {
      errors.push('Temperature must be between -50°C and 60°C');
    }

    if (data.humidity !== undefined && !this.validateHumidity(data.humidity)) {
      errors.push('Humidity must be between 0% and 100%');
    }

    // Validate enum values
    const validHealthStatuses = ['excellent', 'good', 'fair', 'poor', 'critical', 'dead'];
    if (data.healthStatus && !validHealthStatuses.includes(data.healthStatus)) {
      errors.push('Invalid health status');
    }

    const validLandUses = ['forest', 'urban', 'agricultural', 'park', 'roadside', 'residential', 'commercial', 'industrial'];
    if (data.landUse && !validLandUses.includes(data.landUse)) {
      errors.push('Invalid land use type');
    }

    const validPrecipitation = ['none', 'light', 'moderate', 'heavy'];
    if (data.precipitation && !validPrecipitation.includes(data.precipitation)) {
      errors.push('Invalid precipitation level');
    }

    const validMaintenanceTypes = ['watering', 'pruning', 'fertilizing', 'pest_treatment', 'other'];
    if (data.maintenanceType && !validMaintenanceTypes.includes(data.maintenanceType)) {
      errors.push('Invalid maintenance type');
    }

    const validCaptureMethods = ['mobile_app', 'web_form', 'field_survey', 'drone', 'satellite'];
    if (data.captureMethod && !validCaptureMethods.includes(data.captureMethod)) {
      errors.push('Invalid capture method');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Calculate carbon sequestration estimate
  static estimateCarbonSequestration(data: CaptureData): number {
    // Basic calculation based on DBH and species
    if (!data.dbh) return 0;

    // Find species data
    const species = COMMON_SPECIES.find(s => 
      s.commonName.toLowerCase() === data.commonName?.toLowerCase() ||
      s.scientificName.toLowerCase() === data.scientificName?.toLowerCase()
    );

    const baseRate = species?.carbonSequestrationRate || 15; // Default rate
    const dbhFactor = Math.pow(data.dbh / 30, 1.5); // Scale by DBH
    const healthFactor = this.getHealthMultiplier(data.healthStatus);

    return Math.round(baseRate * dbhFactor * healthFactor);
  }

  // Calculate economic value estimate
  static estimateEconomicValue(data: CaptureData): number {
    const carbonValue = this.estimateCarbonSequestration(data);
    const species = COMMON_SPECIES.find(s => 
      s.commonName.toLowerCase() === data.commonName?.toLowerCase() ||
      s.scientificName.toLowerCase() === data.scientificName?.toLowerCase()
    );

    const pricePerKg = species?.economicValuePerKg || 0.05;
    return Math.round(carbonValue * pricePerKg * 100) / 100; // Round to 2 decimal places
  }

  private static getHealthMultiplier(healthStatus?: string): number {
    switch (healthStatus) {
      case 'excellent': return 1.2;
      case 'good': return 1.0;
      case 'fair': return 0.8;
      case 'poor': return 0.6;
      case 'critical': return 0.3;
      case 'dead': return 0;
      default: return 1.0;
    }
  }

  // Suggest species based on location (basic implementation)
  static suggestSpecies(latitude: number, longitude: number): typeof COMMON_SPECIES {
    // This could be enhanced with a proper geographic species database
    // For now, return all species as suggestions
    return COMMON_SPECIES;
  }
}

export default TreeDataValidator;