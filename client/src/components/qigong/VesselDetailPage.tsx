import React, { useState, useEffect } from 'react';

interface Vessel {
  id?: number;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface Acupoint {
  id?: number;
  symbol: string;
  vessel_id: number;
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

interface VesselDetailPageProps {
  vessel: Vessel;
  onClose: () => void;
  onAcupointClick?: (acupoint: Acupoint) => void;
  accessCode: string;
}

const VesselDetailPage: React.FC<VesselDetailPageProps> = ({ 
  vessel, 
  onClose, 
  onAcupointClick,
  accessCode 
}) => {
  const [showImageViewer, setShowImageViewer] = useState<boolean>(false);
  const [acupoints, setAcupoints] = useState<Acupoint[]>([]);
  const [loadingAcupoints, setLoadingAcupoints] = useState<boolean>(true);

  // Fetch acupoints for this vessel
  useEffect(() => {
    const fetchAcupoints = async () => {
      try {
        const response = await fetch(`/api/admin/acupoints?access_code=${accessCode}`);
        if (response.ok) {
          const allAcupoints = await response.json();
          // Filter acupoints for this vessel
          const vesselAcupoints = allAcupoints.filter((ap: Acupoint) => ap.vessel_id === vessel.id);
          setAcupoints(vesselAcupoints);
        }
      } catch (error) {
        console.error('Failed to fetch acupoints:', error);
      } finally {
        setLoadingAcupoints(false);
      }
    };

    fetchAcupoints();
  }, [vessel.id, accessCode]);

  const handleImageClick = () => {
    if (vessel.image_url) {
      setShowImageViewer(true);
    }
  };

  const handleAcupointClick = (acupoint: Acupoint) => {
    if (onAcupointClick) {
      onAcupointClick(acupoint);
    }
  };

  const getImageUrl = () => {
    if (!vessel.image_url) return '';
    return vessel.image_url.startsWith('http') ? vessel.image_url : `http://localhost:5001${vessel.image_url}`;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50 to-green-50 z-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Quay lại</span>
            </button>
            <h1 className="text-xl font-bold text-gray-900">Chi tiết Kỳ Kinh</h1>
            <div className="w-20"></div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Hero Section - Compact */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{vessel.name}</h1>
                <div className="text-base font-semibold text-purple-600">Kỳ Kinh</div>
              </div>
            </div>

            <div className="inline-flex items-center px-4 py-2 bg-purple-100 text-purple-800 rounded-full">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {acupoints.length} huyệt đạo
            </div>
          </div>
        </div>

        {/* Main Content Grid - Full Height */}
        <div className="flex-1 overflow-hidden">
          <div className="max-w-6xl mx-auto p-6 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
              {/* Left Column - Info */}
              <div className="lg:col-span-2 space-y-4 overflow-y-auto">
                {/* Description */}
                {vessel.description && (
                  <div className="bg-white rounded-lg shadow p-5">
                    <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
                      <div className="flex items-center mb-3">
                        <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mr-3"></div>
                        <h3 className="text-base font-semibold text-blue-800">Mô tả</h3>
                      </div>
                      <p className="text-base text-blue-900 leading-relaxed whitespace-pre-wrap">
                        {vessel.description}
                      </p>
                    </div>
                  </div>
                )}

                {/* Acupoints List */}
                <div className="bg-white rounded-lg shadow p-5">
                  <div className="p-4 bg-gradient-to-r from-green-50 to-teal-50 rounded-lg">
                    <div className="flex items-center mb-3">
                      <div className="w-3 h-3 bg-gradient-to-r from-green-500 to-teal-500 rounded-full mr-3"></div>
                      <h3 className="text-base font-semibold text-green-800">Huyệt đạo ({acupoints.length})</h3>
                    </div>
                    
                    {loadingAcupoints ? (
                      <div className="flex items-center justify-center py-8">
                        <svg className="animate-spin h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="ml-2 text-green-700">Đang tải...</span>
                      </div>
                    ) : acupoints.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {acupoints.map((acupoint) => (
                          <button
                            key={acupoint.id}
                            onClick={() => handleAcupointClick(acupoint)}
                            className="p-3 bg-white rounded-lg border border-green-200 hover:border-green-400 hover:shadow-md transition-all duration-200 text-left group"
                          >
                            <div className="font-medium text-sm text-gray-900 group-hover:text-green-700">
                              {acupoint.symbol}
                            </div>
                            <div className="text-xs text-gray-600 mt-1 group-hover:text-green-600">
                              {acupoint.vietnamese_name}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-green-700">
                        <p>Chưa có huyệt đạo nào cho Kỳ Kinh này.</p>
                        <p className="text-sm mt-1">Sử dụng tính năng "🤖 Auto-detect" để tự động phát hiện huyệt đạo.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Image & Meta */}
              <div className="lg:col-span-3 flex flex-col h-full">
                {/* Image - Takes most of the height */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden flex-1 flex flex-col">
                  {vessel.image_url ? (
                    <div className="relative group cursor-pointer flex-1 flex items-center justify-center" onClick={handleImageClick}>
                      <img
                        src={getImageUrl()}
                        alt={vessel.name}
                        className="max-w-full max-h-full object-contain p-4 transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <div className="bg-white bg-opacity-90 rounded-full p-3 shadow-lg">
                            <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400">
                      <div className="text-center">
                        <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-lg">Không có hình ảnh</p>
                        <p className="text-sm text-gray-500 mt-1">Chưa có hình ảnh cho Kỳ Kinh này</p>
                      </div>
                    </div>
                  )}

                  {/* Meta Info - At bottom of image container */}
                  <div className="border-t bg-gray-50 p-3">
                    <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Tạo:</span>
                        <div className="text-gray-900 text-xs">
                          {vessel.created_at ? new Date(vessel.created_at).toLocaleDateString('vi-VN') : 'N/A'}
                        </div>
                      </div>
                      <div>
                        <span className="font-medium">Cập nhật:</span>
                        <div className="text-gray-900 text-xs">
                          {vessel.updated_at ? new Date(vessel.updated_at).toLocaleDateString('vi-VN') : 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Viewer Modal */}
      {showImageViewer && (
        <ImageViewer
          imageUrl={getImageUrl()}
          title={vessel.name}
          onClose={() => setShowImageViewer(false)}
        />
      )}
    </div>
  );
};

// Image Viewer Component with Zoom functionality
interface ImageViewerProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ imageUrl, title, onClose }) => {
  const [scale, setScale] = useState<number>(1);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[9999] p-4"
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* Controls - Fixed position, not affected by zoom */}
      <div className="fixed top-4 right-4 flex space-x-2 z-[10000]">
        <button
          onClick={resetView}
          className="bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-colors"
          title="Reset view"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image Container */}
      <div className="relative max-w-full max-h-full overflow-hidden">
        <img
          src={imageUrl}
          alt={title}
          className={`max-w-full max-h-full object-contain select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          draggable={false}
        />
      </div>

      {/* Title */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-2 rounded">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-gray-300">
          Zoom: {Math.round(scale * 100)}% | Scroll để zoom, kéo để di chuyển
        </div>
      </div>
    </div>
  );
};

export default VesselDetailPage;
