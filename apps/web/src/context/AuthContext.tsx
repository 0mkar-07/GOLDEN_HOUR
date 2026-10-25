import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserDto, UserRole } from '@goldenhour/contracts';
import { refreshSocketSession } from '../lib/socket';
import { apiClient, ApiError } from '../lib/api-client';

interface AuthContextType {
  user: UserDto | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  accounts: Array<UserDto & { hospitalName?: string | null }>;
  switchUser: (email: string) => Promise<void>;
}

const DEMO_CREDENTIALS = {
  paramedic: { email: 'paramedic@goldenhour.test', password: 'demo123' },
  admin: { email: 'admin@goldenhour.test', password: 'demo123' },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<Array<UserDto & { hospitalName?: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMe();
      setUser(res.user);
      refreshSocketSession(true);
      setError(null);
    } catch {
      // If not authenticated in demo environment, auto-login default paramedic demo user
      try {
        const loginRes = await apiClient.login({
          email: DEMO_CREDENTIALS.paramedic.email,
          password: DEMO_CREDENTIALS.paramedic.password,
        });
        setUser(loginRes.user);
        setError(null);
      } catch {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    apiClient.getDemoAccounts().then((res) => setAccounts(res.accounts)).catch(() => setAccounts([]));
  }, []);

  const login = async (email: string, password = 'demo123') => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.login({ email, password });
      setUser(res.user);
      refreshSocketSession(true);
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
      refreshSocketSession(false);
    } catch (err: any) {
      setError(err?.message || 'Logout failed');
    } finally {
      setLoading(false);
    }
  };

  const switchUser = async (email: string) => {
    if (accounts.some((account) => account.email === email)) await login(email, 'demo123');
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, switchUser, accounts }}>
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
