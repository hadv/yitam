# Production Error Fix: JSON Parsing Error

## Problem Description

The application was experiencing a production error where the SharedConversationService was receiving HTML responses instead of JSON from the API endpoints, causing the error:

```
SharedConversationService.ts:96 Error sharing conversation: SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

## Root Cause Analysis

1. **API Response Type Mismatch**: The client was expecting JSON responses but receiving HTML (likely 404 or error pages)
2. **Missing Content-Type Validation**: The code was attempting to parse all responses as JSON without checking the content type
3. **Poor Error Handling**: No graceful handling of non-JSON responses
4. **Limited Production Debugging**: Insufficient logging for production troubleshooting

## Solution Implemented

### 1. Enhanced Error Handling in SharedConversationService

- **Added `safeJsonParse()` method**: Validates content-type before attempting JSON parsing
- **Added retry mechanism**: Implements exponential backoff for failed requests
- **Improved error messages**: More descriptive error messages for different failure scenarios
- **Enhanced logging**: Better logging for production debugging

### 2. Content-Type Validation

```typescript
private async safeJsonParse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');
  
  if (!contentType || !contentType.includes('application/json')) {
    const responseText = await response.text();
    logger.error(`Expected JSON but got ${contentType}`, { 
      status: response.status, 
      url: response.url,
      responsePreview: responseText.substring(0, 500) 
    });
    
    throw new Error(`Server error: Expected JSON response but received ${contentType || 'unknown content type'}. Status: ${response.status}`);
  }

  try {
    return await response.json();
  } catch (parseError) {
    // Handle JSON parsing errors gracefully
  }
}
```

### 3. Retry Mechanism

```typescript
private async retryFetch(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // If we get a server error (5xx), retry
      if (response.status >= 500 && attempt < maxRetries) {
        await this.delay(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        await this.delay(Math.pow(2, attempt - 1) * 1000);
      }
    }
  }
  
  throw lastError!;
}
```

### 4. Production Logging System

- **Created `logger.ts`**: Centralized logging utility with log levels
- **Log History**: Keeps recent logs in memory for debugging
- **Export Functionality**: Ability to export logs for analysis
- **Production-Safe**: Only logs warnings and errors in production by default

### 5. Debug Tools

- **LogViewer Component**: In-app log viewer accessible via Ctrl+Shift+L
- **Export Logs**: Download logs as JSON for analysis
- **Filter Logs**: Filter by level or message content
- **Real-time Updates**: Refresh logs without page reload

## Files Modified

1. `client/src/services/SharedConversationService.ts` - Enhanced error handling and retry logic
2. `client/src/components/tailwind/TailwindShareConversation.tsx` - Better error messages
3. `client/src/utils/logger.ts` - New logging utility
4. `client/src/components/debug/LogViewer.tsx` - New debug component
5. `client/src/components/tailwind/TailwindApp.tsx` - Added LogViewer component

## Files Added

1. `client/src/services/__tests__/SharedConversationService.test.ts` - Unit tests for error scenarios
2. `client/src/utils/logger.ts` - Production logging utility
3. `client/src/components/debug/LogViewer.tsx` - Debug log viewer
4. `docs/PRODUCTION_ERROR_FIX.md` - This documentation

## Testing

The fix includes unit tests that verify:
- HTML responses are handled gracefully
- Network errors don't crash the application
- Malformed JSON responses are caught
- Successful responses work correctly

## Production Debugging

### Accessing Logs in Production

1. **Keyboard Shortcut**: Press `Ctrl+Shift+L` to open the log viewer
2. **Debug Button**: Click the "Debug" button in the bottom-right corner
3. **Export Logs**: Use the "Export" button to download logs for analysis

### Log Levels

- **ERROR**: Critical errors that need immediate attention
- **WARN**: Warnings that should be investigated
- **INFO**: General information (development only)
- **DEBUG**: Detailed debugging information (development only)

## Prevention

This fix prevents similar issues by:
1. Always validating response content-type before parsing
2. Providing detailed error information for debugging
3. Implementing retry logic for transient failures
4. Maintaining production logs for post-mortem analysis

## Deployment Notes

- The fix is backward compatible
- No database changes required
- No environment variable changes needed
- The debug tools are only visible when explicitly activated
