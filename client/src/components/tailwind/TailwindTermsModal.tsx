import { useEffect, useState, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { useConsent } from '../../contexts/ConsentContext';
import ReactMarkdown from 'react-markdown';

interface TermsModalProps {
  socket: Socket | null;
}

export default function TailwindTermsModal({ socket }: TermsModalProps) {
  const { hasAcceptedTerms, setHasAcceptedTerms } = useConsent();
  const [terms, setTerms] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasReadToBottom, setHasReadToBottom] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Handle scroll event to detect when user reaches bottom
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const element = e.target as HTMLDivElement;
    const scrolledToBottom = 
      Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 30;

    console.log('Scroll detected:', {
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      difference: element.scrollHeight - element.scrollTop - element.clientHeight,
      scrolledToBottom
    });

    if (scrolledToBottom && !hasReadToBottom) {
      console.log('User has scrolled to bottom');
      setHasReadToBottom(true);
    }
  };

  useEffect(() => {
    if (!socket) {
      console.log('Socket not available yet');
      return;
    }

    if (hasAcceptedTerms) {
      console.log('Terms already accepted');
      return;
    }

    console.log('Setting up terms listener');
    const handleTermsResponse = (response: { success: boolean; data?: any; error?: string }) => {
      console.log('Received terms response:', response);
      setIsLoading(false);
      if (response.success && response.data) {
        setTerms(response.data.content);
      } else {
        setError(response.error || 'Failed to load terms');
      }
    };

    socket.on('legal-document', handleTermsResponse);
    console.log('Requesting terms document');
    socket.emit('get-legal-document', 'terms');

    return () => {
      console.log('Cleaning up terms listener');
      socket.off('legal-document', handleTermsResponse);
    };
  }, [socket, hasAcceptedTerms]);

  // Force show modal if not accepted
  if (hasAcceptedTerms) {
    console.log('Terms accepted, not showing modal');
    return null;
  }

  console.log('Rendering terms modal. Loading:', isLoading, 'Error:', error);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="bg-[#F5EFE0] px-8 py-4 rounded-t-lg border-b border-[#E6DFD1]">
          <h2 className="text-xl font-semibold text-[#3A2E22]">Điều khoản và Điều kiện</h2>
          <p className="text-sm text-[#5D4A38] mt-1">
            {!hasReadToBottom && "Vui lòng cuộn xuống để đọc hết điều khoản"}
          </p>
        </div>
        <div 
          ref={contentRef}
          onScroll={handleScroll}
          className="px-8 py-6 flex-1 overflow-y-auto scroll-smooth"
        >
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#78A161]"></div>
            </div>
          ) : error ? (
            <div className="text-red-600 text-center p-4 bg-red-50 rounded-lg">
              {error}
            </div>
          ) : (
            <div className="prose prose-lg max-w-none prose-headings:text-[#3A2E22] prose-headings:font-semibold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-p:text-[#5D4A38] prose-p:leading-relaxed prose-li:text-[#5D4A38] prose-strong:text-[#3A2E22] prose-strong:font-semibold">
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 className="mb-8 pb-2 border-b border-[#E6DFD1]" {...props} />,
                  h2: ({node, ...props}) => <h2 className="mt-8 mb-4 text-[#3A2E22]" {...props} />,
                  h3: ({node, ...props}) => <h3 className="mt-6 mb-3 text-[#5D4A38]" {...props} />,
                  ul: ({node, ...props}) => <ul className="my-4 list-disc list-inside" {...props} />,
                  li: ({node, ...props}) => <li className="ml-4 mb-2" {...props} />,
                  p: ({node, ...props}) => <p className="my-4 leading-relaxed" {...props} />,
                }}
              >
                {terms}
              </ReactMarkdown>
              {/* Spacer to ensure content is scrollable */}
              <div className="h-10" />
            </div>
          )}
        </div>
        <div className="border-t border-[#E6DFD1] p-6 bg-[#F5EFE0] rounded-b-lg flex justify-between items-center">
          <p className="text-sm text-[#5D4A38] italic">
            {hasReadToBottom 
              ? "Bằng cách nhấn 'Đồng ý', bạn xác nhận đã đọc và chấp nhận các điều khoản."
              : "Vui lòng cuộn xuống để đọc hết điều khoản để có thể tiếp tục."}
          </p>
          <button
            onClick={() => {
              console.log('Accepting terms');
              setHasAcceptedTerms(true);
            }}
            className={`px-6 py-2.5 text-white rounded-lg transition-all font-medium text-base shadow-sm 
              ${hasReadToBottom 
                ? 'bg-[#78A161] hover:bg-[#6a8f54] hover:shadow-md' 
                : 'bg-gray-400 cursor-not-allowed'}`}
            disabled={isLoading || !!error || !hasReadToBottom}
          >
            Đồng ý
          </button>
        </div>
      </div>
    </div>
  );
} 