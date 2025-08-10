import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface QigongMainPageProps {}

const QigongMainPage: React.FC<QigongMainPageProps> = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accessCode = searchParams.get('access_code');

  const navigateToSection = (section: string) => {
    const params = accessCode ? `?access_code=${encodeURIComponent(accessCode)}` : '';
    navigate(`/qigong/${section}${params}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">
            Quản lý Khí Công
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Hệ thống quản lý thông tin về Kỳ Kinh và Huyệt trong Y học Cổ truyền Trung Quốc
          </p>
        </div>

        {/* Main Navigation Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* 8 Kỳ Kinh Card */}
          <div 
            onClick={() => navigateToSection('vessels')}
            className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105 border border-gray-200"
          >
            <div className="p-8">
              <div className="flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-6 mx-auto">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">
                8 Kỳ Kinh
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Quản lý thông tin về 8 Kỳ Kinh (Eight Extraordinary Vessels) - các kinh mạch đặc biệt trong Y học Cổ truyền
              </p>
              <div className="text-center">
                <span className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                  Xem chi tiết →
                </span>
              </div>
            </div>
          </div>

          {/* Huyệt Card */}
          <div 
            onClick={() => navigateToSection('acupoints')}
            className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer transform hover:scale-105 border border-gray-200"
          >
            <div className="p-8">
              <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6 mx-auto">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">
                Huyệt
              </h2>
              <p className="text-gray-600 text-center mb-6">
                Quản lý thông tin về các huyệt (Acupuncture Points) - các điểm châm cứu quan trọng
              </p>
              <div className="text-center">
                <span className="inline-flex items-center px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                  Xem chi tiết →
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <div className="bg-white rounded-lg shadow-md p-6 max-w-2xl mx-auto">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Về hệ thống
            </h3>
            <p className="text-gray-600 text-sm">
              Hệ thống này được thiết kế để quản lý và lưu trữ thông tin chi tiết về các Kỳ Kinh và Huyệt 
              trong Y học Cổ truyền Trung Quốc, bao gồm tên tiếng Việt, chữ Hán, Pinyin, mô tả, công dụng và hình ảnh.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QigongMainPage;
