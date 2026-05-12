// Edge Function: get-suggestions
// Tương đương: GET /api/reservations/:id/suggestions
// Gợi ý bàn phù hợp cho đặt chỗ pending (thuật toán 100 điểm)
// Body: { reservation_id }
//
// Tối ưu: dùng batch queries thay vì N+1 query như backend Node.js
// → Lấy toàn bộ blocked_slots + reservations 1 lần, tính toán trong memory

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

// Thời gian ngồi mặc định (phút)
const DEFAULT_DURATION = 90;

/** "HH:MM" hoặc "HH:MM:SS" → phút từ nửa đêm */
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ── Thuật toán chấm điểm ──────────────────────────────────────────────────

/** Điểm 1 — độ vừa vặn sức chứa (0–40): bàn nhỏ nhất đủ người → ưu tiên */
function calcCapacityScore(capacity: number, guests: number): number {
  const diff = capacity - guests;
  if (diff === 0) return 40;
  if (diff <= 1) return 35;
  if (diff <= 2) return 28;
  if (diff <= 4) return 18;
  return 8;
}

/** Điểm 2 — lấp đầy khu (0–30): ưu tiên khu đang có nhiều đặt chỗ nhất */
function calcZoneScore(
  zone: string,
  zoneStats: Record<string, number>,
): number {
  const counts = Object.values(zoneStats);
  const max = Math.max(...counts, 0);
  if (max === 0) return 15;
  const mine = zoneStats[zone] || 0;
  return Math.round((mine / max) * 30);
}

/**
 * Điểm 3 — tránh kẹp giữa (0–30):
 * Phạt nếu xếp vào đây tạo khoảng trống nhỏ (<60 phút) trước/sau
 */
function calcSandwichScore(
  tableId: number,
  resByTable: Record<number, { time: string }[]>,
  newStart: number,
  newEnd: number,
): number {
  const rows = resByTable[tableId] || [];
  const TINY = 60;
  let before = false;
  let after = false;

  for (const r of rows) {
    const rStart = toMin(r.time);
    const rEnd = rStart + DEFAULT_DURATION;
    if (rEnd <= newStart && newStart - rEnd < TINY) before = true;
    if (rStart >= newEnd && rStart - newEnd < TINY) after = true;
  }

  if (!before && !after) return 30;
  if (before && after) return 0;
  return 15;
}

/**
 * Tìm cặp/bộ 3 bàn có thể ghép để đủ sức chứa.
 * Ưu tiên: cùng khu → ít dư chỗ → ít bàn
 */
