import { UnleashClient } from 'unleash-proxy-client';

// Unleash client configuration
// Note: In a real production environment, you would need to set up an Unleash server
// and configure the Unleash Proxy to connect to it
export const unleashClient = new UnleashClient({
  url: 'http://localhost:4242/api/frontend', // Default Unleash Proxy URL when running locally
  clientKey: 'default:development.unleash-insecure-frontend-api-token', // Default client key for development
  appName: 'yitam',
  refreshInterval: 15, // How often (in seconds) the client should poll for updates
  environment: 'development',
});

// Feature flags
export const FEATURE_FLAGS = {
  TAILWIND_UI: 'tailwind-ui-version',
};

// Initialize Unleash client
export const initUnleash = async () => {
  try {
    // First check if the Unleash server is actually running
    try {
      const response = await fetch('http://localhost:4242/api/frontend', {
        method: 'HEAD',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      
      if (!response.ok) {
        console.warn('Unleash server is not responding correctly:', response.status);
        return false;
      }
    } catch (fetchError) {
      console.warn('Unleash server is not available:', fetchError);
      return false;
    }
    
    // If server is available, try to start the client
    await unleashClient.start();
    
    // Additional check: try to access the feature flag to verify connection
    try {
      unleashClient.isEnabled(FEATURE_FLAGS.TAILWIND_UI);
      console.log('Unleash connected: feature flag access successful');
      return true;
    } catch (accessError) {
      console.error('Error accessing feature flags:', accessError);
      return false;
    }
  } catch (error: any) {
    console.error('Failed to initialize Unleash client:', error);
    return false;
  }
};

// Check if a feature is enabled
export const isFeatureEnabled = (featureName: string): boolean => {
  try {
    return unleashClient.isEnabled(featureName);
  } catch (error) {
    console.error(`Error checking feature flag ${featureName}:`, error);
    // Default when feature check fails
    if (featureName === FEATURE_FLAGS.TAILWIND_UI) {
      console.log('Defaulting to Tailwind UI due to error');
      return true;
    }
    return false;
  }
}; 