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
    // Khởi động: xử lý ?code= OAuth callback nếu Supabase redirect về đây thay vì /auth/callback
    const initAuth = async () => {
      try {
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
        // setLoading TRƯỚC khi loadRestaurant — không để restaurant query làm block UI
        // Bug cũ: await loadRestaurant() trước setLoading → nếu query treo thì loading vĩnh viễn
        setLoading(false);
        if (u) loadRestaurant(u.id); // fire-and-forget: restaurant load không block auth
      } catch {
        // Failsafe: đảm bảo loading kết thúc dù có lỗi bất ngờ
        setLoading(false);
      }
    };

    initAuth();

    // Lắng nghe thay đổi auth state (login, logout, token refresh, INITIAL_SESSION)
    // Callback KHÔNG async vì không cần await — setLoading phải chạy ngay lập tức
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        // setLoading TRƯỚC loadRestaurant — tránh bug treo màn hình spinner
        setLoading(false);
        if (u) {
          loadRestaurant(u.id); // fire-and-forget
        } else {
          setRestaurant(null);
        }
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
