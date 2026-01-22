export interface CaptureData {
  id: string;
  userId: string;
  
  // Geolocation data
  latitude: number;
  longitude: number;
  altitude?: number; // Elevation in meters
  gpsAccuracy?: number; // GPS accuracy in meters
  
  // Tree physical characteristics
  species?: string;
  commonName?: string;
  scientificName?: string;
  dbh?: number; // Diameter at Breast Height in cm
  height?: number; // Tree height in meters
  crownDiameter?: number; // Crown diameter in meters
  treeAge?: number; // Estimated age in years
  
  // Tree health and condition
  healthStatus?: 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'dead';
  diseasePresent?: boolean;
  pestDamage?: boolean;
  structuralDamage?: boolean;
  
  // Environmental context
  soilType?: string;
  landUse?: 'forest' | 'urban' | 'agricultural' | 'park' | 'roadside' | 'residential' | 'commercial' | 'industrial';
  weather?: {
    temperature?: number; // Celsius
    humidity?: number; // Percentage
    precipitation?: 'none' | 'light' | 'moderate' | 'heavy';
  };
  
  // Planting/maintenance data
  plantingDate?: Date;
  plantedBy?: string;
  lastMaintenance?: Date;
  maintenanceType?: 'watering' | 'pruning' | 'fertilizing' | 'pest_treatment' | 'other';
  
  // Media and documentation
  imageUrl?: string;
  additionalImages?: string[];
  audioNote?: string; // URL to audio recording
  
  // Metadata
  timestamp: Date;
  deviceId?: string;
  captureMethod?: 'mobile_app' | 'web_form' | 'field_survey' | 'drone' | 'satellite';
  note?: string;
  tags?: string[]; // User-defined tags
  
  // Administrative
  approved?: boolean;
  verifiedBy?: string; // User ID of verifier
  verificationDate?: Date;
  carbonSequestrationEstimate?: number; // kg CO2/year
  economicValue?: number; // Currency value
  blockchainTxId?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  sub: string; // Keycloak subject ID
  preferred_username: string;
  given_name?: string;
  family_name?: string;
}

export interface KeycloakTokenPayload {
  sub: string;
  preferred_username: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: {
    [key: string]: {
      roles: string[];
    };
  };
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

export interface FabricTransaction {
  txId: string;
  timestamp: Date;
  captureId: string;
  userId: string;
  data: CaptureData;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Tree species database interface
export interface TreeSpecies {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  genus: string;
  nativeRegions: string[];
  characteristics: {
    maxHeight: number; // meters
    maxDbh: number; // cm
    lifespan: number; // years
    growthRate: 'slow' | 'moderate' | 'fast';
  };
  carbonSequestrationRate: number; // kg CO2/year per tree
  economicValuePerKg: number;
}

// Geolocation validation
export interface LocationBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
  region: string;
}

// Measurement validation ranges
export interface MeasurementValidation {
  dbh: { min: number; max: number; unit: 'cm' };
  height: { min: number; max: number; unit: 'm' };
  crownDiameter: { min: number; max: number; unit: 'm' };
  age: { min: number; max: number; unit: 'years' };
}

// Capture form data (for API requests)
export interface CaptureFormData {
  latitude: number;
  longitude: number;
  altitude?: number;
  gpsAccuracy?: number;
  species?: string;
  commonName?: string;
  scientificName?: string;
  dbh?: number;
  height?: number;
  crownDiameter?: number;
  treeAge?: number;
  healthStatus?: string;
  diseasePresent?: boolean;
  pestDamage?: boolean;
  structuralDamage?: boolean;
  soilType?: string;
  landUse?: string;
  temperature?: number;
  humidity?: number;
  precipitation?: string;
  plantingDate?: string; // ISO date string
  plantedBy?: string;
  lastMaintenance?: string; // ISO date string
  maintenanceType?: string;
  captureMethod?: string;
  note?: string;
  tags?: string;
  deviceId?: string;
}
