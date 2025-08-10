import { ImageAnnotatorClient } from '@google-cloud/vision';

// Initialize Google Cloud Vision client
const visionClient = new ImageAnnotatorClient({
  // If you have a service account key file, specify it here:
  // keyFilename: 'path/to/service-account-key.json',
  // Or use environment variables for authentication
});

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
 * Detect acupoints in vessel image using Google Cloud Vision API
 */
export async function detectAcupointsInImage(
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
    
    // Step 4: Process detected text to find acupoint symbols
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
        const centerX = vertices.reduce((sum, v) => sum + (v.x || 0), 0) / vertices.length;
        const centerY = vertices.reduce((sum, v) => sum + (v.y || 0), 0) / vertices.length;
        
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
    
  } catch (error) {
    console.error('Google Cloud Vision API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Vision API detection failed: ${errorMessage}`);
  }
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
  try {
    // Test with a simple image properties call
    const testImageUrl = 'https://via.placeholder.com/100x100.png';
    await visionClient.imageProperties(testImageUrl);
    return true;
  } catch (error) {
    console.error('Vision API configuration validation failed:', error);
    return false;
  }
}
