# Feature Flags with Unleash for Yitam

This document explains how to use Unleash feature flags for A/B testing the UI in Yitam.

## Overview

We've implemented feature flagging using Unleash to toggle between:
1. Original UI
2. New Tailwind CSS UI

The Tailwind CSS version is designed to look identical to the original UI but uses Tailwind for styling.

## Setup Instructions

### 1. Start Unleash Server

Run the Unleash server using Docker Compose:

```bash
docker-compose -f docker-compose-unleash.yml up -d
```

This will start:
- Unleash server on http://localhost:4242
- Postgres database for Unleash

### 2. Configure Feature Flags

1. Open the Unleash dashboard at http://localhost:4242
2. Log in with:
   - Username: `admin`
   - Password: `unleash4all`
3. Create a new feature flag:
   - Name: `tailwind-ui-version`
   - Description: "Toggle between original UI and Tailwind UI"
   - Enable the flag for testing
   
### 3. Testing Different UI Versions

To test the different UI versions:
- Enable the `tailwind-ui-version` flag to see the Tailwind CSS version
- Disable the flag to see the original UI version

You can also use Unleash's gradual rollout features to show the new UI to a percentage of users:
1. Edit the `tailwind-ui-version` flag
2. Add a gradual rollout strategy
3. Set the rollout percentage (e.g., 50% to show the new UI to half of users)

## Implementation Details

- `client/src/unleashConfig.ts` - Unleash client configuration
- `client/src/components/TailwindApp.tsx` - Tailwind CSS version of the UI
- `client/src/App.tsx` - Main component with feature flag implementation

## Using in Development

When working locally, the app will connect to your local Unleash server and respect the feature flag settings.

## Using in Production

For production, you should:
1. Set up a proper Unleash server (self-hosted or cloud)
2. Update the Unleash configuration in `unleashConfig.ts` with your production URL and API keys
3. Configure proper security for your Unleash server

## Troubleshooting

If the feature flag isn't working:
1. Check that Unleash server is running
2. Verify that the feature flag is created and enabled in Unleash dashboard
3. Check the browser console for any errors related to Unleash client initialization 