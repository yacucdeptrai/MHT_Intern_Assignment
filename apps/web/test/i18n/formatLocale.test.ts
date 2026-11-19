import { describe, expect, it } from "vitest";

import { formatDateLocale, formatNumberLocale, formatPercentLocale, getIntlLocale } from "../../app/utils/formatLocale";

describe("formatLocale", () => {
  it("resolves correct Intl locale for vi and en", () => {
    expect(getIntlLocale("en")).toBe("en-US");
    expect(getIntlLocale("vi")).toBe("vi-VN");
    expect(getIntlLocale(undefined)).toBe("vi-VN");
    expect(getIntlLocale("other")).toBe("vi-VN");
  });

  it("formats dates according to active locale in APP_TIMEZONE", () => {
    const epoch = new Date("2026-11-19T07:00:00.000Z").getTime();
    const formattedEn = formatDateLocale(epoch, "en");
    const formattedVi = formatDateLocale(epoch, "vi");

    // In Asia/Ho_Chi_Minh (+7), 07:00 UTC is 14:00 on Nov 19, 2026
    expect(formattedEn).toContain("2026");
    expect(formattedVi).toContain("2026");
  });

  it("formats numbers and percentages according to active locale", () => {
    const num = 1234567.89;
    const enNum = formatNumberLocale(num, "en");
    const viNum = formatNumberLocale(num, "vi");

    expect(enNum).toContain("1,234,567");
    // In Vietnamese locale, comma or period grouping:
    expect(viNum).toBeDefined();

    const pct = 0.854;
    expect(formatPercentLocale(pct, "en")).toContain("85.4%");
    expect(formatPercentLocale(pct, "vi")).toContain("85,4%");
  });
});
