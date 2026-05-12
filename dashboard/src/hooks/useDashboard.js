'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { computeTableStatus, findReservationForTable } from '../utils/tableStatus';

// Dùng local timezone để tránh lệch ngày ở Vietnam (UTC+7)
// new Date().toISOString() trả về UTC → có thể cho ngày hôm qua trước 07:00 sáng
function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function useDashboard(restaurantId = 1) {
  const [selectedDate,   setSelectedDate]   = useState(todayStr);
  const [tables,         setTables]         = useState([]);
  const [reservations,   setReservations]   = useState([]);
  const [blockedSlots,   setBlockedSlots]   = useState([]);
  const [selectedTable,  setSelectedTable]  = useState(null);
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [loading,        setLoading]        = useState(true);
  const [realtimeStatus, setRealtimeStatus] = useState('connecting');
  const [error,          setError]          = useState(null);

  // Đặt chỗ đang được mở modal xếp bàn
  const [assigningReservation, setAssigningReservation] = useState(null);

  // ── Tải dữ liệu ──────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!restaurantId) return; // Chờ auth load xong mới fetch
    setLoading(true);
    setError(null);
    try {
      const [t, r, b] = await Promise.all([
        api.getTables(restaurantId),
        api.getReservations({ restaurantId, date: selectedDate }),
        api.getBlockedSlots({ date: selectedDate }),
      ]);
      setTables(t       || []);
      setReservations(r || []);
      setBlockedSlots(b || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, selectedDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Supabase Realtime ─────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' },   fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_slots' },  fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_groups' },   fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables' },         fetchData)
      .subscribe(status => {
        setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'connecting');
      });

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // ── Tính trạng thái từng bàn ──────────────────────────────────────
  const tableStatuses = useMemo(() => {
    const isToday = selectedDate === todayStr();
    return Object.fromEntries(
      tables.map(t => [t.id, computeTableStatus(t, reservations, blockedSlots, isToday)])
    );
  }, [tables, reservations, blockedSlots, selectedDate]);

  // ── Lọc danh sách đặt chỗ ────────────────────────────────────────
  // Pending không hiện trên dashboard — quản lý ở trang Nhân Viên
  const filteredReservations = useMemo(() => {
    if (statusFilter === 'all') return reservations.filter(r => r.status !== 'pending');
    return reservations.filter(r => r.status === statusFilter);
  }, [reservations, statusFilter]);

  // Số đặt chỗ đang chờ xếp bàn (badge cảnh báo)
  const pendingCount = useMemo(
    () => reservations.filter(r => r.status === 'pending').length,
    [reservations]
  );

  // ── Tìm đặt chỗ của bàn đang chọn ───────────────────────────────
  const selectedTableReservation = useMemo(() => {
    if (!selectedTable) return null;
    return findReservationForTable(selectedTable.id, reservations);
  }, [selectedTable, reservations]);

  // ── Các action ───────────────────────────────────────────────────
  const actions = {
    checkIn:      (id) => api.updateStatus(id, 'seated').then(fetchData),
    complete:     (id) => api.updateStatus(id, 'completed').then(fetchData),
    cancel:       (id) => api.cancelReservation(id).then(fetchData),
    changeTable:  (id, tableId) => api.changeTable(id, tableId).then(fetchData),
    blockSlot:    (data) => api.createBlockedSlot(data).then(fetchData),
    unblockSlot:  (id)   => api.deleteBlockedSlot(id).then(fetchData),
    // Xếp bàn / ghép bàn
    assignTable:  (id, tableIds) => api.assignTable(id, tableIds).then(fetchData),
  };

  return {
    selectedDate, setSelectedDate,
    tables, reservations: filteredReservations, allReservations: reservations,
    blockedSlots, tableStatuses,
    selectedTable, setSelectedTable, selectedTableReservation,
    statusFilter, setStatusFilter,
    loading, realtimeStatus, error,
    pendingCount,
    assigningReservation, setAssigningReservation,
    actions, fetchData,
  };
}
