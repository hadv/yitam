import React, { useState, useEffect } from 'react';
import { useSearchParams, Routes, Route, useLocation } from 'react-router-dom';
import VesselManagement from './VesselManagement';
import QigongMainPage from './QigongMainPage';
import AcupointManagement from './AcupointManagement';

interface Vessel {
  id?: number;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface Acupoints {
  id?: number;
  symbol: string;
  category_id: number;
  chinese_characters?: string;
  pinyin?: string;
  vietnamese_name: string;
  description?: string;
  usage?: string;
  notes?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface QigongManagementProps {}

const QigongManagement: React.FC<QigongManagementProps> = () => {
  const [searchParams] = useSearchParams();
  const [accessCode, setAccessCode] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Check for access code in URL params
  useEffect(() => {
    const codeFromUrl = searchParams.get('access_code');
    if (codeFromUrl) {
      setAccessCode(codeFromUrl);
      handleAuthentication(codeFromUrl);
    }
  }, [searchParams]);

  const handleAuthentication = async (code: string) => {
    try {
      // Simple authentication check
      const response = await fetch(`/api/admin/vessels?access_code=${encodeURIComponent(code)}`);
      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Invalid access code');
        setIsAuthenticated(false);
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
      setIsAuthenticated(false);
    }
  };

  const handleSubmitAccessCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim()) {
      handleAuthentication(accessCode.trim());
    }
  };

  // If not authenticated, show login form
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
            Truy cập Quản lý Khí Công
          </h2>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmitAccessCode}>
            <div className="mb-4">
              <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-2">
                Mã truy cập
              </label>
              <input
                type="password"
                id="accessCode"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nhập mã truy cập"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If authenticated, show routes
  return (
    <Routes>
      <Route path="/" element={<QigongMainPage />} />
      <Route path="/vessels" element={<VesselManagement accessCode={accessCode} />} />
      <Route path="/acupoints" element={<AcupointManagement accessCode={accessCode} />} />
    </Routes>
  );
};

export default QigongManagement;
