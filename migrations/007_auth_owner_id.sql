-- Migration 007: Thêm owner_id vào restaurants + bật RLS trên tất cả bảng
-- owner_id liên kết với Supabase Auth user (auth.users.id)
-- RLS bảo vệ direct Supabase client access (backend service role vẫn bypass RLS)

-- 1. Thêm cột owner_id vào restaurants (nullable để không phá data cũ)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Bật Row Level Security trên tất cả bảng dữ liệu ─────────────────────────
ALTER TABLE restaurants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_groups ENABLE ROW LEVEL SECURITY;

-- 3. Policies cho bảng restaurants ──────────────────────────────────────────
-- Chủ nhà hàng chỉ đọc nhà hàng của mình (dùng khi frontend fetch restaurant sau đăng nhập)
DROP POLICY IF EXISTS "owner_select_restaurant" ON restaurants;
CREATE POLICY "owner_select_restaurant" ON restaurants
  FOR SELECT USING (auth.uid() = owner_id);

-- Chủ nhà hàng chỉ update nhà hàng của mình
DROP POLICY IF EXISTS "owner_update_restaurant" ON restaurants;
CREATE POLICY "owner_update_restaurant" ON restaurants
  FOR UPDATE USING (auth.uid() = owner_id);

-- Chủ nhà hàng có thể tạo nhà hàng mới với owner_id = chính mình
DROP POLICY IF EXISTS "owner_insert_restaurant" ON restaurants;
CREATE POLICY "owner_insert_restaurant" ON restaurants
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- 4. Policies cho bảng tables ────────────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all_tables" ON tables;
CREATE POLICY "owner_all_tables" ON tables
  FOR ALL USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
  );

-- 5. Policies cho bảng reservations ─────────────────────────────────────────
DROP POLICY IF EXISTS "owner_all_reservations" ON reservations;
CREATE POLICY "owner_all_reservations" ON reservations
  FOR ALL USING (
    restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
  );

-- 6. Policies cho bảng blocked_slots (join qua tables → restaurants) ─────────
DROP POLICY IF EXISTS "owner_all_blocked_slots" ON blocked_slots;
CREATE POLICY "owner_all_blocked_slots" ON blocked_slots
  FOR ALL USING (
    table_id IN (
      SELECT t.id FROM tables t
      WHERE t.restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
    )
  );

-- 7. Policies cho bảng table_groups (join qua reservations → restaurants) ────
DROP POLICY IF EXISTS "owner_all_table_groups" ON table_groups;
CREATE POLICY "owner_all_table_groups" ON table_groups
  FOR ALL USING (
    reservation_id IN (
      SELECT r.id FROM reservations r
      WHERE r.restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
    )
  );
