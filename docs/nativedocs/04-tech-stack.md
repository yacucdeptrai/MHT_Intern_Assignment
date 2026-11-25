# Danh Mục Công Nghệ & Hướng Dẫn Tiếp Cận (Tech Stack & Learning Guide)

> **Tài liệu nguồn**: Sheet `Techs` trong `Tài liệu cho intern_Hoành_Anh.xlsx`  
> **Mục đích**: Tổng hợp toàn bộ danh mục công nghệ, thư viện, công cụ và nền tảng hạ tầng được sử dụng trong các dự án, kèm liên kết tài liệu chuẩn và lời khuyên tiếp cận thực chiến dành cho Intern.

---

## 🛠️ Bảng Tổng Hợp Công Nghệ & Tài Liệu Tham Khảo

| STT | Nhóm công nghệ | Công nghệ / Framework | Mô tả kỹ thuật | Link tài liệu chính thức | Tips tiếp cận dành cho Intern |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **01** | Frontend + TypeScript | **React** | Thư viện giao diện người dùng phổ biến nhất hiện nay. | [react.dev/learn](https://react.dev/learn) | Nắm vững cú pháp JSX, hệ thống Hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`), và các mô hình quản lý State. |
| **02** | Frontend + TypeScript | **Vue.js** | Framework MVVM với cơ chế phản ứng linh hoạt (reactive). | [vuejs.org/guide](https://vuejs.org/guide/introduction) | Nắm chắc Reactive Data (Composition API, `ref`, `reactive`), Component Lifecycle và Watchers. |
| **03** | Backend + TypeScript | **Node.js, Express, NestJS** | Xây dựng RESTful API, Microservices và Message Queue. | [nodejs.org/docs](https://nodejs.org/docs/latest/api/) | Hiểu sâu về Pipeline Middleware, thiết kế chuẩn RESTful, kiến trúc Module/DI và xử lý bất đồng bộ (`async/await`, Error handling). |
| **04** | Fullstack + TypeScript | **Remix** | Fullstack web framework tập trung vào Web Standards, SSR, tối ưu Nested Routing và Form Actions. | [remix.run/docs](https://remix.run/docs/en/main) | Bắt đầu từ thư mục `app/routes/*`, tìm hiểu cơ chế `loader` (fetch data phía server) và `action` (xử lý mutation phía server), đọc kỹ Coding Guideline dự án. |
| **05** | Fullstack + TypeScript | **Next.js** | React framework hỗ trợ SSR, SSG, Server Components. | [nextjs.org/docs](https://nextjs.org/docs) | Nắm rõ App Router / Pages Router, cơ chế rendering (`getServerSideProps`, Server Components) và tối ưu hóa SEO. |
| **06** | Database | **MySQL** | Hệ quản trị cơ sở dữ liệu quan hệ (RDBMS) phổ thông. | [w3schools.com/MySQL](https://www.w3schools.com/MySQL/default.asp) | Thành thạo câu lệnh SQL cơ bản, kỹ thuật đánh Index để tối ưu tìm kiếm, và nguyên lý quản lý Transaction (ACID). |
| **07** | Database | **PostgreSQL** | Hệ quản trị CSDL quan hệ mạnh mẽ, hỗ trợ kiểu dữ liệu mở rộng (JSONB). | [postgresql.org/about](https://www.postgresql.org/about/) | Nắm vững SQL queries, transactions, quản lý locking và quan hệ dữ liệu phức tạp. |
| **08** | Database (ORM) | **Prisma (ORM)** | Next-generation ORM cho TypeScript và Node.js. | [prisma.io/docs](https://www.prisma.io/docs/about) | Hiểu cấu trúc tệp `schema.prisma`, cách tạo và chạy Migration (`npx prisma migrate dev`), kỹ thuật tương tác DB và sử dụng Transaction Client (`$transaction`). |
| **09** | VR / 3D | **Babylon.js, Three.js** | Engine 3D/VR chạy trên Web, hỗ trợ kính thực tế ảo (VR Headsets). | [doc.babylonjs.com](https://doc.babylonjs.com/) | Làm quen với việc import, render mô hình 3D định dạng `.gltf`/`.glb`, thiết lập Scene, Camera, Lighting và tối ưu hiệu năng đồ họa. |
| **10** | Cloud Services | **AWS (S3, Cloudflare R2, EC2, AMI)** | Dịch vụ đám mây phục vụ lưu trữ file, máy chủ và mở rộng hạ tầng. | [docs.aws.amazon.com](https://docs.aws.amazon.com/) | Học cách deploy ứng dụng cơ bản, quản trị quyền truy cập IAM, cấu trúc Bucket lưu trữ file và cấu hình Presigned URL upload. |
| **11** | Cloud Services | **Google Cloud Platform (GCP)** | Nền tảng điện toán đám mây của Google (GCS, Cloud Run). | [cloud.google.com/docs](https://cloud.google.com/docs) | Làm quen với IAM Roles, Google Cloud Storage (GCS) Bucket và triển khai container trên Cloud Run. |
| **12** | CI/CD | **GitHub Actions** | Nền tảng tự động hóa quy trình kiểm thử và triển khai code. | [docs.github.com/actions](https://docs.github.com/en/actions) | Nắm được cú pháp tệp Workflow cấu hình YAML (`.github/workflows/*.yml`), cấu hình trigger `push`, `pull_request` và chạy automated test/lint. |
| **13** | Development Tools | **Docker, ESLint, Prettier** | Đóng gói môi trường container và chuẩn hóa định dạng mã nguồn. | [docs.docker.com](https://docs.docker.com/)<br>[eslint.org/docs](https://eslint.org/docs/latest/)<br>[prettier.io/docs](https://prettier.io/docs/) | Hiểu cách chạy container database bằng Docker Compose; luôn chạy lệnh check lint và format tự động trước khi commit code. |

---

## 📌 Yêu Cầu Chung Bắt Buộc Về Source Code

1. **Tích hợp đầy đủ plugin chất lượng mã nguồn trên IDE**:
   - **Linter**: Cài đặt plugin `ESLint` trên VS Code / Antigravity IDE để tự động phát hiện lỗi cú pháp và convention theo thời gian thực.
   - **Formatter**: Cài đặt plugin `Prettier` và bật chế độ `Format On Save`.
   - **Spell Checker**: Cài đặt plugin `Code Spell Checker` để tránh lỗi sai chính tả trong tên biến, hàm, file và comment (đây là lỗi thường gặp đã được cảnh báo trong review).
   - **Type Checker**: Kiểm tra chặt chẽ kiểu dữ liệu TypeScript, không sử dụng flag bỏ qua kiểm tra type (`@ts-ignore` hoặc `@ts-nocheck`) khi chưa có sự đồng ý của Tech Lead.
   - **Test Runner**: Thiết lập Vitest hoặc Jest runner để chạy UT nhanh trên máy cá nhân.

2. **Tiếp cận Remix Framework trong dự án**:
   ```text
   app/
   ├── actions/          # Xử lý form mutation phía server
   ├── components/       # Các UI Component tái sử dụng (.tsx)
   ├── loaders/          # Lấy dữ liệu (Data fetching) phía server
   ├── repositories/     # Tương tác trực tiếp với Database qua Prisma
   ├── routes/           # Hệ thống định tuyến lồng nhau (Nested Routes)
   ├── services/         # Tầng xử lý Business Logic nghiệp vụ
   └── utils/            # Helper functions, authentication, session
   ```
   > [!TIP]
   > - Khi viết logic trong Remix, luôn phân biệt rõ ràng mã nguồn nào chạy trên **Server** (Loader, Action, Service, Repository) và mã nguồn nào chạy trên **Browser** (Component JSX, hooks).
   > - Không đưa thông tin nhạy cảm (secrets, connection string, private key) vào các component client-side.
