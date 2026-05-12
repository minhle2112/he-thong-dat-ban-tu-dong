-- Thêm trạng thái 'seated' (khách đã đến, đang ngồi) cho reservations
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('confirmed', 'seated', 'completed', 'cancelled', 'no_show'));
