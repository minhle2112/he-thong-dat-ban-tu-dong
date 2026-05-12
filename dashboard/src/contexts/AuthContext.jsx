'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [restaurant, setRestaurant] = useState(null);
  const [loading,    setLoading]    = useState(true); // true trong khi kiểm tra session

  // Tải thông tin nhà hàng cho user vừa đăng nhập — dùng Supabase thay vì backend
  const loadRestaurant = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('owner_id', userId)
        .single();
      if (!error && data) setRestaurant(data);
      else setRestaurant(null);
    } catch {
      setRestaurant(null);
    }
  }, []);

  useEffect(() => {
    // Khởi động: xử lý ?code= nếu có (Supabase redirect về bất kỳ trang nào sau verify email)
    // Thường /auth/callback xử lý rồi, nhưng phòng khi Site URL trỏ về homepage
    const initAuth = async () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
          // Xoá code khỏi URL để không xử lý lại khi refresh
          window.history.replaceState({}, '', window.location.pathname);
        }
      }

      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u);
      if (u) await loadRestaurant(u.id);
      setLoading(false);
    };

    initAuth();

    // Lắng nghe thay đổi auth state (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          await loadRestaurant(u.id);
        } else {
          setRestaurant(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [loadRestaurant]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      user,
      restaurant,
      restaurantId: restaurant?.id ?? null,
      loading,
      signOut,
      reloadRestaurant: () => user && loadRestaurant(user.id),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng trong AuthProvider');
  return ctx;
}
