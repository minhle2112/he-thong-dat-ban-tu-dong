'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Điều hướng giữa các trang dành cho nhân viên
// badge: true → hiện pending count badge ở tab đó
const PAGES = [
  { href: '/nhan-vien',   icon: '👤', label: 'Nhân Viên',   badge: true },
  { href: '/',            icon: '🗺️', label: 'Dashboard'              },
  { href: '/quan-ly-ban', icon: '🪑', label: 'Quản Lý Bàn'            },
  { href: '/settings',    icon: '⚙️', label: 'Cài Đặt'                },
];

export default function NavBar() {
  const path = usePathname();
  const { restaurantId, restaurant } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  // Lấy số đặt chỗ đang chờ xếp bàn qua Supabase (lọc theo restaurantId của tài khoản đang đăng nhập)
  async function fetchPendingCount() {
    if (!restaurantId) return;
    try {
      const { count } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .eq('status', 'pending');
      setPendingCount(count ?? 0);
    } catch {}
  }

  useEffect(() => {
    fetchPendingCount();

    // Supabase Realtime — cập nhật badge khi có INSERT/UPDATE/DELETE trên bảng reservations
    const channel = supabase
      .channel('navbar-pending-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchPendingCount)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [restaurantId]); // re-subscribe khi restaurantId thay đổi (sau auth load)

  // Badge text: ẩn nếu 0, "99+" nếu vượt 2 chữ số
  const showBadge = pendingCount > 0;
  const badgeText = pendingCount > 99 ? '99+' : String(pendingCount);

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 flex gap-0.5 shrink-0 overflow-x-auto">
      {PAGES.map(({ href, icon, label, badge }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              active
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-500'
            }`}
          >
            {/* Icon — badge đặt tương đối với icon */}
            <span className="relative">
              {icon}
              {badge && showBadge && (
                <span className="absolute -top-2 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {badgeText}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Tên nhà hàng đang đăng nhập — hiện ở phải NavBar */}
      {restaurant && (
        <span className="ml-auto flex items-center px-3 text-xs text-gray-400 dark:text-gray-500 shrink-0 italic">
          {restaurant.name}
        </span>
      )}
    </nav>
  );
}
