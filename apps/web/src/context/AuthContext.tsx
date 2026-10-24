import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserDto, UserRole } from '@goldenhour/contracts';
import { apiClient, ApiError } from '../lib/api-client';

interface AuthContextType {
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchUser: (roleKey: 'paramedic' | 'stjude' | 'bayview' | 'admin') => Promise<void>;
}

const DEMO_CREDENTIALS = {
  paramedic: { email: 'paramedic@goldenhour.test', password: 'demo123' },
  stjude: { email: 'stjude_admin@goldenhour.test', password: 'demo123' },
  bayview: { email: 'bayview_admin@goldenhour.test', password: 'demo123' },
  admin: { email: 'admin@goldenhour.test', password: 'demo123' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMe();
      setUser(res.user);
      setError(null);
    } catch {
      // Not logged in yet
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (email: string, password = 'demo123') => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.login({ email, password });
      setUser(res.user);
    } catch (err: any) {
      setError(err?.message || 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await apiClient.logout();
      setUser(null);
    } catch (err: any) {
      setError(err?.message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const switchUser = async (roleKey: 'paramedic' | 'stjude' | 'bayview' | 'admin') => {
    const creds = DEMO_CREDENTIALS[roleKey];
    if (creds) {
      await login(creds.email, creds.password);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, switchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
