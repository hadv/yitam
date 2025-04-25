import { useState } from 'react';

interface AccessCodeInputProps {
  onAccessGranted: (accessCode: string) => void;
  error?: string;
}

const TailwindAccessCodeInput = ({ onAccessGranted, error: propError }: AccessCodeInputProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [localError, setLocalError] = useState('');

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
                  error ? 'border-[#BC4749]' : 'border-[#E6DFD1]'
                } bg-white text-[#3A2E22] focus:outline-none focus:ring-2 focus:ring-[#78A161] focus:border-[#78A161] transition-colors duration-200`}
                placeholder="Nhập mã truy cập của bạn"
              />
            </div>

            {error && (
              <div className="text-[0.75rem] text-[#BC4749] bg-[rgba(188,71,73,0.1)] px-3 py-2 rounded-lg text-center">
                {error}
              </div>
            )}

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