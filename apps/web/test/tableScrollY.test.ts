import { describe, expect, it } from "vitest";

import { tableScrollY } from "../app/components/table/tableScrollY";

describe("tableScrollY (Review Lesson #15)", () => {
  it("calculates viewport-relative scroll height without hardcoding (Lesson #15)", () => {
    // 1280x720 viewport height
    expect(tableScrollY(720, 250)).toBe(470);
    // 1920x1080 viewport height
    expect(tableScrollY(1080, 250)).toBe(830);
    // Enforces minimum floor height of 200px
    expect(tableScrollY(400, 300)).toBe(200);
  });
});
