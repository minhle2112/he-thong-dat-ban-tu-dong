'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Giá trị mặc định khi chưa tải được settings
const DEFAULT_SETTINGS = {
  max_per_slot:     0,
  slot_interval:    30,
  buffer_minutes:   30,
  duration_minutes: 90,
  schedules: [
    {
      id: 'g1', label: 'Tất cả ngày', days: [0, 1, 2, 3, 4, 5, 6], enabled: true,
      shifts: [
        { id: 's1', label: 'Trưa', from: '11:00', to: '14:30' },
        { id: 's2', label: 'Tối',  from: '17:30', to: '21:30' },
      ],
    },
  ],
};

// Chuyển "HH:MM" sang tổng số phút
function toPhut(gio) {
  const [h, m] = gio.split(':').map(Number);
  return h * 60 + m;
}

// Tạo danh sách khung giờ từ một ca (from → to, bước interval phút)
function generateSlots(from, to, interval) {
  const slots = [];
  let t = toPhut(from);
  const end = toPhut(to);
  while (t < end) {
    const h = Math.floor(t / 60).toString().padStart(2, '0');
    const m = (t % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    t += interval;
  }
  return slots;
}

// Lấy lịch áp dụng cho một ngày cụ thể (theo getDay())
function getScheduleForDate(dateStr, schedules) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return schedules.find(s => s.enabled && s.days.includes(day)) || null;
}

// Tạo toàn bộ khung giờ cho một ngày theo settings
function getSlotsForDate(dateStr, settings) {
  const s = settings || DEFAULT_SETTINGS;
  const schedule = getScheduleForDate(dateStr, s.schedules || []);
  if (!schedule) return [];
  const interval = s.slot_interval || 30;
  return schedule.shifts.flatMap(shift => generateSlots(shift.from, shift.to, interval));
}

// Số phút hiện tại theo local timezone (không dùng UTC)
function gioHienTaiPhut() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// Ngày hôm nay theo local timezone — tránh lệch múi giờ khi dùng toISOString()
function ngayHomNayLocal() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Khung giờ có thể chọn không?
// Hôm nay: phải còn cách hiện tại > bufferPhut phút
// Ngày khác: luôn cho phép
function coTheChon(kg, laHomNay, nowPhut, bufferPhut) {
  if (!laHomNay) return true;
  return toPhut(kg) > nowPhut + (bufferPhut ?? 30);
}

// Tính số chỗ còn trống cho một khung giờ cụ thể
// maxPerSlot: giới hạn số lượt đặt (0 = không giới hạn)
// durationPhut: thời gian sử dụng bàn (phút) — đọc từ settings
function tinhConLai(khungGio, danhSachDatBan, tongSucChua, maxPerSlot, durationPhut) {
  const dur   = durationPhut || 90;
  const start = toPhut(khungGio);
  const end   = start + dur;
  const active = (r) => !['cancelled', 'no_show', 'completed'].includes(r.status);

  // max_per_slot: chỉ đếm đặt chỗ có giờ CHÍNH XÁC bằng khung giờ này.
  // Không dùng overlap vì một đặt chỗ 12:00 kéo dài đến 13:30 không được
  // tính vào quota của khung 12:30 hay 13:00.
  if (maxPerSlot > 0) {
    const cungGio = danhSachDatBan.filter(r => active(r) && toPhut(r.time) === start);
    if (cungGio.length >= maxPerSlot) return 0;
  }

  // Tính số ghế đã chiếm dựa trên tất cả đặt chỗ có overlap theo duration
  const daChiem = danhSachDatBan
    .filter(r => {
      if (!active(r)) return false;
      const rStart = toPhut(r.time);
      const rEnd   = rStart + dur;
      return rStart < end && rEnd > start;
    })
    .reduce((tong, r) => tong + (r.guests || 0), 0);

  return Math.max(0, tongSucChua - daChiem);
}

