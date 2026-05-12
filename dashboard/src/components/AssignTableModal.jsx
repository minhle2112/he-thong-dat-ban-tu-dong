'use client';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

function fmtTime(t) { return (t || '').substring(0, 5); }

// Chuyển "HH:MM" sang phút
function toMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

// Chuyển phút sang chuỗi "HH:MM"
function fromMin(min) {
  const h = Math.floor(min / 60).toString().padStart(2, '0');
  const m = (min % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Kiểm tra bàn có xung đột với đặt chỗ mới không
// Trả về { busyUntil, fromTime } nếu xung đột, null nếu không
function computeConflict(tableId, reservations, newTimeMin, durationMinutes) {
  const newEnd = newTimeMin + durationMinutes;
  for (const r of reservations) {
    if (!['confirmed', 'seated'].includes(r.status)) continue;
    if (r.table_id !== tableId) continue;
    const existStart = toMin(r.time);
    const existEnd   = existStart + durationMinutes;
    if (existStart < newEnd && existEnd > newTimeMin) {
      return { busyUntil: fromMin(existEnd), fromTime: fmtTime(r.time) };
    }
  }
  return null;
}

// ── Badge điểm gợi ý ─────────────────────────────────────────────
function ScoreBadge({ score }) {
  const color = score >= 70 ? 'bg-green-100 text-green-700'
              : score >= 40 ? 'bg-yellow-100 text-yellow-700'
              :               'bg-gray-100 text-gray-500';
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      {score}đ
    </span>
  );
}

// ── Card bàn đơn — có xử lý xung đột + override ──────────────────
function SingleTableCard({ table, onSelect, isSelected, conflict }) {
  const [showConfirm, setShowConfirm] = useState(false);

  // Bàn đang bận — chờ xác nhận override
  if (conflict && showConfirm) {
    return (
      <div className="w-full p-3 rounded-xl border-2 border-red-300 bg-red-50">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-gray-700">{table.name}</span>
          <span className="text-xs text-red-600">Bận đến {conflict.busyUntil}</span>
        </div>
        <p className="text-xs text-red-700 mb-2">Xác nhận xếp bàn dù bàn đang bận?</p>
        <div className="flex gap-2">
          <button
            onClick={() => { onSelect([table.id]); setShowConfirm(false); }}
            className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-3 py-1.5 font-medium"
          >
            Xếp dù vậy
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5"
          >
            Huỷ
          </button>
        </div>
      </div>
    );
  }

  // Bàn đang bận — hiện thông tin và nút override
  if (conflict) {
    return (
      <div className="w-full text-left p-3 rounded-xl border-2 border-amber-200 bg-amber-50">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-semibold text-gray-500">{table.name}</span>
            <span className="text-gray-400 text-xs ml-2">{table.zone}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{table.capacity} chỗ</span>
            <ScoreBadge score={table.score} />
          </div>
        </div>
        <p className="text-xs text-amber-700 mt-1">
          Bận đến {conflict.busyUntil} (đặt chỗ {conflict.fromTime})
        </p>
        <button
          onClick={() => setShowConfirm(true)}
          className="text-xs text-amber-600 hover:text-amber-800 underline mt-1"
        >
          Xếp bàn dù vậy →
        </button>
      </div>
    );
  }

  // Bàn trống — hiển thị bình thường
  return (
    <button
      onClick={() => onSelect([table.id])}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all
        ${isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'}`}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-800">{table.name}</span>
          <span className="text-gray-400 text-xs ml-2">{table.zone}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{table.capacity} chỗ</span>
          <ScoreBadge score={table.score} />
        </div>
      </div>
      {table.reason && (
        <p className="text-xs text-gray-400 mt-0.5">{table.reason}</p>
      )}
    </button>
  );
}

// ── Card ghép bàn gợi ý — có xử lý xung đột + override ──────────
function GroupSuggestionCard({ group, onSelect, isSelected, conflictMap }) {
  const ids = group.tables.map(t => t.id);
  const conflictedTables = group.tables.filter(t => conflictMap[t.id]);
  const hasConflict = conflictedTables.length > 0;
  const [showConfirm, setShowConfirm] = useState(false);

  if (hasConflict && showConfirm) {
    return (
      <div className="w-full text-left p-3 rounded-xl border-2 border-red-300 bg-red-50">
        <div className="flex items-center gap-1.5 mb-2">
          {group.tables.map((t, i) => (
            <span key={t.id}>
              <span className="font-semibold text-gray-700">{t.name}</span>
              {i < group.tables.length - 1 && <span className="text-gray-300 ml-1.5">+</span>}
            </span>
          ))}
        </div>
        <p className="text-xs text-red-700 mb-2">Xác nhận ghép bàn dù có bàn đang bận?</p>
        <div className="flex gap-2">
          <button
            onClick={() => { onSelect(ids); setShowConfirm(false); }}
            className="text-xs text-white bg-red-500 hover:bg-red-600 rounded px-3 py-1.5 font-medium"
          >
            Ghép dù vậy
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="text-xs text-gray-500 border border-gray-200 rounded px-3 py-1.5"
          >
            Huỷ
          </button>
        </div>
      </div>
    );
  }

  if (hasConflict && !isSelected) {
    return (
      <div className="w-full text-left p-3 rounded-xl border-2 border-amber-200 bg-amber-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {group.tables.map((t, i) => (
              <span key={t.id}>
                <span className={`font-semibold ${conflictMap[t.id] ? 'text-amber-700' : 'text-gray-800'}`}>
                  {t.name}
                </span>
                {i < group.tables.length - 1 && <span className="text-gray-300 ml-1.5">+</span>}
              </span>
            ))}
          </div>
          <span className="text-xs text-gray-400 ml-2">{group.total_capacity} chỗ</span>
        </div>
        <p className="text-xs text-amber-700 mt-1">
          {conflictedTables.map(t => `${t.name} bận đến ${conflictMap[t.id].busyUntil}`).join(', ')}
        </p>
        <button
          onClick={() => setShowConfirm(true)}
          className="text-xs text-amber-600 hover:text-amber-800 underline mt-1"
        >
          Ghép bàn dù vậy →
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(ids)}
      className={`w-full text-left p-3 rounded-xl border-2 transition-all
        ${isSelected
          ? 'border-orange-500 bg-orange-50'
          : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {group.tables.map((t, i) => (
            <span key={t.id}>
              <span className="font-semibold text-gray-800">{t.name}</span>
              {i < group.tables.length - 1 && <span className="text-gray-300 ml-1.5">+</span>}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-xs text-gray-500">{group.total_capacity} chỗ</span>
          {group.same_zone && (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Cùng khu</span>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{group.zone}</p>
    </button>
  );
}

// ── Chế độ ghép bàn thủ công — có hiển thị xung đột ─────────────
function ManualGroupPicker({ tables, guests, selectedIds, onToggle, conflictMap }) {
  const total = tables
    .filter(t => selectedIds.includes(t.id))
    .reduce((s, t) => s + t.capacity, 0);
  const isEnough = total >= guests;

  // Nhóm bàn theo khu
  const zones = [];
  const zoneMap = {};
  for (const t of tables) {
    if (!zoneMap[t.zone]) { zoneMap[t.zone] = []; zones.push(t.zone); }
    zoneMap[t.zone].push(t);
  }
  zones.sort();

  return (
    <div className="space-y-3">
      {zones.map(zone => (
        <div key={zone}>
          <p className="text-xs font-medium text-gray-500 mb-1.5">{zone}</p>
          <div className="grid grid-cols-3 gap-2">
            {zoneMap[zone].map(table => {
              const checked  = selectedIds.includes(table.id);
              const conflict = conflictMap[table.id];
              return (
                <button
                  key={table.id}
                  onClick={() => onToggle(table.id)}
                  className={`p-2 rounded-lg border-2 text-left transition-all
                    ${checked
                      ? 'border-blue-500 bg-blue-50'
                      : conflict
                        ? 'border-amber-300 bg-amber-50 hover:border-amber-400'
                        : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <p className={`font-semibold text-sm ${conflict ? 'text-amber-700' : 'text-gray-800'}`}>
                    {table.name}
                  </p>
                  <p className="text-xs text-gray-400">{table.capacity} chỗ</p>
                  {conflict && (
                    <p className="text-[10px] text-amber-600 leading-tight mt-0.5">
                      Bận đến {conflict.busyUntil}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={`flex items-center justify-between p-3 rounded-xl
        ${isEnough ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
        <span className="text-sm text-gray-600">
          Tổng sức chứa: <strong>{total}</strong> / cần <strong>{guests}</strong>
        </span>
        {isEnough
          ? <span className="text-xs text-green-600 font-medium">✓ Đủ chỗ</span>
          : <span className="text-xs text-gray-400">Chưa đủ chỗ</span>
        }
      </div>
    </div>
  );
}

// ── Modal chính ──────────────────────────────────────────────────
export default function AssignTableModal({ reservation, tables, onClose, onAssigned }) {
  const { restaurantId } = useAuth();
  const [suggestions,    setSuggestions]    = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(true);
  const [selectedIds,    setSelectedIds]    = useState([]);
  const [manualMode,     setManualMode]     = useState(false);
  const [manualIds,      setManualIds]      = useState([]);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

  // Dữ liệu xung đột bàn
  const [conflictMap, setConflictMap] = useState({});

  // Tải gợi ý, settings và reservations cùng lúc khi mở modal
  useEffect(() => {
    setLoadingSuggest(true);
    Promise.all([
      api.getSuggestions(reservation.id),
      api.getSettings(restaurantId),
      api.getReservations({ restaurantId, date: reservation.date }),
    ])
      .then(([suggestData, settingsData, reservationsData]) => {
        setSuggestions(suggestData);
        const duration   = settingsData.duration_minutes || 90;
        const newTimeMin = toMin(reservation.time);

        // Xây conflict map cho tất cả bàn active
        const map = {};
        for (const table of tables.filter(t => t.status === 'active')) {
          map[table.id] = computeConflict(table.id, reservationsData, newTimeMin, duration);
        }
        setConflictMap(map);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoadingSuggest(false));
  }, [reservation.id, reservation.date, reservation.time, tables]);

  const activeTables = tables.filter(t => t.status === 'active');

  function toggleManual(id) {
    setManualIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const confirmIds  = manualMode ? manualIds : selectedIds;
  const confirmTotal = activeTables
    .filter(t => confirmIds.includes(t.id))
    .reduce((s, t) => s + t.capacity, 0);
  const canConfirm = confirmIds.length > 0 && confirmTotal >= reservation.guests;
  const hasConflictInSelection = confirmIds.some(id => conflictMap[id]);

  async function handleConfirm() {
    if (!canConfirm) return;
    setSaving(true);
    setError(null);
    try {
      await onAssigned(reservation.id, confirmIds);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:w-[500px] sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Xếp bàn</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {reservation.name} · {reservation.guests} người · {fmtTime(reservation.time)}
              {reservation.note && <span className="italic"> · "{reservation.note}"</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none mt-0.5">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {!manualMode ? (
            <>
              {/* Gợi ý bàn đơn */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Gợi ý bàn đơn</h3>
                {loadingSuggest ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-14" />)}
                  </div>
                ) : suggestions?.single?.length > 0 ? (
                  <div className="space-y-2">
                    {suggestions.single.slice(0, 5).map(table => (
                      <SingleTableCard
                        key={table.id}
                        table={table}
                        onSelect={setSelectedIds}
                        isSelected={selectedIds.length === 1 && selectedIds[0] === table.id}
                        conflict={conflictMap[table.id]}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 py-2 text-center">Không có bàn đơn phù hợp</p>
                )}
              </section>

              {/* Gợi ý ghép bàn */}
              {!loadingSuggest && suggestions?.groups?.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    Gợi ý ghép bàn
                    {suggestions?.single?.length > 0 && (
                      <span className="text-xs font-normal text-gray-400 ml-2">(tuỳ chọn)</span>
                    )}
                  </h3>
                  <div className="space-y-2">
                    {suggestions.groups.map((group, i) => {
                      const ids = group.tables.map(t => t.id);
                      const isSelected = ids.length === selectedIds.length &&
                                         ids.every(id => selectedIds.includes(id));
                      return (
                        <GroupSuggestionCard
                          key={i}
                          group={group}
                          onSelect={setSelectedIds}
                          isSelected={isSelected}
                          conflictMap={conflictMap}
                        />
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Nút chuyển sang ghép thủ công */}
              <button
                onClick={() => { setManualMode(true); setSelectedIds([]); }}
                className="w-full py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                🔧 Ghép bàn thủ công
              </button>
            </>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Ghép bàn thủ công</h3>
                <button
                  onClick={() => { setManualMode(false); setManualIds([]); }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  ← Quay lại gợi ý
                </button>
              </div>
              <ManualGroupPicker
                tables={activeTables}
                guests={reservation.guests}
                selectedIds={manualIds}
                onToggle={toggleManual}
                conflictMap={conflictMap}
              />
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t shrink-0">
          {confirmIds.length > 0 && (
            <>
              <p className="text-xs text-gray-500 mb-1 text-center">
                Đã chọn: {activeTables.filter(t => confirmIds.includes(t.id)).map(t => t.name).join(', ')}
                {' '}({confirmTotal} chỗ)
              </p>
              {hasConflictInSelection && (
                <p className="text-xs text-amber-600 text-center mb-2">
                  ⚠️ Có bàn đang bận — xếp bàn sẽ gây chồng lịch
                </p>
              )}
            </>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-gray-200 rounded-xl hover:bg-gray-50">
              Đóng
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || saving}
              className={`flex-1 py-2.5 text-sm rounded-xl font-medium disabled:opacity-40 ${
                hasConflictInSelection
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Đang xếp...' : confirmIds.length > 1 ? `Ghép ${confirmIds.length} bàn` : 'Xác nhận xếp bàn'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
