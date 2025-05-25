import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { DefaultEventsMap } from '@socket.io/component-emitter';
import { config } from '../config';
import { decryptApiKey } from '../utils/encryption';
import { UserData } from '../types/chat';

export const useSocket = (userData: UserData | null) => {
  const [socket, setSocket] = useState<Socket<DefaultEventsMap, DefaultEventsMap> | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connectSocket = useCallback((userData: UserData) => {
    if (!userData) return null;

    // First establish connection with just user data and API key if available
    const apiKey = decryptApiKey();
    const headers: Record<string, string> = {
      'X-User-Email': userData.email,
      'X-User-Name': userData.name
    };
    
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    // Configure socket with options that ensure reliable connections
    const newSocket = io(config.server.url, {
      ...config.server.socketOptions,
      extraHeaders: headers,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true
    });

    // Only log connect/disconnect events
    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false);
      
      // Handle potential reconnection
      if (reason === 'io server disconnect') {
        // The server has forcefully disconnected - need to reconnect manually
        newSocket.connect();
      }
      // Otherwise, the socket will try to reconnect automatically
    });

    newSocket.on('reconnect', () => {
      setIsConnected(true);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return newSocket;
  }, []);

  // Socket connection effect - when userData changes
  useEffect(() => {
    let currentSocket: Socket<DefaultEventsMap, DefaultEventsMap> | null = null;

    if (userData) {
      currentSocket = connectSocket(userData);
      if (currentSocket) {
        setSocket(currentSocket);
      }
    }

    return () => {
      if (currentSocket) {
        currentSocket.disconnect();
      }
    };
  }, [userData, connectSocket]);

  // Function to disconnect and cleanup
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [socket]);

  return {
    socket,
    isConnected,
    connectSocket,
    disconnect
  };
}; 