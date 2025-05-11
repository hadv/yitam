import { useEffect, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

interface UserData {
  email: string;
  name: string;
  picture: string;
}

export const Auth = () => {
  const [user, setUser] = useState<UserData | null>(null);

  const handleSuccess = (credentialResponse: any) => {
    const decoded = jwtDecode(credentialResponse.credential) as UserData;
    setUser(decoded);
    // Here you can also send the user data to your backend
  };

  const handleError = () => {
    console.error('Login Failed');
  };

  if (user) {
    return (
      <div className="fixed top-4 right-4 flex items-center bg-white rounded-full shadow-lg p-2 space-x-3">
        <img
          src={user.picture}
          alt={user.name}
          className="w-10 h-10 rounded-full border-2 border-indigo-500"
        />
        <div className="pr-4">
          <p className="text-sm font-semibold text-gray-700">{user.name}</p>
          <p className="text-xs text-gray-500">{user.email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h2>
          <p className="text-gray-600">Sign in to continue to Yitam</p>
        </div>
        
        <div className="space-y-4">
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={handleError}
              useOneTap
              theme="filled_black"
              shape="pill"
              size="large"
              text="continue_with"
              locale="en"
            />
          </div>
          
          <div className="text-center mt-6">
            <p className="text-sm text-gray-500">
              By continuing, you agree to our{' '}
              <a href="#" className="text-indigo-600 hover:text-indigo-500">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="#" className="text-indigo-600 hover:text-indigo-500">
                Privacy Policy
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}; 