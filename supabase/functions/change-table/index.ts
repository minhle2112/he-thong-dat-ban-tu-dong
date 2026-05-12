// Edge Function: change-table
// Tương đương: PATCH /api/reservations/:id/table
// Đổi bàn cho đặt chỗ đã confirmed — chỉ cho phép 1 bàn (không ghép bàn)
// Body: { reservation_id, table_id }
//
// Tái sử dụng toàn bộ logic kiểm tra overlap của assign-table
// Khác biệt: chỉ nhận 1 bàn + chỉ cho phép status='confirmed'

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

const DEFAULT_DURATION = 90;

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function isTableFree(
  supabase: ReturnType<typeof createClient>,
  tableId: number,
  date: string,
  newStart: number,
  newEnd: number,
  buffer: number,
  excludeReservationId: number,
): Promise<boolean> {
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

  const { data: reservations } = await supabase
    .from('reservations')
    .select('time')
    .eq('table_id', tableId)
    .eq('date', date)
    .not('status', 'in', '("cancelled","pending")')
    .neq('id', excludeReservationId);

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
    const { reservation_id, table_id } = await req.json();

    if (!reservation_id || !table_id) {
      return err('Thiếu reservation_id hoặc table_id');
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

    // Lấy thông tin bàn mới
    const { data: table, error: tableErr } = await supabase
      .from('tables')
      .select('*')
      .eq('id', table_id)
      .single();
    if (tableErr || !table) return err('Không tìm thấy bàn', 404);

    // Kiểm tra sức chứa
    if (table.capacity < reservation.guests) {
      return err(
        `Bàn ${table.name} chỉ chứa ${table.capacity} người, cần ${reservation.guests}`,
      );
    }

    // Lấy buffer_time
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('buffer_time')
      .eq('id', reservation.restaurant_id || 1)
      .single();
    const buffer = restaurant?.buffer_time ?? 30;

    const newStart = toMin(reservation.time);
    const newEnd = newStart + DEFAULT_DURATION;

    const free = await isTableFree(
      supabase,
      table_id,
      reservation.date,
      newStart,
      newEnd,
      buffer,
      reservation_id,
    );
    if (!free) {
      return err(`Bàn ${table.name} đã có đặt chỗ trong khung giờ này`, 409);
    }

    // Cập nhật bàn chính + xóa nhóm ghép cũ
    const { data: updated, error: updateErr } = await supabase
      .from('reservations')
      .update({ table_id, status: 'confirmed' })
      .eq('id', reservation_id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await supabase
      .from('table_groups')
      .delete()
      .eq('reservation_id', reservation_id);

    return ok(updated, 200, `Đã đổi sang bàn ${table.name}`);
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
