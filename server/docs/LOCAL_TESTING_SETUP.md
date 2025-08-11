# Local Testing Setup for Google Cloud Vision API

## 🚀 Problem: Google Cloud Vision API Cannot Access Localhost

Google Cloud Vision API cannot access `localhost` URLs from external services. This causes auto-detect functionality to fail in local development.

## 💡 Solutions for Local Testing

### **Option 1: Use ngrok (Recommended)**

#### Step 1: Install ngrok
```bash
# Install ngrok
brew install ngrok
# OR download from https://ngrok.com/download
```

#### Step 2: Start your server
```bash
cd /Users/hadv/yitam/server
npm start
# Server runs on http://localhost:5001
```

#### Step 3: Expose server with ngrok
```bash
# In a new terminal
ngrok http 5001
```

#### Step 4: Configure public URL
```bash
# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
# Add to server/.env:
PUBLIC_BASE_URL=https://abc123.ngrok.io
```

#### Step 5: Restart server
```bash
# Restart server to pick up new environment variable
npm start
```

### **Option 2: Use Cloud Storage (Production-like)**

#### Upload images to cloud storage and use public URLs:
```javascript
// Example with AWS S3, Google Cloud Storage, etc.
const publicImageUrl = await uploadToCloudStorage(imageFile);
// Use publicImageUrl for Vision API
```

### **Option 3: Base64 Content (Current Fallback)**

The current implementation automatically falls back to base64 content for local files, but this may have quality limitations.

## 🔧 Configuration

### Environment Variables
```bash
# server/.env
PUBLIC_BASE_URL=https://your-ngrok-url.ngrok.io
GOOGLE_CLOUD_API_KEY=your_api_key_here
```

### Testing Flow
1. **Start server**: `npm start` (port 5001)
2. **Start ngrok**: `ngrok http 5001`
3. **Set PUBLIC_BASE_URL**: Copy ngrok URL to .env
4. **Restart server**: Pick up new environment variable
5. **Test auto-detect**: Should work with public URLs

## 📊 Image Format Recommendations

### **Best Formats for Text Detection:**
- **JPG**: Optimal for text recognition
- **PNG**: Good quality but larger files
- **WebP**: Modern format, good compression

### **Image Quality Tips:**
- **Resolution**: At least 640x480 pixels
- **Text Size**: Clear, readable acupoint symbols
- **Contrast**: High contrast between text and background
- **Compression**: Moderate compression to preserve text clarity

## 🧪 Testing Checklist

### ✅ Pre-Test Setup:
- [ ] Server running on localhost:5001
- [ ] ngrok exposing server publicly
- [ ] PUBLIC_BASE_URL configured in .env
- [ ] Google Cloud API key valid
- [ ] Test image with clear acupoint symbols

### ✅ Test Process:
- [ ] Upload vessel image with acupoint symbols (LI4, ST36, etc.)
- [ ] Click "🤖 Auto-detect" button
- [ ] Check server logs for public URL usage
- [ ] Verify successful detection results
- [ ] Test hover highlighting functionality

## 🐛 Troubleshooting

### Common Issues:
1. **"URL not accessible"**: Check ngrok is running and PUBLIC_BASE_URL is correct
2. **"No text detected"**: Try different image with clearer text
3. **"API key invalid"**: Verify Google Cloud Vision API is enabled
4. **"File not found"**: Check image upload path and permissions

### Debug Logs:
```bash
# Check server logs for:
Using public URL: https://abc123.ngrok.io/uploads/image.jpg
Processing image: https://abc123.ngrok.io/uploads/image.jpg
Base64 content available: false
Request method: URL
```

## 🎯 Expected Results

### Successful Detection:
```json
{
  "success": true,
  "vessel_name": "Lung Meridian",
  "detection_result": {
    "total_detected": 5,
    "processing_time": 1234,
    "image_dimensions": { "width": 800, "height": 600 }
  },
  "created_acupoints": [
    {
      "symbol": "LI4",
      "vietnamese_name": "Hợp Cốc",
      "x_coordinate": 45.2,
      "y_coordinate": 67.8,
      "confidence": 0.95
    }
  ],
  "total_created": 5,
  "skipped": 0
}
```

This setup enables full local testing of the auto-detect acupoints functionality with Google Cloud Vision API.
