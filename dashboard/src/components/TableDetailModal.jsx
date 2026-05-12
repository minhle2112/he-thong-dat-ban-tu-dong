'use client';
import { useState, useMemo } from 'react';
import { STATUS_COLOR, STATUS_LABEL } from '../utils/tableStatus';

function fmtTime(t) { return (t || '').substring(0, 5); }

function toMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function nowMin() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Chuỗi "còn X phút" / "còn Xg Xp" đếm ngược đến giờ đặt
function conLaiText(timeStr) {
  const diff = toMin(timeStr) - nowMin();
  if (diff <= 0) return 'Ngay bây giờ';
  if (diff < 60) return `còn ${diff} phút`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m > 0 ? `còn ${h}g${m}p` : `còn ${h} tiếng`;
}

// Lọc đặt chỗ thuộc một bàn — trực tiếp hoặc qua ghép bàn
function rsvForTable(tableId, reservations) {
  return reservations.filter(r => {
    if (r.table_id === tableId) return true;
    if (Array.isArray(r.group_table_ids) && r.group_table_ids.includes(tableId)) return true;
    return false;
  });
}

// Form đổi bàn — dùng chung cho cả 2 loại card
function ChangeTableForm({ r, tableId, availableTables, onChangeTable }) {
  const [newTableId, setNewTableId] = useState('');
  const [saving,     setSaving]     = useState(false);

  async function handleChange() {
    if (!newTableId) return;
    setSaving(true);
    await onChangeTable(r.id, parseInt(newTableId));
    setSaving(false);
  }

  return (
    <div className="pt-3 border-t space-y-2">
      <p className="text-xs font-medium text-gray-600">Chọn bàn mới:</p>
      <select
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        value={newTableId}
        onChange={e => setNewTableId(e.target.value)}
      >
        <option value="">-- chọn bàn --</option>
        {availableTables
          .filter(t => t.id !== tableId && t.capacity >= r.guests)
          .map(t => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.zone} ({t.capacity} chỗ)
            </option>
          ))}
      </select>
      <button
        onClick={handleChange}
        disabled={!newTableId || saving}
        className="w-full py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40"
      >
        {saving ? 'Đang đổi...' : 'Xác nhận đổi bàn'}
      </button>
    </div>
  );
}

// ── Card đặt chỗ đang diễn ra ────────────────────────────────────
function CardDangDienRa({ r, tableId, availableTables, onComplete, onChangeTable }) {
  const [showChange, setShowChange] = useState(false);

  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
          {r.status === 'seated' ? '🟢 Đang ngồi' : '🕐 Đang diễn ra'}
        </span>
        <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtTime(r.time)}</span>
      </div>
      <p className="text-sm"><span className="text-gray-400">Khách:</span> <strong>{r.name}</strong></p>
      <p className="text-sm"><span className="text-gray-400">SĐT:</span> {r.phone}</p>
      <p className="text-sm"><span className="text-gray-400">Số người:</span> {r.guests} người</p>
      {r.note && <p className="text-sm text-gray-400 italic mt-0.5">"{r.note}"</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => onComplete(r.id)}
          className="flex-1 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
        >
          ✓ Hoàn thành
        </button>
        <button
          onClick={() => setShowChange(v => !v)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
        >
          🔄 Đổi bàn
        </button>
      </div>

      {showChange && (
        <ChangeTableForm
          r={r}
          tableId={tableId}
          availableTables={availableTables}
          onChangeTable={onChangeTable}
        />
      )}
    </div>
  );
}

// ── Card đặt chỗ sắp tới ─────────────────────────────────────────
function CardSapToi({ r, tableId, availableTables, isToday, onCheckIn, onCancel, onChangeTable }) {
  const [showChange, setShowChange] = useState(false);

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
          {isToday ? conLaiText(r.time) : '📅 Đã xếp bàn'}
        </span>
        <span className="text-lg font-bold text-gray-900 tabular-nums">{fmtTime(r.time)}</span>
      </div>
      <p className="text-sm"><span className="text-gray-400">Khách:</span> <strong>{r.name}</strong></p>
      <p className="text-sm"><span className="text-gray-400">SĐT:</span> {r.phone}</p>
      <p className="text-sm"><span className="text-gray-400">Số người:</span> {r.guests} người</p>
      {r.note && <p className="text-sm text-gray-400 italic mt-0.5">"{r.note}"</p>}

      <div className="flex flex-wrap gap-2 pt-2">
        <button
          onClick={() => onCheckIn(r.id)}
          className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          ✓ Check-in
        </button>
        <button
          onClick={() => setShowChange(v => !v)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
        >
          🔄 Đổi bàn
        </button>
        <button
          onClick={() => onCancel(r.id)}
          className="px-3 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50"
        >
          Huỷ
        </button>
      </div>

      {showChange && (
        <ChangeTableForm
          r={r}
          tableId={tableId}
          availableTables={availableTables}
          onChangeTable={onChangeTable}
        />
      )}
    </div>
  );
}

