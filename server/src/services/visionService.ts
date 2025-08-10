import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize Google Cloud Vision client
let visionClient: ImageAnnotatorClient;

// Initialize based on available credentials
if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Use base64 encoded service account credentials
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
  );
  visionClient = new ImageAnnotatorClient({
    credentials: credentials,
  });
} else if (process.env.GOOGLE_CLOUD_API_KEY) {
  // Use API key
  visionClient = new ImageAnnotatorClient({
    apiKey: process.env.GOOGLE_CLOUD_API_KEY,
  });
} else {
  // Fallback to default authentication (GOOGLE_APPLICATION_CREDENTIALS)
  visionClient = new ImageAnnotatorClient();
}

export interface DetectedAcupoint {
  symbol: string;
  vietnamese_name: string;
  x_coordinate: number;
  y_coordinate: number;
  confidence: number;
  description?: string;
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

    const requestBody = {
      requests: [
        {
          image: {
            source: {
              imageUri: imageUrl
            }
          },
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

    return processVisionResults(textAnnotations, imageProps, vesselName, startTime);

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
    const [textResult] = await visionClient.textDetection(imageUrl);
    const textAnnotations = textResult.textAnnotations || [];
    
    // Step 2: Detect objects/features in the image (optional)
    // const [objectResult] = await visionClient.objectLocalization(imageUrl);
    // const objects = objectResult.localizedObjectAnnotations || [];
    
    // Step 3: Get image properties for coordinate calculation
    const [propertiesResult] = await visionClient.imageProperties(imageUrl);
    const imageProps = propertiesResult.imagePropertiesAnnotation;

    return processVisionResults(textAnnotations, imageProps, vesselName, startTime);

  } catch (error) {
    console.error('Google Cloud Vision SDK error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Vision SDK detection failed: ${errorMessage}`);
  }
}

/**
 * Process Vision API results (common for both REST and SDK)
 */
function processVisionResults(
  textAnnotations: any[],
  imageProps: any,
  vesselName: string,
  startTime: number
): VisionDetectionResult {
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

  // Process detected text to find acupoint symbols
  const detectedAcupoints: DetectedAcupoint[] = [];

  // Common acupoint symbol patterns
  const acupointPatterns = [
    // Traditional patterns
    /^(LI|ST|SP|HT|SI|BL|KI|PC|TE|GB|LV|GV|CV|EX)\d+$/i,
    // Chinese patterns
    /^(手|足|督|任|奇)\w{1,3}\d*$/,
    // Vietnamese patterns with numbers
    /^[A-Z]{2,4}\d{1,2}$/
  ];
    
    for (const annotation of textAnnotations.slice(1)) { // Skip first (full text)
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
        
        detectedAcupoints.push({
          symbol: text.toUpperCase(),
          vietnamese_name: vietnameseName,
          x_coordinate: Math.round(clampedX * 10) / 10, // Round to 1 decimal
          y_coordinate: Math.round(clampedY * 10) / 10,
          confidence: annotation.confidence || 0.8,
          description: `Auto-detected acupoint on ${vesselName} using Google Cloud Vision`
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
  // Basic mapping for common acupoints
  const commonNames: { [key: string]: string } = {
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

  const testImageUrl = 'https://via.placeholder.com/100x100.png';

  try {
    // Test with SDK method (works for both API key and service account)
    const [result] = await visionClient.textDetection(testImageUrl);
    return !result.error;

  } catch (sdkError) {
    console.warn('SDK test failed, trying REST API:', sdkError);

    // Fallback to REST API test (only works with API key)
    if (!apiKey) {
      return false;
    }

    try {
      const visionApiUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

      const requestBody = {
      requests: [
        {
          image: {
            source: {
              imageUri: testImageUrl
            }
          },
          features: [
            {
              type: 'TEXT_DETECTION',
              maxResults: 1
            }
          ]
        }
      ]
    };

    const response = await fetch(visionApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const result = await response.json();
      // Check if there's no error in the response
      return !result.responses?.[0]?.error;
    }

    return false;
    } catch (restError) {
      console.error('REST API test also failed:', restError);
      return false;
    }
  }
}
