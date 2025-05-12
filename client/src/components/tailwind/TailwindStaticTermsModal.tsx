import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { TERMS_CONTENT, PRIVACY_CONTENT } from './LegalContent';

interface StaticTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDocument?: 'terms' | 'privacy' | null;
}

interface LegalDocument {
  title: string;
  type: 'terms' | 'privacy';
  content: string;
  lastUpdated: string;
}

// Format current date as DD/MM/YYYY
const getCurrentDate = () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function TailwindStaticTermsModal({ 
  isOpen, 
  onClose,
  initialDocument = null 
}: StaticTermsModalProps) {
  const [activeDocument, setActiveDocument] = useState<string | null>(initialDocument);
  const currentDate = getCurrentDate();
  
  const documents: Record<string, LegalDocument> = {
    terms: {
      title: 'Điều khoản và Điều kiện',
      type: 'terms',
      content: TERMS_CONTENT,
      lastUpdated: currentDate
    },
    privacy: {
      title: 'Chính sách Bảo mật',
      type: 'privacy',
      content: PRIVACY_CONTENT,
      lastUpdated: currentDate
    }
  };

  const openDocument = (docType: string) => {
    setActiveDocument(docType);
  };

  const closeDocument = () => {
    setActiveDocument(null);
  };

  const handleClose = () => {
    setActiveDocument(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      {activeDocument ? (
        // Document viewer
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          <div className="bg-[#F5EFE0] px-8 py-4 rounded-t-lg border-b border-[#E6DFD1] flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-[#3A2E22]">
                {documents[activeDocument].title}
              </h2>
              <p className="text-xs text-[#5D4A38] mt-1">
                Cập nhật lần cuối: {documents[activeDocument].lastUpdated}
              </p>
            </div>
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
        // Main document selection
        <div className="bg-white rounded-lg shadow-xl max-w-xl w-full flex flex-col">
          <div className="bg-[#F5EFE0] px-8 py-6 rounded-t-lg border-b border-[#E6DFD1]">
            <h2 className="text-2xl font-semibold text-[#3A2E22]">Tài liệu pháp lý</h2>
            <p className="text-[#5D4A38] mt-3">
              Vui lòng chọn tài liệu bạn muốn xem
            </p>
          </div>
          
          <div className="px-8 py-6">
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
          
          <div className="border-t border-[#E6DFD1] p-6 bg-[#F5EFE0] rounded-b-lg flex justify-end">
            <button
              onClick={handleClose}
              className="px-6 py-2.5 bg-[#78A161] text-white rounded-lg transition-all font-medium text-base shadow-sm hover:bg-[#6a8f54] hover:shadow-md"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 