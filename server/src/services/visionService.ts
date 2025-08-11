import { ImageAnnotatorClient } from '@google-cloud/vision';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Google Cloud Vision client
let visionClient: ImageAnnotatorClient;

// Initialize based on available credentials
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  try {
    // Use base64 encoded service account credentials
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );

    // Validate it's a proper service account
    if (credentials.type === 'service_account' && credentials.private_key) {
      visionClient = new ImageAnnotatorClient({
        credentials: credentials,
      });
      console.log('Using service account credentials for Vision API');
    } else {
      throw new Error('Invalid service account format');
    }
  } catch (error) {
    console.warn('Invalid GOOGLE_CREDENTIALS_BASE64, falling back to API key');
    // Fallback to API key
    if (process.env.GOOGLE_CLOUD_API_KEY) {
      visionClient = new ImageAnnotatorClient({
        apiKey: process.env.GOOGLE_CLOUD_API_KEY,
      });
      console.log('Using API key for Vision API');
    } else {
      visionClient = new ImageAnnotatorClient();
    }
  }
} else if (process.env.GOOGLE_CLOUD_API_KEY) {
  // Use API key
  visionClient = new ImageAnnotatorClient({
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
  });
  console.log('Using API key for Vision API');
} else {
  // Fallback to default authentication (GOOGLE_APPLICATION_CREDENTIALS)
  visionClient = new ImageAnnotatorClient();
  console.log('Using default authentication for Vision API');
}

