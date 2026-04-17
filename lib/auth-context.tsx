"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { User as SupabaseUser, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { User } from "./validators";

interface AuthContextType {
  currentUser: SupabaseUser | null;
  userProfile: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  isReady: boolean;
  session: Session | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  // ✅ FIXED FUNCTION
  const fetchUserProfile = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", uid)
        .maybeSingle(); // ✅ no error if no row

      if (error) {
        console.error("[v0] Error fetching user profile:", error);
        setError(error.message);
        return;
      }

      if (!data) {
        // no profile yet (normal)
        setUserProfile(null);
        return;
      }

      setUserProfile(data);
    } catch (err: any) {
      console.error("[v0] Unexpected profile error:", err);
      setError(err.message);
    }
  };

  // ✅ CORRECT useEffect (outside function)
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Check if supabase is available and properly initialized
        if (!supabase || !supabase.auth) {
          console.warn("[v0] Supabase not initialized - env vars missing");
          setLoading(false);
          setIsReady(true);
          return;
        }

        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(currentSession);
        setCurrentUser(currentSession?.user || null);

        if (currentSession?.user) {
          await fetchUserProfile(currentSession.user.id);
        }

        setLoading(false);
        setIsReady(true);
      } catch (err: any) {
        console.error("[v0] Failed to get initial session:", err);

        if (mounted) {
          setError(err.message);
          setLoading(false);
          setIsReady(true);
        }
      }
    };

    initializeAuth();

    // Only set up subscription if supabase is available and initialized
    let subscription: any;
    if (supabase && supabase.auth) {
      const {
        data: { subscription: sub },
      } = supabase.auth.onAuthStateChange(async (event, authSession) => {
        if (!mounted) return;

        console.log("[v0] Auth state changed:", event);

        setSession(authSession);
        setCurrentUser(authSession?.user || null);
        setError(null);

        if (authSession?.user) {
          await fetchUserProfile(authSession.user.id);
        } else {
          setUserProfile(null);
        }

        setLoading(false);
        setIsReady(true);
      });
      subscription = sub;
    }

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      setLoading(true);

      // Only call signOut if supabase is properly initialized
      if (supabase && supabase.auth) {
        const { error: err } = await supabase.auth.signOut();
        if (err) throw err;
      }

      setCurrentUser(null);
      setUserProfile(null);
      setSession(null);
      setError(null);
    } catch (err: any) {
      console.error("[v0] Logout error:", err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await fetchUserProfile(currentUser.id);
    }
  };

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    logout,
    isAuthenticated: !!currentUser,
    error,
    refreshProfile,
    isReady,
    session,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
