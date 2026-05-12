-- =============================================================
-- Seed data: 1 nhà hàng mẫu, 20 bàn chia 2 khu
-- =============================================================

-- Xóa dữ liệu cũ (để có thể chạy lại seed an toàn)
TRUNCATE TABLE blocked_slots, reservations, tables, restaurants RESTART IDENTITY CASCADE;

-- Nhà hàng mẫu
INSERT INTO restaurants (name, buffer_time, zones) VALUES (
  'Nhà Hàng Phố Đêm',
  30,
  '[
    {"name": "Khu A", "description": "Phòng trong, máy lạnh, yên tĩnh"},
    {"name": "Khu B", "description": "Sân vườn ngoài trời, có mái che"}
  ]'::jsonb
);

-- ─── Khu A: 10 bàn (phòng trong) ───────────────────────────
-- 4 bàn 2 người, 4 bàn 4 người, 2 bàn 6 người
INSERT INTO tables (restaurant_id, name, capacity, zone) VALUES
  (1, 'A1',  2, 'Khu A'),
  (1, 'A2',  2, 'Khu A'),
  (1, 'A3',  2, 'Khu A'),
  (1, 'A4',  2, 'Khu A'),
  (1, 'A5',  4, 'Khu A'),
  (1, 'A6',  4, 'Khu A'),
  (1, 'A7',  4, 'Khu A'),
  (1, 'A8',  4, 'Khu A'),
  (1, 'A9',  6, 'Khu A'),
  (1, 'A10', 6, 'Khu A');

-- ─── Khu B: 10 bàn (sân vườn) ──────────────────────────────
-- 2 bàn 2 người, 4 bàn 4 người, 2 bàn 6 người, 2 bàn 8 người
INSERT INTO tables (restaurant_id, name, capacity, zone) VALUES
  (1, 'B1',  2, 'Khu B'),
  (1, 'B2',  2, 'Khu B'),
  (1, 'B3',  4, 'Khu B'),
  (1, 'B4',  4, 'Khu B'),
  (1, 'B5',  4, 'Khu B'),
  (1, 'B6',  4, 'Khu B'),
  (1, 'B7',  6, 'Khu B'),
  (1, 'B8',  6, 'Khu B'),
  (1, 'B9',  8, 'Khu B'),
  (1, 'B10', 8, 'Khu B');