export interface DetectedAcupoint {
  symbol: string;
  vietnamese_name: string;
  x_coordinate: number | null;
  y_coordinate: number | null;
  confidence: number;
  description?: string;
  bounding_box?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface VisionDetectionResult {
  detected_acupoints: DetectedAcupoint[];
  total_detected: number;
  processing_time: number;
  image_dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Read local image file and convert to base64
 */
function getImageBase64(imageUrl: string): string | null {
  try {
    console.log(`Checking image URL: ${imageUrl}`);
    // Check if it's a local file path
    if (imageUrl.startsWith('/uploads/')) {
      const filePath = path.join(process.cwd(), imageUrl);
      console.log(`Looking for file at: ${filePath}`);
      console.log(`File exists: ${fs.existsSync(filePath)}`);

      if (fs.existsSync(filePath)) {
        // Read file with optimization for text detection
        const imageBuffer = fs.readFileSync(filePath);

        // For better text detection, ensure we're using high-quality images
        const stats = fs.statSync(filePath);
        console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Check if file is too large (Google Vision API limit: 20MB for base64)
        if (stats.size > 20 * 1024 * 1024) {
          console.warn('File too large for base64 upload, may need compression');
        }

        const base64 = imageBuffer.toString('base64');
        console.log(`Successfully read file, base64 length: ${base64.length}`);
        console.log('Using base64 content for optimal text detection');
        return base64;
      } else {
        console.log(`File not found: ${filePath}`);
      }
    } else {
      console.log(`Not a local upload path: ${imageUrl}`);
    }
    return null;
  } catch (error) {
    console.error('Error reading image file:', error);
    return null;
  }
}

/**
 * Detect acupoints using REST API (fallback method)
 */
async function detectAcupointsWithRestAPI(
  imageUrl: string,
  vesselName: string
): Promise<VisionDetectionResult> {
  const startTime = Date.now();

  // Get authentication method
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;

  if (!apiKey && !base64Credentials) {
    throw new Error('Either GOOGLE_CLOUD_API_KEY or GOOGLE_CREDENTIALS_BASE64 environment variable is required');
  }

  try {
    let visionApiUrl: string;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Configure authentication
    if (apiKey) {
      // Use API key authentication
      visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
    } else if (base64Credentials) {
      // Use service account authentication with access token
      const credentials = JSON.parse(
        Buffer.from(base64Credentials, 'base64').toString()
      );

      // Get access token (simplified - in production, use proper OAuth2 flow)
      visionApiUrl = 'https://vision.googleapis.com/v1/images:annotate';

      // For service account, we'll use the SDK method instead
      throw new Error('Using SDK method for service account credentials');
    } else {
      throw new Error('No valid authentication method found');
    }

    // Try to get base64 content for local files
    const imageBase64 = getImageBase64(imageUrl);
    console.log(`Processing image: ${imageUrl}`);
    console.log(`Base64 content available: ${!!imageBase64}`);

    const requestBody = {
      requests: [
        {
          image: imageBase64
            ? { content: imageBase64 }  // Use base64 content for local files
            : { source: { imageUri: imageUrl } },  // Use URL for external images
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 50
            },
            {
              type: 'IMAGE_PROPERTIES',
              maxResults: 1
            }
          ]
        }
      ]
    };

    console.log(`Request method: ${imageBase64 ? 'base64 content' : 'URL'}`);

    const response = await fetch(visionApiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Vision API request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.responses?.[0]?.error) {
      throw new Error(`Vision API error: ${result.responses[0].error.message}`);
    }

    const textAnnotations = result.responses?.[0]?.textAnnotations || [];
    const imageProps = result.responses?.[0]?.imagePropertiesAnnotation;

    // Debug: Log all detected text
    console.log(`🔍 DEBUG: Total text annotations found: ${textAnnotations.length}`);
    textAnnotations.forEach((annotation: any, index: number) => {
      console.log(`🔍 DEBUG: Text ${index}: "${annotation.description}"`);
    });

    return await processVisionResults(textAnnotations, imageProps, vesselName, startTime);

  } catch (error) {
    console.error('Google Cloud Vision REST API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Vision API detection failed: ${errorMessage}`);
  }
}

/**
 * Detect acupoints in vessel image using Google Cloud Vision API
 */
export async function detectAcupointsInImage(
  imageUrl: string,
  vesselName: string
): Promise<VisionDetectionResult> {
  // Try REST API first (more reliable with API key)
  try {
    return await detectAcupointsWithRestAPI(imageUrl, vesselName);
  } catch (restError) {
    console.warn('REST API failed, trying SDK:', restError);

    // Fallback to SDK method
    return await detectAcupointsWithSDK(imageUrl, vesselName);
  }
}

/**
 * Detect acupoints using Google Cloud Vision SDK
 */
async function detectAcupointsWithSDK(
  imageUrl: string,
  vesselName: string
): Promise<VisionDetectionResult> {
  const startTime = Date.now();

  try {
    // Step 1: Detect text in the image (for acupoint symbols)
    let textResult;
    if (imageUrl.startsWith('/uploads/')) {
      // Use local file path for SDK
      const filePath = path.join(process.cwd(), imageUrl);
      [textResult] = await visionClient.textDetection(filePath);
    } else {
      // Use URL for external images
      [textResult] = await visionClient.textDetection(imageUrl);
    }
    const textAnnotations = textResult.textAnnotations || [];

    // Debug: Log all detected text
    console.log(`🔍 DEBUG: Total text annotations found: ${textAnnotations.length}`);
    textAnnotations.forEach((annotation, index) => {
      console.log(`🔍 DEBUG: Text ${index}: "${annotation.description}"`);
    });

    // Step 2: Detect objects/features in the image (optional)
    // const [objectResult] = await visionClient.objectLocalization(imageUrl);
    // const objects = objectResult.localizedObjectAnnotations || [];
    
    // Step 3: Get image properties for coordinate calculation
    let propertiesResult;
    if (imageUrl.startsWith('/uploads/')) {
      // Use local file path for SDK
      const filePath = path.join(process.cwd(), imageUrl);
      [propertiesResult] = await visionClient.imageProperties(filePath);
    } else {
      // Use URL for external images
      [propertiesResult] = await visionClient.imageProperties(imageUrl);
    }
    const imageProps = propertiesResult.imagePropertiesAnnotation;

    return await processVisionResults(textAnnotations, imageProps, vesselName, startTime);

  } catch (error) {
    console.error('Google Cloud Vision SDK error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Vision SDK detection failed: ${errorMessage}`);
  }
}

/**
 * Process Vision API results (common for both REST and SDK)
 */
async function processVisionResults(
  textAnnotations: any[],
  imageProps: any,
  vesselName: string,
  startTime: number
): Promise<VisionDetectionResult> {
  // Extract image dimensions
  const imageDimensions = {
    width: 1000, // Default fallback
    height: 1000
  };

  // Try to get actual dimensions from image properties
  if (imageProps && (imageProps as any).cropHints && (imageProps as any).cropHints.length > 0) {
    const cropHint = (imageProps as any).cropHints[0];
    if (cropHint.boundingPoly?.vertices) {
      const vertices = cropHint.boundingPoly.vertices;
      imageDimensions.width = Math.max(...vertices.map((v: any) => v.x || 0));
      imageDimensions.height = Math.max(...vertices.map((v: any) => v.y || 0));
    }
  }

  // Step 1: Combine adjacent text fragments (GB + - + 41 = GB-41)
  const combinedTexts = combineAdjacentTexts(textAnnotations);
  console.log(`🔍 DEBUG: Found ${combinedTexts.length} combined acupoint symbols`);

  // Process detected text to find acupoint symbols
  const detectedAcupoints: DetectedAcupoint[] = [];

  // Common acupoint symbol patterns
  const acupointPatterns = [
    // Traditional patterns with hyphen (TE-5, GB-13, LI-4, TE-01, GB-1, etc.)
    /^(LI|ST|SP|HT|SI|BL|KI|PC|TE|GB|LV|GV|CV|EX)-\d{1,2}$/i,
    // Alternative without hyphen (LI4, ST36, TE5, GB01, etc.)
    /^(LI|ST|SP|HT|SI|BL|KI|PC|TE|GB|LV|GV|CV|EX)\d{1,2}$/i,
    // Chinese patterns
    /^(手|足|督|任|奇)\w{1,3}\d*$/,
    // Vietnamese patterns with numbers (1-2 digits)
    /^[A-Z]{2,4}-?\d{1,2}$/
  ];
    
    // Process both individual texts and combined texts
    const allTexts = [...textAnnotations.slice(1), ...combinedTexts];

    for (const annotation of allTexts) {
      const text = annotation.description?.trim() || '';
      const boundingPoly = annotation.boundingPoly;
      
      if (!boundingPoly?.vertices || boundingPoly.vertices.length === 0) continue;
      
      // Check if text matches acupoint pattern
      const isAcupointSymbol = acupointPatterns.some(pattern => pattern.test(text));
      
      if (isAcupointSymbol && boundingPoly.vertices.length >= 4) {
        // Calculate center point of bounding box
        const vertices = boundingPoly.vertices;
        const centerX = vertices.reduce((sum: number, v: any) => sum + (v.x || 0), 0) / vertices.length;
        const centerY = vertices.reduce((sum: number, v: any) => sum + (v.y || 0), 0) / vertices.length;
        
        // Convert to percentage coordinates
        const xPercent = (centerX / imageDimensions.width) * 100;
        const yPercent = (centerY / imageDimensions.height) * 100;
        
        // Ensure coordinates are within bounds
        const clampedX = Math.max(0, Math.min(100, xPercent));
        const clampedY = Math.max(0, Math.min(100, yPercent));
        
        // Generate Vietnamese name based on symbol
        const vietnameseName = generateVietnameseName(text, vesselName);

        // Calculate bounding box coordinates (normalized to 0-100%)
        const boundingBox = calculateBoundingBox(boundingPoly, imageDimensions);

        // Just detect symbols, coordinates will be set manually
        detectedAcupoints.push({
          symbol: text.toUpperCase(),
          vietnamese_name: vietnameseName,
          x_coordinate: null, // Will be set manually
          y_coordinate: null, // Will be set manually
          bounding_box: boundingBox,
          confidence: annotation.confidence || 0.8,
          description: `Auto-detected acupoint symbol ${text.toUpperCase()} on ${vesselName} - coordinates to be set manually`
        });
      }
    }
    
    // Step 5: Remove duplicates and sort by confidence
    const uniqueAcupoints = removeDuplicateAcupoints(detectedAcupoints);
    uniqueAcupoints.sort((a, b) => b.confidence - a.confidence);
    
  const processingTime = Date.now() - startTime;

  return {
    detected_acupoints: uniqueAcupoints,
    total_detected: uniqueAcupoints.length,
    processing_time: processingTime,
    image_dimensions: imageDimensions
  };
}

/**
 * Generate Vietnamese name for acupoint based on symbol and vessel
 */
function generateVietnameseName(symbol: string, vesselName: string): string {
  // Basic mapping for common acupoints (support both hyphen and non-hyphen formats)
  const commonNames: { [key: string]: string } = {
    // With hyphen format (standard)
    'LI-4': 'Hợp Cốc',
    'LI-20': 'Nghênh Hương',
    'ST-36': 'Túc Tam Lý',
    'ST-6': 'Giáp Xa',
    'SP-6': 'Tam Âm Giao',
    'SP-3': 'Thái Bạch',
    'HT-7': 'Thần Môn',
    'SI-3': 'Hậu Khê',
    'BL-2': 'Toản Trúc',
    'BL-40': 'Ủy Trung',
    'KI-3': 'Thái Khê',
    'KI-1': 'Dũng Tuyền',
    'PC-6': 'Nội Quan',
    'TE-5': 'Ngoại Quan',
    'GB-34': 'Dương Lăng Tuyền',
    'GB-20': 'Phong Trì',
    'LV-3': 'Thái Xung',
    'GV-20': 'Bách Hội',
    'CV-17': 'Đàn Trung',
    // Without hyphen format (backward compatibility)
    'LI4': 'Hợp Cốc',
    'LI20': 'Nghênh Hương',
    'ST36': 'Túc Tam Lý',
    'ST6': 'Giáp Xa',
    'SP6': 'Tam Âm Giao',
    'SP3': 'Thái Bạch',
    'HT7': 'Thần Môn',
    'SI3': 'Hậu Khê',
    'BL2': 'Toản Trúc',
    'BL40': 'Ủy Trung',
    'KI3': 'Thái Khê',
    'KI1': 'Dũng Tuyền',
    'PC6': 'Nội Quan',
    'TE5': 'Ngoại Quan',
    'GB34': 'Dương Lăng Tuyền',
    'GB20': 'Phong Trì',
    'LV3': 'Thái Xung',
    'GV20': 'Bách Hội',
    'CV17': 'Đàn Trung'
  };
  
  // Return known name or generate based on pattern
  if (commonNames[symbol]) {
    return commonNames[symbol];
  }
  
  // Generate name based on vessel and number
  const match = symbol.match(/^([A-Z]+)(\d+)$/);
  if (match) {
    const [, prefix, number] = match;
    return `${vesselName} ${number}`;
  }
  
  return `Huyệt ${symbol}`;
}

/**
 * Remove duplicate acupoints based on symbol and proximity
 */
function removeDuplicateAcupoints(acupoints: DetectedAcupoint[]): DetectedAcupoint[] {
  const unique: DetectedAcupoint[] = [];
  const seen = new Set<string>();
  
  for (const point of acupoints) {
    const key = point.symbol;
    
    if (!seen.has(key)) {
      // Check for proximity duplicates (within 5% distance)
      const isDuplicate = unique.some(existing => {
        // Skip distance check if coordinates are null
        if (existing.x_coordinate === null || existing.y_coordinate === null ||
            point.x_coordinate === null || point.y_coordinate === null) {
          return false; // No duplicate if coordinates are null
        }

        const distance = Math.sqrt(
          Math.pow(existing.x_coordinate - point.x_coordinate, 2) +
          Math.pow(existing.y_coordinate - point.y_coordinate, 2)
        );
        return distance < 5; // 5% threshold
      });
      
      if (!isDuplicate) {
        unique.push(point);
        seen.add(key);
      }
    }
  }
  
  return unique;
}

/**
 * Validate Google Cloud Vision API configuration
 */
export async function validateVisionAPIConfig(): Promise<boolean> {
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
  const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;

  if (!apiKey && !base64Credentials) {
    console.error('Neither GOOGLE_CLOUD_API_KEY nor GOOGLE_CREDENTIALS_BASE64 environment variable is set');
    return false;
  }

  // Simple validation - just check if credentials are present and valid format
  // Skip actual API test since it may fail due to network restrictions
  if (apiKey && apiKey.startsWith('AIza')) {
    console.log('Google Cloud API key found and appears valid');
    return true;
  }

  if (base64Credentials) {
    try {
      const credentials = JSON.parse(
        Buffer.from(base64Credentials, 'base64').toString()
      );
      if (credentials.type === 'service_account' && credentials.private_key) {
        console.log('Google Cloud service account credentials found and appear valid');
        return true;
      }
    } catch (error) {
      console.error('Invalid base64 credentials format:', error);
      return false;
    }
  }

  console.error('No valid Google Cloud credentials found');
  return false;
}

/**
 * Combine adjacent text fragments that form acupoint symbols
 * Example: "GB" + "-" + "41" -> "GB-41"
 */
function combineAdjacentTexts(textAnnotations: any[]): any[] {
  const combinedTexts: any[] = [];

  for (let i = 1; i < textAnnotations.length - 2; i++) { // Skip first (full text)
    const text1 = textAnnotations[i]?.description?.trim().toUpperCase();
    const text2 = textAnnotations[i + 1]?.description?.trim();
    const text3 = textAnnotations[i + 2]?.description?.trim();

    if (!text1 || !text2 || !text3) continue;

    // Pattern: "GB" + "-" + "41"
    if (isAcupointPrefix(text1) && text2 === '-' && isAcupointNumber(text3)) {
      const combinedText = `${text1}-${text3}`;

      const combinedAnnotation = {
        description: combinedText,
        boundingPoly: textAnnotations[i].boundingPoly // Use first annotation's position
      };

      combinedTexts.push(combinedAnnotation);
      console.log(`🔍 DEBUG: Combined "${text1}" + "${text2}" + "${text3}" -> "${combinedText}"`);
    }
  }

  return combinedTexts;
}

/**
 * Check if text is a valid acupoint prefix
 */
function isAcupointPrefix(text: string): boolean {
  return /^(LI|ST|SP|HT|SI|BL|KI|PC|TE|GB|LV|GV|CV|EX)$/i.test(text);
}

/**
 * Check if text is a valid acupoint number
 */
function isAcupointNumber(text: string): boolean {
  return /^\d{1,2}$/.test(text);
}

/**
 * Calculate normalized bounding box coordinates (0-100%)
 */
function calculateBoundingBox(boundingPoly: any, imageDimensions: any): any {
  if (!boundingPoly?.vertices || !imageDimensions) {
    return null;
  }

  const vertices = boundingPoly.vertices;
  const xs = vertices.map((v: any) => v.x || 0);
  const ys = vertices.map((v: any) => v.y || 0);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Normalize to percentage (0-100%)
  const x1Percent = (minX / imageDimensions.width) * 100;
  const y1Percent = (minY / imageDimensions.height) * 100;
  const x2Percent = (maxX / imageDimensions.width) * 100;
  const y2Percent = (maxY / imageDimensions.height) * 100;

  return {
    x1: Math.round(x1Percent * 10) / 10, // Round to 1 decimal
    y1: Math.round(y1Percent * 10) / 10,
    x2: Math.round(x2Percent * 10) / 10,
    y2: Math.round(y2Percent * 10) / 10
  };
}
