# Checklist Kiểm Tra Trước Khi Push Code & Mở PR (Pre-Push & PR Checklist)

> **Tài liệu nguồn**: Sheet `Checklist` trong `Tài liệu cho intern_Hoành_Anh.xlsx`  
> **Mục đích**: Thiết lập bộ quy chuẩn tự kiểm tra (Self-Verification Checklist) gồm **13 điểm cốt lõi** mà mỗi lập trình viên / intern bắt buộc phải tự rà soát kỹ lưỡng trước khi push code lên remote và ping reviewer.

---

## ✅ Bảng Tổng Hợp 13 Tiêu Chí Tự Kiểm Tra (Self-Checklist)

| STT | Tiêu chí kiểm tra | Mức độ bắt buộc | Tóm tắt hành động yêu cầu |
| :---: | :--- | :---: | :--- |
| **01** | **Format code tự động** | Bắt buộc | Chạy linter và formatter (`eslint`, `prettier`, `tsc --noEmit`). |
| **02** | **Chạy Unit Test (UT) local** | Bắt buộc | Pass 100% toàn bộ bộ test trên máy cá nhân trước khi push. |
| **03** | **Dọn dẹp `console.log`** | Bắt buộc | Xóa hết toàn bộ các câu lệnh debug rác. |
| **04** | **Loại bỏ Dead Code** | Bắt buộc | Xóa code thừa/không dùng; nếu cần cho tương lai phải có ghi chú `TODO: ...` rõ ràng. |
| **05** | **Cập nhật `.env.example`** | Bắt buộc | Khi khai báo biến môi trường mới, lập tức cập nhật vào `.env.example`. |
| **06** | **Luôn Git Rebase (Không Merge)** | Bắt buộc | Luôn rebase với nhánh đích (vd: `develop`) trước khi mở PR. |
| **07** | **Đầy đủ tệp đa ngôn ngữ (i18n)** | Quan trọng | Đồng bộ đầy đủ các key dịch ở tất cả các ngôn ngữ hỗ trợ (vi, en, ja,...). |
| **08** | **Chuẩn tiếng Anh & Ngữ pháp** | Quan trọng | Tên biến, hàm, file và comment 100% bằng tiếng Anh chuẩn xác, không sai chính tả. |
| **09** | **Đồng bộ logic Validation** | Bắt buộc | Đảm bảo tính nhất quán giữa màn hình Thêm mới (Create) và Chỉnh sửa (Edit). |
| **10** | **Charset Database Migration** | Bắt buộc | Charset của bảng CSDL mới phải là `utf8mb4_bin`. |
| **11** | **Pass toàn bộ CI Checks** | Bắt buộc | Kiểm tra trạng thái CI trên GitHub: Lint, Reviewdog, SonarQube đều phải xanh. |
| **12** | **Tuân thủ Coding Convention** | Bắt buộc | Đối chiếu quy tắc đặt tên file, component, action, service, repository. |
| **13** | **Tuân thủ Clean Architecture** | Bắt buộc | Kiểm tra luồng gọi hàm giữa các tầng (Route -> Service -> Repository). |

---

## 🔍 Hướng Dẫn Chi Tiết Từng Hạng Mục

### 1. Format Code Bằng Các Công Cụ Tiêu Chuẩn
- Trước khi tạo commit, hãy chạy lệnh format và lint:
  ```bash
  npm run lint
  npm run format # hoặc npx prettier --write .
  ```
- Tuyệt đối không để xảy ra các lỗi về khoảng trắng (whitespace), thụt lề lộn xộn hoặc import không sử dụng.

### 2. Chạy Toàn Bộ Unit Test (UT) Ở Local
- Nếu dự án có tích hợp Unit Test, bạn phải chạy test trên máy cá nhân:
  ```bash
  npm run test # hoặc npx vitest run
  ```
- **Chỉ khi 100% test cases đều pass (xanh)** bạn mới được phép push code lên repository.

### 3. Xóa Bỏ Hoàn Toàn `console.log` Không Cần Thiết
- Trước khi push, sử dụng tính năng Search toàn dự án với từ khóa `console.log` trong các file bạn đã thay đổi.
- Nếu cần ghi log phục vụ theo dõi hoạt động hệ thống trên môi trường Production, hãy sử dụng Logger chuẩn của hệ thống (`logger.info`, `logger.error`), kèm User ID / Request ID cụ thể.

### 4. Xóa Bỏ Code Thừa (Dead Code)
- Các biến, hàm, import không còn dùng đến phải được xóa bỏ triệt để.
- Nếu một đoạn code đang chuẩn bị cho tính năng kế tiếp ở Sprint sau, phải để lại comment rõ ràng kèm tag:
  ```typescript
  // TODO(hoanganh): Tích hợp webhook thanh toán ở Sprint 2 theo yêu cầu PRJ-102
  ```

