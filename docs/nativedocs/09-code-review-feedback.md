# Tổng Hợp Phản Hồi Code Review & Bài Học Kinh Nghiệm (Code Review Feedback)

> **Tài liệu nguồn**: Sheet `Feedback` trong `Tài liệu cho intern_Hoành_Anh.xlsx`  
> **Mục tiêu**: Lưu trữ, phân tích và hướng dẫn khắc phục toàn diện **18 lỗi thực tế** được phát hiện qua các đợt Code Review trong quá trình phát triển hệ thống. Đây là tài liệu học tập và tra cứu quan trọng giúp intern nâng cao chất lượng code và tư duy kiến trúc.

---

## 📊 1. Thống Kê Phân Phối Mức Độ Nghiêm Trọng (Severity Breakdown)

| Mức độ nghiêm trọng (Severity) | Số lượng lỗi | Tỷ lệ (%) | Mức độ ưu tiên xử lý |
| :--- | :---: | :---: | :--- |
| 🔴 **Critical** | **1** | 5.5% | Khắc phục ngay lập tức; gây sập hoặc lỗi nghiêm trọng luồng xử lý ngoại lệ. |
| 🟠 **High** | **2** | 11.1% | Ảnh hưởng trực tiếp đến tính toàn vẹn dữ liệu (Transaction) và bảo mật/validation dữ liệu đầu vào. |
| 🟡 **Medium** | **8** | 44.4% | Lỗi về Type Safety, quản trị phiên xác thực, trải nghiệm người dùng và thiết kế kiến trúc. |
| 🟢 **Low** | **5** | 27.8% | Magic numbers, hardcoded values, tối ưu Index truy vấn và ngữ pháp tiếng Anh. |
| ⚪ **Minor** | **2** | 11.1% | Lỗi chính tả tên tệp (Typos). |
| **Tổng cộng** | **18 lỗi** | **100%** | Toàn bộ đã có phương án khuyến nghị xử lý dứt điểm. |

---

## 📋 2. Bảng Tổng Hợp Chi Tiết 18 Phản Hồi Code Review

