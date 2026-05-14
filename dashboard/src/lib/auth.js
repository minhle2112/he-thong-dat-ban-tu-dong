// Xác thực đơn giản bằng username/password cố định lưu trong env vars.
// Token = base64 của "user:pass" — đổi password trong env thì token cũ tự hết hạn.
// Không dùng Supabase Auth, không cần backend.

const STORAGE_KEY = '_admin_auth';

function makeToken() {
  const u = process.env.NEXT_PUBLIC_ADMIN_USERNAME || '';
  const p = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || '';
  return btoa(`${u}:${p}`);
}

/** Kiểm tra credentials nhập vào có khớp env vars không */
export function checkCredentials(username, password) {
  return (
    username === process.env.NEXT_PUBLIC_ADMIN_USERNAME &&
    password === process.env.NEXT_PUBLIC_ADMIN_PASSWORD
  );
}

/** Lưu token vào localStorage sau khi đăng nhập thành công */
export function saveToken() {
  localStorage.setItem(STORAGE_KEY, makeToken());
}

/** Xóa token khỏi localStorage (đăng xuất) */
export function clearToken() {
  localStorage.removeItem(STORAGE_KEY);
}

/** Kiểm tra token trong localStorage có hợp lệ không */
export function isAuthenticated() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === makeToken();
}
