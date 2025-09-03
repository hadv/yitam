import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    if (isVisible) {
      const recentLogs = logger.getRecentLogs(100);
      setLogs(recentLogs);
    }
  }, [isVisible]);

  const refreshLogs = () => {
    const recentLogs = logger.getRecentLogs(100);
    setLogs(recentLogs);
  };

  const clearLogs = () => {
    logger.clearLogs();
    setLogs([]);
  };

  const exportLogs = () => {
    const logsJson = logger.exportLogs();
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yitam-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredLogs = logs.filter(log => 
    filter === '' || 
    log.level.toLowerCase().includes(filter.toLowerCase()) ||
    log.message.toLowerCase().includes(filter.toLowerCase())
  );

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-red-600';
      case 'WARN': return 'text-yellow-600';
      case 'INFO': return 'text-blue-600';
      case 'DEBUG': return 'text-gray-600';
      default: return 'text-gray-800';
    }
  };

  // Show/hide with Ctrl+Shift+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setIsVisible(!isVisible);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-gray-800 text-white px-3 py-1 rounded text-xs hover:bg-gray-700"
          title="Show Debug Logs (Ctrl+Shift+L)"
        >
          Debug
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-5/6 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Debug Logs</h2>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Filter logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-1 border rounded text-sm"
            />
            <button
              onClick={refreshLogs}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              Refresh
            </button>
            <button
              onClick={clearLogs}
              className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
            >
              Clear
            </button>
            <button
              onClick={exportLogs}
              className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
            >
              Export
            </button>
            <button
              onClick={() => setIsVisible(false)}
              className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-4">
          <div className="space-y-2">
            {filteredLogs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No logs found {filter && `matching "${filter}"`}
              </div>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className="border-l-4 border-gray-200 pl-4 py-2">
                  <div className="flex items-center space-x-2 text-sm">
                    <span className="text-gray-500 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={`font-semibold ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                  </div>
                  <div className="text-sm mt-1">{log.message}</div>
                  {log.data && (
                    <details className="mt-2">
                      <summary className="text-xs text-gray-500 cursor-pointer">
                        Show data
                      </summary>
                      <pre className="text-xs bg-gray-100 p-2 rounded mt-1 overflow-auto">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="p-4 border-t text-xs text-gray-500">
          Showing {filteredLogs.length} of {logs.length} logs. Press Ctrl+Shift+L to toggle.
        </div>
      </div>
    </div>
  );
};

export default LogViewer;
