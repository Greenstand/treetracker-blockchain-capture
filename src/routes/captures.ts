import express, { Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CaptureData, ApiResponse, PaginatedResponse, CaptureFormData } from '../types';
import { keycloakAuth } from '../middleware/keycloakAuth';
import { authenticateFlexible } from '../middleware/bearerAuth';
import { upload, getFileUrl } from '../utils/fileUpload';
import TreeDataValidator from '../utils/treeValidation';
import { ensureFabricConnected, fabricClient, withTimeout } from '../services/fabric';
import { getCaptureById, getCaptureByTxId, getCapturesByUser, updateCaptureApproval, upsertCapture } from '../db/captures';

const router = express.Router();
// In-memory storage for demonstration (replace with actual database)
const captures: Map<string, CaptureData> = new Map();
const capturesCache: Map<string, { data: CaptureData[]; fetchedAt: number }> = new Map();

const CAPTURES_QUERY_TIMEOUT_MS = parseInt(process.env.CAPTURES_QUERY_TIMEOUT_MS || '4000', 10);
const CAPTURES_CACHE_TTL_MS = parseInt(process.env.CAPTURES_CACHE_TTL_MS || '30000', 10);
const TOKEN_SERVICE_URL = process.env.TOKEN_SERVICE_URL || 'http://greenstand-token-service:3004/api';

const getCachedCaptures = (userId: string): CaptureData[] | null => {
  const cached = capturesCache.get(userId);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.fetchedAt > CAPTURES_CACHE_TTL_MS) {
    return null;
  }
  return cached.data;
};

/**
 * @route POST /api/captures
 * @desc Create a new tree capture
 * @access Private
 */
