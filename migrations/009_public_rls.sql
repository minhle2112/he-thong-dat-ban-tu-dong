-- Migration 009: Thêm policies cho truy cập công khai
-- Trang /dat-ban (không cần đăng nhập) cần đọc dữ liệu nhà hàng và tạo đặt chỗ.
-- Edge Functions dùng service_role nên bypass RLS — không cần policy riêng.
-- Các policy PERMISSIVE: row đi qua nếu BẤT KỲ policy nào cho phép.

-- ─── restaurants ─────────────────────────────────────────────────────────────
-- Khách cần đọc thông tin nhà hàng (tên, settings) khi vào /dat-ban?r=id
DROP POLICY IF EXISTS "public_read_restaurants" ON restaurants;
CREATE POLICY "public_read_restaurants" ON restaurants
  FOR SELECT USING (true);

-- ─── tables ──────────────────────────────────────────────────────────────────
-- Khách cần đọc danh sách bàn để tính tổng sức chứa
DROP POLICY IF EXISTS "public_read_tables" ON tables;
CREATE POLICY "public_read_tables" ON tables
  FOR SELECT USING (true);

-- ─── reservations ────────────────────────────────────────────────────────────
-- Khách cần đọc đặt chỗ theo ngày để tính số chỗ còn trống
DROP POLICY IF EXISTS "public_read_reservations" ON reservations;
CREATE POLICY "public_read_reservations" ON reservations
  FOR SELECT USING (true);

-- Khách đặt bàn từ /dat-ban — INSERT không cần auth
-- owner_all_reservations (migration 007) không cho phép anon INSERT
-- nên cần thêm policy permissive này để ghi đè
DROP POLICY IF EXISTS "public_insert_reservations" ON reservations;
CREATE POLICY "public_insert_reservations" ON reservations
  FOR INSERT WITH CHECK (true);

-- ─── blocked_slots ───────────────────────────────────────────────────────────
-- Dashboard tính trạng thái bàn cần đọc blocked_slots dù chưa fully auth
DROP POLICY IF EXISTS "public_read_blocked_slots" ON blocked_slots;
CREATE POLICY "public_read_blocked_slots" ON blocked_slots
  FOR SELECT USING (true);

-- ─── table_groups ────────────────────────────────────────────────────────────
-- Dashboard cần JOIN table_groups để hiển thị ghép bàn
DROP POLICY IF EXISTS "public_read_table_groups" ON table_groups;
CREATE POLICY "public_read_table_groups" ON table_groups
  FOR SELECT USING (true);
