// Edge Function: assign-table
// Tương đương: POST /api/reservations/:id/assign
// Nhân viên xếp bàn / ghép bàn cho đặt chỗ pending hoặc confirmed
// Body: { reservation_id, table_ids: [number, ...] }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

// Thời gian ngồi mặc định (phút) — dùng để kiểm tra overlap
const DEFAULT_DURATION = 90;

/** Chuyển "HH:MM" hoặc "HH:MM:SS" → số phút từ nửa đêm */
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Kiểm tra bàn có trống trong khung giờ [newStart, newEnd] không.
 * Trùng giờ khi: newStart < existEnd+buffer AND newEnd+buffer > existStart
 */
async function isTableFree(
  supabase: ReturnType<typeof createClient>,
  tableId: number,
  date: string,
  newStart: number,
  newEnd: number,
  buffer: number,
  excludeReservationId: number | null = null,
): Promise<boolean> {
  // Kiểm tra blocked_slots
  const { data: blocks } = await supabase
    .from('blocked_slots')
    .select('time_from, time_to')
    .eq('table_id', tableId)
    .eq('date', date);

  for (const b of blocks ?? []) {
    const bStart = toMin(b.time_from);
    const bEnd = toMin(b.time_to);
    if (newStart < bEnd + buffer && newEnd + buffer > bStart) return false;
  }

  // Kiểm tra reservations đang active (bỏ qua pending vì chưa có bàn)
  let query = supabase
    .from('reservations')
    .select('time')
    .eq('table_id', tableId)
    .eq('date', date)
    .not('status', 'in', '("cancelled","pending")');

  if (excludeReservationId) {
    query = query.neq('id', excludeReservationId);
  }

  const { data: reservations } = await query;

  for (const r of reservations ?? []) {
    const rStart = toMin(r.time);
    const rEnd = rStart + DEFAULT_DURATION;
    if (newStart < rEnd + buffer && newEnd + buffer > rStart) return false;
  }

  return true;
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
    const { reservation_id, table_ids } = await req.json();

    if (!reservation_id) return err('Thiếu reservation_id');
    if (!Array.isArray(table_ids) || table_ids.length === 0) {
      return err('Thiếu table_ids');
    }

    // Lấy thông tin đặt chỗ
    const { data: reservation, error: resErr } = await supabase
      .from('reservations')
      .select('*')
      .eq('id', reservation_id)
      .single();
    if (resErr || !reservation) return err('Không tìm thấy đặt chỗ', 404);

    if (!['pending', 'confirmed'].includes(reservation.status)) {
      return err('Không thể đổi bàn cho đặt chỗ ở trạng thái này');
    }

    // Lấy thông tin các bàn được chọn
    const { data: tables, error: tablesErr } = await supabase
      .from('tables')
      .select('*')
      .in('id', table_ids);
    if (tablesErr) throw tablesErr;
    if (!tables || tables.length !== table_ids.length) {
      return err('Một số bàn không tồn tại', 404);
    }

    // Kiểm tra tổng sức chứa
    const totalCapacity = tables.reduce((s: number, t: { capacity: number }) => s + t.capacity, 0);
    if (totalCapacity < reservation.guests) {
      return err(
        `Tổng sức chứa ${totalCapacity} không đủ cho ${reservation.guests} khách`,
      );
    }

    // Lấy buffer_time của nhà hàng
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('buffer_time')
      .eq('id', reservation.restaurant_id || 1)
      .single();
    const buffer = restaurant?.buffer_time ?? 30;

    const newStart = toMin(reservation.time);
    const newEnd = newStart + DEFAULT_DURATION;

    // Kiểm tra từng bàn có trống không
    for (const table of tables) {
      const free = await isTableFree(
        supabase,
        table.id,
        reservation.date,
        newStart,
        newEnd,
        buffer,
        reservation_id,
      );
      if (!free) {
        return err(`Bàn ${table.name} đã có đặt chỗ trong khung giờ này`, 409);
      }
    }

    const primaryTableId = table_ids[0];

    // Cập nhật reservation: gán bàn chính, chuyển sang confirmed
    const { data: updated, error: updateErr } = await supabase
      .from('reservations')
      .update({ table_id: primaryTableId, status: 'confirmed' })
      .eq('id', reservation_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Cập nhật table_groups
    if (table_ids.length > 1) {
      // Ghép nhiều bàn: upsert vào table_groups
      const { error: groupErr } = await supabase
        .from('table_groups')
        .upsert({ reservation_id, table_ids }, { onConflict: 'reservation_id' });
      if (groupErr) throw groupErr;
    } else {
      // Bàn đơn: xóa nhóm ghép cũ nếu có
      await supabase
        .from('table_groups')
        .delete()
        .eq('reservation_id', reservation_id);
    }

    const tableNames = tables.map((t: { name: string }) => t.name).join(', ');
    const message =
      table_ids.length > 1
        ? `Đã ghép ${table_ids.length} bàn: ${tableNames}`
        : `Đã xếp bàn ${tables[0].name}`;

    return ok(
      {
        ...updated,
        group_table_ids: table_ids.length > 1 ? table_ids : null,
      },
      200,
      message,
    );
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
