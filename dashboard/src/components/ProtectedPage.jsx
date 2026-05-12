'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

/**
 * Bọc nội dung trang cần đăng nhập.
 * - Đang kiểm tra auth → hiện spinner
 * - Chưa đăng nhập → redirect /login
 * - Đã đăng nhập → render children
 */
export default function ProtectedPage({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Đang kiểm tra đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return children;
}
