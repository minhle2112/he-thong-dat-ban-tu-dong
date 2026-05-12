// Edge Function: bulk-table-ops
// Gộp 2 endpoint:
//   POST /api/tables/bulk-check  → body: { action: 'check',  table_ids: [...] }
//   POST /api/tables/bulk-delete → body: { action: 'delete', table_ids: [...] }
// Dùng RPC vì cần JOIN trên array column (&&) — không thể làm bằng supabase-js filter

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { action, table_ids } = await req.json();

    if (!Array.isArray(table_ids) || table_ids.length === 0) {
      return err('Thiếu table_ids');
    }
    if (!['check', 'delete'].includes(action)) {
      return err('action phải là "check" hoặc "delete"');
    }

    if (action === 'check') {
      // Kiểm tra đặt chỗ active trước khi xóa
      const { data, error } = await supabase.rpc('bulk_check_tables', {
        p_table_ids: table_ids,
      });
      if (error) throw error;
      return ok(data);
    }

    // action === 'delete': xóa trong transaction
    const { data, error } = await supabase.rpc('bulk_delete_tables_txn', {
      p_table_ids: table_ids,
    });
    if (error) throw error;

    return ok(data, 200, `Đã xóa ${data.deleted_count} bàn`);
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
