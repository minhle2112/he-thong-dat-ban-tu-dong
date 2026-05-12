// Edge Function: restaurant-setup
// Tương đương: POST /api/restaurants/setup
// Khởi tạo nhà hàng idempotent sau khi user đăng ký tài khoản
// Body: { owner_id, name }

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
    const { owner_id, name } = await req.json();

    if (!owner_id || !name) {
      return err('Thiếu owner_id hoặc name');
    }

    // Gọi stored procedure: idempotent, có transaction bên trong
    const { data, error } = await supabase.rpc('setup_restaurant_v2', {
      p_owner_id: owner_id,
      p_name: name,
    });
    if (error) throw error;

    return ok(data);
  } catch (e) {
    return err(e.message || 'Lỗi hệ thống', 500);
  }
});
