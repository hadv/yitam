import { useState } from 'react';

interface AccessCodeInputProps {
  onAccessGranted: (accessCode: string) => void;
}

const AccessCodeInput = ({ onAccessGranted }: AccessCodeInputProps) => {
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      setError('Please enter an access code');
      return;
    }
    onAccessGranted(accessCode);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded-lg shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Enter Access Code</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value);
                setError('');
              }}
              placeholder="Enter your access code"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Submit
          </button>
        </form>
      </div>
    </div>
  );
};

export default AccessCodeInput; 