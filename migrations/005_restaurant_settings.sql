-- Migration 005: Thêm cột settings JSONB vào bảng restaurants
-- Lưu cấu hình đặt bàn: max_per_slot, slot_interval, buffer_minutes,
-- duration_minutes (thời gian sử dụng bàn), và lịch khung giờ theo ngày.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
    "max_per_slot": 5,
    "slot_interval": 30,
    "buffer_minutes": 30,
    "duration_minutes": 90,
    "schedules": [
      {
        "id": "group1",
        "label": "Thứ 2 – Thứ 6",
        "days": [1, 2, 3, 4, 5],
        "enabled": true,
        "shifts": [
          { "id": "s1", "label": "Ca trưa", "from": "11:00", "to": "14:30" },
          { "id": "s2", "label": "Ca tối",  "from": "17:30", "to": "21:30" }
        ]
      },
      {
        "id": "group2",
        "label": "Thứ 7 – Chủ Nhật",
        "days": [6, 0],
        "enabled": true,
        "shifts": [
          { "id": "s1", "label": "Ca trưa", "from": "11:00", "to": "14:30" },
          { "id": "s2", "label": "Ca tối",  "from": "17:30", "to": "21:30" }
        ]
      }
    ]
  }';

-- Thêm duration_minutes vào các hàng đã tồn tại (nếu chưa có)
UPDATE restaurants
SET settings = settings || '{"duration_minutes": 90}'::jsonb
WHERE NOT (settings ? 'duration_minutes');
