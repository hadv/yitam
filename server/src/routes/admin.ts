import express, { Request, Response } from 'express';
import {
  getAllHerbalMedicine,
  getHerbalMedicineById,
  createHerbalMedicine,
  updateHerbalMedicine,
  deleteHerbalMedicine,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  CreateHerbalMedicineRequest,
  UpdateHerbalMedicineRequest,
  CreateCategoryRequest,
  UpdateCategoryRequest
} from '../db/database';
import { upload, getImageUrl, deleteImageFile, getFilenameFromUrl } from '../services/imageUpload';

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

// GET /api/admin/categories - Get all categories
router.get('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await getAllCategories();
    res.json({
      success: true,
      data: categories,
      count: categories.length
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch categories'
    });
  }
});

// GET /api/admin/categories/:id - Get specific category
router.get('/categories/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const category = await getCategoryById(id);
    if (!category) {
      res.status(404).json({
        error: 'Not found',
        message: 'Category not found'
      });
      return;
    }

    res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch category'
    });
  }
});

// POST /api/admin/categories - Create new category
router.post('/categories', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, image_url } = req.body;

    if (!name) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Category name is required'
      });
      return;
    }

    const data: CreateCategoryRequest = {
      name: name.trim(),
      description: description?.trim() || undefined,
      image_url: image_url?.trim() || undefined
    };

    const newId = await createCategory(data);
    const newCategory = await getCategoryById(newId);

    res.status(201).json({
      success: true,
      data: newCategory,
      message: 'Category created successfully'
    });
  } catch (error) {
    console.error('Error creating category:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate name',
        message: 'A category with this name already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create category'
      });
    }
  }
});

// PUT /api/admin/categories/:id - Update category
router.put('/categories/:id', async (req: Request, res: Response): Promise<void> => {
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

    const data: UpdateCategoryRequest = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (image_url !== undefined) data.image_url = image_url?.trim() || null;

    const updated = await updateCategory(id, data);
    if (!updated) {
      res.status(404).json({
        error: 'Not found',
        message: 'Category not found'
      });
      return;
    }

    const updatedCategory = await getCategoryById(id);
    res.json({
      success: true,
      data: updatedCategory,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Error updating category:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate name',
        message: 'A category with this name already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update category'
      });
    }
  }
});

// DELETE /api/admin/categories/:id - Delete category
router.delete('/categories/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const deleted = await deleteCategory(id);
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
    console.error('Error deleting category:', error);
    if (error instanceof Error && error.message.includes('Cannot delete category')) {
      res.status(409).json({
        error: 'Cannot delete',
        message: 'Cannot delete category: it is referenced by herbal medicine items'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete category'
      });
    }
  }
});

// HERBAL MEDICINE MANAGEMENT ENDPOINTS

// GET /api/admin/herbal-medicine - Get all herbal medicine records
router.get('/herbal-medicine', async (req: Request, res: Response): Promise<void> => {
  try {
    const categoryId = req.query.category_id ? parseInt(req.query.category_id as string) : undefined;
    const records = await getAllHerbalMedicine(categoryId);
    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    console.error('Error fetching herbal medicine records:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch herbal medicine records'
    });
  }
});

// GET /api/admin/herbal-medicine/:id - Get specific herbal medicine record
router.get('/herbal-medicine/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const record = await getHerbalMedicineById(id);
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
    console.error('Error fetching herbal medicine record:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch herbal medicine record'
    });
  }
});

// POST /api/admin/herbal-medicine - Create new herbal medicine record
router.post('/herbal-medicine', async (req: Request, res: Response): Promise<void> => {
  try {
    const { symbol, category_id, chinese_characters, pinyin, vietnamese_name, description, usage, notes, image_url } = req.body;

    if (!symbol || !vietnamese_name || !category_id) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'Symbol, category ID, and Vietnamese name are required'
      });
      return;
    }

    const data: CreateHerbalMedicineRequest = {
      symbol: symbol.trim(),
      category_id: parseInt(category_id),
      chinese_characters: chinese_characters?.trim() || undefined,
      pinyin: pinyin?.trim() || undefined,
      vietnamese_name: vietnamese_name.trim(),
      description: description?.trim() || undefined,
      usage: usage?.trim() || undefined,
      notes: notes?.trim() || undefined,
      image_url: image_url?.trim() || undefined
    };

    const newId = await createHerbalMedicine(data);
    const newRecord = await getHerbalMedicineById(newId);

    res.status(201).json({
      success: true,
      data: newRecord,
      message: 'Herbal medicine record created successfully'
    });
  } catch (error) {
    console.error('Error creating herbal medicine record:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate symbol',
        message: 'A record with this symbol already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create herbal medicine record'
      });
    }
  }
});

// PUT /api/admin/herbal-medicine/:id - Update herbal medicine record
router.put('/herbal-medicine/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const { symbol, category_id, chinese_characters, pinyin, vietnamese_name, description, usage, notes, image_url } = req.body;

    const data: UpdateHerbalMedicineRequest = {};
    if (symbol !== undefined) data.symbol = symbol.trim();
    if (category_id !== undefined) data.category_id = parseInt(category_id);
    if (chinese_characters !== undefined) data.chinese_characters = chinese_characters?.trim() || null;
    if (pinyin !== undefined) data.pinyin = pinyin?.trim() || null;
    if (vietnamese_name !== undefined) data.vietnamese_name = vietnamese_name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (usage !== undefined) data.usage = usage?.trim() || null;
    if (notes !== undefined) data.notes = notes?.trim() || null;
    if (image_url !== undefined) data.image_url = image_url?.trim() || null;

    const updated = await updateHerbalMedicine(id, data);
    if (!updated) {
      res.status(404).json({
        error: 'Not found',
        message: 'Herbal medicine record not found'
      });
      return;
    }

    const updatedRecord = await getHerbalMedicineById(id);
    res.json({
      success: true,
      data: updatedRecord,
      message: 'Herbal medicine record updated successfully'
    });
  } catch (error) {
    console.error('Error updating herbal medicine record:', error);
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({
        error: 'Duplicate symbol',
        message: 'A record with this symbol already exists'
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update herbal medicine record'
      });
    }
  }
});

// DELETE /api/admin/herbal-medicine/:id - Delete herbal medicine record
router.delete('/herbal-medicine/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({
        error: 'Invalid ID',
        message: 'ID must be a valid number'
      });
      return;
    }

    const deleted = await deleteHerbalMedicine(id);
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
    console.error('Error deleting herbal medicine record:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete herbal medicine record'
    });
  }
});

export default router;
