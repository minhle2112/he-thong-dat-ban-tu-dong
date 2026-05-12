-- =============================================================
-- Migration 004: Thêm trạng thái 'expired' cho đặt chỗ quá giờ
-- Chạy khi: nhân viên không kịp xếp bàn trong 30 phút sau giờ đặt
-- =============================================================

ALTER TABLE reservations
  DROP CONSTRAINT IF EXISTS reservations_status_check;

ALTER TABLE reservations
  ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'expired'));
