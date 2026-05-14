'use client';
import { useState, useEffect } from 'react';
import { STATUS_LABEL } from '../utils/tableStatus';

// ── Màu nền Tailwind theo trạng thái ────────────────────────────
const STATUS_BG = {
  available: 'bg-green-500  hover:bg-green-400',
  reserved:  'bg-amber-400  hover:bg-amber-300',
  occupied:  'bg-red-500    hover:bg-red-400',
  blocked:   'bg-gray-400   hover:bg-gray-300',
};

// Legend: đã bỏ trạng thái "Chặn" vì tính năng chặn bàn không còn trên dashboard
const LEGEND = [
  { status: 'available', color: 'bg-green-500', label: 'Trống' },
  { status: 'reserved',  color: 'bg-amber-400', label: 'Đã xếp bàn' },
  { status: 'occupied',  color: 'bg-red-500',   label: 'Có khách' },
];

// ── Helpers thời gian ────────────────────────────────────────────

function toMin(timeStr) {
  const parts = (timeStr || '').substring(0, 5).split(':');
  return parseInt(parts[0] || 0) * 60 + parseInt(parts[1] || 0);
}

function getNowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function fmtGio(t) { return (t || '').substring(0, 5); }

// "còn 45 phút" / "còn 2 tiếng" / "còn 1g30p"
function fmtConLai(diffMin) {
  if (diffMin < 60) return `còn ${diffMin} phút`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `còn ${h}g${m}p` : `còn ${h} tiếng`;
}

// ── Tìm đặt chỗ theo bàn ────────────────────────────────────────

// Tất cả đặt chỗ confirmed/seated của bàn trong ngày, sắp xếp theo giờ tăng dần
function getTableReservations(tableId, reservations) {
  return reservations
    .filter(r => {
      if (!['confirmed', 'seated'].includes(r.status)) return false;
      const isMain  = r.table_id === tableId;
      const isGroup = Array.isArray(r.group_table_ids) && r.group_table_ids.includes(tableId);
      return isMain || isGroup;
    })
    .sort((a, b) => toMin(a.time) - toMin(b.time));
}

/**
 * Xây dựng map: tableId → thông tin ghép bàn của đặt chỗ liên quan
 * Trả về: { [tableId]: { reservationId, guestName, allTableIds, allTableNames } }
 */
function buildGroupMap(reservations, tables) {
  const tableById = Object.fromEntries(tables.map(t => [t.id, t]));
  const map = {};

  for (const r of reservations) {
    if (!Array.isArray(r.group_table_ids) || r.group_table_ids.length < 2) continue;
    if (['cancelled', 'completed', 'no_show', 'pending'].includes(r.status)) continue;

    const names = r.group_table_ids
      .map(id => tableById[id]?.name || `#${id}`)
      .join(', ');

    for (const id of r.group_table_ids) {
      map[id] = {
        reservationId: r.id,
        guestName:     r.name,
        allTableIds:   r.group_table_ids,
        allTableNames: names,
      };
    }
  }
  return map;
}

// ── Card một bàn ─────────────────────────────────────────────────

// Tối đa 2 đặt chỗ hiện trực tiếp, phần còn lại hiện "+X nữa"
const MAX_SHOW = 2;

