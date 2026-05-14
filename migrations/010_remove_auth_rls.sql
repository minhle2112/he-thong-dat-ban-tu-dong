-- Migration 010: Bỏ RLS — app chuyển sang single-tenant, không cần multi-user security
-- Trước đây RLS dùng auth.uid() để phân quyền theo nhà hàng.
-- Giờ app chỉ có 1 nhà hàng, không có đăng nhập → tắt RLS hoàn toàn.
-- Edge Functions vẫn dùng service_role nên không bị ảnh hưởng.

-- Xóa toàn bộ policies cũ để tránh conflict ──────────────────────────────────

DROP POLICY IF EXISTS "owner_select_restaurant"  ON restaurants;
DROP POLICY IF EXISTS "owner_update_restaurant"  ON restaurants;
DROP POLICY IF EXISTS "owner_insert_restaurant"  ON restaurants;
DROP POLICY IF EXISTS "public_read_restaurants"  ON restaurants;

DROP POLICY IF EXISTS "owner_all_tables"         ON tables;
DROP POLICY IF EXISTS "public_read_tables"       ON tables;

DROP POLICY IF EXISTS "owner_all_reservations"   ON reservations;
DROP POLICY IF EXISTS "public_read_reservations" ON reservations;
DROP POLICY IF EXISTS "public_insert_reservations" ON reservations;

DROP POLICY IF EXISTS "owner_all_blocked_slots"  ON blocked_slots;
DROP POLICY IF EXISTS "public_read_blocked_slots" ON blocked_slots;

DROP POLICY IF EXISTS "owner_all_table_groups"   ON table_groups;
DROP POLICY IF EXISTS "public_read_table_groups" ON table_groups;

-- Tắt RLS trên tất cả bảng ───────────────────────────────────────────────────

ALTER TABLE restaurants   DISABLE ROW LEVEL SECURITY;
ALTER TABLE tables        DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservations  DISABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots DISABLE ROW LEVEL SECURITY;
ALTER TABLE table_groups  DISABLE ROW LEVEL SECURITY;
