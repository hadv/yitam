import React, { useState, useEffect } from 'react';
import { encryptApiKey, decryptApiKey, hasStoredApiKey, removeApiKey } from '../../utils/encryption';

interface TailwindApiKeySettingsProps {
  onApiKeySet: () => void;
}

export const TailwindApiKeySettings: React.FC<TailwindApiKeySettingsProps> = ({ onApiKeySet }) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (hasStoredApiKey()) {
      setMessage('API key đã được lưu trữ an toàn');
      setStatus('success');
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!apiKey.trim()) {
        setMessage('Vui lòng nhập API key');
        setStatus('error');
        return;
      }

      if (!apiKey.startsWith('sk-ant-')) {
        setMessage('API key không hợp lệ');
        setStatus('error');
        return;
      }

      encryptApiKey(apiKey);
      setMessage('API key đã được lưu trữ an toàn');
      setStatus('success');
      setApiKey('');
      onApiKeySet();
    } catch (error) {
      setMessage('Không thể lưu trữ API key');
      setStatus('error');
    }
  };

  const handleRemoveKey = () => {
    try {
      removeApiKey();
      setMessage('API key đã được xóa');
      setStatus('idle');
      setApiKey('');
    } catch (error) {
      setMessage('Không thể xóa API key');
      setStatus('error');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="px-8 py-6 bg-[#F5EFE0] border-b border-[#E6DFD1]">
        <h2 className="text-2xl font-semibold text-[#5D4A38]">Cài đặt Anthropic API Key</h2>
        <p className="mt-2 text-[#5D4A38] opacity-80">
          Để sử dụng Yitam, bạn cần cung cấp API key của Anthropic
        </p>
      </div>

      <div className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[#5D4A38] mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full px-4 py-3 border border-[#E6DFD1] rounded-lg focus:ring-2 focus:ring-[#78A161] focus:border-transparent transition-all duration-200 bg-white"
                placeholder="Nhập Anthropic API key của bạn"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#5D4A38] opacity-70 hover:opacity-100 focus:outline-none"
              >
                {showKey ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {status !== 'idle' && (
            <div className={`rounded-lg p-4 ${
              status === 'success' 
                ? 'bg-[rgba(120,161,97,0.1)] text-[#78A161]' 
                : 'bg-[rgba(188,71,73,0.1)] text-[#BC4749]'
            }`}>
              <p className="text-sm font-medium">{message}</p>
            </div>
          )}

          <div className="flex space-x-4">
            <button
              type="submit"
              className="flex-1 bg-[#78A161] text-white px-6 py-3 rounded-lg hover:bg-[#5D8A46] focus:ring-4 focus:ring-[#78A161] focus:ring-opacity-50 transition-all duration-200 shadow-sm hover:shadow"
            >
              Lưu API Key
            </button>
            {hasStoredApiKey() && (
              <button
                type="button"
                onClick={handleRemoveKey}
                className="flex-1 bg-[#BC4749] text-white px-6 py-3 rounded-lg hover:bg-[#A33E40] focus:ring-4 focus:ring-[#BC4749] focus:ring-opacity-50 transition-all duration-200 shadow-sm hover:shadow"
              >
                Xóa API Key
              </button>
            )}
          </div>
        </form>

        <div className="mt-8 p-6 bg-[#F5EFE0] rounded-xl border border-[#E6DFD1]">
          <h3 className="text-lg font-semibold text-[#5D4A38] mb-4">
            Thông tin bảo mật
          </h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-[#78A161] mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <p className="text-sm text-[#5D4A38] opacity-80">API key của bạn được mã hóa trước khi lưu trữ</p>
            </div>
            <div className="flex items-start">
              <svg className="w-5 h-5 text-[#78A161] mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              <p className="text-sm text-[#5D4A38] opacity-80">Chỉ được lưu trữ trong trình duyệt của bạn</p>
            </div>
            <div className="flex items-start">
              <svg className="w-5 h-5 text-[#78A161] mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-sm text-[#5D4A38] opacity-80">Chỉ được sử dụng để gọi API trực tiếp và không được lưu trữ trên máy chủ</p>
            </div>
            <div className="flex items-start">
              <svg className="w-5 h-5 text-[#78A161] mt-1 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
              </svg>
              <p className="text-sm text-[#5D4A38] opacity-80">Chỉ có thể truy cập từ thiết bị này</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 