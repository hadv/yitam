import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Google Cloud Storage client
let storage: Storage;

// Initialize based on available credentials
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  try {
    // Use base64 encoded service account credentials
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );

    // Validate it's a proper service account
    if (credentials.type === 'service_account' && credentials.private_key) {
      storage = new Storage({
        credentials: credentials,
        projectId: credentials.project_id,
      });
      console.log('Using service account credentials for Cloud Storage');
    } else {
      throw new Error('Invalid service account format');
    }
  } catch (error) {
    console.warn('Invalid GOOGLE_CREDENTIALS_BASE64, using project ID only');
    // Fallback to project ID only
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID is required for Cloud Storage');
    }
    storage = new Storage({
      projectId: projectId,
    });
  }
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
  console.log('Using project ID for Cloud Storage (API key mode)');
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
  console.log(`🔍 DEBUG: API Key available: ${!!apiKey}`);
  console.log(`🔍 DEBUG: API Key starts with: ${apiKey?.substring(0, 10)}...`);

  if (!apiKey) {
    throw new Error('GOOGLE_CLOUD_API_KEY is required for REST API upload');
  }

  // Read file content
  console.log(`🔍 DEBUG: Reading file: ${localFilePath}`);
  const fileBuffer = fs.readFileSync(localFilePath);
  const contentType = getContentType(localFilePath);
  console.log(`🔍 DEBUG: File size: ${fileBuffer.length} bytes`);
  console.log(`🔍 DEBUG: Content type: ${contentType}`);

  // Upload URL with correct Google Cloud Storage REST API format
  const uploadUrl = `https://www.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=vessel-images/${fileName}`;
  console.log(`🔍 DEBUG: Upload URL: ${uploadUrl}`);

  console.log(`🔍 DEBUG: Making upload request...`);
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
      'Authorization': `Bearer ${apiKey}`, // Try Bearer token format
      'X-Goog-Api-Key': apiKey, // Alternative API key header
    },
    body: fileBuffer,
  });

  console.log(`🔍 DEBUG: Upload response status: ${response.status}`);
  console.log(`🔍 DEBUG: Upload response headers:`, Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.log(`🔍 DEBUG: Upload failed with status ${response.status}`);
    console.log(`🔍 DEBUG: Error response:`, errorText);
    throw new Error(`REST API upload failed: ${response.status} ${errorText}`);
  }

  const uploadResult = await response.json();
  console.log(`🔍 DEBUG: Upload successful:`, uploadResult);

  // Make file public using correct Google Cloud Storage REST API format
  const makePublicUrl = `https://www.googleapis.com/storage/v1/b/${bucketName}/o/vessel-images%2F${fileName}/acl`;

  await fetch(makePublicUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Goog-Api-Key': apiKey,
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

    // Try REST API first (debug mode - test with API key)
    if (process.env.GOOGLE_CLOUD_API_KEY) {
      console.log('🔍 DEBUG: Attempting REST API upload with API key');
      try {
        return await uploadWithRestAPI(localFilePath, fileName, bucketName);
      } catch (restError) {
        console.log('🔍 DEBUG: REST API failed, trying SDK fallback');
        const errorMessage = restError instanceof Error ? restError.message : 'Unknown error';
        console.log('🔍 DEBUG: REST error:', errorMessage);
        // Continue to SDK fallback
      }
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
