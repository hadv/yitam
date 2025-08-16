import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VesselDetailPage from './VesselDetailPage';
import AcupointDetailPage from './AcupointDetailPage';

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
  vietnamese_name: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface VesselManagementProps {
  accessCode: string;
}

const VesselManagement: React.FC<VesselManagementProps> = ({ accessCode }) => {
  const navigate = useNavigate();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [viewingVessel, setViewingVessel] = useState<Vessel | null>(null);
  const [viewingAcupoint, setViewingAcupoint] = useState<Acupoint | null>(null);
  const [deletingVesselId, setDeletingVesselId] = useState<number | null>(null);
  const [autoDetecting, setAutoDetecting] = useState<boolean>(false);
  const [detectionResult, setDetectionResult] = useState<string>('');

  const goBack = () => {
    const params = accessCode ? `?access_code=${encodeURIComponent(accessCode)}` : '';
    navigate(`/qigong${params}`);
  };

  useEffect(() => {
    fetchVessels();
  }, [accessCode]);

  const fetchVessels = async () => {
    if (!accessCode) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/vessels?access_code=${encodeURIComponent(accessCode)}`);
      if (response.ok) {
        const result = await response.json();
        setVessels(result.data || []);
      } else {
        setError('Không thể tải danh sách Kỳ Kinh');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (vessel: Vessel) => {
    if (!accessCode) return;

    setLoading(true);
    try {
      const url = vessel.id
        ? `/api/admin/vessels/${vessel.id}?access_code=${encodeURIComponent(accessCode)}`
        : `/api/admin/vessels?access_code=${encodeURIComponent(accessCode)}`;

      const method = vessel.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vessel),
      });

      if (response.ok) {
        await fetchVessels();
        setEditingVessel(null);
        setShowAddForm(false);
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Không thể lưu Kỳ Kinh');
      }
    } catch (err) {
      setError('Không thể lưu Kỳ Kinh');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeletingVesselId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!accessCode || !deletingVesselId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/vessels/${deletingVesselId}?access_code=${encodeURIComponent(accessCode)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchVessels();
        setDeletingVesselId(null);
        setError('');
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Không thể xóa Kỳ Kinh');
      }
    } catch (err) {
      setError('Không thể xóa Kỳ Kinh');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingVesselId(null);
  };

  const handleAutoDetect = async (vessel: Vessel) => {
    if (!vessel.image_url) {
      setError('Vessel must have an image for auto-detection');
      return;
    }

    setAutoDetecting(true);
    setDetectionResult('');
    setError('');

    try {
      const response = await fetch(`/api/admin/detect-acupoints?access_code=${encodeURIComponent(accessCode)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vessel_id: vessel.id,
          image_url: vessel.image_url
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setDetectionResult(
          `✅ Auto-detection completed!\n` +
          `🔍 Detected: ${result.detection_result.total_detected} acupoints\n` +
          `✨ Created: ${result.total_created} new acupoints\n` +
          `⏱️ Processing time: ${result.detection_result.processing_time}ms\n` +
          `📊 Skipped: ${result.skipped} (already exist)`
        );
      } else {
        const errorData = await response.json();
        setError(`Auto-detection failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (err) {
      setError('Failed to connect to auto-detection service');
    } finally {
      setAutoDetecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <button
              onClick={goBack}
              className="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Quản lý 8 Kỳ Kinh</h1>
              <p className="text-gray-600 mt-1">Quản lý thông tin 8 Kỳ Kinh (Eight Extraordinary Vessels)</p>
            </div>
          </div>

          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thêm Kỳ Kinh mới
          </button>
        </div>

        <div className="space-y-6">

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {detectionResult && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <div className="flex justify-between items-start">
            <pre className="whitespace-pre-wrap text-sm">{detectionResult}</pre>
            <button
              onClick={() => setDetectionResult('')}
              className="text-green-500 hover:text-green-700 ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                  Tên
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                  Mô tả
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                  Hình ảnh
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {vessels.map((vessel, index) => (
                <tr
                  key={vessel.id}
                  className={`
                    cursor-pointer transition-colors duration-200 ease-out
                    ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    hover:bg-blue-50 hover:shadow-sm
                    border-b border-gray-200
                  `}
                  onDoubleClick={() => setViewingVessel(vessel)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {vessel.name}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-lg">
                    <div className="whitespace-pre-wrap break-words">
                      {vessel.description || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {vessel.image_url ? (
                      <img
                        src={vessel.image_url.startsWith('http') ? vessel.image_url : `http://localhost:5001${vessel.image_url}`}
                        alt={vessel.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="text-gray-500 text-xs">Không có</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex flex-col space-y-1">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingVessel(vessel)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => vessel.id && handleDeleteClick(vessel.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Xóa
                        </button>
                      </div>
                      {vessel.image_url && (
                        <button
                          onClick={() => handleAutoDetect(vessel)}
                          disabled={autoDetecting}
                          className="text-green-600 hover:text-green-900 disabled:text-gray-400 text-xs flex items-center"
                          title="Auto-detect acupoints using AI"
                        >
                          {autoDetecting ? (
                            <>
                              <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Detecting...
                            </>
                          ) : (
                            <>
                              🤖 Auto-detect
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {vessels.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          Không có Kỳ Kinh nào. Nhấp "Thêm Kỳ Kinh mới" để bắt đầu.
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {(showAddForm || editingVessel) && (
        <VesselFormModal
          vessel={editingVessel}
          onSave={handleSave}
          onCancel={() => {
            setShowAddForm(false);
            setEditingVessel(null);
          }}
        />
      )}

      {/* Detail View Page */}
      {viewingVessel && (
        <VesselDetailPage
          vessel={viewingVessel}
          onClose={() => setViewingVessel(null)}
          onAcupointClick={(acupoint) => {
            setViewingAcupoint(acupoint);
            setViewingVessel(null);
          }}
          accessCode={accessCode}
        />
      )}

      {/* Acupoint Detail Page */}
      {viewingAcupoint && (
        <AcupointDetailPage
          acupoint={viewingAcupoint}
          vessels={vessels}
          onClose={() => setViewingAcupoint(null)}
          onVesselClick={(vessel) => {
            setViewingVessel(vessel);
            setViewingAcupoint(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingVesselId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Xác nhận xóa</h3>
            <p className="text-sm text-gray-500 mb-6">
              Bạn có chắc chắn muốn xóa Kỳ Kinh này? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

// Form Modal Component
interface VesselFormModalProps {
  vessel: Vessel | null;
  onSave: (vessel: Vessel) => void;
  onCancel: () => void;
}

const VesselFormModal: React.FC<VesselFormModalProps> = ({ vessel, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Vessel>({
    name: vessel?.name || '',
    description: vessel?.description || '',
    image_url: vessel?.image_url || '',
    ...(vessel?.id && { id: vessel.id })
  });

  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>(() => {
    const url = vessel?.image_url || '';
    return url ? (url.startsWith('http') ? url : `http://localhost:5001${url}`) : '';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      onSave(formData);
    }
  };

  const handleChange = (field: keyof Vessel, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('image', file);

      // Get access code from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const accessCode = urlParams.get('access_code');

      const response = await fetch(`/api/admin/upload-image?access_code=${encodeURIComponent(accessCode || '')}`, {
        method: 'POST',
        body: uploadFormData,
      });

      if (response.ok) {
        const result = await response.json();
        const imageUrl = result.data.url;
        const absoluteImageUrl = imageUrl.startsWith('http') ? imageUrl : `http://localhost:5001${imageUrl}`;
        setImagePreview(absoluteImageUrl);
        handleChange('image_url', imageUrl); // Store relative URL in form data
        setFormError('');
      } else {
        setFormError('Không thể tải lên hình ảnh');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setFormError('Không thể tải lên hình ảnh');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {vessel ? 'Sửa Kỳ Kinh' : 'Thêm Kỳ Kinh mới'}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập mô tả về Kỳ Kinh này..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hình ảnh
            </label>
            <div className="space-y-2">
              {imagePreview && (
                <div className="flex items-center space-x-2">
                  <img
                    src={imagePreview.startsWith('http') ? imagePreview : `http://localhost:5001${imagePreview}`}
                    alt="Preview"
                    className="h-16 w-16 rounded-lg object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview('');
                      handleChange('image_url', '');
                    }}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Xóa
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {uploading && (
                <div className="text-sm text-gray-500">Đang tải lên...</div>
              )}
            </div>
          </div>
          
          {formError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {formError}
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {vessel ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};




export default VesselManagement;
