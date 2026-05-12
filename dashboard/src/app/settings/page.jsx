'use client';

import { useState, useEffect } from 'react';
import NavBar from '../../components/NavBar';
import { useTheme } from '../../contexts/ThemeContext';
import { api } from '../../lib/api';
import ProtectedPage from '../../components/ProtectedPage';
import { useAuth } from '../../contexts/AuthContext';

// Ngày trong tuần (getDay() → 0=CN, 1=T2, ..., 6=T7)
const NGAY_TRONG_TUAN = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];

// Tạo id ngẫu nhiên
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

// ── Component chọn ngày ──────────────────────────────────────────────────────

function NgayChecker({ selectedDays, onChange }) {
  function toggle(v) {
    const next = selectedDays.includes(v)
      ? selectedDays.filter(d => d !== v)
      : [...selectedDays, v];
    onChange(next);
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {NGAY_TRONG_TUAN.map(({ value, label }) => {
        const on = selectedDays.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => toggle(value)}
            className={`w-9 h-9 rounded-lg text-xs font-bold transition-colors ${
              on
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Component một ca làm việc ────────────────────────────────────────────────

function ShiftRow({ shift, onUpdate, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        type="text"
        value={shift.label}
        onChange={e => onUpdate({ ...shift, label: e.target.value })}
        placeholder="Tên ca"
        className="flex-1 min-w-[80px] border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Từ</span>
        <input
          type="time"
          value={shift.from}
          onChange={e => onUpdate({ ...shift, from: e.target.value })}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-gray-400">đến</span>
        <input
          type="time"
          value={shift.to}
          onChange={e => onUpdate({ ...shift, to: e.target.value })}
          className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
          title="Xóa ca"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Component một nhóm ngày ──────────────────────────────────────────────────

function GroupCard({ group, allGroups, onUpdate, onRemove, canRemove }) {
  function updateShift(idx, updated) {
    const shifts = group.shifts.map((s, i) => (i === idx ? updated : s));
    onUpdate({ ...group, shifts });
  }

  function addShift() {
    const shifts = [...group.shifts, { id: uid(), label: 'Ca mới', from: '08:00', to: '12:00' }];
    onUpdate({ ...group, shifts });
  }

  function removeShift(idx) {
    const shifts = group.shifts.filter((_, i) => i !== idx);
    onUpdate({ ...group, shifts });
  }

  // Những ngày đã được nhóm khác dùng (để báo warning)
  const usedByOther = allGroups
    .filter(g => g.id !== group.id)
    .flatMap(g => g.days);
  const hasConflict = group.days.some(d => usedByOther.includes(d));

  return (
    <div className={`border rounded-xl p-4 space-y-3 dark:border-gray-700 ${
      group.enabled ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-850 opacity-75'
    }`}>
      {/* Header nhóm */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={group.label}
          onChange={e => onUpdate({ ...group, label: e.target.value })}
          className="flex-1 font-semibold bg-transparent border-none focus:outline-none focus:ring-0 text-gray-900 dark:text-gray-100 text-sm"
          placeholder="Tên nhóm ngày"
        />

        {/* Toggle bật/tắt nhóm */}
        <button
          type="button"
          onClick={() => onUpdate({ ...group, enabled: !group.enabled })}
          className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${
            group.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          style={{ height: '22px' }}
          title={group.enabled ? 'Tắt nhóm này' : 'Bật nhóm này'}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
              group.enabled ? 'left-[22px]' : 'left-0.5'
            }`}
          />
        </button>

        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-400 hover:text-red-600 text-sm font-medium flex-shrink-0"
          >
            Xóa nhóm
          </button>
        )}
      </div>

      {/* Chọn ngày trong tuần */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Áp dụng cho các ngày:</p>
        <NgayChecker
          selectedDays={group.days}
          onChange={days => onUpdate({ ...group, days })}
        />
        {hasConflict && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠️ Một số ngày đang được dùng ở nhóm khác
          </p>
        )}
      </div>

      {/* Danh sách ca */}
      {group.enabled && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Khung giờ phục vụ:</p>
          {group.shifts.map((shift, idx) => (
            <ShiftRow
              key={shift.id}
              shift={shift}
              onUpdate={u => updateShift(idx, u)}
              onRemove={() => removeShift(idx)}
              canRemove={group.shifts.length > 1}
            />
          ))}
          <button
            type="button"
            onClick={addShift}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
          >
            + Thêm ca
          </button>
        </div>
      )}
    </div>
  );
}

