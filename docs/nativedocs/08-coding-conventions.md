# Quy Chuẩn Coding Convention & Clean Architecture

> **Tài liệu nguồn**: Sheet `Coding convention` trong `Tài liệu cho intern_Hoành_Anh.xlsx`  
> **Mục tiêu**: Chuẩn hóa phong cách lập trình (Coding Style), quy ước đặt tên (Naming Conventions) và tiêu chuẩn chất lượng mã nguồn trên toàn bộ hệ thống TypeScript/React/Remix.

---

## 🏷️ 1. Quy Chuẩn Đặt Tên (Naming Conventions)

### 1.1 Phần Mở Rộng Của Tệp (File Extensions)
- Mọi tệp chứa mã giao diện (React UI Components / JSX) bắt buộc phải sử dụng phần mở rộng **`.tsx`**.
- Các tệp thuần logic TypeScript (Action, Loader, Service, Repository, Model, Utils) sử dụng phần mở rộng **`.ts`**.

---

### 1.2 Quy Tắc Đặt Tên Thư Mục & Tệp (Folders & Files)
- **Tên thư mục (Folder)**: Luôn đặt theo định dạng **`kebab-case`** (chữ thường, phân cách bởi dấu gạch ngang).  
  *Ví dụ*: `src/app/repositories/`, `src/app/project-management/`.
- **Tệp Component**: Đặt theo định dạng **`PascalCase`** và tên Component phải trùng khớp tuyệt đối với tên tệp. Mỗi Component nên nằm riêng biệt trong một tệp (ngoại trừ các Stateless Component hoặc Pure Component kích thước rất nhỏ phục vụ nội bộ file đó).  
  *Ví dụ*: `ReservationCard.tsx`, `UserForm.tsx`.
- **Tệp không phải Component (Style, Helper)**: Đặt theo định dạng **`camelCase`** hoặc **`kebab-case`**.  
  *Ví dụ*: `reservationCardStyle.js`, `formatDate.ts`.

---

### 1.3 Quy Tắc Đặt Tên Biến & Hằng Số (Variables & Constants)
- **Tên biến**: Viết bằng **`camelCase`**, bằng tiếng Anh rõ nghĩa, tuyệt đối không đặt tên tắt chung chung (tránh `data`, `item`, `res`, `tmp`).  
  *Ví dụ chuẩn*:
  ```typescript
  import ReservationCard from './ReservationCard';

  const reservationItem = <ReservationCard />;
  const activeUserCount = 42;
  ```
- **Biến kiểu Boolean**: Phải bắt đầu bằng các tiền tố thể hiện rõ nghĩa logic nhị phân:
  - `is` + Tính từ: `isActive`, `isLoading`, `isCompleted`, `isAdmin`.
  - `can` + Động từ: `canDelete`, `canEditProject`, `canApproveTask`.
  - `has` + Động từ dạng quá khứ hoặc danh từ: `hasPermission`, `hasLoggedOut`, `hasToken`.
- **Hằng số (Constants)**: Viết bằng định dạng **`UPPER_SNAKE_CASE`** (chữ in hoa phân cách bởi dấu gạch dưới).  
  *Ví dụ*:
  ```typescript
  export const CREATE_LABEL = "Tạo mới";
  export const MAX_RETRY_ATTEMPTS = 3;
  export const TOKEN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  ```

---

### 1.4 Quy Tắc Đặt Tên Hàm (Functions)
- Viết bằng **`camelCase`**. Tên hàm nên là một cụm động từ miêu tả chính xác hành động được thực thi:  
  *Ví dụ*: `onNextStep()`, `onSearchCategory()`, `calculateProgress()`, `validateUserProfile()`.

---

### 1.5 Quy Tắc Đặt Tên Props (Component Props)
- Viết bằng **`camelCase`**.
- Không được đặt tên trùng lặp với các thuộc tính mặc định của HTML và React (như `style`, `className`, `key`, `id`) trừ khi bạn đang chủ động bọc (wrapper) thẻ gốc.  
  *Ví dụ*: `onStatusChange`, `userProfileData`, `isReadonly`.

