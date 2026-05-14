# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Tổng quan project

Hệ thống đặt bàn nhà hàng tự động gồm ba phần độc lập nhưng cùng stack:

| Phần | Mô tả | Trạng thái |
|------|-------|-----------|
| **Phần 1** | Backend API + thuật toán xếp bàn thông minh | ✅ Hoàn thành |
| **Phần 2** | Dashboard sơ đồ bàn real-time cho nhân viên | ✅ Hoàn thành |
| **Phần 3** | Trang đặt bàn công khai cho khách (`/dat-ban`) | ✅ Hoàn thành |
| **Phần 4** | App check-in cho nhân viên trên iPad (`/nhan-vien`) | ✅ Hoàn thành |
| **Phần 5** | Trang quản lý bàn & khu (`/quan-ly-ban`) | ✅ Hoàn thành |
| **Phần 6** | Flow xếp bàn thủ công + ghép bàn | ✅ Hoàn thành |
| **Phần 7** | Trang cài đặt hệ thống (`/settings`) | ✅ Hoàn thành |
| **Phần 8** | ~~Hệ thống đăng nhập Supabase Auth + multi-tenant~~ → Đã xóa auth, app single-tenant | ✅ Hoàn thành |
| **Phần 9** | Migrate toàn bộ backend sang Supabase Edge Functions | ✅ Hoàn thành |

---

## Tech stack

| Layer | Công nghệ |
|-------|-----------|
| Backend | Supabase Edge Functions (Deno/TypeScript) — thay thế Express |
| Database | Supabase (PostgreSQL hosted) + RLS |
| Frontend | Next.js 15 (App Router), React 18, Tailwind CSS 3 |
| Realtime | Supabase PostgRES changes (dashboard) |
| Legacy backend | Node.js + Express 4 — đã xóa (`src/` removed sau khi migrate hoàn tất) |

---

## Cấu trúc thư mục

```
he-thong-dat-ban-tu-dong/
├── supabase/
│   └── functions/
│       ├── _shared/cors.ts         # CORS headers + ok()/err() helpers
│       ├── expire-overdue/         # Expire pending reservations quá giờ
│       ├── rename-zone/            # Đổi tên khu + cập nhật tables.zone
│       ├── bulk-table-ops/         # Kiểm tra + xóa bàn hàng loạt
│       ├── assign-table/           # Xếp bàn / ghép bàn (overlap check)
│       ├── get-suggestions/        # Gợi ý bàn 100 điểm (batch queries)
│       ├── restaurant-setup/       # Khởi tạo nhà hàng idempotent
│       └── change-table/           # Đổi bàn đã confirmed
├── migrations/001_initial_schema.sql … 009_public_rls.sql
├── seeds/001_seed_data.sql
├── docs/api.http               # Ví dụ REST calls (tham khảo)
├── package.json                # Chỉ còn scripts cho dashboard
│
└── dashboard/                  # Frontend Next.js, port 3001
    └── src/
        ├── app/
        │   ├── page.jsx              # Dashboard nhân viên (route /)
        │   ├── dat-ban/page.jsx      # Đặt bàn công khai (route /dat-ban)
        │   ├── nhan-vien/page.jsx    # App check-in iPad (route /nhan-vien)
        │   ├── quan-ly-ban/page.jsx  # Quản lý bàn & khu (route /quan-ly-ban)
        │   └── settings/page.jsx     # Cài đặt hệ thống (route /settings)
        ├── components/               # TableMap, ReservationList, TableDetailModal
        ├── contexts/ThemeContext.jsx # ThemeProvider + useTheme hook (dark/light mode)
        ├── hooks/useDashboard.js     # State + realtime subscription
        ├── lib/api.js                # Supabase client wrapper (thay HTTP client cũ)
        ├── lib/supabase.js           # Supabase client
        └── utils/tableStatus.js     # Tính trạng thái bàn (4 trạng thái)
```

---

## Cấu trúc database

```sql
restaurants  (id, name, buffer_time INT=30, zones JSONB, settings JSONB, created_at)
tables       (id, restaurant_id FK, name, capacity, zone, status active|inactive, created_at)
reservations (id, table_id FK, date DATE, time TIME, guests, name, phone, note,
              status confirmed|cancelled|completed|no_show, created_at)
blocked_slots(id, table_id FK, date DATE, time_from TIME, time_to TIME, reason, created_at)
```

