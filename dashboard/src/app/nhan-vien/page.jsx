'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import NavBar from '../../components/NavBar';
import ProtectedPage from '../../components/ProtectedPage';
import { useAuth } from '../../contexts/AuthContext';

const STAFF_PIN = process.env.NEXT_PUBLIC_STAFF_PIN || '1234';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtGio = (t) => (t || '').substring(0, 5);

// Chuẩn hoá dateStr — PostgreSQL DATE có thể trả về ISO full string hoặc YYYY-MM-DD
function normDate(dateStr) {
  return (dateStr || '').substring(0, 10);
}

// Ngày hôm nay theo local timezone (tránh lệch múi giờ UTC vs Vietnam)
function localDateStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function fmtNgay(dateStr) {
  return new Date(normDate(dateStr) + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function fmtNgayNgan(dateStr) {
  return new Date(normDate(dateStr) + 'T00:00:00').toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit',
  });
}

// Ngày mai theo local timezone
function tomorrowDateStr() {
  const n = new Date();
  n.setDate(n.getDate() + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Nhãn ngày cho card: "Hôm nay", "Ngày mai", hoặc "Thứ Ba, 13/05"
function labelNgay(dateStr) {
  const d = normDate(dateStr);
  if (d === localDateStr())    return 'Hôm nay';
  if (d === tomorrowDateStr()) return 'Ngày mai';
  const date = new Date(d + 'T00:00:00');
  const thu = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][date.getDay()];
  const ngay = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  return `${thu}, ${ngay}`;
}

// Tính thời gian còn lại đến giờ đặt (hoặc đã quá bao lâu)
function tinhConLai(dateStr, timeStr) {
  const datePart = normDate(dateStr);
  const timePart = (timeStr || '').substring(0, 5);
  const dt  = new Date(`${datePart}T${timePart}:00`);
  const now = new Date();
  const diffMins = Math.round((dt - now) / 60000);
  const abs  = Math.abs(diffMins);
  const past = diffMins < 0;

  let text;
  if (abs < 60) {
    text = past ? `Quá ${abs} phút` : `Còn ${abs} phút`;
  } else if (abs < 24 * 60) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const tp = m > 0 ? `${h} tiếng ${m} phút` : `${h} tiếng`;
    text = past ? `Quá ${tp}` : `Còn ${tp}`;
  } else {
    const days = Math.floor(abs / (24 * 60));
    text = past ? `Quá ${days} ngày` : `Còn ${days} ngày`;
  }

  const urgent = abs < 120;
  return { text, past, urgent };
}

// Kiểm tra số điện thoại Việt Nam hợp lệ (10 số, bắt đầu bằng 0)
const validSDT = (phone) => /^0\d{9}$/.test(phone.replace(/\s/g, ''));

// ─────────────────────────────────────────────────────────────────────────────
// Hằng số UI
// ─────────────────────────────────────────────────────────────────────────────

const BADGE = {
  pending:   { text: 'Chờ xếp bàn', cls: 'bg-orange-100 text-orange-700' },
  confirmed: { text: 'Sắp đến',     cls: 'bg-amber-100 text-amber-700'   },
  seated:    { text: 'Đang ngồi',   cls: 'bg-green-100 text-green-700'   },
  completed: { text: 'Đã xong',     cls: 'bg-gray-100 text-gray-500'     },
  cancelled: { text: 'Đã hủy',      cls: 'bg-red-100 text-red-500'       },
  no_show:   { text: 'Không đến',   cls: 'bg-orange-100 text-orange-600' },
  expired:   { text: 'Quá giờ',     cls: 'bg-gray-100 text-gray-500'     },
};

// ═════════════════════════════════════════════════════════════════════════════
// MÀN HÌNH NHẬP PIN
// ═════════════════════════════════════════════════════════════════════════════

