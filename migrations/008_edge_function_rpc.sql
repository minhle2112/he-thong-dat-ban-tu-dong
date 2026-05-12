-- =========================================================================
-- Migration 008: PostgreSQL stored procedures dùng bởi Supabase Edge Functions
-- Các hàm dưới đây cần SECURITY DEFINER vì Edge Functions gọi qua anon key
-- nhưng cần quyền đọc/ghi đầy đủ (bypass RLS).
-- =========================================================================

-- ----- 1. expire_overdue_reservations --------------------------------
-- Chuyển đặt chỗ pending quá 30 phút sau giờ đặt → 'expired'
-- Dùng AT TIME ZONE 'Asia/Ho_Chi_Minh' vì date/time lưu theo giờ VN
CREATE OR REPLACE FUNCTION expire_overdue_reservations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows json;
  v_count int := 0;
BEGIN
  WITH expired AS (
    UPDATE reservations
    SET status = 'expired'
    WHERE status = 'pending'
      AND (date + time) AT TIME ZONE 'Asia/Ho_Chi_Minh'
          < NOW() - INTERVAL '30 minutes'
    RETURNING id, name, date::text, time::text
  )
  SELECT json_agg(e), COUNT(*) INTO v_rows, v_count FROM expired e;

  RETURN json_build_object(
    'expired_count', COALESCE(v_count, 0),
    'expired',       COALESCE(v_rows, '[]'::json)
  );
END;
$$;

-- ----- 2. bulk_check_tables ------------------------------------------
-- Kiểm tra đặt chỗ active trước khi xóa hàng loạt.
-- Cần RPC vì dùng &&  (overlap giữa 2 int[]) — không thể làm bằng supabase-js filter.
CREATE OR REPLACE FUNCTION bulk_check_tables(p_table_ids int[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_agg(row) INTO v_result
  FROM (
    SELECT
      t.id,
      t.name,
      t.zone,
      t.capacity,
      COALESCE((
        SELECT json_agg(DISTINCT jsonb_build_object(
          'id',     r.id,
          'name',   r.name,
          'guests', r.guests,
          'status', r.status,
          'date',   r.date::text,
          'time',   r.time::text
        ))
        FROM (
          -- Đặt chỗ trực tiếp trên bàn này
          SELECT id, name, guests, status, date, time
          FROM reservations
          WHERE table_id = t.id
            AND status NOT IN ('cancelled', 'completed', 'no_show')
          UNION
          -- Đặt chỗ từ nhóm ghép bàn có chứa bàn này
          SELECT r2.id, r2.name, r2.guests, r2.status, r2.date, r2.time
          FROM table_groups tg
          JOIN reservations r2 ON r2.id = tg.reservation_id
          WHERE t.id = ANY(tg.table_ids)
            AND r2.status NOT IN ('cancelled', 'completed', 'no_show')
        ) r
      ), '[]'::json) AS active_reservations
    FROM tables t
    WHERE t.id = ANY(p_table_ids)
  ) row;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- ----- 3. bulk_delete_tables_txn -------------------------------------
-- Xóa nhiều bàn trong một transaction:
--   1) Hủy assign đặt chỗ active → về pending
--   2) Xóa table_groups liên quan
--   3) NULL table_id cho đặt chỗ đã kết thúc (tránh FK violation)
--   4) Xóa bàn
CREATE OR REPLACE FUNCTION bulk_delete_tables_txn(p_table_ids int[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unassigned_ids int[];
  v_deleted_count  int := 0;
BEGIN
  -- Tìm tất cả reservation_id cần hủy assign
  WITH active_res AS (
    SELECT DISTINCT id FROM (
      -- Trực tiếp
      SELECT r.id
      FROM reservations r
      WHERE r.table_id = ANY(p_table_ids)
        AND r.status NOT IN ('cancelled', 'completed', 'no_show')
      UNION ALL
      -- Qua table_groups (overlap array)
      SELECT r.id
      FROM table_groups tg
      JOIN reservations r ON r.id = tg.reservation_id
      WHERE tg.table_ids && p_table_ids
        AND r.status NOT IN ('cancelled', 'completed', 'no_show')
    ) x
  )
  SELECT array_agg(id) INTO v_unassigned_ids FROM active_res;

  -- Hủy assign + đặt về pending
  IF v_unassigned_ids IS NOT NULL
     AND array_length(v_unassigned_ids, 1) > 0 THEN
    UPDATE reservations
    SET table_id = NULL, status = 'pending'
    WHERE id = ANY(v_unassigned_ids);

    DELETE FROM table_groups
    WHERE reservation_id = ANY(v_unassigned_ids);
  END IF;

  -- NULL table_id cho đặt chỗ đã kết thúc (tránh FK violation khi xóa bàn)
  UPDATE reservations
  SET table_id = NULL
  WHERE table_id = ANY(p_table_ids)
    AND status IN ('cancelled', 'completed', 'no_show');

  -- Xóa bàn
  DELETE FROM tables WHERE id = ANY(p_table_ids);
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN json_build_object(
    'deleted_count',              v_deleted_count,
    'unassigned_count',           COALESCE(array_length(v_unassigned_ids, 1), 0),
    'unassigned_reservation_ids', COALESCE(v_unassigned_ids, ARRAY[]::int[])
  );
END;
$$;

-- ----- 4. setup_restaurant_v2 ----------------------------------------
-- Khởi tạo nhà hàng idempotent sau khi user đăng ký:
--   1) Đã có nhà hàng → trả về
--   2) Có nhà hàng chưa có chủ → nhận quyền sở hữu
--   3) Không có → tạo mới + seed 10 bàn mẫu (trong transaction ngầm)
CREATE OR REPLACE FUNCTION setup_restaurant_v2(p_owner_id uuid, p_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant restaurants%ROWTYPE;
  v_rid        int;
BEGIN
  -- Kiểm tra idempotent: user đã có nhà hàng chưa
  SELECT * INTO v_restaurant
  FROM restaurants WHERE owner_id = p_owner_id LIMIT 1;
  IF FOUND THEN RETURN row_to_json(v_restaurant); END IF;

  -- Nhận quyền sở hữu nhà hàng chưa có chủ (data cũ trước khi có auth)
  SELECT * INTO v_restaurant
  FROM restaurants WHERE owner_id IS NULL ORDER BY id LIMIT 1;
  IF FOUND THEN
    UPDATE restaurants
    SET owner_id = p_owner_id, name = p_name
    WHERE id = v_restaurant.id
    RETURNING * INTO v_restaurant;
    RETURN row_to_json(v_restaurant);
  END IF;

  -- Tạo nhà hàng mới
  INSERT INTO restaurants (name, owner_id, buffer_time, zones)
  VALUES (p_name, p_owner_id, 30, '["Khu A","Khu B"]'::jsonb)
  RETURNING * INTO v_restaurant;
  v_rid := v_restaurant.id;

  -- Seed 10 bàn mẫu (5 Khu A + 5 Khu B)
  INSERT INTO tables (restaurant_id, name, capacity, zone) VALUES
    (v_rid,'A1',2,'Khu A'),(v_rid,'A2',2,'Khu A'),(v_rid,'A3',4,'Khu A'),
    (v_rid,'A4',4,'Khu A'),(v_rid,'A5',6,'Khu A'),
    (v_rid,'B1',2,'Khu B'),(v_rid,'B2',4,'Khu B'),(v_rid,'B3',4,'Khu B'),
    (v_rid,'B4',6,'Khu B'),(v_rid,'B5',8,'Khu B');

  RETURN row_to_json(v_restaurant);
END;
$$;
