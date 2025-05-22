/**
 * Application version information
 * Used to track database schema changes and trigger migrations
 */

export const APP_VERSION = '1.0.1';
export const DB_VERSION = 2; // Must match the version in ChatHistoryDB.ts

/**
 * Check if database needs upgrade based on stored version
 */
export function checkDatabaseVersionMismatch(): boolean {
  const storedVersion = localStorage.getItem('db_version');
  
  if (!storedVersion) {
    // First run, store current version
    localStorage.setItem('db_version', DB_VERSION.toString());
    return false;
  }
  
  // Check if stored version matches current version
  return parseInt(storedVersion, 10) !== DB_VERSION;
}

/**
 * Update stored database version
 */
export function updateStoredDatabaseVersion(): void {
  localStorage.setItem('db_version', DB_VERSION.toString());
}

/**
 * Get browser and OS information
 * Useful for debugging
 */
export function getSystemInfo(): {
  browser: string;
  os: string;
  userAgent: string;
} {
  const userAgent = navigator.userAgent;
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  
  // Detect browser
  if (userAgent.indexOf('Chrome') > -1) {
    browser = 'Chrome';
  } else if (userAgent.indexOf('Safari') > -1) {
    browser = 'Safari';
  } else if (userAgent.indexOf('Firefox') > -1) {
    browser = 'Firefox';
  } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident') > -1) {
    browser = 'Internet Explorer';
  } else if (userAgent.indexOf('Edge') > -1) {
    browser = 'Edge';
  }
  
  // Detect OS
  if (userAgent.indexOf('Windows') > -1) {
    os = 'Windows';
  } else if (userAgent.indexOf('Mac') > -1) {
    os = 'macOS';
  } else if (userAgent.indexOf('Linux') > -1) {
    os = 'Linux';
  } else if (userAgent.indexOf('Android') > -1) {
    os = 'Android';
  } else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1 || userAgent.indexOf('iPad') > -1) {
    os = 'iOS';
  }
  
  return {
    browser,
    os,
    userAgent
  };
} 