import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

interface Acupoints {
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

interface Vessel {
  id?: number;
  name: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface AcupointManagementProps {
  accessCode: string;
}

const AcupointManagement: React.FC<AcupointManagementProps> = ({ accessCode }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [acupoints, setAcupoints] = useState<Acupoints[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [filterLoading, setFilterLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [editingAcupoint, setEditingAcupoint] = useState<Acupoints | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [viewingAcupoint, setViewingAcupoint] = useState<Acupoints | null>(null);
  const [deletingAcupointId, setDeletingAcupointId] = useState<number | null>(null);

  const goBack = () => {
    const params = accessCode ? `?access_code=${encodeURIComponent(accessCode)}` : '';
    navigate(`/qigong${params}`);
  };

  // Fetch data functions
  useEffect(() => {
    if (accessCode) {
      fetchData();
      fetchVessels();
    }
  }, [accessCode]);

  const fetchData = async (vesselId?: string, isFilter: boolean = false) => {
    if (!accessCode) return;

    if (isFilter) {
      setFilterLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const vesselParam = vesselId ? `&vessel_id=${encodeURIComponent(vesselId)}` : '';
      const response = await fetch(`/api/admin/acupoints?access_code=${encodeURIComponent(accessCode)}${vesselParam}`);
      if (response.ok) {
        const result = await response.json();
        setAcupoints(result.data || []);
      } else {
        setError('Không thể tải dữ liệu huyệt');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
    } finally {
      if (isFilter) {
        setFilterLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  const fetchVessels = async () => {
    if (!accessCode) return;

    try {
      const response = await fetch(`/api/admin/vessels?access_code=${encodeURIComponent(accessCode)}`);
      if (response.ok) {
        const result = await response.json();
        setVessels(result.data || []);
      }
    } catch (err) {
      console.error('Error fetching vessels:', err);
    }
  };

  const handleVesselFilter = async (vesselId: string) => {
    setSelectedVesselId(vesselId);
    await fetchData(vesselId || undefined, true);
  };

  const handleSave = async (acupoint: Acupoints) => {
    if (!accessCode) return;

    setLoading(true);
    try {
      const url = acupoint.id
        ? `/api/admin/acupoints/${acupoint.id}?access_code=${encodeURIComponent(accessCode)}`
        : `/api/admin/acupoints?access_code=${encodeURIComponent(accessCode)}`;

      const method = acupoint.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(acupoint),
      });

      if (response.ok) {
        await fetchData();
        setShowAddForm(false);
        setEditingAcupoint(null);
      } else {
        setError('Không thể lưu dữ liệu');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeletingAcupointId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!accessCode || !deletingAcupointId) return;

    try {
      const response = await fetch(`/api/admin/acupoints/${deletingAcupointId}?access_code=${encodeURIComponent(accessCode)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
        setDeletingAcupointId(null);
      } else {
        setError('Không thể xóa huyệt');
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
    }
  };

  const handleDeleteCancel = () => {
    setDeletingAcupointId(null);
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
              <h1 className="text-3xl font-bold text-gray-800">Quản lý Huyệt</h1>
              <p className="text-gray-600 mt-1">Quản lý thông tin các huyệt (Acupuncture Points)</p>
            </div>
          </div>
          
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thêm Huyệt mới
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Filter Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center space-x-4">
            <label htmlFor="vesselFilter" className="text-sm font-medium text-gray-700">
              Lọc theo Kỳ Kinh:
            </label>
            <select
              id="vesselFilter"
              value={selectedVesselId}
              onChange={(e) => handleVesselFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={filterLoading}
            >
              <option value="">Tất cả Kỳ Kinh</option>
              {vessels.map((vessel) => (
                <option key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </option>
              ))}
            </select>
            {filterLoading && (
              <div className="text-sm text-gray-500">Đang lọc...</div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Đang tải...</p>
          </div>
        )}

        {/* Acupoints Table */}
        {!loading && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ký hiệu
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Kỳ Kinh
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chữ Hán
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pinyin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tên Việt
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mô tả
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Công dụng
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ghi chú
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hình ảnh
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {acupoints.map((acupoint, index) => (
                    <tr
                      key={acupoint.id}
                      className={`
                        cursor-pointer transition-colors duration-200 ease-out
                        ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                        hover:bg-blue-50 hover:shadow-sm
                        border-b border-gray-200
                      `}
                      onDoubleClick={() => setViewingAcupoint(acupoint)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {acupoint.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {vessels.find(vessel => vessel.id === acupoint.vessel_id)?.name || 'Không xác định'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {acupoint.chinese_characters || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {acupoint.pinyin || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '200px', maxWidth: '250px'}}>
                        <div className="break-words">
                          {acupoint.vietnamese_name}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '300px', maxWidth: '400px'}}>
                        <div className="whitespace-pre-wrap break-words">
                          {acupoint.description || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '300px', maxWidth: '400px'}}>
                        <div className="whitespace-pre-wrap break-words">
                          {acupoint.usage || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '250px', maxWidth: '350px'}}>
                        <div className="whitespace-pre-wrap break-words">
                          {acupoint.notes || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {acupoint.image_url ? (
                          <img
                            src={acupoint.image_url.startsWith('http') ? acupoint.image_url : `http://localhost:5001${acupoint.image_url}`}
                            alt={acupoint.vietnamese_name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-500 text-xs">Không có</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => setEditingAcupoint(acupoint)}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          Sửa
                        </button>
                        <button
                          onClick={() => acupoint.id && handleDeleteClick(acupoint.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {acupoints.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-500">
            Không có huyệt nào. Nhấp "Thêm Huyệt mới" để bắt đầu.
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {(showAddForm || editingAcupoint) && (
          <AcupointFormModal
            acupoint={editingAcupoint}
            vessels={vessels}
            onSave={handleSave}
            onCancel={() => {
              setShowAddForm(false);
              setEditingAcupoint(null);
            }}
          />
        )}

        {/* Detail View Modal */}
        {viewingAcupoint && (
          <AcupointDetailModal
            acupoint={viewingAcupoint}
            vessels={vessels}
            onClose={() => setViewingAcupoint(null)}
          />
        )}

        {/* Delete Confirmation Modal */}
        {deletingAcupointId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Xác nhận xóa</h3>
              <p className="text-sm text-gray-500 mb-6">
                Bạn có chắc chắn muốn xóa huyệt này? Hành động này không thể hoàn tác.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={handleDeleteCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Hủy
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
                >
                  Xóa
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Form Modal Component
interface AcupointFormModalProps {
  acupoint: Acupoints | null;
  vessels: Vessel[];
  onSave: (acupoint: Acupoints) => void;
  onCancel: () => void;
}

const AcupointFormModal: React.FC<AcupointFormModalProps> = ({ acupoint, vessels, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Acupoints>({
    symbol: acupoint?.symbol || '',
    vessel_id: acupoint?.vessel_id || 0,
    chinese_characters: acupoint?.chinese_characters || '',
    pinyin: acupoint?.pinyin || '',
    vietnamese_name: acupoint?.vietnamese_name || '',
    description: acupoint?.description || '',
    usage: acupoint?.usage || '',
    notes: acupoint?.notes || '',
    image_url: acupoint?.image_url || '',
    ...(acupoint?.id && { id: acupoint.id })
  });

  const [uploading, setUploading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>(() => {
    const url = acupoint?.image_url || '';
    return url ? (url.startsWith('http') ? url : `http://localhost:5001${url}`) : '';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.symbol && formData.vietnamese_name && formData.vessel_id) {
      onSave(formData);
    }
  };

  const handleChange = (field: keyof Acupoints, value: string | number) => {
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

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      if (response.ok) {
        const result = await response.json();
        const imageUrl = result.url;
        setFormData(prev => ({ ...prev, image_url: imageUrl }));
        setImagePreview(`http://localhost:5001${imageUrl}`);
        setFormError('');
      } else {
        setFormError('Không thể tải lên hình ảnh');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      setFormError('Lỗi khi tải lên hình ảnh');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              {acupoint ? 'Sửa Huyệt' : 'Thêm Huyệt mới'}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {formError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Symbol */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ký hiệu *
                </label>
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => handleChange('symbol', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ví dụ: LI4, ST36"
                  required
                />
              </div>

              {/* Vessel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kỳ Kinh *
                </label>
                <select
                  value={formData.vessel_id}
                  onChange={(e) => handleChange('vessel_id', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value={0}>Chọn Kỳ Kinh</option>
                  {vessels.map((vessel) => (
                    <option key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Chinese Characters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Chữ Hán
                </label>
                <input
                  type="text"
                  value={formData.chinese_characters}
                  onChange={(e) => handleChange('chinese_characters', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="合谷"
                />
              </div>

              {/* Pinyin */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pinyin
                </label>
                <input
                  type="text"
                  value={formData.pinyin}
                  onChange={(e) => handleChange('pinyin', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="hégǔ"
                />
              </div>
            </div>

            {/* Vietnamese Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên tiếng Việt *
              </label>
              <input
                type="text"
                value={formData.vietnamese_name}
                onChange={(e) => handleChange('vietnamese_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Hợp Cốc"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mô tả
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mô tả vị trí và đặc điểm của huyệt..."
              />
            </div>

            {/* Usage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Công dụng
              </label>
              <textarea
                value={formData.usage}
                onChange={(e) => handleChange('usage', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Công dụng và tác dụng chữa bệnh..."
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ghi chú
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ghi chú thêm..."
              />
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hình ảnh
              </label>
              <div className="flex items-center space-x-4">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={uploading}
                />
                {uploading && (
                  <div className="text-sm text-gray-500">Đang tải lên...</div>
                )}
              </div>
              {imagePreview && (
                <div className="mt-4">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="h-32 w-32 object-cover rounded-lg border border-gray-300"
                  />
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                disabled={uploading}
              >
                {acupoint ? 'Cập nhật' : 'Tạo mới'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Acupoint Detail Modal Component
interface AcupointDetailModalProps {
  acupoint: Acupoints;
  vessels: Vessel[];
  onClose: () => void;
}

const AcupointDetailModal: React.FC<AcupointDetailModalProps> = ({ acupoint, vessels, onClose }) => {
  const vessel = vessels.find(v => v.id === acupoint.vessel_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex">
        {/* Left Section - Information */}
        <div className="w-1/2 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">Chi tiết Huyệt</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Acupoint Information */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ký hiệu</label>
              <div className="text-lg font-semibold text-gray-900">{acupoint.symbol}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên tiếng Việt</label>
              <div className="text-lg font-semibold text-gray-900">{acupoint.vietnamese_name}</div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kỳ Kinh</label>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {vessel?.name || 'Không xác định'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chữ Hán</label>
                <div className="text-gray-700">
                  {acupoint.chinese_characters || 'Không có'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pinyin</label>
                <div className="text-gray-700">
                  {acupoint.pinyin || 'Không có'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
              <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">
                {acupoint.description || 'Không có mô tả'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Công dụng</label>
              <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">
                {acupoint.usage || 'Không có thông tin công dụng'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">
                {acupoint.notes || 'Không có ghi chú'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tạo</label>
                <div className="text-sm text-gray-600">
                  {acupoint.created_at ? new Date(acupoint.created_at).toLocaleString('vi-VN') : 'Không xác định'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cập nhật lần cuối</label>
                <div className="text-sm text-gray-600">
                  {acupoint.updated_at ? new Date(acupoint.updated_at).toLocaleString('vi-VN') : 'Không xác định'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section - Image */}
        {acupoint.image_url && (
          <div className="w-1/2 bg-gray-50 flex items-center justify-center p-6">
            <img
              src={acupoint.image_url.startsWith('http') ? acupoint.image_url : `http://localhost:5001${acupoint.image_url}`}
              alt={acupoint.vietnamese_name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          </div>
        )}

        {/* No Image State */}
        {!acupoint.image_url && (
          <div className="w-1/2 bg-gray-50 flex items-center justify-center p-6">
            <div className="text-center text-gray-500">
              <svg className="w-24 h-24 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>Không có hình ảnh</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcupointManagement;
