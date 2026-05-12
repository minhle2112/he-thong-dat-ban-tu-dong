// Tính trạng thái hiển thị của bàn dựa trên reservations + blocked_slots + giờ hiện tại

const DURATION_MIN = 90; // thời gian ngồi mặc định (phút)

function toMin(timeStr) {
  const parts = (timeStr || '').substring(0, 5).split(':');
  return parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0);
}

function nowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/**
 * Trả về: 'available' | 'reserved' | 'occupied' | 'blocked'
 *
 * @param {object}   table
 * @param {object[]} reservations  - tất cả đặt chỗ của ngày (bao gồm pending, confirmed, seated)
 * @param {object[]} blockedSlots  - tất cả blocked_slot của ngày
 * @param {boolean}  isToday       - true nếu ngày đang xem là hôm nay
 *
 * Lưu ý: đặt chỗ pending (chưa có bàn) có table_id = null
 * → không ảnh hưởng trạng thái bàn trên sơ đồ.
 * Đặt chỗ ghép bàn: bàn phụ được nhận biết qua group_table_ids của reservation.
 */
export function computeTableStatus(table, reservations, blockedSlots, isToday) {
  if (table.status === 'inactive') return 'blocked';

  const now = isToday ? nowMin() : 0;

  // Kiểm tra blocked_slots
  const blocks = blockedSlots.filter(b => b.table_id === table.id);
  for (const b of blocks) {
    const from = toMin(b.time_from);
    const to   = toMin(b.time_to);
    if (!isToday || (now >= from && now < to)) return 'blocked';
  }

  // Lọc đặt chỗ của bàn này:
  // - table_id khớp trực tiếp (bàn chính), HOẶC
  // - bàn này nằm trong group_table_ids (bàn phụ trong ghép bàn)
  const rsvs = reservations.filter(r => {
    if (['cancelled', 'completed', 'no_show', 'pending', 'expired'].includes(r.status)) return false;
    if (r.table_id === table.id) return true;
    // Bàn phụ trong nhóm ghép
    if (Array.isArray(r.group_table_ids) && r.group_table_ids.includes(table.id)) return true;
    return false;
  });

  for (const r of rsvs) {
    if (r.status === 'seated') return 'occupied';

    if (r.status === 'confirmed') {
      const start = toMin(r.time);
      const end   = start + DURATION_MIN;

      if (isToday) {
        if (now >= start - 15 && now < end) return 'occupied';
        if (now < start && start - now <= 120) return 'reserved';
      } else {
        return 'reserved';
      }
    }
  }

  return 'available';
}

// Màu theo trạng thái
export const STATUS_COLOR = {
  available: '#22c55e',
  reserved:  '#f59e0b',
  occupied:  '#ef4444',
  blocked:   '#9ca3af',
};

export const STATUS_LABEL = {
  available: 'Trống',
  reserved:  'Đã xếp bàn',
  occupied:  'Có khách',
  blocked:   'Chặn',
};

/**
 * Tìm đặt chỗ hiện tại của một bàn (dùng cho modal).
 * Trả về đặt chỗ confirmed/seated gắn với bàn này (trực tiếp hoặc ghép bàn).
 */
export function findReservationForTable(tableId, reservations) {
  return reservations.find(r => {
    if (['cancelled', 'completed', 'no_show', 'pending', 'expired'].includes(r.status)) return false;
    if (r.table_id === tableId) return true;
    if (Array.isArray(r.group_table_ids) && r.group_table_ids.includes(tableId)) return true;
    return false;
  }) || null;
}

/**
 * Lấy tất cả id bàn liên quan đến một đặt chỗ (kể cả ghép bàn).
 */
export function getTableIdsForReservation(reservation) {
  if (!reservation) return [];
  if (Array.isArray(reservation.group_table_ids) && reservation.group_table_ids.length > 0) {
    return reservation.group_table_ids;
  }
  return reservation.table_id ? [reservation.table_id] : [];
}
