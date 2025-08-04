export const config = {
  server: {
    url: import.meta.env.VITE_SERVER_URL || 'http://localhost:5001',
    socketOptions: {
      withCredentials: true,
      transports: ['polling', 'websocket']
    }
  },
  client: {
    url: import.meta.env.VITE_CLIENT_URL || window.location.origin
  }
};