router.post('/', 
  upload.single('image'),
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Extract and parse form data
      const formData: CaptureFormData = {
        latitude: parseFloat(req.body.latitude),
        longitude: parseFloat(req.body.longitude),
        altitude: req.body.altitude ? parseFloat(req.body.altitude) : undefined,
        gpsAccuracy: req.body.gpsAccuracy ? parseFloat(req.body.gpsAccuracy) : undefined,
        species: req.body.species,
        commonName: req.body.commonName,
        scientificName: req.body.scientificName,
        dbh: req.body.dbh ? parseFloat(req.body.dbh) : undefined,
        height: req.body.height ? parseFloat(req.body.height) : undefined,
        crownDiameter: req.body.crownDiameter ? parseFloat(req.body.crownDiameter) : undefined,
        treeAge: req.body.treeAge ? parseInt(req.body.treeAge) : undefined,
        healthStatus: req.body.healthStatus,
        diseasePresent: req.body.diseasePresent === 'true',
        pestDamage: req.body.pestDamage === 'true',
        structuralDamage: req.body.structuralDamage === 'true',
        soilType: req.body.soilType,
        landUse: req.body.landUse,
        temperature: req.body.temperature ? parseFloat(req.body.temperature) : undefined,
        humidity: req.body.humidity ? parseFloat(req.body.humidity) : undefined,
        precipitation: req.body.precipitation,
        plantingDate: req.body.plantingDate,
        plantedBy: req.body.plantedBy,
        lastMaintenance: req.body.lastMaintenance,
        maintenanceType: req.body.maintenanceType,
        captureMethod: req.body.captureMethod || 'mobile_app',
        note: req.body.note,
        tags: req.body.tags,
        deviceId: req.body.deviceId
      };

      // Log the received form data for debugging
      console.log('=== CAPTURE SUBMISSION DEBUG ===');
      console.log('User:', req.user?.sub, req.user?.preferred_username);
      console.log('Form data received:');
      console.log('- latitude:', req.body.latitude, '(type:', typeof req.body.latitude, ')');
      console.log('- longitude:', req.body.longitude, '(type:', typeof req.body.longitude, ')');
      console.log('- file uploaded:', !!req.file, req.file?.filename, req.file?.size, 'bytes');
      console.log('- species:', req.body.species);
      console.log('- note:', req.body.note);
      console.log('- captureMethod:', req.body.captureMethod);
      console.log('Raw body keys:', Object.keys(req.body));
      
      // Validate the form data
      const validation = TreeDataValidator.validateCaptureData(formData);
      if (!validation.isValid) {
        console.log('Validation failed with errors:', validation.errors);
        res.status(400).json({
          success: false,
          error: 'Invalid capture data',
          details: validation.errors
        } as ApiResponse);
        return;
      }
      
      console.log('Validation passed, proceeding with capture submission...');

      const captureId = uuidv4();
      const userId = req.user!.sub;
      const timestamp = new Date();

      // Get image URL if uploaded
      let imageUrl: string | undefined;
      let additionalImages: string[] = [];
      if (req.file) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        imageUrl = getFileUrl(req.file.filename, baseUrl);
      }
      // Handle multiple images if provided
      if (req.files && Array.isArray(req.files)) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        additionalImages = req.files.map(file => getFileUrl(file.filename, baseUrl));
      }

      const captureData: CaptureData = {
        id: captureId,
        userId,
        // Geolocation
        latitude: formData.latitude,
        longitude: formData.longitude,
        altitude: formData.altitude,
        gpsAccuracy: formData.gpsAccuracy,
        // Tree characteristics
        species: formData.species,
        commonName: formData.commonName,
        scientificName: formData.scientificName,
        dbh: formData.dbh,
        height: formData.height,
        crownDiameter: formData.crownDiameter,
        treeAge: formData.treeAge,
        // Health and condition
        healthStatus: formData.healthStatus as any,
        diseasePresent: formData.diseasePresent,
        pestDamage: formData.pestDamage,
        structuralDamage: formData.structuralDamage,
        // Environmental context
        soilType: formData.soilType,
        landUse: formData.landUse as any,
        weather: {
          temperature: formData.temperature,
          humidity: formData.humidity,
          precipitation: formData.precipitation as any
        },
        // Planting/maintenance
        plantingDate: formData.plantingDate ? new Date(formData.plantingDate) : undefined,
        plantedBy: formData.plantedBy,
        lastMaintenance: formData.lastMaintenance ? new Date(formData.lastMaintenance) : undefined,
        maintenanceType: formData.maintenanceType as any,
        // Media
        imageUrl,
        additionalImages,
        // Metadata
        timestamp,
        deviceId: formData.deviceId,
        captureMethod: formData.captureMethod as any,
        note: formData.note,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : undefined,
        // Administrative
        approved: false
      };

      // Calculate estimates
      if (captureData.dbh) {
        captureData.carbonSequestrationEstimate = TreeDataValidator.estimateCarbonSequestration(captureData);
        captureData.economicValue = TreeDataValidator.estimateEconomicValue(captureData);
      }

      // Connect to Fabric as admin (transactions will use admin identity)
      await ensureFabricConnected();

      // Submit to blockchain
      const submitResult = await withTimeout(
        fabricClient.submitCaptureTransaction(captureData),
        CAPTURES_QUERY_TIMEOUT_MS,
        'fabric_submit'
      );
      captureData.blockchainTxId = submitResult.txId;
      if (submitResult.treeId) {
        captureData.id = submitResult.treeId;
      }

      await upsertCapture(captureData);

      // Store in local memory (fallback cache)
      captures.set(captureData.id, captureData);
      console.log(`✅ Capture ${captureData.id} stored in memory and submitted to Fabric`);

      res.status(201).json({
        success: true,
        data: captureData,
        message: 'Capture created successfully'
      } as ApiResponse<CaptureData>);

    } catch (error) {
      console.error('Error creating capture:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create capture'
      } as ApiResponse);
    }
  }
);

/**
 * @route GET /api/captures
 * @desc Get all captures for the authenticated user
 * @access Private
 */
