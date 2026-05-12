'use client';

// Pending được quản lý ở trang Nhân Viên, không hiện trên dashboard
const STATUS_TABS = [
  { value: 'all',       label: 'Tất cả' },
  { value: 'confirmed', label: 'Đã xếp bàn' },
  { value: 'seated',    label: 'Đang ngồi' },
  { value: 'completed', label: 'Xong' },
  { value: 'cancelled', label: 'Huỷ' },
];

const BADGE_CLASS = {
  pending:   'badge badge-pending',
  confirmed: 'badge badge-confirmed',
  seated:    'badge badge-seated',
  completed: 'badge badge-completed',
  cancelled: 'badge badge-cancelled',
  no_show:   'badge badge-no_show',
};

const STATUS_VN = {
  pending:   'Chờ xếp bàn',
  confirmed: 'Đã xếp bàn',
  seated:    'Đang ngồi',
  completed: 'Hoàn thành',
  cancelled: 'Đã huỷ',
  no_show:   'Không đến',
};

function fmtTime(t) { return (t || '').substring(0, 5); }

function ReservationCard({ r, onCheckIn, onComplete, onCancel, onAssign }) {
  const isPending   = r.status === 'pending';
  const canCheckIn  = r.status === 'confirmed';
  const canComplete = r.status === 'seated';
  const canCancel   = ['pending', 'confirmed', 'seated'].includes(r.status);

  // Hiển thị bàn: bàn chính hoặc danh sách bàn ghép
  const tableLabel = (() => {
    if (isPending) return null;
    if (Array.isArray(r.group_table_ids) && r.group_table_ids.length > 1) {
      return `🔗 Ghép bàn (${r.table_name})`;
    }
    return r.table_name ? `🪑 ${r.table_name}${r.zone ? ` (${r.zone})` : ''}` : null;
  })();

  return (
    <div className={`bg-white border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow
      ${isPending ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100'}`}>
      {/* Hàng 1: giờ + tên + badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-bold text-gray-800 shrink-0">{fmtTime(r.time)}</span>
          <span className="font-medium text-gray-700 truncate">{r.name}</span>
        </div>
        <span className={BADGE_CLASS[r.status] || 'badge'}>{STATUS_VN[r.status]}</span>
      </div>

      {/* Hàng 2: chi tiết */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500 mb-2.5">
        <span>📞 {r.phone}</span>
        <span>👥 {r.guests} người</span>
        {tableLabel && <span>{tableLabel}</span>}
        {isPending && <span className="text-orange-500 font-medium">⏳ Chưa có bàn</span>}
        {r.note && <span className="text-gray-400 italic truncate w-full">"{r.note}"</span>}
      </div>

      {/* Nút hành động */}
      <div className="flex gap-2 flex-wrap">
        {isPending && (
          <button
            className="btn btn-primary text-xs"
            onClick={() => onAssign(r)}
          >
            🪑 Xếp bàn
          </button>
        )}
        {canCheckIn && (
          <button className="btn btn-success text-xs" onClick={() => onCheckIn(r.id)}>
            ✓ Check-in
          </button>
        )}
        {canComplete && (
          <button className="btn btn-primary text-xs" onClick={() => onComplete(r.id)}>
            ✓ Hoàn thành
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-ghost text-xs text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => onCancel(r.id)}
          >
            Huỷ
          </button>
        )}
      </div>
    </div>
  );
}

export default function ReservationList({
  reservations, statusFilter, onFilterChange,
  onCheckIn, onComplete, onCancel, onAssign,
  pendingCount,
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Filter tabs */}
      <div className="flex gap-1 px-4 pt-4 pb-3 overflow-x-auto shrink-0">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => onFilterChange(tab.value)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${statusFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Số lượng */}
      <p className="px-4 text-xs text-gray-400 mb-2 shrink-0">
        {reservations.length} đặt chỗ
      </p>

      {/* Danh sách */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
        {reservations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="text-4xl mb-2">📋</span>
            <p className="text-sm">Không có đặt chỗ nào</p>
          </div>
        ) : (
          reservations.map(r => (
            <ReservationCard
              key={r.id}
              r={r}
              onCheckIn={onCheckIn}
              onComplete={onComplete}
              onCancel={onCancel}
              onAssign={onAssign}
            />
          ))
        )}
      </div>
    </div>
  );
}
