# Google Cloud Vision API Setup Guide

## 🚀 Quick Setup with API Key (Recommended)

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project
3. Note your Project ID

### Step 2: Enable Vision API
1. Go to [Vision API Library](https://console.cloud.google.com/apis/library/vision.googleapis.com)
2. Click "Enable" to enable the Vision API for your project

### Step 3: Create API Key
1. Go to [Credentials page](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "API Key"
3. Copy the generated API key
4. (Optional) Restrict the API key:
   - Click on the API key to edit
   - Under "API restrictions", select "Restrict key"
   - Choose "Cloud Vision API"
   - Under "Application restrictions", you can restrict by IP, HTTP referrer, etc.

### Step 4: Configure Environment Variable
Add to your `.env` file:
```bash
GOOGLE_CLOUD_API_KEY=your_actual_api_key_here
```

### Step 5: Test Configuration
Start your server and test the Vision API:
```bash
# Test endpoint
GET /api/admin/test-vision-api?access_code=ADMIN123
```

## 🔧 Alternative: Service Account Setup

If you prefer using service account credentials instead of API key:

### Step 1: Create Service Account
1. Go to [Service Accounts page](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Click "Create Service Account"
3. Fill in service account details
4. Grant "Cloud Vision API User" role
5. Create and download JSON key file

### Step 2: Configure Credentials
Option A - Environment Variable:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
```

Option B - Update visionService.ts:
```typescript
const visionClient = new ImageAnnotatorClient({
  keyFilename: 'path/to/service-account-key.json',
});
```

## 📊 Usage Examples

### Auto-Detect Acupoints
```bash
POST /api/admin/detect-acupoints?access_code=ADMIN123
Content-Type: application/json

{
  "vessel_id": 1,
  "image_url": "https://example.com/vessel-image.jpg"
}
```

### Test API Configuration
```bash
GET /api/admin/test-vision-api?access_code=ADMIN123
```

## 💰 Pricing Information

Google Cloud Vision API pricing (as of 2024):
- **Text Detection**: $1.50 per 1,000 images
- **First 1,000 images per month**: FREE
- **Image Properties**: $1.00 per 1,000 images

For current pricing, check: https://cloud.google.com/vision/pricing

## 🔍 Supported Image Formats

- **JPEG**
- **PNG** 
- **GIF**
- **BMP**
- **WebP**
- **RAW**
- **ICO**
- **PDF** (first page only)
- **TIFF**

## 📏 Image Size Limits

- **Maximum file size**: 20MB
- **Maximum dimensions**: 75 megapixels
- **Minimum dimensions**: 640x480 pixels (recommended)

## 🛠️ Troubleshooting

### Common Issues:

1. **"API key not valid"**
   - Check if Vision API is enabled for your project
   - Verify API key is correct
   - Check API key restrictions

2. **"Quota exceeded"**
   - Check your usage in Google Cloud Console
   - Increase quotas if needed
   - Consider upgrading billing account

3. **"Permission denied"**
   - Ensure Vision API is enabled
   - Check service account permissions
   - Verify project billing is enabled

4. **"Image too large"**
   - Resize image to under 20MB
   - Compress image quality
   - Use supported formats

### Debug Mode:
Enable detailed logging by setting:
```bash
NODE_ENV=development
```

## 🔐 Security Best Practices

1. **Restrict API Keys**:
   - Limit to specific APIs (Vision API only)
   - Restrict by IP address if possible
   - Regenerate keys periodically

2. **Environment Variables**:
   - Never commit API keys to version control
   - Use `.env` files for local development
   - Use secure secret management in production

3. **Rate Limiting**:
   - Implement rate limiting in your application
   - Monitor usage in Google Cloud Console
   - Set up billing alerts

## 📈 Monitoring & Analytics

Monitor your Vision API usage:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "APIs & Services" → "Dashboard"
3. Click on "Cloud Vision API"
4. View usage statistics and quotas

## 🚀 Production Deployment

For production environments:
1. Use service account credentials instead of API keys
2. Set up proper IAM roles and permissions
3. Enable audit logging
4. Configure monitoring and alerting
5. Set up billing budgets and alerts

## 📞 Support

- [Google Cloud Vision Documentation](https://cloud.google.com/vision/docs)
- [Google Cloud Support](https://cloud.google.com/support)
- [Stack Overflow - google-cloud-vision](https://stackoverflow.com/questions/tagged/google-cloud-vision)
