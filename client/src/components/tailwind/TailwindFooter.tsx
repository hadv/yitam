import React from 'react';

interface TailwindFooterProps {
  isConnected: boolean;
  hasMessages: boolean;
  isBotResponding: boolean;
  onStartNewChat: () => void;
}

const TailwindFooter: React.FC<TailwindFooterProps> = ({
  isConnected,
  hasMessages,
  isBotResponding,
  onStartNewChat
}) => {
  return (
    <footer className="bg-[#F5EFE0] mt-2 py-2 px-3 flex flex-col border-t border-[#E6DFD1] rounded shadow-[0_-1px_1px_rgba(0,0,0,0.05)] min-h-[45px]">
      <div className="flex justify-between items-center">
        <div className="flex items-center flex-1">
          <div className={`text-sm font-medium px-2 py-1 rounded ${
            isConnected 
              ? 'bg-[rgba(120,161,97,0.2)] text-[#78A161]' 
              : 'bg-[rgba(188,71,73,0.2)] text-[#BC4749]'
          }`}>
            {isConnected ? 'Sẵn sàng' : 'Ngoại tuyến'}
          </div>
          
          {/* New Chat button */}
          {hasMessages ? (
            <button
              onClick={onStartNewChat}
              disabled={isBotResponding}
              className={`ml-3 flex items-center text-sm font-medium py-1.5 px-3 rounded-md transition-all duration-200 ${
                isBotResponding 
                  ? 'bg-[#E6DFD1] text-[#9E9689] cursor-not-allowed opacity-80' 
                  : 'bg-[#78A161] text-white hover:bg-[#5D8A46] shadow-sm hover:shadow'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Cuộc trò chuyện mới
            </button>
          ) : (
            <div className="ml-3 py-1.5 px-3 invisible">Placeholder</div>
          )}
        </div>
        
        <a 
          href="https://github.com/sponsors/hadv" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex items-center text-sm font-medium text-[#78A161] bg-[rgba(120,161,97,0.1)] hover:bg-[rgba(120,161,97,0.2)] px-2 py-1 rounded transition-all hover:scale-105 ml-2"
        >
          <span className="text-[#BC4749] mr-1.5 text-base">♥</span>
          <span className="leading-none">Hỗ trợ dự án</span>
        </a>
      </div>
      <div className="text-right text-xs text-[#5D4A38] opacity-70 mt-2">
        © {new Date().getFullYear()} Toàn bộ bản quyền thuộc Yitam
      </div>
    </footer>
  );
};

export default TailwindFooter; 