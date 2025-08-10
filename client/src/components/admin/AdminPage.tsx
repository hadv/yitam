import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import CategoryManagement from './CategoryManagement';

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

interface AdminPageProps {}

const AdminPage: React.FC<AdminPageProps> = () => {
  const [searchParams] = useSearchParams();
  const [accessCode, setAccessCode] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<'herbal-medicine' | 'categories'>('herbal-medicine');
  const [data, setData] = useState<Acupoints[]>([]);
  const [categories, setCategories] = useState<Vessel[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [filterLoading, setFilterLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [editingItem, setEditingItem] = useState<Acupoints | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [viewingItem, setViewingItem] = useState<Acupoints | null>(null);
  const [viewingCategory, setViewingCategory] = useState<Vessel | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // Check for access code in URL params
  useEffect(() => {
    const codeFromUrl = searchParams.get('access_code');
    if (codeFromUrl) {
      setAccessCode(codeFromUrl);
      handleAuthentication(codeFromUrl);
    }
  }, [searchParams]);

  const handleAuthentication = async (code: string) => {
    setLoading(true);
    setError('');

    try {
      const [dataResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/admin/herbal-medicine?access_code=${encodeURIComponent(code)}`),
        fetch(`/api/admin/categories?access_code=${encodeURIComponent(code)}`)
      ]);

      if (dataResponse.ok && categoriesResponse.ok) {
        const dataResult = await dataResponse.json();
        const categoriesResult = await categoriesResponse.json();
        setData(dataResult.data || []);
        setCategories(categoriesResult.data || []);
        setIsAuthenticated(true);
      } else {
        const errorData = await dataResponse.json();
        setError(errorData.message || 'Invalid access code');
        setIsAuthenticated(false);
      }
    } catch (err) {
      setError('Không thể kết nối đến máy chủ');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAccessCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim()) {
      handleAuthentication(accessCode.trim());
    }
  };

  const fetchData = async (categoryId?: string, isFilter: boolean = false) => {
    if (!accessCode) return;

    if (isFilter) {
      setFilterLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const categoryParam = categoryId ? `&category_id=${encodeURIComponent(categoryId)}` : '';
      const response = await fetch(`/api/admin/herbal-medicine?access_code=${encodeURIComponent(accessCode)}${categoryParam}`);
      if (response.ok) {
        const result = await response.json();
        setData(result.data || []);
      } else {
        setError('Không thể tải dữ liệu');
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

  const handleCategoryFilter = async (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    await fetchData(categoryId || undefined, true);
  };

  const handleSave = async (item: Acupoints) => {
    if (!accessCode) return;

    setLoading(true);
    try {
      const url = item.id
        ? `/api/admin/herbal-medicine/${item.id}?access_code=${encodeURIComponent(accessCode)}`
        : `/api/admin/herbal-medicine?access_code=${encodeURIComponent(accessCode)}`;

      const method = item.id ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item),
      });

      if (response.ok) {
        await fetchData();
        setEditingItem(null);
        setShowAddForm(false);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Không thể lưu huyệt');
      }
    } catch (err) {
      setError('Không thể lưu huyệt');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeletingItemId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!accessCode || !deletingItemId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/herbal-medicine/${deletingItemId}?access_code=${encodeURIComponent(accessCode)}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
        setDeletingItemId(null);
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Không thể xóa huyệt');
      }
    } catch (err) {
      setError('Không thể xóa huyệt');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingItemId(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-center mb-6">Truy cập Quản trị</h1>

          <form onSubmit={handleSubmitAccessCode} className="space-y-4">
            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-2">
                Mã truy cập
              </label>
              <input
                type="password"
                id="accessCode"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nhập mã truy cập quản trị"
                required
              />
            </div>
            
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Đang xác thực...' : 'Truy cập 8 Kỳ Kinh'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">8 Kỳ Kinh</h1>

          {/* Navigation Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setCurrentView('herbal-medicine')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'herbal-medicine'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Danh sách các huyệt
              </button>
              <button
                onClick={() => setCurrentView('categories')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  currentView === 'categories'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Kỳ Kinh
              </button>
            </nav>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Conditional Content Based on Current View */}
        {currentView === 'categories' ? (
          <CategoryManagement accessCode={accessCode} />
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
              >
                Thêm huyệt mới
              </button>
            </div>

            {/* Category Filter */}
            <div className="mb-4">
              <label htmlFor="categoryFilter" className="block text-sm font-medium text-gray-700 mb-2">
                Kỳ Kinh
              </label>
              <select
                id="categoryFilter"
                value={selectedCategoryId}
                onChange={(e) => handleCategoryFilter(e.target.value)}
                className="w-64 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Tất Cả</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white shadow-md rounded-lg overflow-hidden relative">
              {/* Filter Loading Indicator */}
              {filterLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-600">Đang lọc dữ liệu...</span>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto relative">
                <table className="w-full divide-y divide-gray-200" style={{minWidth: '1600px'}}>
                  <thead className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Ký Hiệu
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Danh mục
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Hán
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Pinyin
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Việt
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Mô tả
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Công dụng
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Ghi chú
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200">
                        Hình ảnh
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-gray-200 transition-opacity duration-300 ${filterLoading ? 'opacity-50' : 'opacity-100'}`}>
                {data.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`
                      cursor-pointer transition-colors duration-200 ease-out
                      ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      hover:bg-blue-50 hover:shadow-sm
                      border-b border-gray-200
                    `}
                    onDoubleClick={() => setViewingItem(item)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {categories.find(cat => cat.id === item.category_id)?.name || 'Không xác định'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.chinese_characters || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.pinyin || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '200px', maxWidth: '250px'}}>
                      <div className="break-words">
                        {item.vietnamese_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '300px', maxWidth: '400px'}}>
                      <div className="whitespace-pre-wrap break-words">
                        {item.description || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '300px', maxWidth: '400px'}}>
                      <div className="whitespace-pre-wrap break-words">
                        {item.usage || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500" style={{minWidth: '250px', maxWidth: '350px'}}>
                      <div className="whitespace-pre-wrap break-words">
                        {item.notes || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.image_url ? (
                        <img
                          src={item.image_url.startsWith('http') ? item.image_url : `http://localhost:5001${item.image_url}`}
                          alt={item.vietnamese_name}
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
                        onClick={() => setEditingItem(item)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => item.id && handleDeleteClick(item.id)}
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

            {data.length === 0 && !loading && !filterLoading && (
              <div className="text-center py-8 text-gray-500">
                Không có dữ liệu. Nhấp "Thêm huyệt mới" để bắt đầu.
              </div>
            )}

            {/* Add/Edit Form Modal */}
            {(showAddForm || editingItem) && (
              <ItemFormModal
                item={editingItem}
                categories={categories}
                onSave={handleSave}
                onCancel={() => {
                  setShowAddForm(false);
                  setEditingItem(null);
                }}
              />
            )}

            {/* Detail View Modal */}
            {viewingItem && (
              <AcupointsDetailModal
                item={viewingItem}
                categories={categories}
                onClose={() => setViewingItem(null)}
              />
            )}

            {/* Delete Confirmation Modal */}
            {deletingItemId && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Xác nhận xóa</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Bạn có chắc chắn muốn xóa huyệt này? Hành động này không thể hoàn tác.
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
        )}


      </div>
    </div>
  );
};

// Form Modal Component
interface ItemFormModalProps {
  item: Acupoints | null;
  categories: Vessel[];
  onSave: (item: Acupoints) => void;
  onCancel: () => void;
}

const ItemFormModal: React.FC<ItemFormModalProps> = ({ item, categories, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Acupoints>({
    symbol: item?.symbol || '',
    category_id: item?.category_id || 1,
    chinese_characters: item?.chinese_characters || '',
    pinyin: item?.pinyin || '',
    vietnamese_name: item?.vietnamese_name || '',
    description: item?.description || '',
    usage: item?.usage || '',
    notes: item?.notes || '',
    image_url: item?.image_url || '',
    ...(item?.id && { id: item.id })
  });

  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>(() => {
    const url = item?.image_url || '';
    return url ? (url.startsWith('http') ? url : `http://localhost:5001${url}`) : '';
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (formData.symbol.trim() && formData.vietnamese_name.trim() && formData.category_id > 0) {
      onSave(formData);
    } else {
      setFormError('Vui lòng điền đầy đủ các trường bắt buộc: Ký Hiệu, Tên Việt, và Kỳ Kinh');
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
      } else {
        alert('Không thể tải lên hình ảnh');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Không thể tải lên hình ảnh');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {item ? 'Sửa huyệt' : 'Thêm huyệt mới'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ký Hiệu *
              </label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => handleChange('symbol', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Danh mục *
              </label>
              <select
                value={formData.category_id}
                onChange={(e) => handleChange('category_id', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0}>Chọn danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Việt *
              </label>
              <input
                type="text"
                value={formData.vietnamese_name}
                onChange={(e) => handleChange('vietnamese_name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hán
              </label>
              <input
                type="text"
                value={formData.chinese_characters}
                onChange={(e) => handleChange('chinese_characters', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Pinyin
              </label>
              <input
                type="text"
                value={formData.pinyin}
                onChange={(e) => handleChange('pinyin', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
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
              placeholder="Nhập mô tả chi tiết về huyệt..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Công dụng
            </label>
            <textarea
              value={formData.usage}
              onChange={(e) => handleChange('usage', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập công dụng và cách sử dụng huyệt..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ghi chú
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập ghi chú đặc biệt, lưu ý khi sử dụng..."
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
              {item ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Acupoints Detail Modal Component
interface AcupointsDetailModalProps {
  item: Acupoints;
  categories: Vessel[];
  onClose: () => void;
}

const AcupointsDetailModal: React.FC<AcupointsDetailModalProps> = ({ item, categories, onClose }) => {
  const category = categories.find(cat => cat.id === item.category_id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex">
        {/* Left Section - Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Chi tiết huyệt</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ký hiệu</label>
                <div className="text-lg font-semibold text-gray-900">{item.symbol}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Kỳ Kinh</label>
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {category?.name || 'Không xác định'}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên Việt</label>
                <div className="text-lg font-semibold text-gray-900">{item.vietnamese_name}</div>
              </div>

              {item.chinese_characters && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chữ Hán</label>
                  <div className="text-xl text-gray-900">{item.chinese_characters}</div>
                </div>
              )}

              {item.pinyin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pinyin</label>
                  <div className="text-gray-700">{item.pinyin}</div>
                </div>
              )}
            </div>

            {/* Description */}
            {item.description && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">
                  {item.description}
                </div>
              </div>
            )}

            {/* Usage */}
            {item.usage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Công dụng</label>
                <div className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">
                  {item.usage}
                </div>
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <div className="text-gray-700 whitespace-pre-wrap bg-yellow-50 p-3 rounded-md border-l-4 border-yellow-400">
                  {item.notes}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ngày tạo</label>
                <div className="text-sm text-gray-600">
                  {item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : 'Không xác định'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cập nhật lần cuối</label>
                <div className="text-sm text-gray-600">
                  {item.updated_at ? new Date(item.updated_at).toLocaleString('vi-VN') : 'Không xác định'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
            >
              Đóng
            </button>
          </div>
        </div>

        {/* Right Section - Image */}
        {item.image_url && (
          <div className="w-1/2 bg-gray-50 flex items-center justify-center p-6">
            <img
              src={item.image_url.startsWith('http') ? item.image_url : `http://localhost:5001${item.image_url}`}
              alt={item.vietnamese_name}
              className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            />
          </div>
        )}

        {/* Right Section - No Image Placeholder */}
        {!item.image_url && (
          <div className="w-1/2 bg-gray-50 flex items-center justify-center p-6">
            <div className="text-center text-gray-400">
              <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg">Không có hình ảnh</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
