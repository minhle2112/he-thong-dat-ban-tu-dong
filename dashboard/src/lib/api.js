// API client — dùng Supabase JS client + Edge Functions thay vì Express backend
// CRUD đơn giản → supabase.from(...) trực tiếp
// Logic phức tạp → supabase.functions.invoke('function-name', { body })
import { supabase } from './supabase';

// ── Helper: flatten reservation row từ Supabase embedded join ─────────────────
// Supabase trả join dạng nested object; backend cũ trả flat field.
// Hàm này chuyển nested → flat để các component không cần sửa.
function flatRes(r) {
  if (!r) return r;
  return {
    ...r,
    table_name:      r.tables?.name        ?? null,
    zone:            r.tables?.zone        ?? null,
    capacity:        r.tables?.capacity    ?? null,
    // table_groups là mảng (0 hoặc 1 phần tử) → lấy phần tử đầu
    group_table_ids: Array.isArray(r.table_groups)
      ? (r.table_groups[0]?.table_ids ?? null)
      : (r.table_groups?.table_ids ?? null),
    tables:       undefined,
    table_groups: undefined,
  };
}

// ── Helper: chuẩn hoá zones JSONB (hỗ trợ cả string lẫn object) ──────────────
function normalizeZones(arr) {
  return (arr || []).map(z => (typeof z === 'string' ? z : z?.name || '')).filter(Boolean);
}

// ── Helper: gọi Edge Function (tương đương request() cũ) ─────────────────────
async function invokeEdge(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data && !data.success) throw new Error(data.message || 'Edge Function error');
  return data?.data ?? data;
}

