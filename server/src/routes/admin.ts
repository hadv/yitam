import express, { Request, Response } from 'express';
import {
  getAllAcupoints,
  getAcupointById,
  createAcupoint,
  updateAcupoint,
  deleteAcupoint,
  getAllVessels,
  getVesselById,
  createVessel,
  updateVessel,
  deleteVessel,
  CreateAcupointsRequest,
  UpdateAcupointsRequest,
  CreateVesselRequest,
  UpdateVesselRequest
} from '../db/database';
import { upload, getImageUrl, deleteImageFile, getFilenameFromUrl } from '../services/imageUpload';
import { detectAcupointsInImage, validateVisionAPIConfig } from '../services/visionService';
import { uploadRelativePathToCloud, validateCloudStorageConfig } from '../services/cloudStorageService';
import {
  createQigongVessel,
  getQigongVessels,
  createQigongAcupoint,
  getQigongAcupoints,
  QigongVessel,
  QigongAcupoint
} from '../db/qigongDatabase';

const router = express.Router();

// Middleware to validate admin access code
const validateAdminAccess = (req: Request, res: Response, next: express.NextFunction): void => {
  const accessCode = req.query.access_code as string || req.headers['x-access-code'] as string;

  if (!accessCode) {
    res.status(401).json({
      error: 'Access code required',
      message: 'Please provide a valid access code'
    });
    return;
  }

  const validAdminCodes = process.env.ADMIN_ACCESS_CODES?.split(',') || [];

  if (!validAdminCodes.includes(accessCode)) {
    res.status(403).json({
      error: 'Invalid access code',
      message: 'The provided access code is not valid for admin operations'
    });
    return;
  }

  next();
};

// Apply admin access validation to all routes
router.use(validateAdminAccess);

// IMAGE UPLOAD ENDPOINTS

// POST /api/admin/upload-image - Upload image file
router.post('/upload-image', upload.single('image'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select an image file to upload'
      });
      return;
    }

    const imageUrl = getImageUrl(req.file.filename);

    res.json({
      success: true,
      data: {
        filename: req.file.filename,
        url: imageUrl,
        originalName: req.file.originalname,
        size: req.file.size
      },
      message: 'Image uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: 'Failed to upload image'
    });
  }
});

// DELETE /api/admin/delete-image/:filename - Delete uploaded image
router.delete('/delete-image/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filename } = req.params;

    if (!filename) {
      res.status(400).json({
        error: 'Missing filename',
        message: 'Filename is required'
      });
      return;
    }

    deleteImageFile(filename);

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({
      error: 'Delete failed',
      message: 'Failed to delete image'
    });
  }
});

// CATEGORY MANAGEMENT ENDPOINTS

// GET /api/admin/vessels - Get all vessels
router.get('/vessels', async (req: Request, res: Response): Promise<void> => {
  try {
    const vessels = await getAllVessels();
    res.json({
      success: true,
      data: vessels,
      count: vessels.length
    });
  } catch (error) {
    console.error('Error fetching vessels:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch vessels'
    });
  }
});

// GET /api/admin/vessels/:id - Get specific vessel
router.get('/vessels/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const vessel = await getVesselById(id);
    if (!vessel) {
      res.status(404).json({
        error: 'Not found',
        message: 'Category not found'
      });
      return;
    }

    res.json({
      success: true,
      data: vessel
    });
  } catch (error) {
    console.error('Error fetching vessel:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch vessel'
    });
  }
});

// POST /api/admin/vessels - Create new vessel
router.post('/vessels', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, image_url } = req.body;

    if (!name) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Category name is required'
      });
      return;
    }

    const data: CreateVesselRequest = {
      name: name.trim(),
      description: description?.trim() || undefined,
      image_url: image_url?.trim() || undefined
    };

    const newId = await createVessel(data);
    const newCategory = await getVesselById(newId);

    res.status(201).json({
      success: true,
      data: newCategory,
      message: 'Category created successfully'
    });
  } catch (error) {
    console.error('Error creating vessel:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate name',
        message: 'A vessel with this name already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create vessel'
      });
    }
  }
});

// PUT /api/admin/vessels/:id - Update vessel
router.put('/vessels/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const { name, description, image_url } = req.body;

    const data: UpdateVesselRequest = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (image_url !== undefined) data.image_url = image_url?.trim() || null;

    const updated = await updateVessel(id, data);
    if (!updated) {
      res.status(404).json({
        error: 'Not found',
        message: 'Category not found'
      });
      return;
    }

    const updatedCategory = await getVesselById(id);
    res.json({
      success: true,
      data: updatedCategory,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Error updating vessel:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate name',
        message: 'A vessel with this name already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update vessel'
      });
    }
  }
});

// DELETE /api/admin/vessels/:id - Delete vessel
router.delete('/vessels/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const deleted = await deleteVessel(id);
    if (!deleted) {
      res.status(404).json({
        error: 'Not found',
        message: 'Category not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting vessel:', error);
    if (error instanceof Error && error.message.includes('Cannot delete vessel')) {
      res.status(409).json({
        error: 'Cannot delete',
        message: 'Cannot delete vessel: it is referenced by acupoint items'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete vessel'
      });
    }
  }
});

