'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// App chỉ phục vụ 1 nhà hàng duy nhất — không cần multi-tenant hay auth
const RESTAURANT_ID = 1;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('restaurants')
      .select('*')
      .eq('id', RESTAURANT_ID)
      .single()
      .then(({ data }) => setRestaurant(data ?? null))
      .catch(() => setRestaurant(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{
      restaurant,
      restaurantId: RESTAURANT_ID,
      loading,
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