function ManHinhPIN({ onSuccess }) {
  const [pin, setPin] = useState('');
  const [sai, setSai] = useState(false);

  const bam = (so) => {
    if (pin.length >= 4) return;
    const pinMoi = pin + so;
    setPin(pinMoi);
    setSai(false);
    if (pinMoi.length === 4) {
      if (pinMoi === STAFF_PIN) {
        sessionStorage.setItem('nv_auth', '1');
        onSuccess();
      } else {
        setSai(true);
        setTimeout(() => { setPin(''); setSai(false); }, 800);
      }
    }
  };

  const xoa = () => setPin(p => p.slice(0, -1));

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <span className="text-5xl">🍽️</span>
        <h1 className="text-white text-2xl font-bold mt-3">Dành cho Nhân Viên</h1>
        <p className="text-gray-400 text-sm mt-1">Nhập PIN 4 số để vào</p>
      </div>
      <div className="flex gap-5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-5 h-5 rounded-full transition-all duration-150 ${
            i < pin.length ? (sai ? 'bg-red-500 scale-110' : 'bg-white scale-110') : 'bg-gray-600'
          }`} />
        ))}
      </div>
      {sai && <p className="text-red-400 text-sm font-medium -mt-5 animate-pulse">PIN không đúng. Thử lại.</p>}
      <div className="grid grid-cols-3 gap-3 w-72">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k, i) => (
          <button
            key={i}
            onClick={() => { if (k === '⌫') xoa(); else if (k !== '') bam(String(k)); }}
            className={`h-16 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
              k === ''   ? 'invisible' :
              k === '⌫' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' :
                          'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >{k}</button>
        ))}
      </div>
      <p className="text-gray-600 text-xs">PIN mặc định: 1234</p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// APP CHÍNH
// ═════════════════════════════════════════════════════════════════════════════

