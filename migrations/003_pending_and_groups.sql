-- =============================================================
-- Migration 003: Thêm trạng thái pending + bảng table_groups
-- =============================================================

-- 1. Thêm restaurant_id để lọc đặt chỗ pending (chưa có bàn)
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS restaurant_id INTEGER REFERENCES restaurants(id);

-- Điền restaurant_id cho dữ liệu cũ (lấy từ bàn)
UPDATE reservations r
SET restaurant_id = t.restaurant_id
FROM tables t
WHERE t.id = r.table_id AND r.restaurant_id IS NULL;

-- 2. Cho phép table_id là NULL (đặt chỗ chờ xếp bàn chưa có bàn)
ALTER TABLE reservations ALTER COLUMN table_id DROP NOT NULL;

-- 2. Mở rộng constraint status để thêm 'pending'
ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'));

-- 3. Bảng lưu ghép bàn (1 đặt chỗ có thể dùng nhiều bàn)
CREATE TABLE IF NOT EXISTS table_groups (
  id             SERIAL PRIMARY KEY,
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  table_ids      INTEGER[] NOT NULL,    -- mảng id các bàn được ghép
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Mỗi đặt chỗ chỉ có 1 bộ ghép bàn
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_groups_reservation
  ON table_groups (reservation_id);

-- Index tìm nhanh theo reservation
CREATE INDEX IF NOT EXISTS idx_table_groups_res
  ON table_groups (reservation_id);
