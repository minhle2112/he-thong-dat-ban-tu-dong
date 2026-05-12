// Edge Function: rename-zone
// Tương đương: PATCH /api/restaurants/:id/zones/:zoneName
// Đổi tên khu: cập nhật zones JSONB + tất cả tables.zone cùng tên
// Body: { restaurant_id, old_name, new_name }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

// Chuẩn hoá một phần tử zones JSONB (hỗ trợ cả string lẫn object {name:...})
function zoneName(z: unknown): string {
  if (typeof z === 'string') return z;
  if (z && typeof z === 'object') return (z as { name?: string }).name || '';
  return '';
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
    const { restaurant_id, old_name, new_name } = await req.json();

    if (!restaurant_id || !old_name || !new_name?.trim()) {
      return err('Thiếu restaurant_id, old_name hoặc new_name');
    }
    const trimmedNew = new_name.trim();

    // Lấy zones hiện tại
    const { data: restaurant, error: restErr } = await supabase
      .from('restaurants')
      .select('zones')
      .eq('id', restaurant_id)
      .single();
    if (restErr || !restaurant) return err('Không tìm thấy nhà hàng', 404);

    const zones: string[] = ((restaurant.zones as unknown[]) || [])
      .map(zoneName)
      .filter(Boolean);

    if (!zones.includes(old_name)) {
      return err(`Không tìm thấy khu "${old_name}"`, 404);
    }
    if (zones.includes(trimmedNew) && trimmedNew !== old_name) {
      return err(`Khu "${trimmedNew}" đã tồn tại`, 409);
    }

    const newZones = zones.map((z) => (z === old_name ? trimmedNew : z));

    // Cập nhật zones JSONB của nhà hàng
    const { error: updateZoneErr } = await supabase
      .from('restaurants')
      .update({ zones: newZones })
      .eq('id', restaurant_id);
    if (updateZoneErr) throw updateZoneErr;

    // Cập nhật zone trên tất cả bàn thuộc khu cũ
    const { error: updateTableErr } = await supabase
      .from('tables')
      .update({ zone: trimmedNew })
      .eq('restaurant_id', restaurant_id)
      .eq('zone', old_name);
    if (updateTableErr) throw updateTableErr;

    return ok({ old_name, new_name: trimmedNew });
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