function AppNhanVien({ onLogout }) {
  const { restaurantId } = useAuth();
  const homNay = localDateStr();

  // ── Dữ liệu ──────────────────────────────────────────────────────────────
  const [danhSachDat,     setDanhSachDat]     = useState([]);  // đặt chỗ hôm nay (cho stats)
  const [danhSachBan,     setDanhSachBan]     = useState([]);  // danh sách bàn (cho modal xếp bàn)
  const [danhSachPending, setDanhSachPending] = useState([]);
  const [danhSachExpired, setDanhSachExpired] = useState([]);
  const [dangTai,         setDangTai]         = useState(true);
  const [realtimeOk,      setRealtimeOk]      = useState(false);
  const [loi,             setLoi]             = useState('');

  // ── Tab: chỉ còn 2 tab — pending và expired ───────────────────────────────
  const [tab, setTab] = useState('pending');

  // ── Toast thông báo sau khi thêm đặt chỗ ─────────────────────────────────
  const [thongBao, setThongBao] = useState('');

  // ── Modal thêm đặt chỗ thủ công ──────────────────────────────────────────
  const [modalThemDatCho, setModalThemDatCho] = useState(false);
  const [tdcTen,          setTdcTen]          = useState('');
  const [tdcPhone,        setTdcPhone]        = useState('');
  const [tdcNgay,         setTdcNgay]         = useState(homNay);
  const [tdcGio,          setTdcGio]          = useState('');
  const [tdcSoNguoi,      setTdcSoNguoi]      = useState(2);
  const [tdcGhiChu,       setTdcGhiChu]       = useState('');
  const [tdcDangGui,      setTdcDangGui]      = useState(false);
  const [tdcLoi,          setTdcLoi]          = useState('');

  // ── Modal xếp bàn ─────────────────────────────────────────────────────────
  const [modalXepBan,    setModalXepBan]    = useState(null);
  const [goiYBan,        setGoiYBan]        = useState([]);
  const [goiYGroups,     setGoiYGroups]     = useState([]);
  const [xepBanTab,      setXepBanTab]      = useState('don');
  const [xepBanChon,     setXepBanChon]     = useState(null);
  const [xepBanGhepIds,  setXepBanGhepIds]  = useState([]);
  const [xepBanDangTai,  setXepBanDangTai]  = useState(false);
  const [xepBanDangGui,  setXepBanDangGui]  = useState(false);
  const [xepBanLoi,      setXepBanLoi]      = useState('');

  // ── Tải dữ liệu ──────────────────────────────────────────────────────────
  const taiDuLieu = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const [dsDat, dsBan, dsPending, dsExpired] = await Promise.all([
        api.getReservations({ restaurantId: restaurantId, date: homNay }),
        api.getTables(restaurantId),
        api.getReservations({ restaurantId: restaurantId, status: 'pending' }),
        api.getReservations({ restaurantId: restaurantId, status: 'expired' }),
      ]);
      setDanhSachDat(dsDat || []);
      setDanhSachBan(dsBan || []);
      // Pending: giờ đặt gần nhất lên đầu
      setDanhSachPending(
        (dsPending || []).sort((a, b) =>
          `${normDate(a.date)}T${a.time}`.localeCompare(`${normDate(b.date)}T${b.time}`)
        )
      );
      // Expired: mới nhất (giờ đặt muộn nhất) lên đầu
      setDanhSachExpired(
        (dsExpired || []).sort((a, b) =>
          `${normDate(b.date)}T${b.time}`.localeCompare(`${normDate(a.date)}T${a.time}`)
        )
      );
    } catch {
      setLoi('Không thể tải dữ liệu. Kiểm tra kết nối mạng.');
    } finally {
      setDangTai(false);
    }
  }, [homNay, restaurantId]);

  useEffect(() => { taiDuLieu(); }, [taiDuLieu]);

  // Tự động expire đặt chỗ pending quá giờ: chạy ngay khi load, rồi mỗi 5 phút
  useEffect(() => {
    const chayExpire = async () => {
      try {
        const res = await api.expireOverdue();
        if (res?.expired_count > 0) taiDuLieu();
      } catch {
        // Expire là background task, không hiện lỗi ra UI
      }
    };
    chayExpire();
    const interval = setInterval(chayExpire, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [taiDuLieu]);

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('nhan-vien-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations'  }, taiDuLieu)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' }, taiDuLieu)
      .subscribe(s => setRealtimeOk(s === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, [taiDuLieu]);

  // ── Số lượng (header stats + tab badges) ─────────────────────────────────
  const soLuong = useMemo(() => ({
    confirmed: danhSachDat.filter(r => r.status === 'confirmed').length,
    seated:    danhSachDat.filter(r => r.status === 'seated').length,
    completed: danhSachDat.filter(r => r.status === 'completed').length,
    pending:   danhSachPending.length,
    expired:   danhSachExpired.length,
  }), [danhSachDat, danhSachPending, danhSachExpired]);

  const coUrgentPending = useMemo(() =>
    danhSachPending.some(r => tinhConLai(r.date, r.time).urgent),
    [danhSachPending]
  );

  // Tổng sức chứa của các bàn đang chọn để ghép
  const tongSucChuaGhep = useMemo(() =>
    xepBanGhepIds.reduce((sum, id) => {
      const ban = danhSachBan.find(b => b.id === id);
      return sum + (ban?.capacity || 0);
    }, 0),
    [xepBanGhepIds, danhSachBan]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Actions — Thêm đặt chỗ thủ công
  // ─────────────────────────────────────────────────────────────────────────

  const moModalThemDatCho = () => {
    setTdcTen('');
    setTdcPhone('');
    setTdcNgay(homNay);
    setTdcGio('');
    setTdcSoNguoi(2);
    setTdcGhiChu('');
    setTdcLoi('');
    setModalThemDatCho(true);
  };

  const xuLyThemDatCho = async () => {
    setTdcLoi('');

    // Validate bắt buộc
    if (!tdcTen.trim()) { setTdcLoi('Vui lòng nhập họ tên khách.'); return; }
    if (!validSDT(tdcPhone)) { setTdcLoi('Số điện thoại không hợp lệ (VD: 0912345678).'); return; }
    if (!tdcGio) { setTdcLoi('Vui lòng nhập giờ đặt.'); return; }

    // Validate giờ nếu chọn hôm nay: không cho nhập giờ đã qua
    if (tdcNgay === homNay) {
      const now = new Date();
      const [h, m] = tdcGio.split(':').map(Number);
      const gioPhut = h * 60 + m;
      const nowPhut = now.getHours() * 60 + now.getMinutes();
      if (gioPhut <= nowPhut) {
        setTdcLoi('Giờ đặt phải sau giờ hiện tại. Vui lòng chọn giờ muộn hơn.');
        return;
      }
    }

    if (tdcSoNguoi < 1) { setTdcLoi('Số người phải ít nhất 1.'); return; }

    setTdcDangGui(true);
    try {
      await api.createReservation({
        restaurant_id: restaurantId,
        date: tdcNgay,
        time: tdcGio,
        guests: tdcSoNguoi,
        name: tdcTen.trim(),
        phone: tdcPhone.trim(),
        ...(tdcGhiChu.trim() && { note: tdcGhiChu.trim() }),
      });

      // Hiện toast thông báo thành công
      const ngayHienThi = tdcNgay === homNay ? 'hôm nay' : `ngày ${fmtNgayNgan(tdcNgay)}`;
      setThongBao(`Đã thêm đặt chỗ cho ${tdcTen.trim()} lúc ${tdcGio} ${ngayHienThi}`);
      setTimeout(() => setThongBao(''), 4000);

      setModalThemDatCho(false);
      setTab('pending'); // Focus về tab Chờ xếp bàn
      taiDuLieu();
    } catch (e) {
      setTdcLoi(e.message || 'Không thể tạo đặt chỗ. Thử lại.');
    } finally {
      setTdcDangGui(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Actions — Xếp bàn
  // ─────────────────────────────────────────────────────────────────────────

  // Mở modal xếp bàn và tải gợi ý từ backend
  const xuLyMoXepBan = async (reservation) => {
    setModalXepBan(reservation);
    setXepBanChon(null);
    setXepBanGhepIds([]);
    setXepBanLoi('');
    setGoiYBan([]);
    setGoiYGroups([]);
    setXepBanTab('don');
    setXepBanDangTai(true);
    try {
      const goiY = await api.getSuggestions(reservation.id);
      const singles = Array.isArray(goiY?.single) ? goiY.single : [];
      const groups  = Array.isArray(goiY?.groups)  ? goiY.groups  : [];
      setGoiYBan(singles);
      setGoiYGroups(groups);
      // Tự chuyển sang tab ghép bàn nếu không có bàn đơn nào đủ chỗ
      if (singles.length === 0) setXepBanTab('ghep');
    } catch {
      setXepBanLoi('Không tải được gợi ý bàn. Thử lại.');
    } finally {
      setXepBanDangTai(false);
    }
  };

  // Bật/tắt một bàn trong danh sách ghép
  const toggleGhepBan = (tableId) => {
    setXepBanGhepIds(prev =>
      prev.includes(tableId) ? prev.filter(id => id !== tableId) : [...prev, tableId]
    );
  };

  // Chọn nhanh một gợi ý ghép bàn từ backend
  const chonNhanhGroup = (group) => {
    setXepBanGhepIds(group.tables.map(t => t.id));
  };

  // Xác nhận xếp bàn — dùng chung cho cả bàn đơn lẫn ghép
  const xuLyXepBan = async () => {
    const tableIds = xepBanTab === 'don' ? [xepBanChon] : xepBanGhepIds;
    if (!tableIds.length || tableIds[0] == null) return;
    setXepBanDangGui(true);
    setXepBanLoi('');
    try {
      await api.assignTable(modalXepBan.id, tableIds);
      setModalXepBan(null);
      taiDuLieu();
    } catch (e) {
      setXepBanLoi(e.message || 'Xếp bàn thất bại. Thử lại.');
    } finally {
      setXepBanDangGui(false);
    }
  };

  const xuLyHuyDatCho = async (id) => {
    try {
      await api.cancelReservation(id);
      setModalXepBan(null);
      taiDuLieu();
    } catch {
      setXepBanLoi('Hủy thất bại. Thử lại.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Actions — Tab Quá giờ
  // ─────────────────────────────────────────────────────────────────────────

  // Khôi phục đặt chỗ expired → pending để nhân viên có thể xếp bàn lại
  const xuLyKhoiPhuc = async (id) => {
    try {
      await api.updateStatus(id, 'pending');
      taiDuLieu();
    } catch {
      setLoi('Khôi phục thất bại. Thử lại.');
    }
  };

  const xuLyHuyExpired = async (id) => {
    try {
      await api.cancelReservation(id);
      taiDuLieu();
    } catch {
      setLoi('Huỷ thất bại. Thử lại.');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">Nhân Viên</h1>
          <p className="text-sm text-gray-500 capitalize mt-0.5">{fmtNgay(homNay)}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${realtimeOk ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            {realtimeOk ? 'Live' : 'Kết nối...'}
          </span>
          <button
            onClick={onLogout}
            className="text-sm text-gray-400 hover:text-gray-700 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Điều hướng giữa các trang */}
      <NavBar />

      {/* Thống kê nhanh hôm nay */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-8">
        <SoLuong so={soLuong.confirmed} nhan="Sắp đến"   mau="text-amber-600" />
        <SoLuong so={soLuong.seated}    nhan="Đang ngồi" mau="text-green-600" />
        <SoLuong so={soLuong.completed} nhan="Đã xong"   mau="text-gray-500"  />
        {soLuong.pending > 0 && (
          <SoLuong
            so={soLuong.pending}
            nhan="Chờ xếp bàn"
            mau={coUrgentPending ? 'text-red-600' : 'text-orange-600'}
          />
        )}
        <span className="text-sm text-gray-400 ml-auto">{danhSachDat.length} đặt chỗ hôm nay</span>
      </div>

      {/* Tabs: chỉ còn Chờ xếp bàn và Quá giờ */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-1 shrink-0">
        {/* Tab: Chờ xếp bàn */}
        <button
          onClick={() => setTab('pending')}
          className={`flex items-center gap-2 px-4 py-3.5 text-base font-medium border-b-2 whitespace-nowrap transition-colors ${
            tab === 'pending'
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ⏳ Chờ xếp bàn
          {soLuong.pending > 0 && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              coUrgentPending
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-orange-100 text-orange-700'
            }`}>
              {soLuong.pending}
            </span>
          )}
        </button>

        {/* Tab: Quá giờ */}
        <button
          onClick={() => setTab('expired')}
          className={`flex items-center gap-2 px-4 py-3.5 text-base font-medium border-b-2 whitespace-nowrap transition-colors ${
            tab === 'expired'
              ? 'border-gray-500 text-gray-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ⏰ Quá giờ
          {soLuong.expired > 0 && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
              {soLuong.expired}
            </span>
          )}
        </button>
      </div>

      {loi && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-red-600 text-sm">⚠️ {loi}</span>
          <button onClick={() => setLoi('')} className="text-red-400 text-xl leading-none ml-3">×</button>
        </div>
      )}

      {/* ── Tab: Chờ xếp bàn ── */}
      {tab === 'pending' && (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 space-y-3">
          {dangTai ? (
            [1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-36 border border-gray-100 shadow-sm" />
            ))
          ) : danhSachPending.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-6xl mb-4">✅</p>
              <p className="text-lg font-medium">Không có đặt chỗ nào chờ xếp bàn</p>
            </div>
          ) : (
            danhSachPending.map(r => (
              <CardPending key={r.id} r={r} onXepBan={() => xuLyMoXepBan(r)} />
            ))
          )}
        </div>
      )}

      {/* ── Tab: Quá giờ ── */}
      {tab === 'expired' && (
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 space-y-3">
          {dangTai ? (
            [1, 2, 3].map(i => (
              <div key={i} className="animate-pulse bg-white rounded-2xl h-32 border border-gray-100 shadow-sm" />
            ))
          ) : danhSachExpired.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-6xl mb-4">✅</p>
              <p className="text-lg font-medium">Không có đặt chỗ nào quá giờ</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 text-center pb-1">
                Đặt chỗ đã quá 30 phút mà chưa được xếp bàn
              </p>
              {danhSachExpired.map(r => (
                <CardExpired
                  key={r.id}
                  r={r}
                  onKhoiPhuc={() => xuLyKhoiPhuc(r.id)}
                  onHuy={() => xuLyHuyExpired(r.id)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* FAB: Thêm đặt chỗ — cố định góc dưới phải, dễ bấm trên iPad */}
      <div className="fixed bottom-6 right-6 z-20">
        <button
          onClick={moModalThemDatCho}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl px-6 py-4 shadow-2xl text-base flex items-center gap-2 transition-all active:scale-95"
        >
          <span className="text-2xl leading-none">+</span> Thêm đặt chỗ
        </button>
      </div>

      {/* Toast thông báo thành công */}
      {thongBao && (
        <div className="fixed bottom-24 left-4 right-4 z-30 bg-green-600 text-white px-5 py-4 rounded-2xl shadow-2xl text-sm font-semibold text-center">
          ✅ {thongBao}
        </div>
      )}

      {/* ════ MODALS ════ */}

      {/* ── Modal: Thêm đặt chỗ thủ công ── */}
      {modalThemDatCho && (
        <Modal onClose={() => setModalThemDatCho(false)}>
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <h2 className="text-2xl font-bold text-gray-800">Thêm Đặt Chỗ</h2>
              <p className="text-gray-500 text-sm mt-1">Tạo đặt chỗ thủ công cho khách</p>
            </div>

            {/* Họ tên */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Họ tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={tdcTen}
                onChange={e => setTdcTen(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full border border-gray-300 rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Số điện thoại */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={tdcPhone}
                onChange={e => setTdcPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="0912345678"
                className="w-full border border-gray-300 rounded-2xl px-5 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {/* Cảnh báo inline nếu SĐT đã nhập nhưng chưa hợp lệ */}
              {tdcPhone.length > 0 && !validSDT(tdcPhone) && (
                <p className="text-xs text-orange-600 mt-1.5">
                  ⚠️ SĐT phải đủ 10 số, bắt đầu bằng 0 (VD: 0912345678)
                </p>
              )}
            </div>

            {/* Ngày + Giờ — 2 cột trên iPad */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ngày <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={tdcNgay}
                  min={homNay}
                  onChange={e => { if (e.target.value) setTdcNgay(e.target.value); }}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Giờ <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  value={tdcGio}
                  onChange={e => setTdcGio(e.target.value)}
                  className="w-full border border-gray-300 rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Cảnh báo giờ đã qua — chỉ hiện khi chọn hôm nay và đã nhập giờ */}
            {tdcNgay === homNay && tdcGio && (() => {
              const now = new Date();
              const [h, m] = tdcGio.split(':').map(Number);
              const gioPhut = h * 60 + m;
              const nowPhut = now.getHours() * 60 + now.getMinutes();
              return gioPhut <= nowPhut ? (
                <p className="text-xs text-orange-600 -mt-2">
                  ⚠️ Giờ này đã qua. Vui lòng nhập giờ muộn hơn giờ hiện tại.
                </p>
              ) : null;
            })()}

            {/* Số người */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Số người <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setTdcSoNguoi(n => Math.max(1, n - 1))}
                  className="w-14 h-14 rounded-full border-2 border-gray-300 text-3xl font-bold text-gray-600 hover:border-blue-400 flex items-center justify-center"
                >−</button>
                <div className="flex-1 text-center">
                  <span className="text-5xl font-bold text-gray-900">{tdcSoNguoi}</span>
                  <p className="text-xs text-gray-400 mt-1">người</p>
                </div>
                <button
                  onClick={() => setTdcSoNguoi(n => Math.min(30, n + 1))}
                  className="w-14 h-14 rounded-full border-2 border-gray-300 text-3xl font-bold text-gray-600 hover:border-blue-400 flex items-center justify-center"
                >+</button>
              </div>
              <div className="flex gap-2 mt-3 justify-center">
                {[2, 4, 6, 8, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setTdcSoNguoi(n)}
                    className={`w-11 h-11 rounded-xl text-sm font-semibold transition-colors ${
                      tdcSoNguoi === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-blue-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Ghi chú */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ghi chú <span className="text-gray-400 font-normal">(tuỳ chọn)</span>
              </label>
              <textarea
                value={tdcGhiChu}
                onChange={e => setTdcGhiChu(e.target.value)}
                placeholder="Yêu cầu đặc biệt, dị ứng thức ăn..."
                rows={2}
                className="w-full border border-gray-300 rounded-2xl px-5 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {tdcLoi && <BannerLoi>{tdcLoi}</BannerLoi>}

            <div className="flex gap-3">
              <BtnHuy onClick={() => setModalThemDatCho(false)} />
              <button
                onClick={xuLyThemDatCho}
                disabled={tdcDangGui}
                className="flex-1 py-4 rounded-2xl bg-blue-600 disabled:bg-blue-300 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-2 transition-colors"
              >
                {tdcDangGui ? <><Spinner /> Đang lưu...</> : 'Lưu đặt chỗ'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal xếp bàn ── */}
      {modalXepBan && (
        <Modal onClose={() => setModalXepBan(null)}>
          <div className="space-y-4">
            {/* Thông tin đặt chỗ */}
            <div>
              <h2 className="text-xl font-bold text-gray-800">Xếp bàn</h2>
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mt-3 space-y-1.5">
                <InfoRow nhan="Khách"    giaTri={modalXepBan.name} />
                <InfoRow nhan="Ngày"     giaTri={`${fmtNgayNgan(modalXepBan.date)} lúc ${fmtGio(modalXepBan.time)}`} />
                <InfoRow nhan="Số người" giaTri={`${modalXepBan.guests} người`} />
                {modalXepBan.note && <InfoRow nhan="Ghi chú" giaTri={modalXepBan.note} />}
              </div>
            </div>

            {/* Loading gợi ý */}
            {xepBanDangTai && (
              <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
                <Spinner cls="border-gray-400" />
                <span className="text-sm">Đang tải gợi ý...</span>
              </div>
            )}

            {/* Tabs bàn đơn / ghép bàn */}
            {!xepBanDangTai && (
              <>
                <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setXepBanTab('don')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      xepBanTab === 'don'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🪑 Bàn đơn
                    {goiYBan.length > 0 && (
                      <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                        {goiYBan.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setXepBanTab('ghep')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      xepBanTab === 'ghep'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    🔗 Ghép bàn
                    {goiYGroups.length > 0 && (
                      <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                        {goiYGroups.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Nội dung tab Bàn đơn */}
                {xepBanTab === 'don' && (
                  <div>
                    {goiYBan.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <p className="text-3xl mb-2">😕</p>
                        <p className="text-sm">Không có bàn đơn đủ chỗ cho {modalXepBan.guests} người</p>
                        <button
                          onClick={() => setXepBanTab('ghep')}
                          className="mt-3 text-sm text-purple-600 font-semibold underline"
                        >
                          Thử ghép bàn →
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5 max-h-52 overflow-y-auto">
                        {goiYBan.map(ban => {
                          const chon = xepBanChon === ban.id;
                          return (
                            <button
                              key={ban.id}
                              onClick={() => setXepBanChon(ban.id)}
                              className={`rounded-xl border-2 p-3 text-left transition-all ${
                                chon ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300'
                              }`}
                            >
                              <p className={`font-bold text-base ${chon ? 'text-blue-700' : 'text-gray-800'}`}>
                                {ban.name}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">{ban.zone} · {ban.capacity} chỗ</p>
                              {ban.reason && <p className="text-xs text-gray-400 mt-0.5">{ban.reason}</p>}
                              {ban.score != null && (
                                <div className="flex items-center gap-1 mt-1.5">
                                  <div className="h-1.5 flex-1 rounded-full bg-gray-200">
                                    <div className="h-full rounded-full bg-blue-400" style={{ width: `${ban.score}%` }} />
                                  </div>
                                  <span className="text-xs text-gray-400">{ban.score}đ</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Nội dung tab Ghép bàn */}
                {xepBanTab === 'ghep' && (
                  <div className="space-y-3">
                    {/* Gợi ý nhanh từ backend */}
                    {goiYGroups.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Gợi ý nhanh
                        </p>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto">
                          {goiYGroups.map((grp, i) => {
                            const tenBan = grp.tables.map(t => t.name).join(' + ');
                            const dsId   = grp.tables.map(t => t.id);
                            const daChon = dsId.length === xepBanGhepIds.length &&
                              dsId.every(id => xepBanGhepIds.includes(id));
                            return (
                              <button
                                key={i}
                                onClick={() => chonNhanhGroup(grp)}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border-2 text-left transition-all ${
                                  daChon
                                    ? 'border-purple-500 bg-purple-50'
                                    : 'border-gray-200 bg-white hover:border-purple-300'
                                }`}
                              >
                                <span className={`text-sm font-semibold ${daChon ? 'text-purple-700' : 'text-gray-800'}`}>
                                  {tenBan}
                                </span>
                                <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                                  {grp.zone} · {grp.total_capacity} chỗ
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3 my-3">
                          <div className="flex-1 h-px bg-gray-200" />
                          <span className="text-xs text-gray-400">hoặc chọn thủ công</span>
                          <div className="flex-1 h-px bg-gray-200" />
                        </div>
                      </div>
                    )}

                    {/* Danh sách tất cả bàn — checkbox multi-select */}
                    <div className="max-h-44 overflow-y-auto space-y-1.5">
                      {danhSachBan.filter(b => b.status === 'active').map(ban => {
                        const chon = xepBanGhepIds.includes(ban.id);
                        return (
                          <button
                            key={ban.id}
                            onClick={() => toggleGhepBan(ban.id)}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-2 text-left transition-all ${
                              chon ? 'border-purple-500 bg-purple-50' : 'border-gray-200 bg-white hover:border-purple-300'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 ${
                              chon ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                            }`}>
                              {chon && <span className="text-white text-xs font-bold leading-none">✓</span>}
                            </div>
                            <span className={`flex-1 text-sm font-semibold ${chon ? 'text-purple-700' : 'text-gray-800'}`}>
                              {ban.name}
                              <span className="font-normal text-gray-400 ml-1.5">{ban.zone}</span>
                            </span>
                            <span className="text-xs text-gray-500 flex-shrink-0">{ban.capacity} chỗ</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Tổng sức chứa đang chọn */}
                    {xepBanGhepIds.length > 0 && (
                      <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                        tongSucChuaGhep < modalXepBan.guests
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-green-50 border border-green-200'
                      }`}>
                        <span className={`text-sm font-semibold ${
                          tongSucChuaGhep < modalXepBan.guests ? 'text-red-700' : 'text-green-700'
                        }`}>
                          {xepBanGhepIds.length} bàn — tổng {tongSucChuaGhep} chỗ
                        </span>
                        {tongSucChuaGhep < modalXepBan.guests ? (
                          <span className="text-xs text-red-600">⚠️ Chưa đủ {modalXepBan.guests} người</span>
                        ) : (
                          <span className="text-xs text-green-600">✓ Đủ chỗ</span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {xepBanLoi && <BannerLoi>{xepBanLoi}</BannerLoi>}

                <div className="flex gap-3">
                  <button
                    onClick={() => xuLyHuyDatCho(modalXepBan.id)}
                    className="px-4 py-4 rounded-2xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
                  >
                    Hủy đặt chỗ
                  </button>
                  <button
                    onClick={xuLyXepBan}
                    disabled={
                      xepBanDangGui ||
                      (xepBanTab === 'don'  && !xepBanChon) ||
                      (xepBanTab === 'ghep' && xepBanGhepIds.length === 0)
                    }
                    className="flex-1 py-4 rounded-2xl bg-blue-600 disabled:bg-blue-200 hover:bg-blue-700 text-white font-bold text-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    {xepBanDangGui ? <><Spinner /> Đang xếp...</> : 'Xác nhận xếp bàn'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═════════════════════════════════════════════════════════════════════════════

// Card đặt chỗ quá giờ (tab Quá giờ)
function CardExpired({ r, onKhoiPhuc, onHuy }) {
  const conLai = tinhConLai(r.date, r.time);

  return (
    <div className="bg-gray-50 rounded-2xl border-2 border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        {/* Dòng 1: ngày giờ + badge thời gian quá */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            {/* Nhãn ngày: "Hôm nay", "Ngày mai", hoặc "Thứ Ba, 13/05" */}
            <p className="text-xs font-medium text-gray-400 leading-tight">{labelNgay(r.date)}</p>
            {/* Giờ nổi bật */}
            <p className="text-xl font-bold text-gray-600 tabular-nums leading-tight">{fmtGio(r.time)}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1.5 rounded-full bg-gray-200 text-gray-600 whitespace-nowrap">
            ⏰ {conLai.text}
          </span>
        </div>

        <p className="text-base font-semibold text-gray-700 truncate">{r.name}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-400">
          <span>👥 {r.guests} người</span>
          {r.phone !== '0000000000' && <span>📞 {r.phone}</span>}
        </div>
        {r.note && <p className="text-sm text-gray-400 italic mt-1 truncate">"{r.note}"</p>}

        {/* 2 nút hành động */}
        <div className="flex gap-2.5 mt-4">
          <button
            onClick={onHuy}
            className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-500 font-semibold text-sm hover:bg-gray-100 transition-colors active:scale-95"
          >
            Huỷ đặt chỗ
          </button>
          <button
            onClick={onKhoiPhuc}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors active:scale-95"
          >
            🔄 Khôi phục
          </button>
        </div>
      </div>
    </div>
  );
}

// Card đặt chỗ chờ xếp bàn (tab Chờ xếp bàn)
function CardPending({ r, onXepBan }) {
  const conLai = tinhConLai(r.date, r.time);

  return (
    <div className={`bg-white rounded-2xl border-2 shadow-sm overflow-hidden transition-all ${
      conLai.past   ? 'border-red-300'    :
      conLai.urgent ? 'border-orange-300' :
                      'border-gray-100'
    }`}>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            {/* Nhãn ngày: "Hôm nay", "Ngày mai", hoặc "Thứ Ba, 13/05" */}
            <p className="text-xs font-medium text-gray-400 leading-tight">{labelNgay(r.date)}</p>
            {/* Giờ nổi bật */}
            <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{fmtGio(r.time)}</p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1.5 rounded-full whitespace-nowrap ${
            conLai.past   ? 'bg-red-100 text-red-700'      :
            conLai.urgent ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-100 text-gray-500'
          }`}>
            {conLai.past && '⚠️ '}{conLai.text}
          </span>
        </div>

        <p className="text-lg font-semibold text-gray-800 truncate">{r.name}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
          <span>👥 {r.guests} người</span>
          {r.phone !== '0000000000' && <span>📞 {r.phone}</span>}
        </div>
        {r.note && <p className="text-sm text-gray-400 italic mt-1.5 truncate">"{r.note}"</p>}

        <button
          onClick={onXepBan}
          className={`w-full mt-4 font-bold rounded-xl py-3.5 text-base transition-all active:scale-95 ${
            conLai.urgent
              ? 'bg-orange-500 hover:bg-orange-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          🪑 Xếp bàn
        </button>
      </div>
    </div>
  );
}

function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-8"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl p-6 pb-10 max-h-[92vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ nhan, giaTri }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 flex-shrink-0">{nhan}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{giaTri}</span>
    </div>
  );
}

function SoLuong({ so, nhan, mau }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold ${mau}`}>{so}</p>
      <p className="text-xs text-gray-500 mt-0.5">{nhan}</p>
    </div>
  );
}

function BtnHuy({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-lg hover:bg-gray-50 transition-colors">
      Huỷ
    </button>
  );
}

function BannerLoi({ children }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex gap-2">
      <span>⚠️</span><span>{children}</span>
    </div>
  );
}

function Spinner({ cls = 'border-white' }) {
  return <span className={`w-5 h-5 border-2 ${cls} border-t-transparent rounded-full animate-spin inline-block`} />;
}

// ═════════════════════════════════════════════════════════════════════════════
// Page export
// ═════════════════════════════════════════════════════════════════════════════

export default function NhanVienPage() {
  return (
    <ProtectedPage>
      <NhanVienContent />
    </ProtectedPage>
  );
}

function NhanVienContent() {
  const [daXacThuc, setDaXacThuc] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('nv_auth') === '1') setDaXacThuc(true);
  }, []);

  const dangXuat = () => {
    sessionStorage.removeItem('nv_auth');
    setDaXacThuc(false);
  };

  if (!daXacThuc) return <ManHinhPIN onSuccess={() => setDaXacThuc(true)} />;
  return <AppNhanVien onLogout={dangXuat} />;
}
