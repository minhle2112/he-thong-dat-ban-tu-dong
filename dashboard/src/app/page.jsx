'use client';
import { useDashboard } from '../hooks/useDashboard';
import { useAuth } from '../contexts/AuthContext';
import TableMap from '../components/TableMap';
import ReservationList from '../components/ReservationList';
import TableDetailModal from '../components/TableDetailModal';
import AssignTableModal from '../components/AssignTableModal';
import NavBar from '../components/NavBar';
import ProtectedPage from '../components/ProtectedPage';

/** Chỉ báo kết nối Realtime */
function RealtimeDot({ status }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
      {status === 'connected' ? 'Live' : 'Đang kết nối…'}
    </span>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedPage>
      <DashboardContent />
    </ProtectedPage>
  );
}

function DashboardContent() {
  const { restaurantId, restaurant } = useAuth();
  const {
    selectedDate, setSelectedDate,
    tables, reservations, allReservations,
    tableStatuses, selectedTable, setSelectedTable, selectedTableReservation,
    statusFilter, setStatusFilter,
    loading, realtimeStatus, error,
    pendingCount,
    assigningReservation, setAssigningReservation,
    actions,
  } = useDashboard(restaurantId);

  const displayDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString('vi-VN', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl">🍽️</span>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight text-base md:text-lg">
              {restaurant?.name || 'Dashboard'}
            </h1>
            <p className="text-xs text-gray-400 capitalize">{displayDate}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <RealtimeDot status={realtimeStatus} />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </header>

      {/* ── Điều hướng giữa các trang ────────────────────────────── */}
      <NavBar />

      {/* ── Error banner ──────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────── */}
      <main className="flex flex-col md:flex-row flex-1 overflow-hidden">

        {/* Left: sơ đồ bàn (60%) */}
        <section className="md:w-3/5 p-4 md:overflow-y-auto border-b md:border-b-0 md:border-r border-gray-200">
          <h2 className="font-semibold text-gray-600 text-sm mb-3 uppercase tracking-wide">
            Sơ đồ bàn
          </h2>

          {loading ? (
            <div className="animate-pulse bg-gray-100 rounded-xl h-[480px]" />
          ) : (
            <TableMap
              tables={tables}
              tableStatuses={tableStatuses}
              selectedTable={selectedTable}
              onTableClick={setSelectedTable}
              reservations={allReservations}
              selectedDate={selectedDate}
            />
          )}

          {/* Tóm tắt nhanh — đã bỏ "Chặn" */}
          {!loading && (
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
              {[
                { label: 'Trống',    count: Object.values(tableStatuses).filter(s => s === 'available').length, color: 'text-green-600' },
                { label: 'Có khách', count: Object.values(tableStatuses).filter(s => s === 'occupied').length,  color: 'text-red-600'   },
                { label: 'Đã xếp',  count: Object.values(tableStatuses).filter(s => s === 'reserved').length,  color: 'text-yellow-600' },
              ].map(({ label, count, color }) => (
                <span key={label} className={`text-sm font-medium ${color}`}>
                  {count} {label}
                </span>
              ))}
              <span className="text-sm text-gray-400 ml-auto">
                / {tables.length} bàn
              </span>
            </div>
          )}
        </section>

        {/* Right: danh sách đặt chỗ (40%) */}
        <section className="md:w-2/5 flex flex-col overflow-hidden">
          <div className="px-4 pt-4 shrink-0">
            <h2 className="font-semibold text-gray-600 text-sm uppercase tracking-wide">
              Đặt chỗ trong ngày
            </h2>
          </div>

          {loading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-24" />
              ))}
            </div>
          ) : (
            <ReservationList
              reservations={reservations}
              statusFilter={statusFilter}
              onFilterChange={setStatusFilter}
              onCheckIn={actions.checkIn}
              onComplete={actions.complete}
              onCancel={actions.cancel}
              onAssign={setAssigningReservation}
              pendingCount={pendingCount}
            />
          )}
        </section>
      </main>

      {/* ── Modal chi tiết bàn — hiện tất cả đặt chỗ của bàn trong ngày ─ */}
      {selectedTable && (
        <TableDetailModal
          table={selectedTable}
          reservations={allReservations}
          selectedDate={selectedDate}
          tableStatus={tableStatuses[selectedTable.id]}
          availableTables={tables}
          onClose={() => setSelectedTable(null)}
          onCheckIn={actions.checkIn}
          onComplete={actions.complete}
          onCancel={actions.cancel}
          onChangeTable={actions.changeTable}
        />
      )}

      {/* ── Modal xếp bàn / ghép bàn ─────────────────────────────── */}
      {assigningReservation && (
        <AssignTableModal
          reservation={assigningReservation}
          tables={tables}
          onClose={() => setAssigningReservation(null)}
          onAssigned={actions.assignTable}
        />
      )}
    </div>
  );
}
