import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { createSignedInMember, signInAsAdmin } from "./helpers";

/* cspell:disable */

async function switchToLang(page: Page, lang: "vi" | "en") {
  const targetButton = page.getByTestId(lang === "vi" ? "lang-vi" : "lang-en");
  await targetButton.click();
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
}

test.describe("i18n language switching and localization coverage", () => {
  test("anonymous /login renders Vietnamese by default and switches cleanly to English", async ({ page }) => {
    // 1. Visit /login without cookies: must default to Vietnamese (vi)
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");

    // Vietnamese strings must be present, English must be absent
    await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByText("Sign in with your email and password")).not.toBeVisible();
    await expect(page.getByText("Đăng nhập bằng email và mật khẩu của bạn")).toBeVisible();
    await expect(page.getByLabel("Địa chỉ email")).toBeVisible();
    await expect(page.getByLabel("Mật khẩu")).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).not.toBeVisible();

    // 2. Switch to English via switcher
    await switchToLang(page, "en");

    // English strings must be present, Vietnamese must be absent
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByText("Sign in with your email and password")).toBeVisible();
    await expect(page.getByText("Đăng nhập bằng email và mật khẩu của bạn")).not.toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Đăng nhập", exact: true })).not.toBeVisible();

    // 3. Switch back to Vietnamese
    await switchToLang(page, "vi");
    await expect(page.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByText("Sign in with your email and password")).not.toBeVisible();
  });

  test("admin views switch cleanly between Vietnamese and English across all top-level routes", async ({ page }) => {
    await signInAsAdmin(page);

    const adminRoutes = [
      {
        path: "/admin",
        vi: {
          heading: "Bảng điều khiển",
          nav: "Nhật ký kiểm toán",
          absentEn: ["Admin Dashboard", "Audit Log"],
        },
        en: {
          heading: "Dashboard",
          nav: "Audit log",
          absentVi: ["Bảng điều khiển Quản trị", "Nhật ký Kiểm toán"],
        },
      },
      {
        path: "/admin/users",
        vi: {
          heading: "Quản lý người dùng",
          nav: "Nhật ký kiểm toán",
          absentEn: ["User Management"],
        },
        en: {
          heading: "User Management",
          nav: "Audit log",
          absentVi: ["Quản lý người dùng"],
        },
      },
      {
        path: "/admin/statuses",
        vi: {
          heading: "Trạng thái công việc",
          nav: "Trạng thái",
          absentEn: ["Task Statuses"],
        },
        en: {
          heading: "Task Statuses",
          nav: "Statuses",
          absentVi: ["Trạng thái công việc"],
        },
      },
      {
        path: "/admin/audit-log",
        vi: {
          heading: "Nhật ký hệ thống",
          nav: "Người dùng",
          absentEn: ["System Audit Log"],
        },
        en: {
          heading: "System Audit Log",
          nav: "Users",
          absentVi: ["Nhật ký hệ thống"],
        },
      },
    ];

    for (const route of adminRoutes) {
      await page.goto(route.path);

      // Verify in VI
      await switchToLang(page, "vi");
      await expect(page.getByRole("heading", { name: route.vi.heading, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation").getByRole("link", { name: route.vi.nav, exact: true })).toBeVisible();
      for (const text of route.vi.absentEn) {
        await expect(page.getByRole("heading", { name: text, exact: true })).not.toBeVisible();
      }

      // Verify in EN
      await switchToLang(page, "en");
      await expect(page.getByRole("heading", { name: route.en.heading, exact: true })).toBeVisible();
      await expect(page.getByRole("navigation").getByRole("link", { name: route.en.nav, exact: true })).toBeVisible();
      for (const text of route.en.absentVi) {
        await expect(page.getByRole("heading", { name: text, exact: true })).not.toBeVisible();
      }
    }
  });

  test("member views switch cleanly between Vietnamese and English across all top-level routes", async ({
    browser,
  }) => {
    const member = await createSignedInMember(browser, "MEMBER");
    const page = member.page;

    const memberRoutes = [
      {
        path: "/",
        vi: {
          heading: "Bảng điều khiển",
          nav: "Công việc của tôi",
          absentEn: ["Dashboard"],
        },
        en: {
          heading: "Dashboard",
          nav: "My tasks",
          absentVi: ["Bảng điều khiển"],
        },
      },
      {
        path: "/projects",
        vi: {
          heading: "Dự án",
          nav: "Công việc của tôi",
          absentEn: ["Projects"],
        },
        en: {
          heading: "Projects",
          nav: "My tasks",
          absentVi: ["Dự án"],
        },
      },
      {
        path: "/my-tasks",
        vi: {
          heading: "Công việc của tôi",
          nav: "Lịch biểu",
          absentEn: ["Calendar"],
        },
        en: {
          heading: "My Tasks",
          nav: "Calendar",
          absentVi: ["Công việc của tôi"],
        },
      },
      {
        path: "/calendar",
        vi: {
          heading: "Lịch biểu",
          nav: "Công việc của tôi",
          absentEn: ["Schedule Calendar"],
        },
        en: {
          heading: "Calendar",
          nav: "My tasks",
          absentVi: ["Lịch biểu"],
        },
      },
      {
        path: "/notifications",
        vi: {
          heading: "Thông báo",
          emptyText: "Không tìm thấy thông báo nào.",
          absentEn: ["No notifications found."],
        },
        en: {
          heading: "Notifications",
          emptyText: "No notifications found.",
          absentVi: ["Không tìm thấy thông báo nào."],
        },
      },
      {
        path: "/profile",
        vi: {
          heading: "Hồ sơ cá nhân",
          section: "Thông tin cá nhân",
          absentEn: ["User Profile", "Personal Information"],
        },
        en: {
          heading: "User Profile",
          section: "Personal Information",
          absentVi: ["Hồ sơ cá nhân", "Thông tin cá nhân"],
        },
      },
    ];

    for (const route of memberRoutes) {
      await page.goto(route.path);

      // Verify in VI
      await switchToLang(page, "vi");
      await expect(page.getByRole("heading", { name: route.vi.heading, exact: true })).toBeVisible();
      if ("nav" in route.vi) {
        await expect(page.getByRole("navigation").getByRole("link", { name: route.vi.nav, exact: true })).toBeVisible();
      }
      if ("emptyText" in route.vi) {
        await expect(page.getByText(route.vi.emptyText)).toBeVisible();
      }
      if ("section" in route.vi) {
        await expect(page.getByRole("heading", { name: route.vi.section, exact: true })).toBeVisible();
      }
      for (const text of route.vi.absentEn) {
        await expect(page.getByRole("heading", { name: text, exact: true })).not.toBeVisible();
      }

      // Verify in EN
      await switchToLang(page, "en");
      await expect(page.getByRole("heading", { name: route.en.heading, exact: true })).toBeVisible();
      if ("nav" in route.en) {
        await expect(page.getByRole("navigation").getByRole("link", { name: route.en.nav, exact: true })).toBeVisible();
      }
      if ("emptyText" in route.en) {
        await expect(page.getByText(route.en.emptyText)).toBeVisible();
      }
      if ("section" in route.en) {
        await expect(page.getByRole("heading", { name: route.en.section, exact: true })).toBeVisible();
      }
      for (const text of route.en.absentVi) {
        await expect(page.getByRole("heading", { name: text, exact: true })).not.toBeVisible();
      }
    }

    await member.context.close();
  });
});
