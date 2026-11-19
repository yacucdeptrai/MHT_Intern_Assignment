/* cspell:disable */
import { describe, expect, it } from "vitest";

describe("file name spelling checks (Review Lessons #01 & #02)", () => {
  it("verifies repository files do not contain known typos (Lesson #1)", () => {
    const repos = import.meta.glob("../../../packages/db/src/repositories/*.ts", { eager: true });
    const paths = Object.keys(repos);
    expect(paths.some((p) => p.includes("notificatonRepository"))).toBe(false);
    expect(paths.some((p) => p.includes("notification.repository"))).toBe(true);
  });

  it("verifies service files do not contain known typos (Lesson #2)", () => {
    const services = import.meta.glob("../app/services/**/*.service.ts", { eager: true });
    const paths = Object.keys(services);
    expect(paths.some((p) => p.includes("projectMemeber.service"))).toBe(false);
    expect(paths.some((p) => p.includes("projectMember.service"))).toBe(true);
  });
});