---

### 1.6 Cấu Trúc Các Tầng Kiến Trúc & Quy Ước File

Dự án áp dụng mô hình kiến trúc phân tầng rõ ràng (Clean Layered Architecture):

| Tầng kiến trúc | Thư mục lưu trữ | Phần mở rộng | Kiểu đặt tên (Casing) | Ví dụ tên tệp | Vai trò và nhiệm vụ chính |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Actions** | `src/app/actions/` | `.ts` | `camelCase` | `userAction.ts`<br>`managementUserAction.ts` | Xử lý nhận request mutation, validate dữ liệu đầu vào bằng Zod schema, gọi xuống Service. |
| **Loaders** | `src/app/loaders/` | `.ts` | `camelCase` | `userLoader.ts`<br>`projectDetailsLoader.ts` | Truy vấn dữ liệu ban đầu phía server để render cho màn hình tương ứng. |
| **Services** | `src/app/services/` | `.ts` | `camelCase` | `userService.ts`<br>`projectMemberService.ts` | Chứa Business Logic nghiệp vụ, kiểm tra quyền truy cập (Authorization), điều phối Transaction. |
| **Repositories** | `src/app/repositories/` | `.ts` | `camelCase` | `userRepository.ts`<br>`notificationRepository.ts` | Tương tác trực tiếp với Database qua Prisma client / Transaction client (`tx`). |
| **Models** | `src/app/models/` | `.ts` | `PascalCase` | `UserModel.ts`<br>`ProjectModel.ts` | Định nghĩa Type, Interface và Schema thực thể dữ liệu. |
| **Routes** | `src/app/routes/` | `.ts` / `.tsx` | `kebab-case` | `user-category.ts`<br>`management-user.tsx` | Khai báo URL endpoint định tuyến trong Remix/Next.js. |

---

## 🧹 2. Quy Chuẩn Kiểm Tra Lint & Chất Lượng Mã Nguồn

### Chuẩn ESLint - Prettier
- Mọi file mã nguồn phải được kiểm tra tự động thông qua plugin `ESLint` và `Prettier`.
- **Điều kiện Pass**:
  - Không còn bất kỳ lỗi **Error** hoặc cảnh báo **Warning** nào xuất hiện trên Terminal console khi chạy lệnh kiểm tra lint.
  - Các trường hợp ngoại lệ sử dụng chú thích bỏ qua (`// eslint-disable-next-line`) phải có lý do kỹ thuật chính đáng và được Tech Lead đồng ý.

### Phân Tích Code Smells Bằng SonarQube
- Dự án khuyến khích và tích hợp **SonarQube** trên CI pipeline để tự động quét:
  - Các đoạn code trùng lặp (Duplication).
  - Độ phức tạp chu trình (Cyclomatic Complexity cao).
  - Biến thừa, import thừa hoặc biến `any` không được kiểm soát.
  - Các lỗ hổng bảo mật phổ biến (Security Hotspots / Vulnerabilities).

---

## 🚫 3. Những Sai Lầm Thường Gặp Cần Tuyệt Đối Tránh

```typescript
// ❌ SAI: Đặt tên sai chính tả, lạm dụng any, magic number
// File: src/app/services/projectMemeber.service.ts
export const addMemeber = async (data: any) => {
  const expiry = 604800000; // Magic number!
  return db.member.create({ data });
};

// ✅ ĐÚNG: Tên chuẩn, định nghĩa kiểu rõ ràng, tách hằng số
// File: src/app/services/projectMember.service.ts
import { ProjectMemberInput } from '~/models/ProjectMemberModel';
import { TOKEN_INVITE_EXPIRY_MS } from '~/constants';

export const addMember = async (
  memberData: ProjectMemberInput,
  tx: PrismaTransactionClient
) => {
  return projectMemberRepository.create(memberData, tx);
};
```