// ── Section "Đã xong" — collapsed mặc định ───────────────────────
function SectionDaXong({ list }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        <span>✅ Đã xong hôm nay ({list.length})</span>
        <span className="text-xs">{open ? '▲ Thu gọn' : '▼ Xem'}</span>
      </button>
      {open && (
        <div className="space-y-2 mt-1">
          {list.map(r => (
            <div key={r.id} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{r.name}</p>
                <p className="text-xs text-gray-400">{r.guests} người</p>
              </div>
              <span className="text-sm font-bold text-gray-400 tabular-nums">{fmtTime(r.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal chính ──────────────────────────────────────────────────
export default function TableDetailModal({
  table, reservations, tableStatus, availableTables, selectedDate,
  onClose, onCheckIn, onComplete, onCancel, onChangeTable,
}) {
  const statusColor = STATUS_COLOR[tableStatus] || STATUS_COLOR.available;
  const isToday     = selectedDate === todayStr();

  // Lọc đặt chỗ thuộc bàn này (trực tiếp hoặc ghép bàn)
  const tableRsvs = useMemo(
    () => rsvForTable(table.id, reservations || []),
    [table.id, reservations]
  );

  // Phân nhóm: Đang diễn ra / Sắp tới / Đã xong
  const { active, upcoming, done } = useMemo(() => {
    const now    = isToday ? nowMin() : -1;
    const active   = [];
    const upcoming = [];
    const done     = [];

    for (const r of tableRsvs) {
      if (r.status === 'seated') {
        active.push(r);
      } else if (r.status === 'confirmed') {
        // "Đang diễn ra" nếu hôm nay và đã trong cửa sổ 15 phút trước giờ đặt
        if (isToday && now >= toMin(r.time) - 15) {
          active.push(r);
        } else {
          upcoming.push(r);
        }
      } else if (r.status === 'completed') {
        done.push(r);
      }
      // cancelled / no_show / pending / expired → bỏ qua
    }

    upcoming.sort((a, b) => toMin(a.time) - toMin(b.time));
    done.sort((a, b) => toMin(a.time) - toMin(b.time));

    return { active, upcoming, done };
  }, [tableRsvs, isToday]);

  const isEmpty = active.length === 0 && upcoming.length === 0 && done.length === 0;

  // Wrapped actions — fire action rồi đóng modal ngay
  const doCheckIn  = (id) => { onCheckIn(id);  onClose(); };
  const doComplete = (id) => { onComplete(id); onClose(); };
  const doCancel   = (id) => { onCancel(id);   onClose(); };
  const doChange   = async (id, tableId) => { await onChangeTable(id, tableId); onClose(); };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:w-[480px] sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header — giữ nguyên: tên bàn, khu, sức chứa, trạng thái */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full shrink-0" style={{ background: statusColor }} />
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{table.name}</h2>
              <p className="text-sm text-gray-500">
                {table.zone} · {table.capacity} chỗ · {STATUS_LABEL[tableStatus]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-2">×</button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isEmpty ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Bàn trống, chưa có đặt chỗ nào
            </p>
          ) : (
            <>
              {/* Nhóm 1 — Đang diễn ra */}
              {active.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                    Đang diễn ra
                  </p>
                  {active.map(r => (
                    <CardDangDienRa
                      key={r.id}
                      r={r}
                      tableId={table.id}
                      availableTables={availableTables}
                      onComplete={doComplete}
                      onChangeTable={doChange}
                    />
                  ))}
                </section>
              )}

              {/* Nhóm 2 — Sắp tới */}
              {upcoming.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    Sắp tới
                  </p>
                  {upcoming.map(r => (
                    <CardSapToi
                      key={r.id}
                      r={r}
                      tableId={table.id}
                      availableTables={availableTables}
                      isToday={isToday}
                      onCheckIn={doCheckIn}
                      onCancel={doCancel}
                      onChangeTable={doChange}
                    />
                  ))}
                </section>
              )}

              {/* Nhóm 3 — Đã xong (collapsed) */}
              {done.length > 0 && (
                <section className="border-t pt-3">
                  <SectionDaXong list={done} />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