// HERBAL MEDICINE MANAGEMENT ENDPOINTS

// GET /api/admin/acupoints - Get all acupoint records
router.get('/acupoints', async (req: Request, res: Response): Promise<void> => {
  try {
    const vesselId = req.query.vessel_id ? parseInt(req.query.vessel_id as string) : undefined;
    const records = await getAllAcupoints(vesselId);
    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    console.error('Error fetching acupoint records:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch acupoint records'
    });
  }
});

// GET /api/admin/acupoints/:id - Get specific acupoint record
router.get('/acupoints/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const record = await getAcupointById(id);
    if (!record) {
      res.status(404).json({
        error: 'Not found',
        message: 'Herbal medicine record not found'
      });
      return;
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    console.error('Error fetching acupoint record:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch acupoint record'
    });
  }
});

// POST /api/admin/acupoints - Create new acupoint record
router.post('/acupoints', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol, vessel_id, chinese_characters, pinyin, vietnamese_name, description, usage, notes, image_url, x_coordinate, y_coordinate } = req.body;

    if (!symbol || !vietnamese_name || !vessel_id) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Symbol, vessel ID, and Vietnamese name are required'
      });
      return;
    }

    const data: CreateAcupointsRequest = {
      symbol: symbol.trim(),
      vessel_id: parseInt(vessel_id),
      chinese_characters: chinese_characters?.trim() || undefined,
      pinyin: pinyin?.trim() || undefined,
      vietnamese_name: vietnamese_name.trim(),
      description: description?.trim() || undefined,
      usage: usage?.trim() || undefined,
      notes: notes?.trim() || undefined,
      image_url: image_url?.trim() || undefined,
      x_coordinate: x_coordinate ? parseFloat(x_coordinate) : undefined,
      y_coordinate: y_coordinate ? parseFloat(y_coordinate) : undefined
    };

    const newId = await createAcupoint(data);
    const newRecord = await getAcupointById(newId);

    res.status(201).json({
      success: true,
      data: newRecord,
      message: 'Herbal medicine record created successfully'
    });
  } catch (error) {
    console.error('Error creating acupoint record:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate symbol',
        message: 'A record with this symbol already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create acupoint record'
      });
    }
  }
});

// PUT /api/admin/acupoints/:id - Update acupoint record
router.put('/acupoints/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const { symbol, vessel_id, chinese_characters, pinyin, vietnamese_name, description, usage, notes, image_url, x_coordinate, y_coordinate } = req.body;

    const data: UpdateAcupointsRequest = {};
    if (symbol !== undefined) data.symbol = symbol.trim();
    if (vessel_id !== undefined) data.vessel_id = parseInt(vessel_id);
    if (chinese_characters !== undefined) data.chinese_characters = chinese_characters?.trim() || null;
    if (pinyin !== undefined) data.pinyin = pinyin?.trim() || null;
    if (vietnamese_name !== undefined) data.vietnamese_name = vietnamese_name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (usage !== undefined) data.usage = usage?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (image_url !== undefined) data.image_url = image_url?.trim() || null;
    if (x_coordinate !== undefined) data.x_coordinate = x_coordinate ? parseFloat(x_coordinate) : null;
    if (y_coordinate !== undefined) data.y_coordinate = y_coordinate ? parseFloat(y_coordinate) : null;

    const updated = await updateAcupoint(id, data);
    if (!updated) {
      res.status(404).json({
        error: 'Not found',
        message: 'Herbal medicine record not found'
      });
      return;
    }

    const updatedRecord = await getAcupointById(id);
    res.json({
      success: true,
      data: updatedRecord,
      message: 'Herbal medicine record updated successfully'
    });
  } catch (error) {
    console.error('Error updating acupoint record:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate symbol',
        message: 'A record with this symbol already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update acupoint record'
      });
    }
  }
});

// DELETE /api/admin/acupoints/:id - Delete acupoint record
router.delete('/acupoints/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const deleted = await deleteAcupoint(id);
    if (!deleted) {
      res.status(404).json({
        error: 'Not found',
        message: 'Herbal medicine record not found'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Herbal medicine record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting acupoint record:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete acupoint record'
    });
  }
});