router.get('/',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const cachedCaptures = getCachedCaptures(userId);
      let capturesResult: CaptureData[] = [];
      let total = 0;
      let usedCache = false;

      try {
        const dbResult = await getCapturesByUser(userId, page, limit);
        capturesResult = dbResult.captures;
        total = dbResult.total;
        capturesCache.set(userId, { data: dbResult.captures, fetchedAt: Date.now() });
      } catch (error) {
        if (cachedCaptures) {
          capturesResult = cachedCaptures;
          total = cachedCaptures.length;
          usedCache = true;
        } else {
          capturesResult = [];
          total = 0;
          usedCache = true;
        }
        console.warn('Falling back to cached captures:', (error as Error).message);
      }

      if (usedCache) {
        res.setHeader('X-Data-Source', cachedCaptures ? 'cache' : 'empty');
        res.setHeader('X-Data-Stale', 'true');
      } else {
        res.setHeader('X-Data-Source', 'database');
      }

      const totalPages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: capturesResult,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      } as PaginatedResponse<CaptureData>);

    } catch (error) {
      console.error('Error fetching captures:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch captures'
      } as ApiResponse);
    }
  }
);

/**
 * @route GET /api/captures/:id
 * @desc Get a specific capture by ID
 * @access Private
 */
router.get('/:id',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const captureId = req.params.id;
      const userId = req.user!.sub;

      let capture: CaptureData | null = null;
      try {
        capture = await getCaptureById(captureId);
      } catch (error) {
        console.warn('Database lookup failed, falling back to Fabric:', (error as Error).message);
      }

      if (!capture) {
        try {
          await ensureFabricConnected();
          capture = await withTimeout(
            fabricClient.queryCapture(captureId),
            CAPTURES_QUERY_TIMEOUT_MS,
            'fabric_query'
          );
        } catch (error) {
          capture = captures.get(captureId) || null;
          res.setHeader('X-Data-Source', capture ? 'cache' : 'empty');
          res.setHeader('X-Data-Stale', 'true');
          console.warn('Falling back to cached capture:', (error as Error).message);
        }
      } else {
        res.setHeader('X-Data-Source', 'database');
      }

      if (!capture) {
        res.status(404).json({
          success: false,
          error: 'Capture not found'
        } as ApiResponse);
        return;
      }

      // Check if user owns the capture
      if (capture.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: capture
      } as ApiResponse<CaptureData>);

    } catch (error) {
      console.error('Error fetching capture:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capture'
      } as ApiResponse);
    }
  }
);

/**
 * @route PUT /api/captures/:id/approve
 * @desc Approve or reject a capture (admin only)
 * @access Private (Admin)
 */
router.put('/:id/approve',
  authenticateFlexible,
  keycloakAuth.requireRole('admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const captureId = req.params.id;
      const { approved } = req.body;

      if (typeof approved !== 'boolean') {
        res.status(400).json({
          success: false,
          error: 'Approved field must be a boolean'
        } as ApiResponse);
        return;
      }

      const captureRecord =
        (await getCaptureById(captureId)) || (await getCaptureByTxId(captureId));
      if (!captureRecord) {
        res.status(404).json({
          success: false,
          error: 'Capture not found'
        } as ApiResponse);
        return;
      }

      await ensureFabricConnected();

      // Update capture status on blockchain using the ledger ID.
      const txId = await fabricClient.updateCaptureStatus(captureRecord.id, approved);

      await updateCaptureApproval(captureRecord.id, approved, req.user?.sub);

      if (approved) {
        try {
          const authHeader = req.headers.authorization || '';
          await axios.post(
            `${TOKEN_SERVICE_URL}/tokens`,
            {
              captureId: captureRecord.id,
              planterId: captureRecord.userId,
              treeSpecies: captureRecord.species || captureRecord.commonName
            },
            {
              headers: {
                Authorization: authHeader
              },
              timeout: 10000
            }
          );
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 409) {
            console.warn(`Token already exists for capture ${captureId}, skipping issuance`);
          } else {
            console.error('Token issuance failed:', error?.message || error);
          }
        }
      }

      // Update local storage (fallback cache)
      const capture = captures.get(captureRecord.id);
      if (capture) {
        capture.approved = approved;
        captures.set(captureRecord.id, capture);
      }

      res.json({
        success: true,
        data: { captureId: captureRecord.id, approved, blockchainTxId: txId },
        message: `Capture ${approved ? 'approved' : 'rejected'} successfully`
      } as ApiResponse);

    } catch (error) {
      console.error('Error updating capture status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update capture status'
      } as ApiResponse);
    }
  }
);