| STT | Phân loại (Category) | Vị trí file & dòng (Location) | Nội dung lỗi phát hiện (Issue) | Tác động & Rủi ro (Impact) | Khuyến nghị khắc phục (Recommendation) | Mức độ (Severity) |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: |
| **01** | **Naming & Typos** | `src/app/repositories/notificatonRepository.ts` | Tên file bị thiếu chữ cái `i` (`notificaton` ➔ `notification`). | Gây khó khăn khi tìm kiếm mã nguồn (Search file) và làm giảm tính chuyên nghiệp của sản phẩm. | Đổi tên file thành `notificationRepository.ts` và cập nhật lại toàn bộ các lệnh import liên quan. | `Minor` |
| **02** | **Naming & Typos** | `src/app/services/projectMemeber.service.ts` | Tên file sai chính tả (`Memeber` ➔ `Member`). | Gây khó khăn khi tìm kiếm code và dễ gây nhầm lẫn cho các lập trình viên khác trong đội ngũ. | Đổi tên file thành `projectMember.service.ts` và chuẩn hóa lại các đường dẫn import. | `Minor` |
| **03** | **Consistency** | `src/app/repositories/userRepository.ts` | Method `findById` dùng trực tiếp biến global `prisma` client thay vì tham số `db` được truyền vào. | **Không thể thực hiện Transaction đồng nhất.** Nếu cần rollback dữ liệu User kèm các bảng khác trong cùng một transaction, lệnh này sẽ không thuộc quản lý của `tx`. | Sửa chữ `prisma` thành `db` (biến được inject từ `createRepository`/`baseRepository`). | `High` |
| **04** | **Logic & Syntax** | `src/app/services/project.service.ts`<br>*(Line 94)* | Sử dụng sai toán tử dấu phẩy trong lệnh throw: `throw (new AppError("..."), 403)`. | **Lỗi logic nghiêm trọng**: JavaScript sẽ ném ra con số `403` thay vì Object Error. Khối catch sẽ không thể lấy được thuộc tính `.message` hay stack trace. | Sửa thành cú pháp truyền tham số hợp lệ: `throw new AppError("Only the project creator has delete rights", 403)`. | `Critical` |
| **05** | **Validation** | `src/app/actions/managementUserAction.ts`<br>*(và các Action khác)* | Thiếu tầng Validation dữ liệu đầu vào (như Zod); ép kiểu thủ công (`as string`). | Dữ liệu rác hoặc mã độc có thể lọt vào Database; dễ gây lỗi Runtime crash nếu client gửi thiếu trường hoặc sai định dạng. | Áp dụng Zod Schema để parse và validate dữ liệu an toàn ngay tại đầu Action trước khi chuyển xuống Service. | `High` |
| **06** | **Type Safety** | `src/app/components/Form/UserForm.tsx` | Sử dụng kiểu dữ liệu `any` cho `props`. | Mất hoàn toàn lợi thế an toàn kiểu của TypeScript; dễ dẫn đến lỗi gõ sai tên thuộc tính (VD: `data.fullname` thay vì `data.fullName`). | Định nghĩa Interface cụ thể cho User data hoặc dùng `Prisma.UserGetPayload` sinh ra từ schema. | `Medium` |
| **07** | **Coding Standards** | Toàn bộ dự án | Lạm dụng kiểu `any` quá phổ biến (vượt mức cho phép của một dự án TypeScript chuyên nghiệp). | Biến TypeScript trở thành JavaScript "vỏ bọc"; tăng khả năng xuất hiện lỗi nghiêm trọng khi chạy (runtime errors). | Lập kế hoạch refactor dần; thay thế toàn bộ `any` bằng các Type/Interface cụ thể, union types hoặc generics. | `Medium` |
| **08** | **Security** | `src/app/utils/auth.server.ts` | Hàm `requireAdmin` tự động redirect về trang chủ `'/'` nếu người dùng không đủ quyền hạn. | Gây trải nghiệm người dùng kém (không hiểu tại sao bị đẩy ra ngoài) hoặc có thể gây vòng lặp chuyển hướng (loop redirect). | Nên chuyển hướng về `'/login'` kèm tham số `?redirectTo=...` để người dùng có thể đăng nhập lại tài khoản phù hợp và quay lại đúng trang. | `Medium` |
| **09** | **Coding Standards** | `src/app/services/project.service.ts` | Sử dụng Magic Number cho thời hạn token: `7 * 24 * 60 * 60 * 1000`. | Code khó hiểu, khó bảo trì và dễ sai sót khi cần điều chỉnh chính sách thời gian trong tương lai. | Tách hằng số ra file `constants.ts`, ví dụ: `export const TOKEN_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;`. | `Low` |
| **10** | **English Usage** | `src/app/services/projectInvite.service.ts`<br>*(Line 53)* | Sai ngữ pháp và chính tả nghiêm trọng trong chuỗi thông báo: `"Users does not exits"`. | Gây ấn tượng thiếu chuyên nghiệp cho khách hàng và lập trình viên khác khi đọc log hệ thống hoặc mã lỗi API. | Sửa lại thành câu tiếng Anh chuẩn: `"User does not exist"`. | `Low` |
| **11** | **English Usage** | `src/app/services/project.service.ts`<br>*(Line 53)* | Viết sai ngữ pháp và tối nghĩa: `"clib"`. | Thông báo lỗi không có ý nghĩa đối với người dùng và dev bảo trì. | Sửa lại rõ nghĩa: `"You are not a member of this project"`. | `Low` |
| **12** | **Type Safety** | `src/app/services/projectInvite.service.ts`<br>*(Line 33, 75)* | Ép kiểu (cast) kết quả trả về từ repository sang `any`. | Mất kiểm soát kiểu dữ liệu ở các tầng xử lý kế tiếp; nguy cơ truy cập thuộc tính không tồn tại (`undefined`). | Sử dụng Type sinh tự động từ Prisma Client hoặc định nghĩa Interface cụ thể cho kết quả query. | `Medium` |
| **13** | **Hardcoded Values** | `src/app/services/notification.service.ts`<br>*(Line 92)* | Giá trị phân loại bị hardcode dạng chuỗi: `entityType: "PROJECT" as const`. | Khó mở rộng và dễ xảy ra xung đột khi loại thực thể thay đổi hoặc có thêm các thực thể mới (TASK, COMMENT). | Định nghĩa `EntityType` dạng Enum trong tệp `schema.prisma` để đảm bảo tính nhất quán giữa code và database. | `Low` |
| **14** | **Frontend Logic** | `src/app/routes/_protected/managementUser.tsx` | Gọi hàm `form.resetFields()` trong `useEffect` mà không kiểm tra trạng thái thành công. | Người dùng sẽ bị mất sạch toàn bộ dữ liệu vừa nhập nếu server trả về lỗi nghiệp vụ (ví dụ: Email đã tồn tại). | Chỉ gọi lệnh reset form khi có cờ xác nhận thành công: `if (actionData?.success) form.resetFields();`. | `Medium` |
| **15** | **UX & UI** | `src/app/routes/_protected/managementUser.tsx` | Sử dụng chiều cao cuộn bảng (Table scroll) với giá trị cố định hardcode: `y: 100 * 5`. | Giao diện bảng bị vỡ hoặc không co giãn tương thích trên các thiết bị và màn hình có độ phân giải khác nhau. | Sử dụng đơn vị tương đối `vh` trong CSS hoặc tính toán chiều cao động dựa trên kích thước khung nhìn (Viewport). | `Low` |
| **16** | **Logging** | Toàn bộ các Action | Logger ghi nhận không đầy đủ ngữ cảnh context (ví dụ chỉ log `"User updated success"` mà không có ID). | Gây khó khăn rất lớn cho đội vận hành khi cần trace log trên Production để điều tra sự cố. | Bổ sung đầy đủ `userId`, `targetId` hoặc `requestId` vào mọi câu lệnh log quan trọng. | `Medium` |
| **17** | **Performance** | `src/app/repositories/userRepository.ts`<br>*(Line 61)* | Thực hiện đồng thời 2 query tìm kiếm và đếm (`findMany` & `count`) qua `Promise.all` nhưng không tối ưu Index. | Hiệu năng truy vấn sẽ suy giảm nghiêm trọng khi số lượng bản ghi bảng `User` tăng cao. | Rà soát các trường dùng trong mệnh đề `where` của bộ lọc và bổ sung Composite Index phù hợp trong `schema.prisma`. | `Low` |
| **18** | **Code Smells** | `src/app/services/projectInvite.service.ts`<br>*(Line 92-121)* | Xử lý logic tìm và cập nhật Notification dựa trên trường metadata phức tạp nằm lồng trong Transaction. | Mã nguồn cồng kềnh, khó đọc, dễ phát sinh lỗi khi cấu trúc metadata thay đổi và tăng thời gian giữ lock của transaction. | Tách khối xử lý truy vấn metadata thành một helper method chuyên biệt trong Repository để tái sử dụng. | `Medium` |

