import { useState, useEffect } from 'react';

interface AccessCodeInputProps {
  onAccessGranted: (accessCode: string) => void;
  error?: string;
}

const TailwindAccessCodeInput = ({ onAccessGranted, error: propError }: AccessCodeInputProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [localError, setLocalError] = useState('');
  
  // Clear local error when prop error changes
  useEffect(() => {
    if (propError) {
      // Auto-scroll to error message for better visibility
      setTimeout(() => {
        const errorElement = document.getElementById('access-code-error');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [propError]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      setLocalError('Vui lòng nhập mã truy cập');
      return;
    }
    onAccessGranted(accessCode);
  };

  const error = propError || localError;

  return (
    <div className="h-screen bg-[#FDFBF6] text-[#3A2E22] flex justify-center items-center">
      <div className="w-full max-w-[500px] p-6">
        <div className="bg-[#F5EFE0] rounded-lg shadow-[0_1px_1px_rgba(0,0,0,0.05)] p-8">
          <div className="text-center mb-8">
            <img 
              src="/img/yitam-logo.png" 
              alt="Yitam Logo" 
              className="h-auto w-[200px] mx-auto mb-4"
            />
            <h2 className="text-[1.8rem] text-[#5D4A38] font-semibold mb-2">
              Nhập mã truy cập
            </h2>
            <p className="text-[0.9rem] text-[#5D4A38] opacity-80">
              Vui lòng nhập mã truy cập để tiếp tục
            </p>
          </div>

          {error && (
            <div 
              id="access-code-error"
              className="mb-6 text-[0.85rem] text-[#BC4749] bg-[rgba(188,71,73,0.1)] px-4 py-3 rounded-lg flex items-start"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mr-2 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setLocalError('');
                }}
                className={`w-full px-4 py-3 rounded-lg border ${
                  error ? 'border-[#BC4749] bg-[rgba(188,71,73,0.05)]' : 'border-[#E6DFD1]'
                } bg-white text-[#3A2E22] focus:outline-none focus:ring-2 focus:ring-[#78A161] focus:border-[#78A161] transition-colors duration-200`}
                placeholder="Nhập mã truy cập của bạn"
                aria-invalid={!!error}
                aria-describedby={error ? "access-code-error" : undefined}
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 bg-[#78A161] text-white rounded-lg hover:bg-[#6a8f55] focus:outline-none focus:ring-2 focus:ring-[#78A161] focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center"
            >
              <span className="mr-2">Tiếp tục</span>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[0.75rem] text-[#5D4A38] opacity-60">
              Nếu bạn chưa có mã truy cập, vui lòng liên hệ với chúng tôi
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TailwindAccessCodeInput; 