/**
 * @route GET /api/captures/:id/history
 * @desc Get blockchain transaction history for a capture
 * @access Private
 */
router.get('/:id/history',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const captureId = req.params.id;
      const userId = req.user!.sub;

      await ensureFabricConnected();

      // First check if capture exists and user has access
      const capture = await fabricClient.queryCapture(captureId);
      if (!capture) {
        res.status(404).json({
          success: false,
          error: 'Capture not found'
        } as ApiResponse);
        return;
      }

      if (capture.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
        return;
      }

      // Get transaction history
      const history = await fabricClient.getCaptureHistory(captureId);

      res.json({
        success: true,
        data: history
      } as ApiResponse);

    } catch (error) {
      console.error('Error fetching capture history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch capture history'
      } as ApiResponse);
    }
  }
);

/**
 * @route DELETE /api/captures/:id
 * @desc Delete a capture (user can only delete their own)
 * @access Private
 */
router.delete('/:id',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const captureId = req.params.id;
      const userId = req.user!.sub;

      // Get capture from local storage (replace with database)
      const capture = captures.get(captureId);
      
      if (!capture) {
        res.status(404).json({
          success: false,
          error: 'Capture not found'
        } as ApiResponse);
        return;
      }

      // Check if user owns the capture
      if (capture.userId !== userId) {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        } as ApiResponse);
        return;
      }

      // Remove from local storage (replace with database)
      captures.delete(captureId);

      res.json({
        success: true,
        message: 'Capture deleted successfully'
      } as ApiResponse);

    } catch (error) {
      console.error('Error deleting capture:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete capture'
      } as ApiResponse);
    }
  }
);

/**
 * @route GET /api/captures/species/suggest
 * @desc Get suggested tree species based on location
 * @access Private
 */
router.get('/species/suggest',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { latitude, longitude } = req.query;
      
      if (!latitude || !longitude) {
        res.status(400).json({
          success: false,
          error: 'Latitude and longitude are required'
        } as ApiResponse);
        return;
      }

      const lat = parseFloat(latitude as string);
      const lon = parseFloat(longitude as string);

      if (!TreeDataValidator.validateLatitude(lat) || !TreeDataValidator.validateLongitude(lon)) {
        res.status(400).json({
          success: false,
          error: 'Invalid coordinates'
        } as ApiResponse);
        return;
      }

      const suggestions = TreeDataValidator.suggestSpecies(lat, lon);
      
      res.json({
        success: true,
        data: suggestions
      } as ApiResponse);

    } catch (error) {
      console.error('Error fetching species suggestions:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch species suggestions'
      } as ApiResponse);
    }
  }
);

/**
 * @route POST /api/captures/validate
 * @desc Validate capture data without saving
 * @access Private
 */
router.post('/validate',
  authenticateFlexible,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const formData = req.body as CaptureFormData;
      const validation = TreeDataValidator.validateCaptureData(formData);
      
      res.json({
        success: validation.isValid,
        data: {
          isValid: validation.isValid,
          errors: validation.errors,
          estimates: validation.isValid && formData.dbh ? {
            carbonSequestration: TreeDataValidator.estimateCarbonSequestration({
              ...formData,
              dbh: formData.dbh,
              commonName: formData.commonName,
              scientificName: formData.scientificName,
              healthStatus: formData.healthStatus as any
            } as CaptureData),
            economicValue: TreeDataValidator.estimateEconomicValue({
              ...formData,
              dbh: formData.dbh,
              commonName: formData.commonName,
              scientificName: formData.scientificName,
              healthStatus: formData.healthStatus as any
            } as CaptureData)
          } : null
        }
      } as ApiResponse);

    } catch (error) {
      console.error('Error validating capture data:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate capture data'
      } as ApiResponse);
    }
  }
);

export default router;
