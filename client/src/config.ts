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
  },
  model: {
    // Recorded on locally stored topics and messages. This is display metadata
    // for IndexedDB records only — the server decides which model actually
    // serves a request (ANTHROPIC_MODEL, see server/src/config.ts), so keep
    // this in step with the server default when that changes.
    default: 'claude-sonnet-5'
  }
};