function TableCard({ table, status, isSelected, onClick, groupInfo, tableReservations, nowMin, isToday }) {
  const isGrouped = !!groupInfo;

  // Tên ngắn: lấy từ cuối (họ cuối trong tiếng Việt)
  const shortName = (name) => (name || '').split(' ').pop() || name || '';

  // Màu chữ cho từng dòng đặt chỗ theo trạng thái + thời gian
  function rowTextColor(r) {
    if (r.status === 'seated') return 'text-white';
    // Confirmed sắp đến trong vòng 30 phút → đỏ nhạt để cảnh báo
    if (isToday) {
      const diffMin = toMin(r.time) - nowMin;
      if (diffMin >= 0 && diffMin < 30) return 'text-red-200 font-semibold';
    }
    return 'text-yellow-100';
  }

  const shown = tableReservations.slice(0, MAX_SHOW);
  const extra = tableReservations.length - MAX_SHOW;

  return (
    <button
      onClick={() => onClick(table)}
      title={isGrouped ? `Ghép bàn: ${groupInfo.allTableNames}\nKhách: ${groupInfo.guestName}` : undefined}
      className={`
        relative rounded-xl p-3 text-white text-left transition-all duration-150 cursor-pointer w-full
        ${STATUS_BG[status] || STATUS_BG.available}
        ${isSelected ? 'ring-2 ring-white ring-offset-2 scale-105 shadow-lg' : 'shadow-sm hover:shadow-md hover:scale-[1.02]'}
        ${isGrouped ? 'ring-1 ring-white/40' : ''}
      `}
    >
      {/* Tên bàn + sức chứa trên cùng hàng */}
      <div className="flex items-baseline justify-between gap-1">
        <p className="font-bold text-sm leading-tight truncate">{table.name}</p>
        <p className="text-[10px] opacity-70 shrink-0">{table.capacity}c</p>
      </div>

      {/* Danh sách đặt chỗ trong ngày — mỗi dòng: giờ · tên · số người */}
      {tableReservations.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {shown.map(r => (
            <p key={r.id} className={`text-[10px] leading-snug truncate ${rowTextColor(r)}`}>
              {fmtGio(r.time)} · {shortName(r.name)} · {r.guests}ng
            </p>
          ))}
          {extra > 0 && (
            <p className="text-[10px] opacity-55">+{extra} nữa</p>
          )}
        </div>
      ) : (
        // Không có đặt chỗ → hiện nhãn trạng thái mặc định
        <p className="text-[10px] opacity-65 mt-1">{STATUS_LABEL[status]}</p>
      )}

      {/* Icon xích nếu bàn đang ghép */}
      {isGrouped && (
        <span
          className="absolute top-1.5 right-1.5 text-[12px] opacity-90"
          title={`Ghép với: ${groupInfo.allTableNames}`}
        >
          🔗
        </span>
      )}
    </button>
  );
}

// ── Nhóm một khu (zone) ──────────────────────────────────────────

function ZoneSection({ zone, tables, tableStatuses, selectedTable, onTableClick, groupMap, reservations, nowMin, isToday }) {
  return (
    <div className="flex-1 min-w-[200px]">
      <div className="bg-gray-100 rounded-lg px-3 py-1.5 mb-3 text-center">
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{zone}</span>
        <span className="text-xs text-gray-400 ml-1.5">({tables.length} bàn)</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tables.map(table => {
          const status = tableStatuses[table.id] || 'available';
          return (
            <TableCard
              key={table.id}
              table={table}
              status={status}
              isSelected={selectedTable?.id === table.id}
              onClick={onTableClick}
              groupInfo={groupMap[table.id] || null}
              tableReservations={getTableReservations(table.id, reservations)}
              nowMin={nowMin}
              isToday={isToday}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Component chính ──────────────────────────────────────────────

export default function TableMap({ tables, tableStatuses, selectedTable, onTableClick, reservations = [], selectedDate }) {
  // Chỉ hiện thời gian real-time khi đang xem hôm nay
  const isToday = selectedDate === todayStr();

  // Thời điểm hiện tại (phút trong ngày) — cập nhật mỗi 60 giây để "còn X phút" luôn chính xác
  const [nowMin, setNowMin] = useState(getNowMin);
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMin(getNowMin()), 60000);
    return () => clearInterval(id);
  }, [isToday]);

  // Map bàn ghép để hiện icon xích
  const groupMap = buildGroupMap(reservations, tables);

  // Nhóm bàn theo zone — giữ thứ tự xuất hiện lần đầu (theo created_at từ API)
  const zones = [];
  const zoneMap = {};
  for (const t of tables) {
    if (!zoneMap[t.zone]) { zoneMap[t.zone] = []; zones.push(t.zone); }
    zoneMap[t.zone].push(t);
  }

  return (
    <div>
      {/* Chú thích màu */}
      <div className="flex flex-wrap gap-3 mb-4">
        {LEGEND.map(({ status, color, label }) => (
          <span key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-3 h-3 rounded-full ${color}`} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="text-sm">🔗</span>
          Đang ghép bàn
        </span>
      </div>

      {/* Sơ đồ bàn */}
      <div className="flex gap-6 overflow-x-auto pb-2">
        {zones.map(zone => (
          <ZoneSection
            key={zone}
            zone={zone}
            tables={zoneMap[zone]}
            tableStatuses={tableStatuses}
            selectedTable={selectedTable}
            onTableClick={onTableClick}
            groupMap={groupMap}
            reservations={reservations}
            nowMin={nowMin}
            isToday={isToday}
          />
        ))}
      </div>
    </div>
  );
}