// Auto-detect acupoints in vessel image using Google Cloud Vision
router.post('/detect-acupoints', async (req: any, res: any) => {
  try {
    const accessCode = req.query.access_code as string;
    const validAdminCodes = process.env.ADMIN_ACCESS_CODES?.split(',') || [];
    if (!accessCode || !validAdminCodes.includes(accessCode)) {
      return res.status(401).json({ error: 'Invalid access code' });
    }

    const { vessel_id, image_url } = req.body;

    if (!vessel_id || !image_url) {
      return res.status(400).json({ error: 'vessel_id and image_url are required' });
    }

    // Get vessel information
    const vessel = await getVesselById(parseInt(vessel_id));
    if (!vessel) {
      return res.status(404).json({ error: 'Vessel not found' });
    }

    // Validate Vision API configuration
    const isConfigValid = await validateVisionAPIConfig();
    if (!isConfigValid) {
      return res.status(500).json({ error: 'Google Cloud Vision API not properly configured' });
    }

    // Try cloud storage upload for better quality, fallback to base64
    let processableImageUrl = image_url;

    if (image_url.startsWith('/uploads/')) {
      try {
        console.log(`Attempting cloud storage upload: ${image_url}`);

        // Upload to Google Cloud Storage and get public URL
        const uploadResult = await uploadRelativePathToCloud(image_url);
        processableImageUrl = uploadResult.publicUrl;

        console.log(`✅ Cloud storage upload successful: ${processableImageUrl}`);

      } catch (uploadError) {
        console.warn('⚠️ Cloud storage upload failed, using base64 fallback');
        console.warn('This is normal if Cloud Storage API is not enabled for your API key');

        // Fallback to original path (will use base64 in visionService)
        processableImageUrl = image_url;
        console.log('📄 Will use base64 content for Vision API (still works well for text detection)');
      }
    }

    const detectionResult = await detectAcupointsInImage(processableImageUrl, vessel.name);

    // Auto-create detected acupoints
    const createdAcupoints = [];
    for (const detectedPoint of detectionResult.detected_acupoints) {
      try {
        // Check if acupoint with this symbol already exists for this vessel
        const existingAcupoints = await getAllAcupoints();
        const exists = existingAcupoints.some(ap =>
          ap.symbol === detectedPoint.symbol && ap.vessel_id === vessel.id
        );

        if (!exists) {
          const acupointData: CreateAcupointsRequest = {
            symbol: detectedPoint.symbol,
            vessel_id: vessel.id!,
            vietnamese_name: detectedPoint.vietnamese_name,
            description: detectedPoint.description,
            x_coordinate: detectedPoint.x_coordinate,
            y_coordinate: detectedPoint.y_coordinate,
            bounding_box: detectedPoint.bounding_box
          };

          const createdId = await createAcupoint(acupointData);
          createdAcupoints.push({
            id: createdId,
            symbol: detectedPoint.symbol,
            vessel_id: vessel.id!,
            vietnamese_name: detectedPoint.vietnamese_name,
            x_coordinate: detectedPoint.x_coordinate,
            y_coordinate: detectedPoint.y_coordinate,
            bounding_box: detectedPoint.bounding_box,
            confidence: detectedPoint.confidence
          });
        }
      } catch (createError) {
        console.error(`Failed to create acupoint ${detectedPoint.symbol}:`, createError);
        // Continue with other acupoints
      }
    }

    res.json({
      success: true,
      vessel_name: vessel.name,
      detection_result: {
        total_detected: detectionResult.total_detected,
        processing_time: detectionResult.processing_time,
        image_dimensions: detectionResult.image_dimensions
      },
      created_acupoints: createdAcupoints,
      total_created: createdAcupoints.length,
      skipped: detectionResult.total_detected - createdAcupoints.length
    });

  } catch (error) {
    console.error('Auto-detect acupoints error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Failed to auto-detect acupoints',
      details: errorMessage
    });
  }
});

// Test Google Cloud Vision API configuration
router.get('/test-vision-api', async (req: any, res: any) => {
  try {
    const accessCode = req.query.access_code as string;
    const validAdminCodes = process.env.ADMIN_ACCESS_CODES?.split(',') || [];
    if (!accessCode || !validAdminCodes.includes(accessCode)) {
      return res.status(401).json({ error: 'Invalid access code' });
    }

    const isValid = await validateVisionAPIConfig();

    res.json({
      vision_api_configured: isValid,
      message: isValid
        ? 'Google Cloud Vision API is properly configured'
        : 'Google Cloud Vision API configuration failed'
    });

  } catch (error) {
    console.error('Vision API test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      vision_api_configured: false,
      error: 'Failed to test Vision API configuration',
      details: errorMessage
    });
  }
});

// Test Google Cloud Storage configuration
router.get('/test-cloud-storage', async (req: any, res: any) => {
  try {
    const accessCode = req.query.access_code as string;
    const validAdminCodes = process.env.ADMIN_ACCESS_CODES?.split(',') || [];
    if (!accessCode || !validAdminCodes.includes(accessCode)) {
      return res.status(401).json({ error: 'Invalid access code' });
    }

    const isValid = await validateCloudStorageConfig();

    res.json({
      cloud_storage_configured: isValid,
      bucket_name: process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'yitam-vessel-images',
      message: isValid
        ? 'Google Cloud Storage is properly configured'
        : 'Google Cloud Storage configuration failed'
    });

  } catch (error) {
    console.error('Cloud Storage test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      cloud_storage_configured: false,
      error: 'Failed to test Cloud Storage configuration',
      details: errorMessage
    });
  }
});

export default router;