### 5. Cập Nhật Biến Môi Trường Vào `.env.example`
- Bất cứ khi nào bạn thêm một key cấu hình mới vào file `.env` cá nhân (ví dụ: `SLACK_WEBHOOK_URL`, `JWT_REFRESH_SECRET`):
- **Bắt buộc** phải bổ sung dòng khai báo đó vào file `.env.example` (với giá trị placeholder mẫu) để các đồng nghiệp khác không bị crash ứng dụng khi pull code mới về.

### 6. Luôn Rebase Với Nhánh Cần Merge Trước Khi Tạo PR
- Ví dụ: Bạn tạo nhánh `feature/task-list` từ `develop`. Trước khi tạo PR vào `develop`:
  ```bash
  git checkout develop
  git pull origin develop
  git checkout feature/task-list
  git rebase develop
  ```
  > [!WARNING]
  > **Lưu ý tối quan trọng**: Sử dụng **Rebase**, tuyệt đối **KHÔNG sử dụng Git Merge** từ nhánh đích ngược vào nhánh feature của bạn. Rebase giúp giữ lịch sử commit thẳng thớm và sạch đẹp.

### 7. Đồng Bộ Đầy Đủ Các File Đa Ngôn Ngữ (i18n)
- Nếu hệ thống hỗ trợ nhiều ngôn ngữ (ví dụ: English, Tiếng Việt, Tiếng Nhật):
- Khi bạn thêm một key dịch mới vào `en.json`, hãy đảm bảo đã bổ sung tương ứng vào `vi.json` và `ja.json`. Tránh trường hợp người dùng đổi ngôn ngữ bị hiển thị key thô (ví dụ: `errors.auth.userNotFound`).

### 8. Tiếng Anh Chuẩn Xác & Đúng Ngữ Pháp
- Toàn bộ tên file, biến, hàm, chú thích code (comment) và thông báo lỗi người dùng/log phải viết bằng tiếng Anh.
- Cần chú ý ngữ pháp và chính tả, tránh các lỗi phổ biến như:
  - ❌ `Users does not exits` ➔ ✅ `User does not exist`
  - ❌ `clib` ➔ ✅ `You are not a member of this project`
  - ❌ `notificatonRepository.ts` ➔ ✅ `notificationRepository.ts`

### 9. Đồng Bộ Logic Validation Giữa Màn Thêm Mới Và Chỉnh Sửa
- Đây là lỗi nghiệp vụ rất hay gặp phải:
  - *Ví dụ*: Màn hình Thêm mới người dùng có validate kiểm tra email là duy nhất (unique) và đúng định dạng regex, nhưng màn hình Cập nhật lại bỏ qua bước kiểm tra này, dẫn đến dữ liệu trùng lặp hoặc không hợp lệ lọt vào CSDL.
- **Giải pháp**: Tái sử dụng cùng một Zod schema validation dùng chung cho cả 2 thao tác Create và Update.

### 10. Đảm Bảo Charset Migration Bắt Buộc Là `utf8mb4_bin`
- Khi tạo migration mới trên MySQL, hãy kiểm tra tệp migration SQL hoặc cấu hình schema:
  ```sql
  ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
  ```
- Charset `utf8mb4_bin` đảm bảo lưu trữ chuẩn xác các ký tự đặc biệt, biểu tượng cảm xúc (emoji) và phân biệt chính xác chữ hoa - chữ thường khi so sánh chuỗi (Case-sensitive).

### 11. Đảm Bảo Toàn Bộ Các Check CI Trên GitHub Pass 100%
- Sau khi push code và mở PR, hãy theo dõi tab Checks trên GitHub:
  - Check lint
  - Check Reviewdog
  - Check SonarQube Quality Gate
  - Check Unit Tests
- Nếu có bất kỳ bước nào báo đỏ, hãy lập tức đọc log lỗi và push commit fix lỗi trước khi ping reviewer.

### 12. Kiểm Tra Lại Coding Convention
- Rà soát lại xem đã đặt tên đúng quy ước chưa:
  - Component: `PascalCase.tsx`
  - Action/Loader: `camelCase.ts`
  - Repository/Service: `camelCase.ts`
  - Biến Boolean: `is...`, `has...`, `can...`
  - Hằng số: `UPPER_SNAKE_CASE`

### 13. Kiểm Tra Kiến Trúc Dự Án (Clean Architecture)
- Đảm bảo luồng phụ thuộc (Dependency Flow) đi một chiều từ ngoài vào trong:
  ```text
  Route / UI Component ──> Action / Loader ──> Service (Nghiệp vụ) ──> Repository (Data Access) ──> Database
  ```
- Tuyệt đối không gọi trực tiếp Database (Prisma) ngay bên trong UI Component hay Route Action mà không thông qua tầng Service/Repository.
