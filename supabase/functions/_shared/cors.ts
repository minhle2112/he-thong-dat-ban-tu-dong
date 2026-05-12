// Header CORS dùng chung cho tất cả Edge Functions
// Cho phép frontend (localhost:3001 và production) gọi qua browser
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

// Helper trả về response thành công theo format cũ { success, message?, data }
export function ok(data: unknown, status = 200, message?: string): Response {
  return new Response(
    JSON.stringify({ success: true, ...(message ? { message } : {}), data }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

// Helper trả về response lỗi
export function err(message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
