import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Google Cloud Storage client
let storage: Storage;

// Initialize based on available credentials (same as Vision API)
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Use base64 encoded service account credentials
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
  );
  storage = new Storage({
    credentials: credentials,
    projectId: credentials.project_id,
  });
} else if (process.env.GOOGLE_CLOUD_API_KEY) {
  // For API key, we need project ID
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID is required when using API key');
  }
  storage = new Storage({
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
    projectId: projectId,
  });
} else {
  // Fallback to default authentication
  storage = new Storage();
}

export interface CloudUploadResult {
  publicUrl: string;
  fileName: string;
  bucketName: string;
  success: boolean;
}

/**
 * Upload local image file to Google Cloud Storage and return public URL
 */
export async function uploadImageToCloudStorage(
  localFilePath: string,
  fileName?: string
): Promise<CloudUploadResult> {
  try {
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'yitam-vessel-images';
    
    // Generate unique filename if not provided
    if (!fileName) {
      const timestamp = Date.now();
      const extension = path.extname(localFilePath);
      const baseName = path.basename(localFilePath, extension);
      fileName = `${baseName}-${timestamp}${extension}`;
    }

    // Get bucket reference
    const bucket = storage.bucket(bucketName);
    
    // Check if file exists locally
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found: ${localFilePath}`);
    }

    // Upload file to cloud storage
    const [file] = await bucket.upload(localFilePath, {
      destination: `vessel-images/${fileName}`,
      metadata: {
        cacheControl: 'public, max-age=31536000', // 1 year cache
        contentType: getContentType(localFilePath),
      },
      public: true, // Make file publicly accessible
    });

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${file.name}`;

    console.log(`Successfully uploaded to cloud storage: ${publicUrl}`);

    return {
      publicUrl,
      fileName: file.name,
      bucketName,
      success: true,
    };

  } catch (error) {
    console.error('Cloud storage upload failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to upload to cloud storage: ${errorMessage}`);
  }
}

/**
 * Upload image from relative path (e.g., /uploads/image.jpg)
 */
export async function uploadRelativePathToCloud(relativePath: string): Promise<CloudUploadResult> {
  if (!relativePath.startsWith('/uploads/')) {
    throw new Error('Only /uploads/ paths are supported for cloud upload');
  }

  const localFilePath = path.join(process.cwd(), relativePath);
  const originalFileName = path.basename(relativePath);
  
  return await uploadImageToCloudStorage(localFilePath, originalFileName);
}

/**
 * Get content type based on file extension
 */
function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.tiff':
    case '.tif':
      return 'image/tiff';
    default:
      return 'application/octet-stream';
  }
}

/**
 * Validate cloud storage configuration
 */
export async function validateCloudStorageConfig(): Promise<boolean> {
  try {
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'yitam-vessel-images';
    
    // Try to access the bucket
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.warn(`Bucket ${bucketName} does not exist. You may need to create it.`);
      return false;
    }

    console.log(`Cloud storage bucket ${bucketName} is accessible`);
    return true;

  } catch (error) {
    console.error('Cloud storage validation failed:', error);
    return false;
  }
}

/**
 * Create bucket if it doesn't exist
 */
export async function createBucketIfNotExists(): Promise<boolean> {
  try {
    const bucketName = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || 'yitam-vessel-images';
    const bucket = storage.bucket(bucketName);
    
    const [exists] = await bucket.exists();
    
    if (!exists) {
      console.log(`Creating bucket: ${bucketName}`);
      
      await bucket.create({
        location: 'US', // or your preferred location
        storageClass: 'STANDARD',
      });
      
      // Make bucket publicly readable
      await bucket.makePublic();
      
      console.log(`Bucket ${bucketName} created successfully`);
    }
    
    return true;
    
  } catch (error) {
    console.error('Failed to create bucket:', error);
    return false;
  }
}
