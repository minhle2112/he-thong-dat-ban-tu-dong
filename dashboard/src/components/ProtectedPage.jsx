'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '../lib/auth';

export default function ProtectedPage({ children }) {
  const router = useRouter();
  // false trong lúc đang kiểm tra token (tránh flash nội dung trước khi biết kết quả)
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      setOk(true);
    } else {
      router.replace('/login');
    }
  }, [router]);

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return children;
}
