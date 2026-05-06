import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

import {
  sanitizeDownloadFilename,
  writeDownloadFile,
} from "./downloadFiles";

describe("sanitizeDownloadFilename", () => {
  it("accepts safe user-friendly text filenames", () => {
    expect(sanitizeDownloadFilename("ai-news-2026-05-06.md")).toBe(
      "ai-news-2026-05-06.md",
    );
    expect(sanitizeDownloadFilename("headlines.csv")).toBe("headlines.csv");
  });

  it("rejects unsafe paths and unsupported extensions", () => {
    expect(() => sanitizeDownloadFilename("../../../etc/passwd")).toThrow(
      "Download filename is not safe.",
    );
    expect(() => sanitizeDownloadFilename("nested/file.md")).toThrow(
      "Download filename is not safe.",
    );
    expect(() => sanitizeDownloadFilename("ai news!.md")).toThrow(
      "Download filename contains unsupported characters.",
    );
    expect(() => sanitizeDownloadFilename("report.pdf")).toThrow(
      "Download filename must use a supported text extension.",
    );
  });
});

describe("writeDownloadFile", () => {
  beforeEach(() => {
    mkdirMock.mockReset();
    writeFileMock.mockReset();
  });

  it("writes safe text files under public downloads only", async () => {
    await expect(
      writeDownloadFile({
        content: "# AI headlines",
        filename: "ai-news.md",
      }),
    ).resolves.toEqual({ filename: "ai-news.md" });

    expect(mkdirMock).toHaveBeenCalledWith(
      join(process.cwd(), "public", "downloads"),
      { recursive: true },
    );
    expect(writeFileMock).toHaveBeenCalledWith(
      join(process.cwd(), "public", "downloads", "ai-news.md"),
      "# AI headlines",
      "utf8",
    );
  });
});