// ── Helper: query Supabase + throw nếu lỗi ───────────────────────────────────
async function sq(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// SELECT cột join cho reservations
const RES_SELECT = '*, tables!table_id(name, zone, capacity), table_groups!reservation_id(table_ids)';

export const api = {

  // ── Tables ──────────────────────────────────────────────────────────────────

  getTables: async (restaurantId = 1) =>
    sq(supabase.from('tables').select('*')
      .eq('restaurant_id', restaurantId)
      .order('zone').order('name')),

  /** Tạo bàn: kiểm tra tên trùng trước rồi INSERT */
  createTable: async (restaurantId, { name, capacity, zone, status = 'active' }) => {
    // Kiểm tra tên trùng
    const { data: dup } = await supabase.from('tables').select('id')
      .eq('restaurant_id', restaurantId).eq('name', name);
    if (dup?.length) throw new Error(`Tên bàn "${name}" đã tồn tại`);

    return sq(supabase.from('tables')
      .insert({ restaurant_id: restaurantId, name, capacity, zone, status })
      .select().single());
  },

  /** Sửa bàn: kiểm tra tên trùng nếu đổi tên rồi UPDATE */
  updateTable: async (id, updates) => {
    const existing = await sq(supabase.from('tables').select('*').eq('id', id).single());
    if (!existing) throw new Error('Không tìm thấy bàn');

    if (updates.name && updates.name !== existing.name) {
      const { data: dup } = await supabase.from('tables').select('id')
        .eq('restaurant_id', existing.restaurant_id)
        .eq('name', updates.name)
        .neq('id', id);
      if (dup?.length) throw new Error(`Tên bàn "${updates.name}" đã tồn tại`);
    }

    return sq(supabase.from('tables').update(updates).eq('id', id).select().single());
  },

  /** Xóa bàn: kiểm tra đặt chỗ tương lai trước khi xóa */
  deleteTable: async (id) => {
    // Dùng local timezone để tránh lệch ngày khi so sánh (Vietnam = UTC+7)
    const n = new Date();
    const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    const hh = String(n.getHours()).padStart(2, '0');
    const mm = String(n.getMinutes()).padStart(2, '0');
    const nowTime = `${hh}:${mm}`;

    // Lấy đặt chỗ chưa kết thúc của bàn này
    const { data: futureRes } = await supabase.from('reservations')
      .select('id, date, time')
      .eq('table_id', id)
      .not('status', 'in', '("cancelled","completed","no_show")')
      .gte('date', today);

    const hasFuture = (futureRes || []).some(r =>
      r.date > today || (r.date === today && r.time > nowTime)
    );
    if (hasFuture) {
      throw new Error(`Bàn đang có đặt chỗ trong tương lai, không thể xóa`);
    }

    return sq(supabase.from('tables').delete().eq('id', id).select().single());
  },

  /** Kiểm tra trước khi xóa hàng loạt (dùng RPC vì query phức tạp) */
  bulkCheckTables: (tableIds) =>
    invokeEdge('bulk-table-ops', { action: 'check', table_ids: tableIds }),

  /** Xóa hàng loạt (transaction trong Edge Function) */
  bulkDeleteTables: (tableIds) =>
    invokeEdge('bulk-table-ops', { action: 'delete', table_ids: tableIds }),

  // ── Reservations ────────────────────────────────────────────────────────────

  getReservations: async ({ restaurantId = 1, date, status } = {}) => {
    let query = supabase.from('reservations')
      .select(RES_SELECT)
      .eq('restaurant_id', restaurantId)
      .order('date').order('time');

    if (date)   query = query.eq('date', date);
    if (status) query = query.eq('status', status);

    const data = await sq(query);
    return (data || []).map(flatRes);
  },

  /** Tự động expire đặt chỗ pending quá giờ */
  expireOverdue: () => invokeEdge('expire-overdue', {}),

  updateStatus: async (id, status) =>
    flatRes(await sq(supabase.from('reservations')
      .update({ status }).eq('id', id).select(RES_SELECT).single())),

  cancelReservation: async (id) =>
    flatRes(await sq(supabase.from('reservations')
      .update({ status: 'cancelled' }).eq('id', id).select(RES_SELECT).single())),

  createReservation: async (data) =>
    sq(supabase.from('reservations').insert({
      ...data,
      table_id: null,
      status:   'pending',
    }).select().single()),

  /** Gợi ý bàn (thuật toán 100 điểm — Edge Function) */
  getSuggestions: (id) =>
    invokeEdge('get-suggestions', { reservation_id: id }),

  /** Xếp bàn / ghép bàn (Edge Function — có overlap check) */
  assignTable: (id, tableIds) =>
    invokeEdge('assign-table', { reservation_id: id, table_ids: tableIds }),

  /** Đổi bàn (Edge Function) */
  changeTable: (id, tableId) =>
    invokeEdge('change-table', { reservation_id: id, table_id: tableId }),

  // ── Blocked slots ────────────────────────────────────────────────────────────

  getBlockedSlots: async ({ date } = {}) => {
    let query = supabase.from('blocked_slots')
      .select('*, tables(name, zone)')
      .order('date').order('time_from');
    if (date) query = query.eq('date', date);
    const data = await sq(query);
    return (data || []).map(r => ({
      ...r,
      table_name: r.tables?.name ?? null,
      zone:       r.tables?.zone ?? null,
      tables:     undefined,
    }));
  },

  createBlockedSlot: (data) =>
    sq(supabase.from('blocked_slots').insert(data).select().single()),

  deleteBlockedSlot: (id) =>
    sq(supabase.from('blocked_slots').delete().eq('id', id).select().single()),

  // ── Restaurant settings ──────────────────────────────────────────────────────

  getSettings: async (restaurantId = 1) => {
    const data = await sq(supabase.from('restaurants')
      .select('settings').eq('id', restaurantId).single());
    return data?.settings ?? {};
  },

  /** Merge settings: đọc cũ, trộn mới, ghi lại */
  updateSettings: async (restaurantId = 1, incoming) => {
    const current = await api.getSettings(restaurantId);
    const merged  = { ...current, ...incoming };
    const data = await sq(supabase.from('restaurants')
      .update({ settings: merged }).eq('id', restaurantId)
      .select('settings').single());
    return data?.settings;
  },

  // ── Zone management ──────────────────────────────────────────────────────────

  getZones: async (restaurantId = 1) => {
    const [restaurantRes, tablesRes] = await Promise.all([
      supabase.from('restaurants').select('zones').eq('id', restaurantId).single(),
      supabase.from('tables').select('zone').eq('restaurant_id', restaurantId),
    ]);
    if (restaurantRes.error) throw restaurantRes.error;

    const names    = normalizeZones(restaurantRes.data?.zones);
    const allZones = tablesRes.data || [];

    // Đếm số bàn per khu
    const countMap = {};
    allZones.forEach(t => { countMap[t.zone] = (countMap[t.zone] || 0) + 1; });

    const zones = names.map(n => ({ name: n, table_count: countMap[n] || 0 }));

    // Thêm khu có bàn nhưng chưa có trong zones JSONB (data cũ)
    for (const [zone, count] of Object.entries(countMap)) {
      if (!zones.find(z => z.name === zone)) zones.push({ name: zone, table_count: count });
    }

    return zones;
  },

  /** Thêm khu: kiểm tra tên trùng + update JSONB */
  addZone: async (restaurantId, name) => {
    const trimmed = name.trim();
    const { data: restaurant } = await supabase.from('restaurants')
      .select('zones').eq('id', restaurantId).single();
    const zones = normalizeZones(restaurant?.zones);

    if (zones.includes(trimmed)) throw new Error(`Khu "${trimmed}" đã tồn tại`);

    await sq(supabase.from('restaurants')
      .update({ zones: [...zones, trimmed] }).eq('id', restaurantId));
    return { name: trimmed, table_count: 0 };
  },

  /** Đổi tên khu (Edge Function — có cập nhật tables.zone) */
  renameZone: (restaurantId, oldName, newName) =>
    invokeEdge('rename-zone', {
      restaurant_id: restaurantId,
      old_name: oldName,
      new_name: newName,
    }),

  /** Xóa khu: kiểm tra còn bàn + update JSONB */
  deleteZone: async (restaurantId, name) => {
    const { count } = await supabase.from('tables')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).eq('zone', name);
    if (count > 0) throw new Error(`Khu "${name}" còn ${count} bàn, phải xóa hết bàn trước`);

    const { data: restaurant } = await supabase.from('restaurants')
      .select('zones').eq('id', restaurantId).single();
    const newZones = normalizeZones(restaurant?.zones).filter(z => z !== name);

    await sq(supabase.from('restaurants')
      .update({ zones: newZones }).eq('id', restaurantId));
    return { name };
  },
};
