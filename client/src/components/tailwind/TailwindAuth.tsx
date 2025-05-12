import { useCallback, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import TailwindStaticTermsModal from './TailwindStaticTermsModal';

interface UserData {
  email: string;
  name: string;
  picture: string;
}

interface TailwindAuthProps {
  onAuthSuccess: (userData: UserData) => void;
}

export const TailwindAuth = ({ onAuthSuccess }: TailwindAuthProps) => {
  const [showLegalModal, setShowLegalModal] = useState(false);

  const handleSuccess = useCallback((credentialResponse: any) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential) as any;
      
      // Validate required fields
      if (!decoded.email || !decoded.name || !decoded.picture) {
        throw new Error('Missing required user data from Google response');
      }
      
      const userData: UserData = {
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture
      };
      
      onAuthSuccess(userData);
    } catch (error) {
      console.error('Error processing Google credentials:', error);
    }
  }, [onAuthSuccess]);

  const handleError = useCallback(() => {
    console.error('Google login failed');
  }, []);

  const openLegalModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowLegalModal(true);
  };

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-[#FDFBF6] bg-opacity-95 backdrop-blur-sm z-50">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 transform transition-all border border-[#E6DFD1]">
          <div className="text-center mb-8">
            <img 
              src="/img/yitam-logo.png" 
              alt="Yitam Logo" 
              className="h-20 mx-auto mb-6"
            />
            <h2 className="text-2xl font-bold text-[#5D4A38] mb-2">Chào mừng bạn đến với Yitam</h2>
            <p className="text-[#3A2E22] opacity-80">Đăng nhập để tiếp tục trò chuyện</p>
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
                locale="vi"
              />
            </div>
            
            <div className="text-center mt-6">
              <p className="text-sm text-[#3A2E22] opacity-70">
                Bằng cách tiếp tục, bạn đồng ý với{' '}
                <a href="#" onClick={openLegalModal} className="text-[#78A161] hover:text-[#5D8A46]">
                  Điều khoản và Điều kiện pháp lý
                </a>{' '}
                của chúng tôi
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Legal Documents Modal */}
      <TailwindStaticTermsModal
        isOpen={showLegalModal}
        onClose={() => setShowLegalModal(false)}
        initialDocument={null}
      />
    </>
  );
}; 