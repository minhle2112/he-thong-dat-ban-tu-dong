-- =============================================================
-- PHẦN 1: Schema cơ sở dữ liệu hệ thống đặt bàn
-- =============================================================

-- Bảng nhà hàng
CREATE TABLE IF NOT EXISTS restaurants (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  buffer_time   INTEGER DEFAULT 30,        -- khoảng đệm giữa 2 đặt chỗ (phút)
  zones         JSONB DEFAULT '[]',        -- danh sách khu (tên, mô tả)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng danh sách bàn
CREATE TABLE IF NOT EXISTS tables (
  id             SERIAL PRIMARY KEY,
  restaurant_id  INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name           VARCHAR(50) NOT NULL,
  capacity       INTEGER NOT NULL CHECK (capacity > 0),
  zone           VARCHAR(50) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng đặt chỗ
CREATE TABLE IF NOT EXISTS reservations (
  id          SERIAL PRIMARY KEY,
  table_id    INTEGER NOT NULL REFERENCES tables(id) ON DELETE RESTRICT,
  date        DATE NOT NULL,
  time        TIME NOT NULL,
  guests      INTEGER NOT NULL CHECK (guests > 0),
  name        VARCHAR(255) NOT NULL,
  phone       VARCHAR(20) NOT NULL,
  note        TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'confirmed'
                CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bảng khóa slot (bảo trì, sự kiện riêng…)
CREATE TABLE IF NOT EXISTS blocked_slots (
  id          SERIAL PRIMARY KEY,
  table_id    INTEGER NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  time_from   TIME NOT NULL,
  time_to     TIME NOT NULL CHECK (time_to > time_from),
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index tăng tốc truy vấn đặt chỗ theo ngày
CREATE INDEX IF NOT EXISTS idx_reservations_table_date
  ON reservations (table_id, date);

CREATE INDEX IF NOT EXISTS idx_blocked_slots_table_date
  ON blocked_slots (table_id, date);

CREATE INDEX IF NOT EXISTS idx_tables_restaurant
  ON tables (restaurant_id, zone, status);
