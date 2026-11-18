import { describe, expect, it } from "vitest";

import { contentDispositionAttachment } from "../../app/utils/contentDisposition";

describe("contentDispositionAttachment (FR-18 c3)", () => {
  it("keeps a plain ASCII name in both parameters", () => {
    expect(contentDispositionAttachment("report.pdf")).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it('escapes " and \\ in the quoted fallback so the name cannot be cut short', () => {
    const header = contentDispositionAttachment('a"b\\c.pdf');
    expect(header).toContain(String.raw`filename="a\"b\\c.pdf"`);
    expect(header).toContain(`filename*=UTF-8''a%22b%5Cc.pdf`);
  });

  it("percent-encodes ' ( ) * in filename*, which encodeURIComponent leaves alone", () => {
    expect(contentDispositionAttachment("it's (v2)*.txt")).toContain(`filename*=UTF-8''it%27s%20%28v2%29%2A.txt`);
  });

  it("replaces non-ASCII characters in the fallback and UTF-8 encodes them in filename*", () => {
    const header = contentDispositionAttachment("Báo cáo.pdf");
    expect(header).toContain(`filename="B_o c_o.pdf"`);
    expect(header).toContain(`filename*=UTF-8''B%C3%A1o%20c%C3%A1o.pdf`);
  });
});
