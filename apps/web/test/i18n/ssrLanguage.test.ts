import React from "react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import type * as ReactRouter from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { getScopedI18n } from "../../app/i18n/i18n";
import { loader as rootLoader } from "../../app/root";
import { action as setLanguageAction } from "../../app/routes/api.set-language";
import LoginPage from "../../app/routes/login";
import { createLanguageCookie, getLanguage } from "../../app/utils/i18n.server";

// Mock react-router hooks needed for isolated rendering of components
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      ssoProviders: [],
      redirectTo: null,
      ssoError: null,
    }),
    useActionData: () => undefined,
    useNavigation: () => ({ state: "idle" }),
    useFetcher: () => ({
      submit: () => {},
      state: "idle",
      data: undefined,
    }),
    useLocation: () => ({ pathname: "/login", search: "" }),
    useRouteLoaderData: (id: string) => (id === "root" ? { lang: "vi" } : undefined),
    Form: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement("form", props, children),
  };
});

const dummyContext = new Map() as unknown as LoaderFunctionArgs["context"];

describe("SSR Language & Cookie Lifecycle (NFR-06)", () => {
  it("getLanguage defaults to vi when cookie is missing", () => {
    const req = new Request("http://localhost/login");
    expect(getLanguage(req)).toBe("vi");
  });

  it("getLanguage returns en when lang=en cookie is present", () => {
    const req = new Request("http://localhost/login", {
      headers: { Cookie: "lang=en" },
    });
    expect(getLanguage(req)).toBe("en");
  });

  it("getLanguage falls back to vi when cookie has unknown language", () => {
    const req = new Request("http://localhost/login", {
      headers: { Cookie: "lang=fr" },
    });
    expect(getLanguage(req)).toBe("vi");
  });

  it("createLanguageCookie formats cookie with Path=/, SameSite=Lax, and Max-Age 1 year", () => {
    const cookie = createLanguageCookie("en", false);
    expect(cookie).toContain("lang=en");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).not.toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });

  it("createLanguageCookie appends Secure flag on HTTPS", () => {
    const cookie = createLanguageCookie("vi", true);
    expect(cookie).toContain("; Secure");
  });

  it("rootLoader returns language parsed from request cookie", () => {
    const defaultRes = rootLoader({
      request: new Request("http://localhost/login"),
      params: {},
      context: dummyContext,
    } as unknown as Parameters<typeof rootLoader>[0]);
    expect(defaultRes).toEqual({ lang: "vi" });

    const enRes = rootLoader({
      request: new Request("http://localhost/login", { headers: { Cookie: "lang=en" } }),
      params: {},
      context: dummyContext,
    } as unknown as Parameters<typeof rootLoader>[0]);
    expect(enRes).toEqual({ lang: "en" });
  });

  it("SSR HTML of /login is in Vietnamese by default (without cookie)", () => {
    const i18n = getScopedI18n("vi");
    const html = renderToString(React.createElement(I18nextProvider, { i18n }, React.createElement(LoginPage, null)));

    /* cspell:disable */
    expect(html).toContain("Hệ thống Quản lý Dự án &amp; Công việc");
    expect(html).toContain("Đăng nhập bằng email và mật khẩu của bạn");
    expect(html).toContain("Địa chỉ email");
    expect(html).toContain("Mật khẩu");
    expect(html).toContain("Đăng nhập");
    /* cspell:enable */
    expect(html).not.toContain("Sign in with your email and password");
  });

  it("SSR HTML of /login is in English when lang=en", () => {
    const i18n = getScopedI18n("en");
    const html = renderToString(React.createElement(I18nextProvider, { i18n }, React.createElement(LoginPage, null)));

    expect(html).toContain("Project &amp; Task Management");
    expect(html).toContain("Sign in with your email and password");
    expect(html).toContain("Email address");
    expect(html).toContain("Password");
    expect(html).toContain("Sign in");
    /* cspell:disable-next-line */
    expect(html).not.toContain("Đăng nhập bằng email và mật khẩu của bạn");
  });

  it("api.set-language sets language cookie and redirects or returns ok", async () => {
    const formData = new FormData();
    formData.set("lang", "en");
    formData.set("redirectTo", "/login");

    const req = new Request("http://localhost/api/set-language", {
      method: "POST",
      body: formData,
    });

    const res = await setLanguageAction({ request: req });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login");
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("lang=en");
  });

  it("api.set-language rejects invalid language with 400", async () => {
    const formData = new FormData();
    formData.set("lang", "de");

    const req = new Request("http://localhost/api/set-language", {
      method: "POST",
      body: formData,
    });

    const res = await setLanguageAction({ request: req });
    expect(res.status).toBe(400);
    const body: unknown = await res.json();
    expect((body as { success: boolean }).success).toBe(false);
  });
});
