import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useConsent } from '../../contexts/ConsentContext';
import ReactMarkdown from 'react-markdown';

interface TermsModalProps {
  socket: Socket | null;
}

interface LegalDocument {
  title: string;
  type: 'terms' | 'privacy';
  isLoading: boolean;
  content: string;
  error: string | null;
}

export default function TailwindTermsModal({ socket }: TermsModalProps) {
  const { hasAcceptedTerms, setHasAcceptedTerms } = useConsent();
  const [activeDocument, setActiveDocument] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<string, LegalDocument>>({
    terms: {
      title: 'Điều khoản và Điều kiện',
      type: 'terms',
      isLoading: true,
      content: '',
      error: null
    },
    privacy: {
      title: 'Chính sách Bảo mật',
      type: 'privacy',
      isLoading: true,
      content: '',
      error: null
    }
  });

  useEffect(() => {
    if (!socket || hasAcceptedTerms) return;

    const handleDocumentResponse = (docType: 'terms' | 'privacy') => (
      (response: { success: boolean; data?: any; error?: string }) => {
        console.log(`Received ${docType} response:`, response);
        
        setDocuments(prev => ({
          ...prev,
          [docType]: {
            ...prev[docType],
            isLoading: false,
            content: response.success && response.data ? response.data.content : '',
            error: response.success ? null : (response.error || `Failed to load ${docType}`)
          }
        }));
      }
    );

    // Set up event listeners for both document types
    const termsHandler = handleDocumentResponse('terms');
    const privacyHandler = handleDocumentResponse('privacy');
    
    socket.on('legal-document', (response) => {
      // We need to determine which document this response is for
      // This could be improved by adding document type to the response from server
      if (response.documentType === 'terms') {
        termsHandler(response);
      } else if (response.documentType === 'privacy') {
        privacyHandler(response);
      }
    });
    
    // Request both documents
    socket.emit('get-legal-document', 'terms');
    socket.emit('get-legal-document', 'privacy');

    return () => {
      socket.off('legal-document');
    };
  }, [socket, hasAcceptedTerms]);

  const openDocument = (docType: string) => {
    setActiveDocument(docType);
  };

  const closeDocument = () => {
    setActiveDocument(null);
  };

  // Force show modal if not accepted
  if (hasAcceptedTerms) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      {activeDocument ? (
        // Document viewer
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          <div className="bg-[#F5EFE0] px-8 py-4 rounded-t-lg border-b border-[#E6DFD1] flex justify-between items-center">
            <h2 className="text-xl font-semibold text-[#3A2E22]">
              {documents[activeDocument].title}
            </h2>
            <button 
              onClick={closeDocument}
              className="text-[#5D4A38] hover:text-[#3A2E22] transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="px-8 py-6 flex-1 overflow-y-auto scroll-smooth">
            {documents[activeDocument].isLoading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#78A161]"></div>
              </div>
            ) : documents[activeDocument].error ? (
              <div className="text-red-600 text-center p-4 bg-red-50 rounded-lg">
                {documents[activeDocument].error}
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
                  {documents[activeDocument].content}
                </ReactMarkdown>
              </div>
            )}
          </div>
          <div className="border-t border-[#E6DFD1] p-6 bg-[#F5EFE0] rounded-b-lg flex justify-end">
            <button
              onClick={closeDocument}
              className="px-6 py-2.5 bg-[#78A161] text-white rounded-lg transition-all font-medium text-base shadow-sm hover:bg-[#6a8f54] hover:shadow-md"
            >
              Quay lại
            </button>
          </div>
        </div>
      ) : (
        // Main consent dialog
        <div className="bg-white rounded-lg shadow-xl max-w-xl w-full flex flex-col">
          <div className="bg-[#F5EFE0] px-8 py-6 rounded-t-lg border-b border-[#E6DFD1]">
            <h2 className="text-2xl font-semibold text-[#3A2E22]">Chào mừng đến với Yitam</h2>
            <p className="text-[#5D4A38] mt-3">
              Trước khi bắt đầu, vui lòng đọc và đồng ý với các điều khoản và chính sách của chúng tôi.
            </p>
          </div>
          
          <div className="px-8 py-6">
            <div className="mb-6">
              <p className="text-[#5D4A38] mb-4">
                Việc sử dụng dịch vụ của chúng tôi đồng nghĩa với việc bạn đồng ý với:
              </p>
              
              <div className="space-y-4">
                <div 
                  onClick={() => openDocument('terms')}
                  className="p-4 border border-[#E6DFD1] rounded-lg hover:bg-[#F5EFE0] transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium text-[#3A2E22]">Điều khoản và Điều kiện</h3>
                      <p className="text-sm text-[#5D4A38] mt-1">Các quy định về sử dụng dịch vụ</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#78A161]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                
                <div 
                  onClick={() => openDocument('privacy')}
                  className="p-4 border border-[#E6DFD1] rounded-lg hover:bg-[#F5EFE0] transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium text-[#3A2E22]">Chính sách Bảo mật</h3>
                      <p className="text-sm text-[#5D4A38] mt-1">Cách chúng tôi thu thập và xử lý dữ liệu của bạn</p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#78A161]" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-[#F9F7F2] p-4 rounded-md border border-[#E6DFD1]">
              <p className="text-sm text-[#5D4A38]">
                Bằng cách nhấn "Đồng ý", bạn xác nhận rằng bạn đã đọc và đồng ý với Điều khoản và Điều kiện và Chính sách Bảo mật của chúng tôi.
              </p>
            </div>
          </div>
          
          <div className="border-t border-[#E6DFD1] p-6 bg-[#F5EFE0] rounded-b-lg flex justify-end">
            <button
              onClick={() => {
                console.log('Accepting terms');
                setHasAcceptedTerms(true);
              }}
              className="px-6 py-2.5 bg-[#78A161] text-white rounded-lg transition-all font-medium text-base shadow-sm hover:bg-[#6a8f54] hover:shadow-md"
            >
              Đồng ý
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 