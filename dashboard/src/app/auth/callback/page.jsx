'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

// Xử lý redirect sau khi user click link xác nhận email.
// Supabase gửi về một trong hai dạng:
//   PKCE flow:        /auth/callback?code=xxx
//   Token-hash flow:  /auth/callback?token_hash=xxx&type=signup

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [thongBao, setThongBao] = useState('Đang xác nhận email...');
  const [loi, setLoi] = useState('');

  useEffect(() => {
    async function xuLy() {
      // PKCE flow
      const code = searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setLoi('Xác nhận thất bại: ' + error.message); return; }
        router.replace('/');
        return;
      }

      // Token-hash flow (implicit)
      const token_hash = searchParams.get('token_hash');
      const type       = searchParams.get('type');
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (error) { setLoi('Xác nhận thất bại: ' + error.message); return; }
        router.replace('/');
        return;
      }

      // Implicit flow — supabase-js tự xử lý hash (#access_token=...) khi mount
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.replace('/');
        return;
      }

      setLoi('Liên kết xác nhận không hợp lệ hoặc đã hết hạn. Vui lòng thử đăng ký lại.');
    }

    xuLy();
  }, [router, searchParams]);

  if (loi) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Xác nhận thất bại</h1>
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
            {loi}
          </p>
          <a
            href="/register"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-2.5 text-sm text-center transition-colors"
          >
            Đăng ký lại
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">{thongBao}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
