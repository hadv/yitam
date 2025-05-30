import { useState, useCallback, useEffect } from 'react';
import { UserData } from '../types/chat';

export const useAuth = () => {
  // User state
  const [user, setUser] = useState<UserData | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Auth success handler
  const handleAuthSuccess = useCallback((userData: UserData) => {
    // Store user data
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  // Logout handler
  const handleLogout = useCallback(() => {
    // Clear user data
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    handleAuthSuccess,
    handleLogout
  };
};

export default useAuth; 