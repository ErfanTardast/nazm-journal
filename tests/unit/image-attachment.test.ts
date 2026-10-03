import { describe, expect, it } from "vitest";
import { computeScaledDimensions, estimateDataUrlBytes, isAcceptableImageType, validateImageFile } from "@/lib/attachments/image";

describe("image attachment helpers", () => {
  it("never upscales images within bounds", () => {
    expect(computeScaledDimensions(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it("scales down preserving aspect ratio", () => {
    expect(computeScaledDimensions(2560, 1440, 1280)).toEqual({ width: 1280, height: 720 });
  });

  it("scales by the longest edge for portrait images", () => {
    expect(computeScaledDimensions(1000, 4000, 1280)).toEqual({ width: 320, height: 1280 });
  });

  it("handles degenerate sizes", () => {
    expect(computeScaledDimensions(0, 0, 1280)).toEqual({ width: 0, height: 0 });
  });

  it("accepts only known image mime types", () => {
    expect(isAcceptableImageType("image/png")).toBe(true);
    expect(isAcceptableImageType("image/jpeg")).toBe(true);
    expect(isAcceptableImageType("application/pdf")).toBe(false);
    expect(isAcceptableImageType("text/csv")).toBe(false);
  });

  it("estimates decoded byte size of a data url", () => {
    // "AAAA" base64 decodes to 3 bytes, no padding
    expect(estimateDataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    // padding reduces the byte count
    expect(estimateDataUrlBytes("data:image/png;base64,QQ==")).toBe(1);
  });

  it("rejects wrong types and oversized files", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 }, { maxBytes: 5000 })).toEqual({ ok: true });
    expect(validateImageFile({ type: "application/zip", size: 10 }, { maxBytes: 5000 })).toEqual({ ok: false, error: "type" });
    expect(validateImageFile({ type: "image/png", size: 9000 }, { maxBytes: 5000 })).toEqual({ ok: false, error: "size" });
  });
});
