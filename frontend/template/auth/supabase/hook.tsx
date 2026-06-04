// @ts-nocheck

import { AuthContextType, SendOTPResult, AuthResult, LogoutResult, SignUpResult, GoogleSignInResult } from '../types';
import { authService } from './service';
import { configManager } from '../../core/config';
import { useAuthContext } from './context';

export function useAuth(): AuthContextType {
  const context = useAuthContext();
  
  const isAuthEnabled = configManager.isModuleEnabled('auth');
  if (!isAuthEnabled) {
    return {
      user: null,
      loading: false,
      operationLoading: false,
      initialized: true,
      setOperationLoading: () => {},
      sendOTP: async (): Promise<SendOTPResult> => ({ 
        error: 'Auth function not enabled, please check configuration' 
      }),
      verifyOTPAndLogin: async (): Promise<AuthResult> => ({ 
        error: 'Auth function not enabled, please check configuration', 
        user: null 
      }),
      signUpWithPassword: async (): Promise<SignUpResult> => ({ 
        error: 'Auth function not enabled, please check configuration', 
        user: null 
      }),
      signInWithPassword: async (): Promise<AuthResult> => ({ 
        error: 'Auth function not enabled, please check configuration', 
        user: null 
      }),
      signInWithGoogle: async (): Promise<GoogleSignInResult> => ({ 
        error: 'Auth function not enabled, please check configuration'
      }),
      logout: async (): Promise<LogoutResult> => {
        console.warn('Auth function not enabled');
        return { 
          error: 'Auth function not enabled, please check configuration' 
        };
      },
      refreshSession: async () => {
        console.warn('Auth function not enabled');
      },
    };
  }

  const sendOTP = async (email: string): Promise<SendOTPResult> => {
    context.setOperationLoading(true);
    try {
      const result = await authService.sendOTP(email);
      return result;
    } catch (error) {
      console.warn('[Template:useAuth] sendOTP exception:', error);
      return { 
        error: 'Failed to send verification code' 
      };
    } finally {
      context.setOperationLoading(false);
    }
  };

    const verifyOTPAndLogin = async (email: string, otp: string, options?: { password?: string }): Promise<AuthResult> => {
    context.setOperationLoading(true);
    try {
      const result = await authService.verifyOTPAndLogin(email, otp, options);
      return result;
    } catch (error) {
      console.warn('[Template:useAuth] verifyOTPAndLogin exception:', error);
      return { 
        error: 'Login failed',
        user: null 
      };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const signUpWithPassword = async (email: string, password: string, metadata?: Record<string, any>): Promise<SignUpResult> => {
    context.setOperationLoading(true);
    try {
      const result = await authService.signUpWithPassword(email, password, metadata);
      return result;
    } catch (error) {
      console.warn('[Template:useAuth] signUpWithPassword exception:', error);
      return { 
        error: 'Registration failed',
        user: null 
      };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const signInWithPassword = async (email: string, password: string): Promise<AuthResult> => {
    context.setOperationLoading(true);
    try {
      const result = await authService.signInWithPassword(email, password);
      return result;
    } catch (error) {
      console.warn('[Template:useAuth] signInWithPassword exception:', error);
      return { 
        error: 'Login failed',
        user: null 
      };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const logout = async (): Promise<LogoutResult> => {
    context.setOperationLoading(true);
    try {
      // ── God-session aware logout ──
      // If we're inside a God session, clear it locally; never call Supabase
      // (the god identity doesn't exist on the auth server).
      try {
        const { getGodSession, setGodSession } = await import('../../../services/godUser');
        const godUser = await getGodSession();
        if (godUser) {
          await setGodSession(false);
          if (typeof window !== 'undefined' && (window as any).location) {
            (window as any).location.href = '/login';
          }
          return { error: undefined } as LogoutResult;
        }
      } catch { /* fall through to regular logout */ }

      const result = await authService.logout();
      
      if (!result) {
        console.warn('[Template:useAuth] Invalid logout result format:', result);
        return { error: 'Invalid logout response' };
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown logout error';
      console.warn('[Template:useAuth] Logout hook exception:', errorMessage);
      return { error: errorMessage };
    } finally {
      context.setOperationLoading(false);
    }
  };

  const refreshSession = async () => {
    try {
      await authService.refreshSession();
    } catch (error) {
      console.warn('[Template:useAuth] Refresh session error:', error);
    }
  };

  const signInWithGoogle = async (): Promise<GoogleSignInResult> => {
    context.setOperationLoading(true);
    try {
      const result = await authService.signInWithGoogle();
      return result;
    } catch (error) {
      console.warn('[Template:useAuth] signInWithGoogle exception:', error);
      return { 
        error: 'Google login failed'
      };
    } finally {
      context.setOperationLoading(false);
    }
  };

  return {
    user: context.user,
    loading: context.loading,
    operationLoading: context.operationLoading,
    initialized: context.initialized,
    setOperationLoading: context.setOperationLoading,
    sendOTP,
    verifyOTPAndLogin,
    signUpWithPassword,
    signInWithPassword,
    signInWithGoogle,
    logout,
    refreshSession,
  };
}
