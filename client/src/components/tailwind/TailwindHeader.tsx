import React from 'react';
import TailwindUserProfile from './TailwindUserProfile';
import { UserData } from '../../types/chat';

interface TailwindHeaderProps {
  user: UserData | null;
  onLogout: () => void;
  onOpenTopicManager: () => void;
  onOpenApiSettings: () => void;
  onOpenDataExportImport: () => void;
  onOpenStorageSettings?: () => void;
  onOpenPrivacyControls?: () => void;
  onOpenPrivacyPolicy?: () => void;
}

const TailwindHeader: React.FC<TailwindHeaderProps> = ({
  user,
  onLogout,
  onOpenTopicManager,
  onOpenApiSettings,
  onOpenDataExportImport,
  onOpenStorageSettings,
  onOpenPrivacyControls,
  onOpenPrivacyPolicy
}) => {
  return (
    <header className="bg-[#F5EFE0] rounded-lg shadow-sm border border-[#E6DFD1]">
      {/* Top section with logo and title */}
      <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 p-3">
        <div className="flex-none w-[140px] md:w-[200px]">
          <img 
            src="/img/yitam-logo.png" 
            alt="Yitam Logo" 
            className="h-auto w-full object-contain"
          />
        </div>
        
        <div className="flex-1 text-center md:text-left">
          <h1 className="text-xl md:text-2xl font-semibold text-[#5D4A38] leading-tight">
            Hỏi đáp về y học cổ truyền
          </h1>
          <p className="text-sm md:text-base text-[#5D4A38] opacity-80">
            Kết nối tri thức y học cổ truyền với công nghệ hiện đại
          </p>
        </div>

        <div className="flex-none">
          {user && (
            <TailwindUserProfile 
              user={user} 
              onLogout={onLogout}
              onOpenTopicManager={onOpenTopicManager}
              onOpenApiSettings={onOpenApiSettings}
              onOpenDataExportImport={onOpenDataExportImport}
              onOpenStorageSettings={onOpenStorageSettings}
              onOpenPrivacyControls={onOpenPrivacyControls}
              onOpenPrivacyPolicy={onOpenPrivacyPolicy}
            />
          )}
        </div>
      </div>

      {/* Mobile menu for API key settings */}
      <div className="md:hidden flex items-center justify-center border-t border-[#E6DFD1] p-2">
        <button
          onClick={onOpenApiSettings}
          className="flex items-center px-3 py-1.5 text-sm text-[#78A161] hover:text-[#5D4A38] hover:bg-[#78A16115] rounded-md transition-all"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Cài đặt API Key
        </button>
        
        {onOpenPrivacyControls && (
          <button
            onClick={onOpenPrivacyControls}
            className="flex items-center ml-2 px-3 py-1.5 text-sm text-[#78A161] hover:text-[#5D4A38] hover:bg-[#78A16115] rounded-md transition-all"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Quyền riêng tư
          </button>
        )}
      </div>
    </header>
  );
};

export default TailwindHeader; 