"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface User {
  id: number;
  email: string;
  merchantId: number;
  merchantName: string;
  role: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface AuthContextType extends AuthState {
  login: (credentials: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  register: (data: { email: string; password: string; merchantName: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  checkAuth: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const router = useRouter();

  // Check if user is authenticated by calling /auth/me
  const checkAuth = useCallback(async (): Promise<boolean> => {
    console.log("Checking authentication status...");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        credentials: 'include'
      });
      console.log("Response from /auth/me:", response);

      if (response.ok) {
        const userData = await response.json();
        setAuthState({
          user: userData.user,
          isLoading: false,
          isAuthenticated: true,
        });
        return true;
      } else {
        // If /auth/me fails, we'll handle refresh separately to avoid circular dependency
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return false;
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  }, []);

  // Refresh access token using refresh token
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        // Token refreshed successfully, now check auth
        return await checkAuth();
      } else {
        // Refresh failed, user needs to log in again
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false,
        });
        return false;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  }, [checkAuth]);

  // Login function
  const login = useCallback(async (credentials: { email: string; password: string }) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (response.ok) {
        setAuthState({
          user: data.user,
          isLoading: false,
          isAuthenticated: true,
        });
        // Debug: Output cookies after login
        if (typeof window !== 'undefined') {
          console.log('Cookies after login:', document.cookie);
        }
        return { success: true };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return { 
          success: false, 
          error: data.message || 'Login failed' 
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return { 
        success: false, 
        error: 'Network error. Please try again.' 
      };
    }
  }, []);

  // Register function
  const register = useCallback(async (data: { email: string; password: string; merchantName: string }) => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      const responseData = await response.json();

      if (response.ok) {
        setAuthState({
          user: responseData.user,
          isLoading: false,
          isAuthenticated: true,
        });
        return { success: true };
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return { 
          success: false, 
          error: responseData.message || 'Registration failed' 
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      return { 
        success: false, 
        error: 'Network error. Please try again.' 
      };
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear frontend cookies for localhost:3000 (defensive)
      if (typeof document !== 'undefined') {
        document.cookie = 'access_token=; Max-Age=0; path=/';
        document.cookie = 'refresh_token=; Max-Age=0; path=/';
      }
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      router.push('/auth');
    }
  }, [router]);

  // Initial auth check that tries refresh if needed
  const initialAuthCheck = useCallback(async (): Promise<boolean> => {
    console.log("Performing initial authentication check... - 227");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        credentials: 'include'
        
      });
        console.log("Response from initial /auth/me:", response);

      if (response.ok) {
        const userData = await response.json();
        setAuthState({
          user: userData.user,
          isLoading: false,
          isAuthenticated: true,
        });
        return true;
      } else {
        // Try to refresh token
        const refreshed = await refreshAuth();
        return refreshed;
      }
    } catch (error) {
      console.error('Initial auth check failed:', error);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
      });
      return false;
    }
  }, [refreshAuth]);

  // Check authentication on mount and set up periodic refresh
  useEffect(() => {
    let mounted = true;
    let refreshInterval: NodeJS.Timeout;

    const initAuth = async () => {
      if (mounted) {
        await initialAuthCheck();
      }
    };

    initAuth();

    // Set up automatic token refresh every 14 minutes (access tokens expire in 15 minutes)
    if (authState.isAuthenticated) {
      refreshInterval = setInterval(async () => {
        if (mounted && authState.isAuthenticated) {
          await refreshAuth();
        }
      }, 14 * 60 * 1000); // 14 minutes
    }

    return () => {
      mounted = false;
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [initialAuthCheck, refreshAuth, authState.isAuthenticated]);

  // Handle focus events to check auth when user returns to tab
  useEffect(() => {
    const handleFocus = () => {
      if (authState.isAuthenticated) {
        checkAuth();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [authState.isAuthenticated, checkAuth]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      if (authState.isAuthenticated) {
        checkAuth();
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [authState.isAuthenticated, checkAuth]);

  const contextValue: AuthContextType = {
    ...authState,
    login,
    register,
    logout,
    refreshAuth,
    checkAuth,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook for redirecting unauthenticated users
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
}

// Hook for redirecting authenticated users away from auth pages
export function useRedirectIfAuthenticated() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  return { isAuthenticated, isLoading };
}