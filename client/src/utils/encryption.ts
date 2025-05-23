import CryptoJS from 'crypto-js';

const STORAGE_KEY = 'encrypted_anthropic_key';
// We'll use a combination of window properties to create a somewhat unique key per browser/device
const getDeviceFingerprint = () => {
  const { userAgent, language, platform } = window.navigator;
  return CryptoJS.SHA256(`${userAgent}${language}${platform}`).toString();
};

export const encryptApiKey = (apiKey: string): void => {
  try {
    const deviceKey = getDeviceFingerprint();
    const encrypted = CryptoJS.AES.encrypt(apiKey, deviceKey).toString();
    localStorage.setItem(STORAGE_KEY, encrypted);
  } catch (error) {
    console.error('Error encrypting API key:', error);
    throw new Error('Failed to securely store API key');
  }
};

export const decryptApiKey = (): string | null => {
  try {
    const encrypted = localStorage.getItem(STORAGE_KEY);
    if (!encrypted) return null;
    
    const deviceKey = getDeviceFingerprint();
    const decrypted = CryptoJS.AES.decrypt(encrypted, deviceKey);
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Error decrypting API key:', error);
    return null;
  }
};

export const removeApiKey = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const hasStoredApiKey = (): boolean => {
  return !!localStorage.getItem(STORAGE_KEY);
}; 