Index: `(table_id, date)` trên cả `reservations` và `blocked_slots`.

---

## API endpoints

Base URL: `http://localhost:3000/api`

Tất cả response có dạng `{ success: bool, message: string, data: any }`.

```
GET    /health
GET    /restaurants
GET    /restaurants/:id
GET    /restaurants/:restaurantId/tables      ?zone= &status=
POST   /restaurants/:restaurantId/tables     { name, capacity, zone, status? }
GET    /restaurants/:id/zones
POST   /restaurants/:id/zones               { name }
PATCH  /restaurants/:id/zones/:zoneName     { name }  — đổi tên khu + update tất cả bàn
DELETE /restaurants/:id/zones/:zoneName     — báo lỗi nếu còn bàn
GET    /restaurants/:id/settings            — lấy settings JSONB
PATCH  /restaurants/:id/settings            { max_per_slot?, slot_interval?, buffer_minutes?, schedules? } — merge update
PATCH  /tables/:id                          { name?, capacity?, zone?, status? }
DELETE /tables/:id                          — báo lỗi nếu có đặt chỗ tương lai
POST   /tables/bulk-check                   { table_ids } — kiểm tra active reservations
POST   /tables/bulk-delete                  { table_ids } — hủy assign + xóa hàng loạt

POST   /reservations                         tạo đặt chỗ → trạng thái 'pending'
GET    /reservations                         ?date= &restaurant_id= &status=
GET    /reservations/:id
GET    /reservations/:id/suggestions         gợi ý bàn cho nhân viên
POST   /reservations/:id/assign             { table_ids: [id,...] } — xếp bàn / ghép bàn
PATCH  /reservations/:id                     { status }
PATCH  /reservations/:id/table              { table_id } — đổi bàn (đã confirmed)
DELETE /reservations/:id

GET    /blocked-slots                        ?date= &table_id=
POST   /blocked-slots                        { table_id, date, time_from, time_to, reason? }
DELETE /blocked-slots/:id
```

**Body POST /reservations:**
```json
{ "restaurant_id": 1, "date": "YYYY-MM-DD", "time": "HH:MM",
  "guests": 4, "name": "...", "phone": "0901234567", "note": "..." }
```

---

## Biến môi trường

**Backend** (`.env` ở root):
```
DATABASE_URL=postgresql://...    # Supabase connection string
PORT=3000
```