// ── Trang chính ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <ProtectedPage>
      <SettingsContent />
    </ProtectedPage>
  );
}

function SettingsContent() {
  const { theme, toggleTheme } = useTheme();
  const { restaurantId, restaurant, user, signOut } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [copied, setCopied] = useState(false);

  // URL đặt bàn công khai của nhà hàng này
  const reservationUrl = typeof window !== 'undefined' && restaurantId
    ? `${window.location.origin}/dat-ban?r=${restaurantId}`
    : '';

  async function copyLink() {
    if (!reservationUrl) return;
    try {
      await navigator.clipboard.writeText(reservationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback cho trình duyệt không hỗ trợ clipboard API
      const el = document.createElement('input');
      el.value = reservationUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Cấu hình đặt bàn
  const [maxPerSlot,      setMaxPerSlot]      = useState(5);
  const [slotInterval,    setSlotInterval]    = useState(30);
  const [bufferMinutes,   setBufferMinutes]   = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(90);

  // Lịch khung giờ theo nhóm ngày
  const [schedules, setSchedules] = useState([]);

  // Trạng thái tải / lưu
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [thongBao, setThongBao] = useState(null); // { type: 'success'|'error', text }

  // Tải settings khi mount
  useEffect(() => {
    if (!restaurantId) return;
    api.getSettings(restaurantId)
      .then(data => {
        setMaxPerSlot(data.max_per_slot ?? 5);
        setSlotInterval(data.slot_interval ?? 30);
        setBufferMinutes(data.buffer_minutes ?? 30);
        setDurationMinutes(data.duration_minutes ?? 90);
        setSchedules(data.schedules ?? []);
      })
      .catch(() => setThongBao({ type: 'error', text: 'Không tải được cấu hình. Thử lại sau.' }))
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function handleSave() {
    setSaving(true);
    setThongBao(null);
    try {
      await api.updateSettings(restaurantId, {
        max_per_slot:      Number(maxPerSlot),
        slot_interval:     Number(slotInterval),
        buffer_minutes:    Number(bufferMinutes),
        duration_minutes:  Number(durationMinutes),
        schedules,
      });
      setThongBao({ type: 'success', text: 'Đã lưu cấu hình thành công!' });
    } catch (err) {
      setThongBao({ type: 'error', text: err.message || 'Lưu thất bại. Thử lại sau.' });
    } finally {
      setSaving(false);
      // Tự ẩn thông báo sau 4 giây
      setTimeout(() => setThongBao(null), 4000);
    }
  }

  function updateSchedule(idx, updated) {
    setSchedules(schedules.map((s, i) => (i === idx ? updated : s)));
  }

  function removeSchedule(idx) {
    setSchedules(schedules.filter((_, i) => i !== idx));
  }

  function addSchedule() {
    setSchedules([...schedules, {
      id:      uid(),
      label:   'Nhóm mới',
      days:    [],
      enabled: true,
      shifts:  [{ id: uid(), label: 'Ca 1', from: '08:00', to: '12:00' }],
    }]);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">⚙️</span>
          <h1 className="font-bold text-gray-900 dark:text-gray-100 text-base md:text-lg">
            Cài Đặt Hệ Thống
          </h1>
        </div>
      </header>

      <NavBar />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 pb-24 space-y-6">

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-xl h-32" />
            ))}
          </div>
        ) : (
          <>
            {/* ── 1. Giao diện ────────────────────────────────────────── */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">🎨 Giao Diện</h2>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Chủ đề</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Đang dùng: <span className="font-medium">{theme === 'dark' ? 'Tối' : 'Sáng'}</span>
                  </p>
                </div>

                {/* Toggle sáng/tối */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`relative w-14 rounded-full transition-colors flex-shrink-0 ${
                    theme === 'dark' ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  style={{ height: '28px' }}
                  aria-label="Chuyển chủ đề"
                >
                  <span
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform flex items-center justify-center text-[10px] ${
                      theme === 'dark' ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  >
                    {theme === 'dark' ? '🌙' : '☀️'}
                  </span>
                </button>
              </div>
            </section>

            {/* ── 2. Link đặt bàn ─────────────────────────────────────── */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">🔗 Link Đặt Bàn</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Gửi link này cho khách để họ đặt bàn online
                </p>
              </div>

              {/* Hiển thị URL */}
              <div className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-600 dark:text-gray-300 truncate flex-1 font-mono text-xs">
                  {reservationUrl || '—'}
                </span>
              </div>

              {/* Nút hành động */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  disabled={!reservationUrl}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-700'
                      : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                  } disabled:opacity-50`}
                >
                  {copied ? '✓ Đã copy!' : '📋 Copy link'}
                </button>
                <a
                  href={reservationUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => !reservationUrl && e.preventDefault()}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                  🌐 Mở thử
                </a>
              </div>
            </section>

            {/* ── 3. Cấu hình đặt bàn ─────────────────────────────────── */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 space-y-5">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">📋 Cấu Hình Đặt Bàn</h2>

              {/* Số lượt tối đa mỗi khung giờ */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Số lượt đặt tối đa / khung giờ
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Giới hạn số đặt chỗ cùng lúc trong một khung giờ (0 = không giới hạn)
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={maxPerSlot}
                  onChange={e => setMaxPerSlot(e.target.value)}
                  className="w-20 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-center text-sm font-medium bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Khoảng cách khung giờ */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Khoảng cách giữa các khung giờ
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Xác định độ dày của lưới khung giờ trên trang đặt bàn
                  </p>
                </div>
                <select
                  value={slotInterval}
                  onChange={e => setSlotInterval(Number(e.target.value))}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={45}>45 phút</option>
                  <option value={60}>60 phút</option>
                </select>
              </div>

              {/* Buffer tối thiểu */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Thời gian đặt trước tối thiểu
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Khách phải đặt trước ít nhất bao nhiêu phút so với giờ đến
                  </p>
                </div>
                <select
                  value={bufferMinutes}
                  onChange={e => setBufferMinutes(Number(e.target.value))}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>Ngay bây giờ</option>
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={60}>60 phút</option>
                </select>
              </div>

              {/* Thời gian sử dụng bàn */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Thời gian sử dụng bàn
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Sau khi xếp bàn, bàn đó sẽ bị giữ trong khoảng thời gian này
                  </p>
                </div>
                <select
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={30}>30 phút</option>
                  <option value={60}>60 phút</option>
                  <option value={90}>90 phút</option>
                  <option value={120}>120 phút</option>
                  <option value={150}>150 phút</option>
                  <option value={180}>180 phút</option>
                </select>
              </div>
            </section>

            {/* ── 4. Tài Khoản ────────────────────────────────────────── */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">👤 Tài Khoản</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Nhà hàng</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{restaurant?.name || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Email</span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{user?.email || '—'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLogout(true)}
                className="w-full border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium rounded-xl py-2.5 text-sm transition-colors"
              >
                Đăng xuất
              </button>
            </section>

            {/* ── 5. Lịch khung giờ ───────────────────────────────────── */}
            <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-gray-100">📅 Lịch Khung Giờ Theo Ngày</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Nhóm các ngày có cùng lịch phục vụ, thêm các ca trong ngày
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addSchedule}
                  className="text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 rounded-lg px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 font-medium"
                >
                  + Thêm nhóm
                </button>
              </div>

              {schedules.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                  Chưa có nhóm nào. Nhấn "+ Thêm nhóm" để bắt đầu.
                </p>
              ) : (
                <div className="space-y-3">
                  {schedules.map((group, idx) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      allGroups={schedules}
                      onUpdate={u => updateSchedule(idx, u)}
                      onRemove={() => removeSchedule(idx)}
                      canRemove={schedules.length > 1}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── Thông báo toast ──────────────────────────────────────────── */}
      {thongBao && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg z-50 ${
          thongBao.type === 'success'
            ? 'bg-green-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {thongBao.type === 'success' ? '✓' : '⚠'} {thongBao.text}
        </div>
      )}

      {/* ── Nút lưu cố định ở dưới ──────────────────────────────────── */}
      {!loading && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-xl px-6 py-2.5 text-sm transition-colors"
          >
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      )}

      {/* ── Xác nhận đăng xuất ──────────────────────────────────────── */}
      {confirmLogout && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Đăng xuất?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng hệ thống.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmLogout(false)}
                className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={signOut}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
