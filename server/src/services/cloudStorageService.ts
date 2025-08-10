import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Google Cloud Storage client
let storage: Storage;

// Initialize based on available credentials
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Use base64 encoded service account credentials
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
  );
  storage = new Storage({
    credentials: credentials,
    projectId: credentials.project_id,
  });
} else {
  // For API key or default authentication, we need project ID
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID is required for Cloud Storage');
  }

  // Note: Cloud Storage SDK doesn't support API key authentication directly
  // It requires service account credentials or default application credentials
  storage = new Storage({
    projectId: projectId,
  });
}

export interface CloudUploadResult {
  publicUrl: string;
  fileName: string;
  bucketName: string;
  success: boolean;
}

/**
 * Upload using REST API with API key (fallback method)
 */
async function uploadWithRestAPI(
  localFilePath: string,
  fileName: string,
  bucketName: string
): Promise<CloudUploadResult> {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_API_KEY is required for REST API upload');
  }

  // Read file content
  const fileBuffer = fs.readFileSync(localFilePath);
  const contentType = getContentType(localFilePath);

  // Upload URL with API key
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=vessel-images/${fileName}&key=${apiKey}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`REST API upload failed: ${response.status} ${errorText}`);
  }

  // Make file public
  const makePublicUrl = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/vessel-images%2F${fileName}/acl?key=${apiKey}`;

  await fetch(makePublicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      entity: 'allUsers',
      role: 'READER',
    }),
  });

  const publicUrl = `https://storage.googleapis.com/${bucketName}/vessel-images/${fileName}`;

  return {
    publicUrl,
    fileName: `vessel-images/${fileName}`,
    bucketName,
    success: true,
  };
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

    // Check if file exists locally
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Local file not found: ${localFilePath}`);
    }

    // Try REST API first (works with API key)
    if (process.env.GOOGLE_CLOUD_API_KEY) {
      console.log('Using REST API for cloud storage upload');
      return await uploadWithRestAPI(localFilePath, fileName, bucketName);
    }

    // Fallback to SDK (requires service account)
    console.log('Using SDK for cloud storage upload');
    const bucket = storage.bucket(bucketName);

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