---

## 🔬 3. Phân Tích Chuyên Sâu Các Lỗi Điển Hình

### Trường Hợp 1: Lỗi Cú Pháp Toán Tử Phẩy Trong Throw (Critical Bug)

```typescript
// ❌ MÃ NGUỒN CŨ (LỖI NGHIÊM TRỌNG):
// Trong JavaScript, toán tử dấu phẩy (comma operator) đánh giá từng biểu thức từ trái sang phải
// và trả về giá trị của biểu thức cuối cùng. 
// Do đó, biểu thức (new AppError("..."), 403) trả về con số nguyên 403!
throw (new AppError("Only the project creator has delete rights"), 403);

// Hậu quả khi vào khối catch:
try {
  // ...
} catch (error) {
  console.log(error.message); // undefined! Vì error lúc này là số 403 chứ không phải Error instance
}

// ✅ MÃ NGUỒN ĐÃ SỬA CHUẨN XÁC:
throw new AppError("Only the project creator has delete rights", 403);
```

---

### Trường Hợp 2: Mất Đồng Nhất Transaction Trong Repository (High Severity)

```typescript
// ❌ MÃ NGUỒN CŨ (LỖI TRANSACTION):
export class UserRepository {
  async findById(id: string, db: PrismaClientOrTx) {
    // Sai lầm: Bỏ qua biến db được truyền vào mà gọi trực tiếp biến global prisma
    return prisma.user.findUnique({ where: { id } }); 
  }
}

// Hậu quả: Khi UserRepository được gọi bên trong một $transaction:
await prisma.$transaction(async (tx) => {
  await userRepository.findById(userId, tx); // Lệnh này chạy ở kết nối độc lập, KHÔNG nằm trong tx!
  await otherRepository.update(..., tx);
  // Nếu lệnh update lỗi, dữ liệu lệnh findById hoặc các ghi chú kèm theo không được rollback đồng bộ!
});

// ✅ MÃ NGUỒN ĐÃ SỬA CHUẨN XÁC:
export class UserRepository {
  async findById(id: string, db: PrismaClientOrTx) {
    return db.user.findUnique({ where: { id } }); // Đảm bảo luôn chạy dưới context của tx
  }
}
```

---

### Trường Hợp 3: Thiếu Validation Ở Tầng Action (High Severity)

```typescript
// ❌ MÃ NGUỒN CŨ (THIẾU KIỂM SOÁT):
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email") as string; // Nguy hiểm: Ép kiểu mù quáng
  const role = formData.get("role") as string;

  return await userService.createUser({ email, role });
}

// ✅ MÃ NGUỒN ĐÃ SỬA CHUẨN XÁC VỚI ZOD:
import { z } from "zod";

const CreateUserSchema = z.object({
  email: z.string().email("Email không đúng định dạng"),
  role: z.enum(["MEMBER", "TEAM_LEAD", "PM", "ADMIN"]),
  fullName: z.string().min(2, "Họ và tên tối thiểu 2 ký tự"),
});

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);

  const result = CreateUserSchema.safeParse(rawData);
  if (!result.success) {
    return json({ errors: result.error.flatten().fieldErrors, success: false }, { status: 400 });
  }

  const newUser = await userService.createUser(result.data);
  return json({ data: newUser, success: true }, { status: 201 });
}
```