**Dashboard** (`dashboard/.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_STAFF_PIN=1234          # PIN đăng nhập trang /nhan-vien
```

---

## Cách chạy project

```bash
# ── Lần đầu cài đặt ───────────────────────────
npm run install:all    # cài deps cho cả backend lẫn dashboard

npm run migrate        # Tạo bảng (chạy 1 lần)
npm run seed           # Dữ liệu mẫu (tuỳ chọn)

# ── Chạy toàn bộ bằng 1 lệnh ──────────────────
npm run dev            # backend (port 3000) + dashboard (port 3001) song song

# ── Hoặc chạy riêng từng service ──────────────
npm run dev:backend    # chỉ backend, port 3000
npm run dev:dashboard  # chỉ dashboard, port 3001
```

Sau khi chạy:
- Dashboard nhân viên: `http://localhost:3001`
- Trang đặt bàn khách: `http://localhost:3001/dat-ban`
- App check-in iPad:   `http://localhost:3001/nhan-vien` (PIN mặc định: `1234`)
- API: `http://localhost:3000/api/health`
- Quản lý bàn:    `http://localhost:3001/quan-ly-ban`

---

## Quyết định thiết kế quan trọng

**Thuật toán xếp bàn** (`src/services/tableAssignment.js`):
- Hệ thống 100 điểm: độ vừa vặn sức chứa (40đ) + lấp đầy khu (30đ) + tránh kẹp giờ (30đ)
- Mỗi đặt chỗ chiếm **90 phút** (DEFAULT_DURATION), khoảng đệm **30 phút** (buffer_time từ DB)
- Một slot bị chiếm khi: `newStart < existEnd + buffer AND newEnd + buffer > existStart`

**Realtime dashboard**: Supabase PostgRES changes subscribe vào bảng `reservations` và `blocked_slots` — không polling. Khi có thay đổi, gọi lại `fetchData()` để refresh toàn bộ.

**Tính trạng thái bàn**: Logic nằm ở `utils/tableStatus.js`, trả về `available / reserved / occupied / blocked`. `occupied` = đặt chỗ status `seated` hoặc đang trong khung giờ (nếu là ngày hôm nay).

**Giữ ngày khi chuyển tab**: `selectedDate` trong `useDashboard.js` được lưu vào `sessionStorage` (key `_dashboard_selected_date`) mỗi khi thay đổi, và đọc lại khi hook khởi tạo. Tránh reset về hôm nay khi navigate ra ngoài rồi quay lại dashboard. `setSelectedDate` bọc bởi `useCallback` để đồng thời gọi `sessionStorage.setItem`. Nút "Hôm nay" trong header dashboard ẩn đi khi đang xem hôm nay, hiện lại khi xem ngày khác để reset nhanh.

**Sơ đồ bàn dashboard (/)**: `TableMap` nhận prop `selectedDate` để tính `isToday`. Mỗi ô bàn hiện **tất cả đặt chỗ** trong ngày (confirmed + seated), sắp xếp theo giờ tăng dần, tối đa 2 dòng rồi hiện "+X nữa". Mỗi dòng: `HH:MM · Tên ngắn · Xng`. Màu chữ theo trạng thái: `seated` → trắng; `confirmed` thường → vàng nhạt (`text-yellow-100`); `confirmed` < 30 phút (hôm nay) → đỏ nhạt (`text-red-200`). Bàn không có đặt chỗ → hiện nhãn trạng thái mặc định. Thời gian được cập nhật mỗi 60 giây. Legend đã bỏ trạng thái "Chặn".

**Chặn bàn đã bỏ khỏi dashboard**: `TableDetailModal` không còn hiện form chặn bàn, danh sách blocked slots, hay nút "Bỏ chặn". Các prop `blockedSlots`, `onBlock`, `onUnblock` đã xóa khỏi modal. Dữ liệu `blocked_slots` vẫn được dùng trong `useDashboard.js` để tính `tableStatuses` (bàn inactive vẫn hiện màu xám), nhưng không có UI để tạo/xóa blocked slots trên dashboard nữa.

**TableDetailModal — hiện tất cả đặt chỗ trong ngày**: Prop thay đổi: `reservation` (single) → `reservations` (tất cả đặt chỗ ngày đang xem) + `selectedDate`. Modal lọc đặt chỗ của bàn đó (trực tiếp hoặc ghép bàn) rồi chia 3 nhóm: (1) **Đang diễn ra** — `status=seated` hoặc `confirmed` + hôm nay + `nowMin >= start-15` → card xanh, nút "Hoàn thành" + "Đổi bàn"; (2) **Sắp tới** — `confirmed` chưa đến giờ → card vàng, nút "Check-in" + "Đổi bàn" + "Huỷ", hiện "còn X phút/tiếng"; (3) **Đã xong** — `completed` → collapsed mặc định, click để mở. Bàn không có đặt chỗ → "Bàn trống, chưa có đặt chỗ nào". `page.jsx` truyền `allReservations` thay vì `selectedTableReservation`.

**Trang /dat-ban**: Không expose số bàn cho khách. Tính số chỗ còn lại client-side bằng cách fetch reservations theo ngày và tính overlap 90 phút. Khung giờ hết chỗ bị ẩn hoàn toàn. Khung giờ đã qua hoặc trong buffer tối thiểu (`BUFFER_PHUT = 30`) cũng bị ẩn khi chọn hôm nay. `nowPhut` được cập nhật mỗi 60 giây bằng `setInterval` — không cần refresh trang. Giờ so sánh dùng `new Date().getHours()` (local timezone, không phải UTC); `homNay` cũng dùng local date để tránh lệch múi giờ. Nếu hôm nay hết giờ hợp lệ → thông báo riêng màu cam (khác với thông báo "hết chỗ" màu đỏ).

**Single restaurant**: Toàn bộ hệ thống mặc định `restaurant_id = 1`. Frontend hardcode hằng số `RESTAURANT_ID = 1`.

**Trang /nhan-vien (Phần 4)**: App iPad cho nhân viên check-in. Bảo vệ bằng PIN 4 số lưu trong `sessionStorage` — không phải auth thực sự, chỉ đủ ngăn khách lạ bấm nhầm. PIN cấu hình qua `NEXT_PUBLIC_STAFF_PIN`, mặc định `1234`. `api.createReservation` được thêm vào `lib/api.js` ở Phần 4. Trang chỉ có 2 tab: **Chờ xếp bàn** và **Quá giờ** — tab Danh sách đã bị xóa. Mặc định mở tab Chờ xếp bàn khi vào trang.

**Fix lệch ngày (quan trọng)**: `postgres-date` (dependency của `pg`) parse `DATE` column thành `new Date(year, month, day)` tại **local midnight**. Khi backend chạy ở UTC+7, `JSON.stringify` convert thành `"2026-05-10T17:00:00.000Z"` → frontend đọc 10 ký tự đầu ra `"2026-05-10"` thay vì `"2026-05-11"` — lệch 1 ngày. **Root fix**: `src/config/database.js` thêm `types.setTypeParser(1082, val => val)` để pg trả `DATE` về dạng string thô `"YYYY-MM-DD"`. Frontend phòng thủ bằng `normDate(dateStr).substring(0, 10)` và luôn thêm `T00:00:00` khi parse. Mọi nơi dùng "hôm nay" phải dùng local date (`getFullYear/getMonth/getDate`), không dùng `toISOString().split('T')[0]` (UTC).

**Ghép bàn trong /nhan-vien**: Modal xếp bàn có 2 tab — "Bàn đơn" (chọn 1 bàn từ `goiY.single`) và "Ghép bàn" (chọn nhiều bàn, hiện tổng sức chứa). Backend `getSuggestions` trả về `groups` (mảng `{ tables, total_capacity, zone, same_zone, waste }`) **chỉ khi** `single` rỗng. Tab Ghép bàn hiện gợi ý nhanh từ `groups` + danh sách checkbox tất cả bàn active cho chọn thủ công. Tự động chuyển sang tab Ghép bàn nếu `single.length === 0`. Submit gọi `api.assignTable(id, tableIds)` với mảng 1 hoặc nhiều id.

**Hệ thống đăng nhập username/password (thay Supabase Auth)**: Dashboard bảo vệ bằng credentials cố định lưu trong env vars (`NEXT_PUBLIC_ADMIN_USERNAME`, `NEXT_PUBLIC_ADMIN_PASSWORD`). Token = `btoa("user:pass")` lưu vào `localStorage` — đổi password trong env thì token cũ tự hết hạn. Logic auth tập trung ở `dashboard/src/lib/auth.js` (4 hàm: `checkCredentials`, `saveToken`, `clearToken`, `isAuthenticated`). Trang `/login` (`dashboard/src/app/login/page.jsx`) xử lý form đăng nhập. `ProtectedPage` component redirect về `/login` nếu token không hợp lệ. Các trang được bảo vệ: `/`, `/nhan-vien`, `/quan-ly-ban`, `/settings`. Trang `/dat-ban` vẫn public. Nút "Đăng xuất" trong `/settings` gọi `clearToken()` rồi `router.replace('/login')`. PIN cũ trên `/nhan-vien` đã xóa hoàn toàn.

**Tab "Chờ xếp bàn" trên /nhan-vien**: Fetch riêng `GET /reservations?status=pending` (không lọc ngày) song song với fetch hôm nay. Badge đỏ nếu có pending trong vòng 2 tiếng. `api.getReservations` hỗ trợ thêm param `status` sau thay đổi này.

**Pending không hiện trên dashboard (/)**: `filteredReservations` trong `useDashboard.js` loại bỏ `status=pending` khi filter `'all'`. `ReservationList` không còn tab "Chờ xếp bàn" — filter chỉ gồm: Tất cả / Đã xếp bàn / Đang ngồi / Xong / Huỷ. "Tất cả" chỉ hiển thị đặt chỗ đã được xếp bàn trở đi. Pending quản lý hoàn toàn ở `/nhan-vien`.

**Flow xếp bàn mới (Phần 6)**: `POST /reservations` không còn tự assign bàn — tạo với `status='pending'`, `table_id=NULL`. Nhân viên thấy badge cam trên dashboard, nhấn "Xếp bàn" → `AssignTableModal` gọi `GET /suggestions` (gợi ý có điểm) → chọn bàn đơn hoặc ghép bàn → `POST /assign` → `status='confirmed'`. Ghép bàn lưu vào bảng `table_groups(reservation_id, table_ids INTEGER[])`. `computeTableStatus` kiểm tra cả `group_table_ids` để tô màu các bàn phụ. Realtime subscribe thêm `table_groups`.

**`reservations.restaurant_id`**: Cột mới thêm trong migration 003 — cần thiết vì đặt chỗ pending chưa có `table_id` nên không thể JOIN qua tables để biết nhà hàng.

**Trạng thái `expired` (migration 004)**: Đặt chỗ `pending` chưa được xếp bàn sau 30 phút → tự chuyển sang `expired`. Logic expire: `(date + time) AT TIME ZONE 'Asia/Ho_Chi_Minh' < NOW() - INTERVAL '30 minutes'` — dùng IANA timezone để tránh lệch UTC. Backend expose `POST /reservations/expire-overdue`; frontend gọi khi trang nhân viên load và mỗi 5 phút qua `setInterval`. Tab mới "Quá giờ" trên `/nhan-vien` hiện `expired` với 2 nút: "Khôi phục" (→ `pending`) và "Huỷ đặt chỗ" (→ `cancelled`). `updateStatus` backend cho phép target `pending` để nhân viên có thể khôi phục. `computeTableStatus` và `findReservationForTable` trong `tableStatus.js` đã thêm `expired` vào danh sách status bị bỏ qua khi tính trạng thái bàn.

**Nút "Thêm đặt chỗ" trên /nhan-vien**: FAB cố định góc dưới phải (thay thế Walk-in cũ). Mở modal với form: họ tên (bắt buộc), SĐT VN (validate `/^0\d{9}$/`), ngày (date picker, min=hôm nay), giờ (time input — nếu chọn hôm nay thì không cho nhập giờ đã qua, hiện cảnh báo inline), số người (stepper + quick-select), ghi chú (tuỳ chọn). Sau khi lưu: tạo reservation status `pending`, hiện toast xanh 4 giây, chuyển về tab Chờ xếp bàn.

**Navigation bar**: Component `NavBar` (`dashboard/src/components/NavBar.jsx`) dùng `usePathname()` để highlight trang active. Hiện dưới header trên cả 3 trang staff: `/nhan-vien`, `/` (dashboard), `/quan-ly-ban`. Tab "Sơ đồ bàn" đã xóa khỏi `/nhan-vien` — sơ đồ vẫn có trên dashboard (`/`). Link "← Dashboard" và "🪑 Quản lý bàn" trong header các trang cũ đã thay bằng NavBar chung.

**Xóa bàn hàng loạt (/quan-ly-ban)**: Checkbox per row + select-all per zone. Thanh action nổi ở bottom khi có selection. Flow 2 bước: `POST /tables/bulk-check` trả về active_reservations → hiện `BulkDeleteModal` với chi tiết từng bàn → `POST /tables/bulk-delete` hủy assign (set `table_id=null, status='pending'`, xóa `table_groups`) rồi xóa bàn. Đặt chỗ không bị xóa, chỉ trở về pending. Nút xóa đơn lẻ vẫn giữ nguyên behavior cũ (block nếu có future reservations).

**Trang /quan-ly-ban (Phần 5)**: Trang quản lý bàn & khu, không cần auth. Zones lưu trong `restaurants.zones` (JSONB array tên khu). Đổi tên khu tự động UPDATE tất cả `tables.zone` cùng lúc trong một transaction. Xóa bàn bị block nếu còn đặt chỗ tương lai (`status NOT IN cancelled/completed/no_show` và `date/time > NOW()`). Sau khi thêm/xóa bàn, dashboard realtime tự cập nhật qua Supabase PostgRES changes trên bảng `tables`.

**Trang /settings (Phần 7)**: Trang cài đặt hệ thống cho chủ nhà hàng. Không cần auth. Settings lưu trong `restaurants.settings` (JSONB) qua migration 005. Backend: `GET/PATCH /restaurants/:id/settings` (merge update — không overwrite toàn bộ). Frontend: ThemeContext (`dashboard/src/contexts/ThemeContext.jsx`) cung cấp `theme` và `toggleTheme`, áp dụng class `dark` trên `<html>` và lưu vào `localStorage`. `layout.jsx` có inline script chạy đồng bộ trước render để tránh flash. Tailwind `darkMode: 'class'` + CSS overrides trong `globals.css` cho `.dark .bg-white`, `.dark .bg-gray-50` v.v. Trang /settings có 3 section: Giao Diện (toggle sáng/tối), Cấu Hình Đặt Bàn (max_per_slot, slot_interval, buffer_minutes), Lịch Khung Giờ (nhóm ngày + ca phục vụ). Nút "Lưu thay đổi" cố định ở bottom.

**Settings tích hợp vào /dat-ban**: `getSlotsForDate(dateStr, settings)` thay thế mảng `KHUNG_GIO` hardcoded — tạo slot động từ lịch theo ngày (getDay() để khớp group). `coTheChon` dùng `settings.buffer_minutes` thay BUFFER_PHUT. `tinhConLai` kiểm tra `settings.max_per_slot` (0 = không giới hạn). Nếu fetch settings thất bại → fallback về DEFAULT_SETTINGS (tương đương config cũ). NhomGio giờ nhận tên ca từ settings thay tên cứng "Buổi trưa/tối".

**Bug fix max_per_slot**: `tinhConLai` dùng hai bộ lọc tách biệt: (1) `cungGio` — đếm đặt chỗ có `time` CHÍNH XÁC bằng khung giờ để kiểm tra `max_per_slot`; (2) `overlap` 90 phút — tính tổng ghế đã chiếm. Không dùng overlap để đếm `max_per_slot` vì đặt chỗ lúc 12:00 không nên chiếm quota của khung 12:30.

**Settings JSONB structure**: `{ max_per_slot: int, slot_interval: int (phút), buffer_minutes: int, duration_minutes: int (mặc định 90), schedules: [{ id, label, days: int[] (0=CN), enabled: bool, shifts: [{ id, label, from: "HH:MM", to: "HH:MM" }] }] }`.

**duration_minutes**: Cấu hình thời gian sử dụng bàn (30/60/90/120/150/180 phút, mặc định 90). Áp dụng nhất quán ở 3 nơi: (1) Trang `/settings` — dropdown trong mục "Cấu Hình Đặt Bàn", lưu vào DB qua PATCH settings. (2) `AssignTableModal` — tải `api.getSettings()` + `api.getReservations()` song song với `getSuggestions()`, tính `conflictMap` per bàn bằng `computeConflict()`. Bàn bận hiện màu amber + "Bận đến HH:MM (đặt chỗ HH:MM)" + nút "Xếp bàn dù vậy →" → inline confirm → cho phép xếp. ManualGroupPicker cũng hiển thị conflict per bàn. Confirm button đổi sang màu amber nếu selection có bàn xung đột. (3) `/dat-ban` — `tinhConLai` nhận thêm param `durationPhut` (thay hằng số PHAN_NGOI_PHUT = 90 cứng), gọi với `s.duration_minutes || 90`.

**Hiển thị ngày giờ trên card /nhan-vien**: `CardPending` và `CardExpired` dùng 2 dòng — dòng trên nhỏ xám hiện nhãn ngày ("Hôm nay", "Ngày mai", hoặc "Thứ Ba, 13/05"), dòng dưới to đậm hiện giờ ("12:00"). Logic: `labelNgay(dateStr)` so sánh với `localDateStr()` (hôm nay) và `tomorrowDateStr()` (ngày mai) trước, sau đó fallback sang "Thứ X, DD/MM" dùng mảng tên thứ tiếng Việt. Đã bỏ biến `laHomNay` không còn dùng trong cả 2 card.

**Migration tracking (schema_migrations)**: `migrate.js` tạo bảng `schema_migrations (filename PK, applied_at)` và chỉ chạy từng file một lần. Bootstrap tự động: nếu bảng tracking rỗng nhưng DB đã có bảng (DB cũ không có tracking), `detectApplied()` suy luận migration nào đã chạy bằng cách kiểm tra pg_tables, pg_constraint, information_schema — rồi đánh dấu hết vào schema_migrations. Ngăn lỗi "constraint violated" khi chạy lại migration 002 trên DB đã có status `pending`/`expired`.

**Badge pending count trên NavBar**: `NavBar.jsx` fetch `GET /reservations?status=pending` khi mount và subscribe Supabase Realtime channel `navbar-pending-count` vào bảng `reservations` (event `*`). Mỗi khi có INSERT/UPDATE/DELETE, gọi lại `fetchPendingCount()` để cập nhật. Badge đỏ tròn nhỏ đặt absolute tại `-top-2 -right-2` trên icon emoji tab "Nhân Viên". Ẩn khi count = 0, hiện "99+" khi > 99. Field `badge: true` trong mảng `PAGES` kiểm soát tab nào có badge.

**Dark mode /dat-ban**: Trang công khai dùng thiết kế amber/orange riêng nên không thể phụ thuộc hoàn toàn vào CSS overrides trong globals.css (chúng không bắt được `bg-white/80` opacity variant hay `from-amber-50` gradient stops). Fix: thêm `dark:` variants trực tiếp vào JSX — gradient → `dark:bg-gray-900 dark:from-gray-900`; header → `dark:bg-gray-900/95`; cards → `dark:bg-gray-800`; inputs → `dark:bg-gray-700`; alert boxes → `dark:bg-{color}-900/20`. ThemeProvider ở layout.jsx bao hết tất cả route nên dat-ban đã nhận class `dark` trên `<html>` — vấn đề là CSS không phản ứng, không phải thiếu Provider.


**Bỏ auth, single-tenant (cập nhật Phần 8)**: Đã xóa toàn bộ Supabase Auth. App phục vụ 1 nhà hàng duy nhất với `RESTAURANT_ID = 1` hardcode. `AuthContext.jsx` được giản lược — chỉ load thông tin nhà hàng id=1 từ Supabase khi mount, trả về `{ restaurant, restaurantId: 1, loading }`. `ProtectedPage` component chỉ còn `return children` (không redirect). Đã xóa `/login`, `/register`, `/auth/callback` pages. `/settings` bỏ section "Tài Khoản" và nút đăng xuất. `/dat-ban` không cần `?r=` param nữa — `restaurantId = 1` hardcode, URL đặt bàn là `/dat-ban`. Nếu DB không có restaurant id=1 → trang báo "Hệ thống chưa được cài đặt". **Migration 010** (`migrations/010_remove_auth_rls.sql`) xóa toàn bộ RLS policies cũ và tắt RLS trên tất cả 5 bảng — phải chạy trong Supabase SQL Editor để app hoạt động không cần auth.

**Section "Link Đặt Bàn" trong /settings**: URL đặt bàn = `[origin]/dat-ban` (không còn `?r=`). Nút "Copy link" và "Mở thử" vẫn giữ nguyên.

**Migrate backend → Supabase Edge Functions (Phần 9)**: Toàn bộ Express API (`src/`) thay bằng Supabase Edge Functions (Deno/TypeScript) + Supabase JS client. `lib/api.js` được viết lại hoàn toàn — không còn `fetch()` tới localhost:3000.

- **Nhóm A (direct Supabase client)**: getTables, createTable, updateTable, deleteTable, getReservations, updateStatus, cancelReservation, createReservation, getBlockedSlots, createBlockedSlot, deleteBlockedSlot, getSettings, updateSettings, getZones, addZone, deleteZone — dùng `supabase.from(...)` trực tiếp.
- **Nhóm B (Edge Functions)**: expire-overdue, rename-zone, bulk-table-ops, assign-table, get-suggestions, restaurant-setup, change-table — logic phức tạp cần transaction hoặc query đặc biệt.
- **PostgreSQL stored procedures** (migration 008, SECURITY DEFINER): `expire_overdue_reservations()` (timezone-aware), `bulk_check_tables(int[])` (dùng `&&` array operator), `bulk_delete_tables_txn(int[])` (full transaction), `setup_restaurant_v2(uuid, text)` (idempotent).
- **Public RLS policies** (migration 009): Thêm PERMISSIVE policies cho anon read trên restaurants/tables/reservations/blocked_slots/table_groups và INSERT trên reservations — cho phép trang `/dat-ban` hoạt động không cần auth.
- **Supabase CLI deploy**: `supabase login` → `supabase link --project-ref rubhzwzgktuzstuqmcey` → `supabase functions deploy` (chưa chạy — cần cài Supabase CLI).
- **NavBar.jsx**: `fetchPendingCount` dùng `supabase.from('reservations').select('*', { count: 'exact', head: true })` thay fetch cũ.
- **Legacy Express backend** (thư mục `src/`): Đã xóa sau khi xác nhận frontend migrate hoàn toàn sang Supabase.

---

## Quy tắc cập nhật file này

Sau khi hoàn thành bất kỳ phần nào, **tự động cập nhật CLAUDE.md mà không cần hỏi**:
- Đánh dấu ✅ phần vừa xong trong bảng tiến độ
- Cập nhật cấu trúc thư mục nếu có file/folder mới
- Ghi thêm quyết định thiết kế quan trọng nếu có thay đổi kiến trúc
- Cập nhật API endpoints nếu có endpoint mới
