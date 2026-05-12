-- Migration 006: Thêm cột position_order vào tables để lưu thứ tự kéo thả
ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_order INTEGER DEFAULT 0;

-- Khởi tạo position_order theo thứ tự zone + name hiện tại (giữ nguyên UI cũ)
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY zone, name) - 1) AS rn
  FROM tables
)
UPDATE tables t
SET position_order = o.rn
FROM ordered o
WHERE t.id = o.id;
