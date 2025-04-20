import React, { useMemo, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';

// Interface matching the server-side definition
interface SampleQuestion {
  title: string;
  question: string;
}

interface SampleQuestionsProps {
  onQuestionClick: (question: string) => void;
  socket: Socket | null;
  limit?: number;
}

const TailwindSampleQuestions: React.FC<SampleQuestionsProps> = ({ 
  onQuestionClick, 
  socket, 
  limit = 6 
}) => {
  const [sampleQuestions, setSampleQuestions] = useState<SampleQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (socket) {
      // Request sample questions from server with limit
      socket.emit('get-sample-questions', limit);
      
      // Listen for sample questions from server
      socket.on('sample-questions', (data: SampleQuestion[]) => {
        console.log(`Received ${data.length} sample questions`);
        setSampleQuestions(data);
        setLoading(false);
      });
    }
    
    // Cleanup listener on unmount
    return () => {
      if (socket) {
        socket.off('sample-questions');
      }
    };
  }, [socket, limit]);

  // No need for client-side randomization anymore since server handles it
  const displayQuestions = useMemo(() => {
    return sampleQuestions;
  }, [sampleQuestions]);

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4 text-center">
        <h2 className="text-lg text-[#5D4A38] font-medium mb-4">Đang tải câu hỏi mẫu...</h2>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <h2 className="text-lg text-[#5D4A38] font-medium mb-4 text-center">Câu hỏi mẫu</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {displayQuestions.map((item, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onQuestionClick(item.question);
            }}
            className="p-4 bg-white border border-[#E6DFD1] rounded-lg shadow-sm hover:shadow-md transition-all hover:scale-[1.02] text-left"
          >
            <h3 className="text-[#78A161] font-medium mb-2">{item.title}</h3>
            <p className="text-sm text-[#5D4A38]">{item.question}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default TailwindSampleQuestions; 