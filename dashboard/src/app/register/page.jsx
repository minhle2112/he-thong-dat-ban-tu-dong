'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisterPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [tenNhaHang,     setTenNhaHang]     = useState('');
  const [email,          setEmail]          = useState('');
  const [password,       setPassword]       = useState('');
  const [confirmPass,    setConfirmPass]    = useState('');
  const [error,          setError]          = useState('');
  const [infoMsg,        setInfoMsg]        = useState('');
  const [submitting,     setSubmitting]     = useState(false);

  // Đã đăng nhập → về dashboard
  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [user, loading, router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfoMsg('');

    if (password !== confirmPass) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải ít nhất 6 ký tự');
      return;
    }
    if (!tenNhaHang.trim()) {
      setError('Vui lòng nhập tên nhà hàng');
      return;
    }

    setSubmitting(true);

    // 1. Tạo tài khoản Supabase Auth
    // emailRedirectTo: sau khi user click link xác nhận → redirect về /auth/callback
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (authError) {
      const msg = authError.message || '';
      if (msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('over_email_send_rate_limit')) {
        setError('Hệ thống đã gửi quá nhiều email trong 1 giờ qua. Vui lòng thử lại sau ít phút, hoặc liên hệ quản trị viên.');
      } else if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already registered')) {
        setError('Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.');
      } else {
        setError(msg || 'Đăng ký thất bại. Vui lòng thử lại.');
      }
      setSubmitting(false);
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setError('Không lấy được thông tin tài khoản');
      setSubmitting(false);
      return;
    }

    // 2. Tạo hoặc nhận quyền sở hữu nhà hàng (Edge Function — service role)
    try {
      const { error: fnErr } = await supabase.functions.invoke('restaurant-setup', {
        body: { owner_id: userId, name: tenNhaHang.trim() },
      });
      if (fnErr) throw fnErr;
    } catch (err) {
      setError('Tạo nhà hàng thất bại: ' + (err.message || err));
      setSubmitting(false);
      return;
    }

    // 3. Kiểm tra session — nếu có ngay (email confirmation disabled) → redirect
    if (data.session) {
      router.replace('/');
    } else {
      // Email confirmation enabled → thông báo cho user
      setInfoMsg('Tài khoản đã tạo! Vui lòng kiểm tra email để xác nhận trước khi đăng nhập.');
      setSubmitting(false);
    }
  }

  if (loading || user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-4xl">🍽️</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900 dark:text-gray-100">Tạo tài khoản</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Mỗi nhà hàng một tài khoản riêng</p>
        </div>

        {infoMsg ? (
          /* Màn hình thành công — cần xác nhận email */
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center space-y-4">
            <div className="text-4xl">📧</div>
            <p className="text-sm text-gray-700 dark:text-gray-300">{infoMsg}</p>
            <Link href="/login" className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-2.5 text-sm text-center transition-colors">
              Về trang đăng nhập
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                ⚠️ {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tên nhà hàng</label>
              <input
                type="text"
                required
                value={tenNhaHang}
                onChange={e => setTenNhaHang(e.target.value)}
                placeholder="Nhà Hàng Phố Đêm"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@nhahang.com"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mật khẩu</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Xác nhận mật khẩu</label>
              <input
                type="password"
                required
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors mt-2"
            >
              {submitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          Đã có tài khoản?{' '}
          <Link href="/login" className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
}