// Format ngày sang tiếng Việt đầy đủ
function formatNgay(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Validate số điện thoại Việt Nam (đầu 03x, 05x, 07x, 08x, 09x)
function kiemTraSDT(sdt) {
  const chuanHoa = sdt.replace(/[\s\-\.]/g, '');
  return /^(0[35789]\d{8}|84[35789]\d{8}|\+84[35789]\d{8})$/.test(chuanHoa);
}

// Tạo mã đặt chỗ từ ID
function taoMa(id) {
  return `RES${String(id).padStart(6, '0')}`;
}

// ─── Component chính ────────────────────────────────────────────────────────

// App chỉ có 1 nhà hàng — không cần ?r= param nữa
export default function DatBanPage() {
  const restaurantId = 1;

  // Thông tin nhà hàng (tên hiển thị)
  const [restaurant, setRestaurant] = useState(null);
  const [dangTaiNhaHang, setDangTaiNhaHang] = useState(true);
  const [linkKhongHopLe, setLinkKhongHopLe] = useState(false);
  // Lỗi hệ thống (khác với link không hợp lệ): RLS chặn, mạng lỗi, v.v.
  const [loiHeThong, setLoiHeThong] = useState('');

  // 1 = chọn giờ, 2 = nhập thông tin, 3 = thành công
  const [buoc, setBuoc] = useState(1);

  // Dữ liệu bước 1
  const [ngay, setNgay] = useState('');
  const [gio, setGio] = useState('');
  const [soNguoi, setSoNguoi] = useState(2);

  // Dữ liệu bước 2
  const [hoTen, setHoTen] = useState('');
  const [dienThoai, setDienThoai] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  // Trạng thái UI
  const [dangTaiKhung, setDangTaiKhung] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [ketQua, setKetQua] = useState(null);

  // Cấu hình từ server (settings)
  const [settings, setSettings] = useState(null);

  // Dữ liệu tính toán khả dụng
  const [tongSucChua, setTongSucChua] = useState(0);
  const [danhSachDat, setDanhSachDat] = useState([]);
  const [conLaiTheoGio, setConLaiTheoGio] = useState({});

  // Giờ hiện tại (phút) — cập nhật mỗi 60 giây để ẩn khung giờ đã qua
  const [nowPhut, setNowPhut] = useState(gioHienTaiPhut);

  const homNay = ngayHomNayLocal();
  // True nếu ngày khách đang chọn là hôm nay
  const laHomNay = ngay === homNay;

  // Tải thông tin nhà hàng và settings khi mount
  useEffect(() => {
    // Lấy thông tin nhà hàng (name + settings) trong 1 query
    supabase
      .from('restaurants')
      .select('id, name, settings')
      .eq('id', restaurantId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setRestaurant(data);
          if (data.settings) setSettings(data.settings);
          return;
        }
        // PGRST116 = 0 rows: nhà hàng không tồn tại HOẶC RLS đang chặn anon read
        // Các lỗi khác (mạng, cấu hình Supabase) → hiện thông báo riêng
        if (error && error.code !== 'PGRST116') {
          setLoiHeThong(`Không thể kết nối hệ thống (${error.code || error.message}). Vui lòng thử lại sau.`);
        } else {
          setLinkKhongHopLe(true);
        }
      })
      .catch((e) => setLoiHeThong('Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.'))
      .finally(() => setDangTaiNhaHang(false));
  }, [restaurantId]);

  // Interval cập nhật giờ hiện tại mỗi 60 giây
  useEffect(() => {
    const id = setInterval(() => setNowPhut(gioHienTaiPhut()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Nếu đang ở bước 1 và khung giờ đã chọn bị qua giờ → tự động bỏ chọn
  useEffect(() => {
    const buf = (settings || DEFAULT_SETTINGS).buffer_minutes ?? 30;
    if (buoc === 1 && gio && laHomNay && !coTheChon(gio, true, nowPhut, buf)) {
      setGio('');
    }
  }, [nowPhut, gio, laHomNay, buoc, settings]);

  // Khi chọn ngày (hoặc settings thay đổi) → tải dữ liệu bàn và đặt chỗ để tính chỗ trống
  useEffect(() => {
    if (!ngay) return;

    const s = settings || DEFAULT_SETTINGS;

    const layDuLieu = async () => {
      setDangTaiKhung(true);
      setGio('');
      setLoi('');
      try {
        // Dùng Supabase client trực tiếp (public RLS policy cho phép đọc)
        const [resBan, resDat] = await Promise.all([
          supabase.from('tables').select('id, capacity').eq('restaurant_id', restaurantId).eq('status', 'active'),
          supabase.from('reservations').select('id, time, guests, status').eq('restaurant_id', restaurantId).eq('date', ngay),
        ]);

        const danhSachBan    = resBan.data  || [];
        const danhSachDatBan = resDat.data  || [];

        // Tổng sức chứa = tổng capacity của tất cả bàn đang hoạt động
        const tong = danhSachBan.reduce((acc, b) => acc + (b.capacity || 0), 0);
        setTongSucChua(tong);
        setDanhSachDat(danhSachDatBan);

        // Tính số chỗ còn lại cho từng khung giờ theo settings
        const slots = getSlotsForDate(ngay, s);
        const map = {};
        slots.forEach(kg => {
          map[kg] = tinhConLai(kg, danhSachDatBan, tong, s.max_per_slot || 0, s.duration_minutes || 90);
        });
        setConLaiTheoGio(map);
      } catch {
        setLoi('Không thể tải thông tin. Vui lòng thử lại.');
      } finally {
        setDangTaiKhung(false);
      }
    };

    layDuLieu();
  }, [ngay, settings]);

  // Gửi yêu cầu đặt bàn
  const xuLyDatBan = async () => {
    // Validate trước khi gửi
    if (!hoTen.trim()) {
      setLoi('Vui lòng nhập họ tên.');
      return;
    }
    if (!kiemTraSDT(dienThoai)) {
      setLoi('Số điện thoại không đúng định dạng Việt Nam (vd: 0901234567).');
      return;
    }

    setDangGui(true);
    setLoi('');

    try {
      // Dùng Supabase INSERT trực tiếp (public_insert_reservations policy cho phép)
      const { data, error } = await supabase
        .from('reservations')
        .insert({
          restaurant_id: restaurantId,
          table_id:      null,
          status:        'pending',
          date:          ngay,
          time:          gio,
          guests:        soNguoi,
          name:          hoTen.trim(),
          phone:         dienThoai.replace(/[\s\-\.]/g, ''),
          note:          ghiChu.trim() || null,
        })
        .select()
        .single();

      if (error) throw new Error(error.message || 'Đặt bàn không thành công');

      setKetQua(data);
      setBuoc(3);
    } catch (e) {
      setLoi(e.message || 'Đặt bàn thất bại. Vui lòng thử lại sau.');
    } finally {
      setDangGui(false);
    }
  };

  // Reset toàn bộ form để đặt lại
  const datLai = () => {
    setBuoc(1);
    setNgay('');
    setGio('');
    setSoNguoi(2);
    setHoTen('');
    setDienThoai('');
    setGhiChu('');
    setLoi('');
    setKetQua(null);
    setConLaiTheoGio({});
  };

  // Khung giờ theo settings cho ngày đang chọn
  const s = settings || DEFAULT_SETTINGS;
  const bufferPhut = s.buffer_minutes ?? 30;
  const khoungGioHomNay = ngay ? getSlotsForDate(ngay, s) : [];

  // Hôm nay đã qua hết khung giờ hợp lệ (kể cả buffer) — hiện thông báo riêng
  const tatCaQua =
    ngay && laHomNay && !dangTaiKhung &&
    khoungGioHomNay.every(kg => !coTheChon(kg, true, nowPhut, bufferPhut));

  // Tất cả khung giờ còn lại (chưa qua + còn buffer) đều hết chỗ
  const tatCaHetCho =
    ngay && !dangTaiKhung && !tatCaQua &&
    khoungGioHomNay
      .filter(kg => coTheChon(kg, laHomNay, nowPhut, bufferPhut))
      .every(kg => (conLaiTheoGio[kg] ?? 0) <= 0);

  // Đang tải thông tin nhà hàng — hiện spinner toàn trang
  if (dangTaiNhaHang) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:bg-gray-900 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <span className="w-8 h-8 border-4 border-gray-200 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-sm">Đang tải...</p>
        </div>
      </div>
    );
  }

  // Lỗi hệ thống (mạng, RLS cấu hình sai, v.v.) — khác với "link không hợp lệ"
  if (loiHeThong) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:bg-gray-900 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Không thể tải trang
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {loiHeThong}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // Nhà hàng chưa được cài đặt trong hệ thống
  if (linkKhongHopLe) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:bg-gray-900 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 max-w-sm w-full text-center space-y-4">
          <div className="text-5xl">🍽️</div>
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">
            Chưa có dữ liệu nhà hàng
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Hệ thống chưa được cài đặt. Vui lòng liên hệ quản trị viên.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:bg-gray-900 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900">
      {/* dark:from/via/to-gray-900 override gradient thành solid gray-900 khi dark mode */}
      {/* ── Header ── */}
      {/* bg-white/80 có opacity nên cần dark riêng (globals.css không bắt được /80) */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-amber-100 sticky top-0 z-10 dark:bg-gray-900/95 dark:border-gray-700">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🍽️</span>
          <div>
            {/* Tên nhà hàng từ DB, fallback về "Đặt Bàn Online" */}
            <h1 className="text-base font-bold text-gray-800 dark:text-gray-100 leading-tight">
              {restaurant?.name || 'Đặt Bàn Online'}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Nhanh chóng · Tiện lợi · Miễn phí</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 pb-16">
        {/* ── Thanh tiến trình (chỉ hiện ở bước 1 và 2) ── */}
        {buoc < 3 && (
          <div className="flex items-center gap-2 mb-6">
            <BuocTienTrinh so={1} nhan="Chọn giờ" active={buoc >= 1} done={buoc > 1} />
            <div className={`flex-1 h-0.5 rounded-full transition-colors ${buoc >= 2 ? 'bg-amber-400' : 'bg-gray-200'}`} />
            <BuocTienTrinh so={2} nhan="Thông tin" active={buoc >= 2} done={false} />
          </div>
        )}

        {/* ════════════════════════════════════════════════
            BƯỚC 1: Chọn ngày, khung giờ, số người
        ════════════════════════════════════════════════ */}
        {buoc === 1 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6 dark:bg-gray-800 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Khi nào bạn muốn đến?</h2>
              <p className="text-sm text-gray-500 mt-0.5">Chọn ngày và khung giờ phù hợp</p>
            </div>

            {/* Chọn ngày */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                📅 Ngày
              </label>
              {/* Input cần dark:bg riêng vì browser không tự đổi màu input */}
              <input
                type="date"
                min={homNay}
                value={ngay}
                onChange={e => { setNgay(e.target.value); setLoi(''); }}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent text-base dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>

            {/* Chọn khung giờ — chỉ hiện sau khi chọn ngày */}
            {ngay && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  🕐 Khung giờ
                  {gio && (
                    <span className="ml-2 text-amber-600 font-normal">Đã chọn: {gio}</span>
                  )}
                </label>

                {dangTaiKhung ? (
                  <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-amber-400 rounded-full animate-spin" />
                    <span className="text-sm">Đang tải khung giờ...</span>
                  </div>
                ) : tatCaQua ? (
                  /* Hôm nay đã hết giờ hợp lệ (qua buffer) */
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center dark:bg-orange-900/20 dark:border-orange-700">
                    <p className="text-orange-700 font-medium text-sm dark:text-orange-300">
                      Hôm nay không còn khung giờ trống.
                    </p>
                    <p className="text-orange-500 text-xs mt-1 dark:text-orange-400">
                      Vui lòng chọn ngày khác.
                    </p>
                  </div>
                ) : tatCaHetCho ? (
                  /* Còn giờ hợp lệ nhưng tất cả đã hết chỗ */
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center dark:bg-red-900/20 dark:border-red-700">
                    <p className="text-red-600 font-medium text-sm dark:text-red-300">Ngày này đã hết chỗ trống</p>
                    <p className="text-red-400 text-xs mt-1 dark:text-red-400">Vui lòng chọn ngày khác</p>
                  </div>
                ) : (
                  <>
                    {/* Hiển thị từng ca theo cấu hình settings */}
                    {(getScheduleForDate(ngay, s.schedules || [])?.shifts || []).map(shift => (
                      <NhomGio
                        key={shift.id}
                        nhan={shift.label}
                        danhSach={generateSlots(shift.from, shift.to, s.slot_interval || 30)}
                        conLaiTheoGio={conLaiTheoGio}
                        laHomNay={laHomNay}
                        nowPhut={nowPhut}
                        bufferPhut={bufferPhut}
                        gioChon={gio}
                        onChon={kg => { setGio(kg); setLoi(''); }}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Chọn số người — chỉ hiện sau khi chọn giờ */}
            {ngay && gio && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  👥 Số người
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSoNguoi(n => Math.max(1, n - 1))}
                    className="w-11 h-11 rounded-full border-2 border-gray-300 text-gray-600 font-bold text-xl hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center justify-center"
                  >
                    −
                  </button>
                  <div className="text-center">
                    <span className="text-3xl font-bold text-gray-800">{soNguoi}</span>
                    <p className="text-xs text-gray-400 mt-0.5">người</p>
                  </div>
                  <button
                    onClick={() => setSoNguoi(n => Math.min(20, n + 1))}
                    className="w-11 h-11 rounded-full border-2 border-gray-300 text-gray-600 font-bold text-xl hover:border-amber-400 hover:text-amber-600 transition-colors flex items-center justify-center"
                  >
                    +
                  </button>

                  {/* Gợi ý nhanh */}
                  <div className="flex gap-1.5 ml-2 flex-wrap">
                    {[2, 4, 6, 8].map(n => (
                      <button
                        key={n}
                        onClick={() => setSoNguoi(n)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                          soNguoi === n
                            ? 'bg-amber-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-amber-100'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cảnh báo nếu số người nhiều hơn chỗ trống ước tính */}
                {conLaiTheoGio[gio] > 0 && soNguoi > conLaiTheoGio[gio] && (
                  <p className="text-amber-600 text-xs mt-2 bg-amber-50 rounded-lg px-3 py-2 dark:bg-amber-900/20 dark:text-amber-300">
                    ⚠️ Khung giờ này còn khoảng {conLaiTheoGio[gio]} chỗ. Nhà hàng sẽ cố gắng sắp xếp tốt nhất cho bạn.
                  </p>
                )}
              </div>
            )}

            {loi && <ThongBaoLoi>{loi}</ThongBaoLoi>}

            <button
              disabled={!ngay || !gio || soNguoi < 1}
              onClick={() => { setBuoc(2); setLoi(''); }}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-xl py-3.5 transition-colors text-base"
            >
              Tiếp theo →
            </button>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            BƯỚC 2: Nhập thông tin liên hệ
        ════════════════════════════════════════════════ */}
        {buoc === 2 && (
          <div className="space-y-4">
            {/* Tóm tắt lựa chọn từ bước 1 */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center justify-between dark:bg-amber-900/20 dark:border-amber-700">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{formatNgay(ngay)}</p>
                <p className="text-amber-600 text-sm mt-0.5 dark:text-amber-300">
                  🕐 {gio} &nbsp;·&nbsp; 👥 {soNguoi} người
                </p>
              </div>
              <button
                onClick={() => { setBuoc(1); setLoi(''); }}
                className="text-amber-600 text-sm hover:text-amber-800 font-medium underline underline-offset-2 dark:text-amber-400 dark:hover:text-amber-300"
              >
                Sửa
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 dark:bg-gray-800 dark:border-gray-700">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Thông tin liên hệ</h2>
                <p className="text-sm text-gray-500 mt-0.5">Để nhà hàng xác nhận chỗ cho bạn</p>
              </div>

              {/* Họ tên */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Họ tên <BatBuoc />
                </label>
                <input
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={hoTen}
                  onChange={e => { setHoTen(e.target.value); setLoi(''); }}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </div>

              {/* Số điện thoại */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Số điện thoại <BatBuoc />
                </label>
                <input
                  type="tel"
                  placeholder="0901 234 567"
                  value={dienThoai}
                  onChange={e => { setDienThoai(e.target.value); setLoi(''); }}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">Định dạng: 0901234567 hoặc +84901234567</p>
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Ghi chú{' '}
                  <span className="text-gray-400 font-normal">(tuỳ chọn)</span>
                </label>
                <textarea
                  placeholder="Sinh nhật, dị ứng thực phẩm, yêu cầu bàn riêng, v.v."
                  value={ghiChu}
                  onChange={e => setGhiChu(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                />
              </div>

              {loi && <ThongBaoLoi>{loi}</ThongBaoLoi>}

              {/* Nút xác nhận */}
              <button
                onClick={xuLyDatBan}
                disabled={dangGui}
                className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-semibold rounded-xl py-3.5 transition-colors text-base flex items-center justify-center gap-2"
              >
                {dangGui ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  'Xác nhận đặt bàn'
                )}
              </button>

              <p className="text-xs text-gray-400 text-center leading-relaxed">
                Hệ thống sẽ tự động sắp xếp bàn phù hợp nhất cho bạn.
                <br />Không cần thanh toán trước.
              </p>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════
            BƯỚC 3: Đặt bàn thành công
        ════════════════════════════════════════════════ */}
        {buoc === 3 && ketQua && (
          <div className="space-y-4">
            {/* Banner thành công */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center dark:bg-gray-800 dark:border-gray-700">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl dark:bg-green-900/30">
                ✅
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Đặt bàn thành công!</h2>
              <p className="text-gray-500 mt-1.5 text-sm">
                Nhà hàng đã nhận được yêu cầu của bạn.
              </p>
            </div>

            {/* Thẻ xác nhận */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden dark:bg-gray-800 dark:border-gray-700">
              {/* Mã đặt chỗ */}
              <div className="bg-amber-500 px-6 py-5 text-center">
                <p className="text-amber-100 text-sm font-medium mb-1">Mã đặt chỗ của bạn</p>
                <p className="text-4xl font-bold text-white tracking-widest">
                  {taoMa(ketQua.id)}
                </p>
                <p className="text-amber-200 text-xs mt-2">
                  Lưu lại mã này để liên hệ khi cần
                </p>
              </div>

              {/* Chi tiết đặt bàn */}
              <div className="px-6 py-5 space-y-3.5 divide-y divide-gray-50 dark:divide-gray-700">
                <HangThongTin nhan="📅 Ngày" giaTri={formatNgay(ketQua.date)} />
                <HangThongTin nhan="🕐 Giờ" giaTri={ketQua.time} />
                <HangThongTin nhan="👥 Số người" giaTri={`${ketQua.guests} người`} />
                <HangThongTin nhan="👤 Tên" giaTri={ketQua.name} />
                <HangThongTin nhan="📞 Điện thoại" giaTri={ketQua.phone} />
                {ketQua.note && (
                  <HangThongTin nhan="📝 Ghi chú" giaTri={ketQua.note} />
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4 dark:bg-blue-900/20 dark:border-blue-700">
              <p className="text-blue-700 text-sm leading-relaxed dark:text-blue-300">
                💡 Vui lòng đến đúng giờ. Nếu cần hủy hoặc thay đổi, hãy liên hệ nhà hàng và cung cấp mã đặt chỗ bên trên.
              </p>
            </div>

            <button
              onClick={datLai}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl py-3.5 transition-colors text-base"
            >
              Đặt bàn khác
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Hiển thị nhóm khung giờ theo tên ca (từ settings)
// Ẩn: khung giờ hết chỗ, đã qua giờ, hoặc trong buffer tối thiểu
function NhomGio({ nhan, danhSach, conLaiTheoGio, laHomNay, nowPhut, bufferPhut, gioChon, onChon }) {
  // Lọc: phải còn chỗ VÀ chưa qua buffer
  const dsHienThi = danhSach.filter(kg =>
    (conLaiTheoGio[kg] ?? 0) > 0 && coTheChon(kg, laHomNay, nowPhut, bufferPhut)
  );

  // Nếu không còn khung giờ nào trong nhóm → ẩn cả nhóm
  if (dsHienThi.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{nhan}</p>
      <div className="grid grid-cols-3 gap-2">
        {dsHienThi.map(kg => {
          const conLai = conLaiTheoGio[kg] ?? 0;
          const daCho  = gioChon === kg;
          return (
            <button
              key={kg}
              onClick={() => onChon(kg)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all border ${
                daCho
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md scale-[1.02]'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:border-amber-500 dark:hover:bg-amber-900/20'
              }`}
            >
              <div>{kg}</div>
              <div className={`text-xs font-normal mt-0.5 ${daCho ? 'text-amber-100' : 'text-gray-400 dark:text-gray-400'}`}>
                ~{conLai} chỗ
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Hiển thị bước trong thanh tiến trình
function BuocTienTrinh({ so, nhan, active, done }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
          done
            ? 'bg-green-500 text-white'
            : active
              ? 'bg-amber-500 text-white'
              : 'bg-gray-200 text-gray-400'
        }`}
      >
        {done ? '✓' : so}
      </div>
      <span className={`text-sm font-medium ${active ? 'text-gray-700' : 'text-gray-400'}`}>
        {nhan}
      </span>
    </div>
  );
}

// Một hàng thông tin trong thẻ xác nhận
function HangThongTin({ nhan, giaTri }) {
  return (
    <div className="flex justify-between items-start gap-4 pt-3 first:pt-0">
      <span className="text-sm text-gray-500 flex-shrink-0">{nhan}</span>
      <span className="text-sm font-semibold text-gray-800 text-right">{giaTri}</span>
    </div>
  );
}

// Hiển thị thông báo lỗi
function ThongBaoLoi({ children }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm flex gap-2 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300">
      <span className="flex-shrink-0">⚠️</span>
      <span>{children}</span>
    </div>
  );
}

// Dấu bắt buộc (*)
function BatBuoc() {
  return <span className="text-red-500 ml-0.5">*</span>;
}
