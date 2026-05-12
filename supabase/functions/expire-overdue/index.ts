// Edge Function: expire-overdue
// Tương đương: POST /api/reservations/expire-overdue
// Chuyển đặt chỗ pending quá 30 phút sau giờ đặt → 'expired'
// Dùng PostgreSQL function expire_overdue_reservations() để xử lý timezone

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, ok, err } from '../_shared/cors.ts';

serve(async (req) => {
  // Trả về 200 cho preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // bypass RLS
  );

  try {
    const { data, error } = await supabase.rpc('expire_overdue_reservations');
    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Đã chuyển ${data.expired_count} đặt chỗ sang trạng thái quá giờ`,
        expired_count: data.expired_count,
        expired: data.expired,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