function findGroupSuggestions(
  availableTables: Record<string, unknown>[],
  guests: number,
) {
  type TableRow = { id: number; name: string; zone: string; capacity: number };
  const tables = availableTables as TableRow[];
  const results: {
    tables: TableRow[];
    total_capacity: number;
    zone: string;
    same_zone: boolean;
    waste: number;
  }[] = [];

  // Thử cặp 2 bàn
  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const t1 = tables[i];
      const t2 = tables[j];
      const total = t1.capacity + t2.capacity;
      if (total < guests) continue;
      const sameZone = t1.zone === t2.zone;
      results.push({
        tables: [t1, t2],
        total_capacity: total,
        zone: sameZone ? t1.zone : `${t1.zone} + ${t2.zone}`,
        same_zone: sameZone,
        waste: total - guests,
      });
    }
  }

  // Thử bộ 3 bàn nếu cặp 2 vẫn không đủ
  if (results.length === 0) {
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        for (let k = j + 1; k < tables.length; k++) {
          const t1 = tables[i];
          const t2 = tables[j];
          const t3 = tables[k];
          const total = t1.capacity + t2.capacity + t3.capacity;
          if (total < guests) continue;
          const zones = new Set([t1.zone, t2.zone, t3.zone]);
          const sameZone = zones.size === 1;
          results.push({
            tables: [t1, t2, t3],
            total_capacity: total,
            zone: [...zones].join(' + '),
            same_zone: sameZone,
            waste: total - guests,
          });
        }
      }
    }
  }

  // Sắp xếp: cùng khu trước, ít dư chỗ trước
  results.sort((a, b) => {
    if (b.same_zone !== a.same_zone) {
      return Number(b.same_zone) - Number(a.same_zone);
    }
    return a.waste - b.waste;
  });

  return results.slice(0, 6);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { reservation_id } = await req.json();
    if (!reservation_id) return err('Thiếu reservation_id');

    // Lấy thông tin đặt chỗ
    const { data: reservation, error: resErr } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();
    if (resErr || !reservation) return err('Không tìm thấy đặt chỗ', 404);
    if (reservation.status !== 'pending') {
      return err('Đặt chỗ này đã được xếp bàn');
    }

    const restaurantId = reservation.restaurant_id || 1;
    const { date, time, guests } = reservation;

    // Lấy buffer_time nhà hàng
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('buffer_time')
      .eq('id', restaurantId)
      .single();
    const buffer = restaurant?.buffer_time ?? 30;

    const newStart = toMin(time);
    const newEnd = newStart + DEFAULT_DURATION;

    // ── Batch query 1: tất cả bàn active ─────────────────────────────
    const { data: allTables, error: tablesErr } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .order('zone')
      .order('capacity');
    if (tablesErr) throw tablesErr;

    const tableIds = (allTables || []).map((t: { id: number }) => t.id);
    if (tableIds.length === 0) {
      return ok({ single: [], groups: [] });
    }

    // ── Batch query 2: blocked_slots ngày đó cho tất cả bàn ──────────
    const { data: allBlocks } = await supabase
      .from('blocked_slots')
      .select('table_id, time_from, time_to')
      .in('table_id', tableIds)
      .eq('date', date);

    // ── Batch query 3: reservations ngày đó cho tất cả bàn ───────────
    // Loại trừ cancelled và pending (pending chưa có bàn thực sự)
    const { data: allReservations } = await supabase
      .from('reservations')
      .select('id, table_id, time')
      .in('table_id', tableIds)
      .eq('date', date)
      .not('status', 'in', '("cancelled","pending")')
      .neq('id', reservation_id); // loại trừ đặt chỗ hiện tại

    // Group by table_id để tra cứu O(1)
    const blocksByTable: Record<number, { time_from: string; time_to: string }[]> = {};
    for (const b of allBlocks ?? []) {
      if (!blocksByTable[b.table_id]) blocksByTable[b.table_id] = [];
      blocksByTable[b.table_id].push(b);
    }

    const resByTable: Record<number, { id: number; time: string }[]> = {};
    for (const r of allReservations ?? []) {
      if (!resByTable[r.table_id]) resByTable[r.table_id] = [];
      resByTable[r.table_id].push(r);
    }

    // ── Kiểm tra trống trong memory (không cần thêm DB call) ─────────
    function isTableFreeInMemory(tableId: number): boolean {
      // Kiểm tra blocked_slots
      for (const b of blocksByTable[tableId] ?? []) {
        const bStart = toMin(b.time_from);
        const bEnd = toMin(b.time_to);
        if (newStart < bEnd + buffer && newEnd + buffer > bStart) return false;
      }
      // Kiểm tra reservations
      for (const r of resByTable[tableId] ?? []) {
        const rStart = toMin(r.time);
        const rEnd = rStart + DEFAULT_DURATION;
        if (newStart < rEnd + buffer && newEnd + buffer > rStart) return false;
      }
      return true;
    }

    const availableTables = (allTables || []).filter((t: { id: number }) =>
      isTableFreeInMemory(t.id),
    );

    // ── Zone stats: đếm reservation confirmed/seated theo khu ─────────
    // Lấy từ allReservations đã có (tối ưu: không cần query thêm)
    const zoneStats: Record<string, number> = {};
    for (const t of allTables || []) {
      if (!zoneStats[t.zone]) zoneStats[t.zone] = 0;
    }
    for (const r of allReservations ?? []) {
      const table = (allTables || []).find((t: { id: number }) => t.id === r.table_id);
      if (table) zoneStats[table.zone] = (zoneStats[table.zone] || 0) + 1;
    }

    // ── Gợi ý bàn đơn ────────────────────────────────────────────────
    const singleCandidates = availableTables.filter(
      (t: { capacity: number }) => t.capacity >= guests,
    );

    const single = singleCandidates.map((table: { id: number; capacity: number; zone: string }) => {
      const score =
        calcCapacityScore(table.capacity, guests) +
        calcZoneScore(table.zone, zoneStats) +
        calcSandwichScore(table.id, resByTable, newStart, newEnd);
      const diff = table.capacity - guests;
      const reason =
        diff === 0 ? 'Vừa đủ số người' : `Dư ${diff} chỗ`;
      return { ...table, score, reason };
    });

    single.sort(
      (a: { score: number; capacity: number }, b: { score: number; capacity: number }) =>
        b.score - a.score || a.capacity - b.capacity,
    );

    // ── Gợi ý ghép bàn (chỉ khi không có bàn đơn đủ chỗ) ────────────
    const groups = single.length === 0
      ? findGroupSuggestions(availableTables, guests)
      : [];

    return ok({ single, groups });
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
