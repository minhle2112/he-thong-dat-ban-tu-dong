'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import NavBar from '../../components/NavBar';
import ProtectedPage from '../../components/ProtectedPage';
import { useAuth } from '../../contexts/AuthContext';

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all
            ${t.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);
  return { toasts, show };
}

// ── Modal xác nhận xóa ────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <p className="text-gray-800 text-sm mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
            Hủy
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal xác nhận xóa hàng loạt ─────────────────────────────────────────────
function BulkDeleteModal({ tableInfos, onConfirm, onCancel, saving }) {
  const totalUnassign = tableInfos.reduce(
    (s, t) => s + t.active_reservations.length, 0
  );

  // Phân loại từng bàn để hiển thị
  function describeTable(t) {
    const rsvs = t.active_reservations;
    if (rsvs.length === 0) return { label: 'trống', color: 'text-green-600', detail: '→ xóa bình thường' };
    const seated = rsvs.find(r => r.status === 'seated');
    if (seated) {
      return {
        label: `đang có khách — ${seated.name}`,
        color: 'text-red-600',
        detail: '→ sẽ tự động hủy assign',
      };
    }
    return {
      label: `có ${rsvs.length} đặt chỗ tương lai`,
      color: 'text-orange-600',
      detail: '→ sẽ tự động hủy assign',
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b">
          <h2 className="font-bold text-gray-900">Xác nhận xóa {tableInfos.length} bàn</h2>
          {totalUnassign > 0 && (
            <p className="text-sm text-orange-600 mt-1">
              ⚠️ {totalUnassign} đặt chỗ sẽ được chuyển về "Chờ xếp bàn"
            </p>
          )}
        </div>

        {/* Danh sách bàn */}
        <ul className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {tableInfos.map(t => {
            const { label, color, detail } = describeTable(t);
            return (
              <li key={t.id} className="text-sm flex items-start gap-1.5">
                <span className="text-gray-400 shrink-0 mt-0.5">•</span>
                <span>
                  <span className="font-semibold text-gray-800">{t.name}</span>
                  {' '}
                  <span className={color}>({label})</span>
                  {' '}
                  <span className="text-gray-400">{detail}</span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* Ghi chú */}
        {totalUnassign > 0 && (
          <p className="px-5 pb-3 text-xs text-gray-500">
            Các khách bị hủy assign sẽ về trạng thái "Chờ xếp bàn". Đặt chỗ không bị xóa.
          </p>
        )}

        {/* Nút */}
        <div className="px-5 pb-5 flex justify-end gap-3 border-t pt-4">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
          >
            {saving ? 'Đang xóa...' : `Xóa ${tableInfos.length} bàn`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quản lý Khu ───────────────────────────────────────────────────────────────
function ZoneManager({ zones, loading, onAdd, onRename, onDelete }) {
  const [newName, setNewName]     = useState('');
  const [editingZone, setEditingZone] = useState(null); // { name, draft }
  const [submitting, setSubmitting]   = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    await onAdd(newName.trim());
    setNewName('');
    setSubmitting(false);
  }

  async function handleRename(zone) {
    if (!editingZone?.draft?.trim() || editingZone.draft.trim() === zone.name) {
      setEditingZone(null);
      return;
    }
    setSubmitting(true);
    const ok = await onRename(zone.name, editingZone.draft.trim());
    if (ok) setEditingZone(null);
    setSubmitting(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Danh sách khu</h2>
        <span className="text-xs text-gray-400">{zones.length} khu</span>
      </div>

      {/* Form thêm khu */}
      <form onSubmit={handleAdd} className="px-4 py-3 border-b border-gray-100 flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="Tên khu mới (vd: Khu VIP)"
          maxLength={50}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!newName.trim() || submitting}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
        >
          Thêm
        </button>
      </form>

      {/* Danh sách */}
      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2,3].map(i => <div key={i} className="animate-pulse bg-gray-100 rounded h-10" />)}
        </div>
      ) : zones.length === 0 ? (
        <p className="p-4 text-sm text-gray-400 text-center">Chưa có khu nào</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {zones.map(zone => (
            <li key={zone.name} className="px-4 py-3 flex items-center gap-3">
              {editingZone?.name === zone.name ? (
                <>
                  <input
                    autoFocus
                    value={editingZone.draft}
                    onChange={e => setEditingZone(prev => ({ ...prev, draft: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(zone);
                      if (e.key === 'Escape') setEditingZone(null);
                    }}
                    maxLength={50}
                    className="flex-1 border border-blue-400 rounded-lg px-2 py-1 text-sm focus:outline-none"
                  />
                  <button
                    onClick={() => handleRename(zone)}
                    disabled={submitting}
                    className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setEditingZone(null)}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Hủy
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium text-gray-800">{zone.name}</span>
                  <span className="text-xs text-gray-400 mr-1">{zone.table_count} bàn</span>
                  <button
                    onClick={() => setEditingZone({ name: zone.name, draft: zone.name })}
                    className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Đổi tên
                  </button>
                  <button
                    onClick={() => onDelete(zone)}
                    className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Xóa
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Form thêm / sửa bàn ───────────────────────────────────────────────────────
function TableForm({ zones, editingTable, onSubmit, onCancel }) {
  const isEdit = !!editingTable;
  const [form, setForm] = useState({
    name:     editingTable?.name     ?? '',
    capacity: editingTable?.capacity ?? '',
    zone:     editingTable?.zone     ?? (zones[0]?.name || ''),
    status:   editingTable?.status   ?? 'active',
  });
  const [submitting, setSubmitting] = useState(false);

  // Reset khi editingTable thay đổi
  useEffect(() => {
    setForm({
      name:     editingTable?.name     ?? '',
      capacity: editingTable?.capacity ?? '',
      zone:     editingTable?.zone     ?? (zones[0]?.name || ''),
      status:   editingTable?.status   ?? 'active',
    });
  }, [editingTable, zones]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({ ...form, capacity: Number(form.capacity) });
    setSubmitting(false);
  }

  const field = (label, children) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">{isEdit ? `Sửa bàn: ${editingTable.name}` : 'Thêm bàn mới'}</h2>
      </div>
      <form onSubmit={handleSubmit} className="p-4 grid grid-cols-2 gap-3">
        {field('Tên bàn *',
          <input
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="vd: A11, VIP1"
            maxLength={50}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {field('Sức chứa (người) *',
          <input
            required
            type="number"
            min={1}
            max={100}
            value={form.capacity}
            onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))}
            placeholder="vd: 4"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {field('Khu *',
          <select
            required
            value={form.zone}
            onChange={e => setForm(p => ({ ...p, zone: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {zones.map(z => <option key={z.name} value={z.name}>{z.name}</option>)}
          </select>
        )}
        {field('Trạng thái',
          <select
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">Hoạt động</option>
            <option value="inactive">Không hoạt động</option>
          </select>
        )}
        <div className="col-span-2 flex justify-end gap-3 pt-1">
          {isEdit && (
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              Hủy
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {submitting ? '...' : isEdit ? 'Lưu thay đổi' : 'Thêm bàn'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Bảng danh sách bàn ────────────────────────────────────────────────────────
function TableList({ tables, zones: zoneDefs, loading, onEdit, onDelete, selectedIds, onToggle, onToggleZone }) {
  // Dùng thứ tự khu từ API để tránh sắp xếp theo chữ cái
  const zones = zoneDefs?.length > 0
    ? zoneDefs.map(z => z.name)
    : [...new Set(tables.map(t => t.zone))];

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        {[1,2,3,4].map(i => <div key={i} className="animate-pulse bg-gray-100 rounded h-12" />)}
      </div>
    );
  }

  if (tables.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
        Chưa có bàn nào
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {zones.map(zone => {
        const zoneTables   = tables.filter(t => t.zone === zone);
        const zoneIds      = zoneTables.map(t => t.id);
        const checkedCount = zoneIds.filter(id => selectedIds.includes(id)).length;
        const allChecked   = checkedCount === zoneIds.length;
        const someChecked  = checkedCount > 0 && !allChecked;

        return (
          <div key={zone} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header khu */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
              {/* Checkbox chọn cả khu */}
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked; }}
                onChange={() => onToggleZone(zoneIds, allChecked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                title={allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
              />
              <span className="font-medium text-sm text-gray-700">{zone}</span>
              <span className="text-xs text-gray-400 ml-auto">
                {checkedCount > 0
                  ? <span className="text-blue-600">{checkedCount}/{zoneTables.length} đã chọn</span>
                  : `${zoneTables.length} bàn`}
              </span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-50">
                  <th className="pl-4 pr-2 py-2 w-8"></th>
                  <th className="px-2 py-2 font-medium">Tên bàn</th>
                  <th className="px-2 py-2 font-medium">Sức chứa</th>
                  <th className="px-2 py-2 font-medium">Trạng thái</th>
                  <th className="px-4 py-2 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {zoneTables.map(table => {
                  const isChecked = selectedIds.includes(table.id);
                  return (
                    <tr
                      key={table.id}
                      className={`transition-colors cursor-pointer ${isChecked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => onToggle(table.id)}
                    >
                      {/* Checkbox */}
                      <td className="pl-4 pr-2 py-3" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggle(table.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="px-2 py-3 font-medium text-gray-800">{table.name}</td>
                      <td className="px-2 py-3 text-gray-600">{table.capacity} người</td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                          ${table.status === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'}`}>
                          {table.status === 'active' ? 'Hoạt động' : 'Không hoạt động'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => onEdit(table)}
                            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => onDelete(table)}
                            className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function QuanLyBanPage() {
  return (
    <ProtectedPage>
      <QuanLyBanContent />
    </ProtectedPage>
  );
}

function QuanLyBanContent() {
  const { restaurantId } = useAuth();
  const [zones,        setZones]        = useState([]);
  const [tables,       setTables]       = useState([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [loadingTables, setLoadingTables] = useState(true);
  const [editingTable, setEditingTable] = useState(null);
  const [confirm,      setConfirm]      = useState(null); // { message, onConfirm }
  const { toasts, show } = useToast();

  // ── Chọn hàng loạt ───────────────────────────────────────────────
  const [selectedIds,     setSelectedIds]     = useState([]);          // id bàn đang chọn
  const [bulkModal,       setBulkModal]       = useState(null);        // { tableInfos: [] }
  const [bulkSaving,      setBulkSaving]      = useState(false);

  // Toggle 1 bàn
  function handleToggle(id) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // Toggle tất cả bàn trong 1 khu
  function handleToggleZone(zoneIds, allChecked) {
    if (allChecked) {
      setSelectedIds(prev => prev.filter(id => !zoneIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...zoneIds])]);
    }
  }

  // Bước 1: Kiểm tra trước khi mở modal xác nhận
  async function handleBulkDeleteClick() {
    if (selectedIds.length === 0) return;
    try {
      const data = await api.bulkCheckTables(selectedIds);
      setBulkModal({ tableInfos: data });
    } catch (err) {
      show(err.message, 'error');
    }
  }

  // Bước 2: Xác nhận xóa hàng loạt
  async function handleBulkDeleteConfirm() {
    setBulkSaving(true);
    try {
      const result = await api.bulkDeleteTables(selectedIds);
      const msg = result.unassigned_count > 0
        ? `Đã xóa ${result.deleted_count} bàn, ${result.unassigned_count} đặt chỗ đã được chuyển về Chờ xếp bàn`
        : `Đã xóa ${result.deleted_count} bàn`;
      show(msg);
      setBulkModal(null);
      setSelectedIds([]);
      fetchTables();
      fetchZones();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  }

  const fetchZones = useCallback(async () => {
    if (!restaurantId) return;
    setLoadingZones(true);
    try {
      const data = await api.getZones(restaurantId);
      setZones(data || []);
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setLoadingZones(false);
    }
  }, [show, restaurantId]);

  const fetchTables = useCallback(async () => {
    if (!restaurantId) return;
    setLoadingTables(true);
    try {
      const data = await api.getTables(restaurantId);
      setTables(data || []);
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setLoadingTables(false);
    }
  }, [show, restaurantId]);

  useEffect(() => {
    fetchZones();
    fetchTables();
  }, [fetchZones, fetchTables]);

  // ── Zone actions ──────────────────────────────────────────────────
  async function handleAddZone(name) {
    if (!restaurantId) return;
    try {
      await api.addZone(restaurantId, name);
      show(`Đã thêm khu "${name}"`);
      fetchZones();
    } catch (err) {
      show(err.message, 'error');
    }
  }

  async function handleRenameZone(oldName, newName) {
    if (!restaurantId) return false;
    try {
      await api.renameZone(restaurantId, oldName, newName);
      show(`Đã đổi tên "${oldName}" → "${newName}"`);
      fetchZones();
      fetchTables();
      return true;
    } catch (err) {
      show(err.message, 'error');
      return false;
    }
  }

  function handleDeleteZone(zone) {
    if (!restaurantId) return;
    if (zone.table_count > 0) {
      show(`Khu "${zone.name}" còn ${zone.table_count} bàn, phải xóa hết bàn trước`, 'error');
      return;
    }
    setConfirm({
      message: `Xóa khu "${zone.name}"? Hành động này không thể hoàn tác.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.deleteZone(restaurantId, zone.name);
          show(`Đã xóa khu "${zone.name}"`);
          fetchZones();
        } catch (err) {
          show(err.message, 'error');
        }
      },
    });
  }

  // ── Table actions ─────────────────────────────────────────────────
  async function handleTableSubmit(data) {
    if (!restaurantId) return;
    try {
      if (editingTable) {
        await api.updateTable(editingTable.id, data);
        show(`Đã cập nhật bàn "${data.name}"`);
        setEditingTable(null);
      } else {
        await api.createTable(restaurantId, data);
        show(`Đã thêm bàn "${data.name}"`);
      }
      fetchTables();
      fetchZones();
    } catch (err) {
      show(err.message, 'error');
    }
  }

  function handleDeleteTable(table) {
    setConfirm({
      message: `Xóa bàn "${table.name}"? Hành động này không thể hoàn tác.`,
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api.deleteTable(table.id);
          show(`Đã xóa bàn "${table.name}"`);
          fetchTables();
          fetchZones();
        } catch (err) {
          show(err.message, 'error');
        }
      },
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center gap-3 shrink-0">
        <span className="text-xl">🪑</span>
        <h1 className="font-bold text-gray-900 text-base md:text-lg">Quản lý bàn & khu</h1>
        <span className="ml-auto text-xs text-gray-400">{tables.length} bàn · {zones.length} khu</span>
      </header>

      {/* Điều hướng giữa các trang */}
      <NavBar />

      <main className="max-w-5xl mx-auto p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: zone + form thêm bàn */}
        <div className="md:col-span-1 space-y-6">
          <ZoneManager
            zones={zones}
            loading={loadingZones}
            onAdd={handleAddZone}
            onRename={handleRenameZone}
            onDelete={handleDeleteZone}
          />
          <TableForm
            zones={zones}
            editingTable={editingTable}
            onSubmit={handleTableSubmit}
            onCancel={() => setEditingTable(null)}
          />
        </div>

        {/* Right: danh sách bàn */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
              Danh sách bàn
            </h2>
            {selectedIds.length > 0 && (
              <button
                onClick={() => setSelectedIds([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Bỏ chọn tất cả
              </button>
            )}
          </div>
          <TableList
            tables={tables}
            zones={zones}
            loading={loadingTables}
            onEdit={setEditingTable}
            onDelete={handleDeleteTable}
            selectedIds={selectedIds}
            onToggle={handleToggle}
            onToggleZone={handleToggleZone}
          />
        </div>
      </main>

      {/* ── Thanh action nổi khi có bàn được chọn ─────────────────── */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30
                        bg-gray-900 text-white rounded-2xl shadow-2xl
                        px-5 py-3 flex items-center gap-4
                        w-[calc(100%-2rem)] max-w-md">
          <span className="text-sm font-medium flex-1">
            Đã chọn <strong>{selectedIds.length}</strong> bàn
          </span>
          <button
            onClick={handleBulkDeleteClick}
            className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-1.5 rounded-xl transition-colors"
          >
            Xóa các bàn đã chọn
          </button>
        </div>
      )}

      {/* Confirm modal (xóa đơn lẻ / xóa khu) */}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Modal xác nhận xóa hàng loạt */}
      {bulkModal && (
        <BulkDeleteModal
          tableInfos={bulkModal.tableInfos}
          saving={bulkSaving}
          onConfirm={handleBulkDeleteConfirm}
          onCancel={() => setBulkModal(null)}
        />
      )}

      <Toast toasts={toasts} />
    </div>
  );
}
