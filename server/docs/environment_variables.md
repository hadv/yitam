# Environment Variables Reference

This document lists all environment variables required for the application. Copy these into your `.env` file.

## Server Configuration
```
PORT=5001
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

## API Keys
```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## Access Control
```
# Comma-separated list of valid access codes
VALID_ACCESS_CODES=code1,code2,code3
```

## Request Signature Security
```
# Enable or disable signature verification (true/false)
ENABLE_SIGNATURE_VERIFICATION=true
# Secret used for signing and verifying requests
SIGNING_SECRET=replace_with_secure_random_string_in_production
```

## Model Configuration
```
ANTHROPIC_MODEL=claude-3-7-sonnet-20250219
MODEL_MAX_TOKENS=10000
```

## MCP Server (Optional)
```
MCP_SERVER_PATH=
```

## Setup Instructions

1. Create a file named `.env` in the server directory
2. Copy the variables above into the file
3. Replace the placeholder values with your actual configuration
4. For production, ensure you use strong random values for `SIGNING_SECRET`

## Note for Production

In production environments:
- Set `NODE_ENV=production`
- Use a secure, randomly generated string for `SIGNING_SECRET`
- Limit `VALID_ACCESS_CODES` to authorized users
- Consider enabling HTTPS for secure communication 