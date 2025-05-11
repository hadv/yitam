import React, { useState, useEffect } from 'react';
import { encryptApiKey, decryptApiKey, hasStoredApiKey, removeApiKey } from '../utils/encryption';

interface ApiKeySettingsProps {
  onApiKeySet: () => void;
}

export const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ onApiKeySet }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Check if API key exists
    if (hasStoredApiKey()) {
      setMessage('API key is set and securely stored');
      setStatus('success');
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!apiKey.trim()) {
        setMessage('Please enter an API key');
        setStatus('error');
        return;
      }

      // Basic validation for Anthropic API key format
      if (!apiKey.startsWith('sk-ant-')) {
        setMessage('Invalid Anthropic API key format');
        setStatus('error');
        return;
      }

      encryptApiKey(apiKey);
      setMessage('API key securely stored');
      setStatus('success');
      setApiKey('');
      onApiKeySet();
    } catch (error) {
      setMessage('Failed to store API key');
      setStatus('error');
    }
  };

  const handleRemoveKey = () => {
    try {
      removeApiKey();
      setMessage('API key removed');
      setStatus('idle');
      setApiKey('');
    } catch (error) {
      setMessage('Failed to remove API key');
      setStatus('error');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Anthropic API Key Settings</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2 border rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your Anthropic API key"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
            >
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {status !== 'idle' && (
          <p className={`text-sm ${status === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message}
          </p>
        )}

        <div className="flex space-x-4">
          <button
            type="submit"
            className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Save API Key
          </button>
          {hasStoredApiKey() && (
            <button
              type="button"
              onClick={handleRemoveKey}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
            >
              Remove API Key
            </button>
          )}
        </div>
      </form>

      <div className="mt-4 text-sm text-gray-600">
        <p>Your API key will be:</p>
        <ul className="list-disc list-inside mt-2">
          <li>Encrypted before storage</li>
          <li>Stored only in your browser</li>
          <li>Never sent to our servers</li>
          <li>Accessible only on this device</li>
        </ul>
      </div>
    </div>
  );
}; 