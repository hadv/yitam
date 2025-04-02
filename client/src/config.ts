export const config = {
  server: {
    url: import.meta.env.VITE_SERVER_URL || 'http://localhost:5001',
    socketOptions: {
      withCredentials: true,
      transports: ['polling', 'websocket']
    }
  }
}; 