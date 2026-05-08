import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  readFile: readFileMock,
  writeFile: vi.fn(),
}));

import { downloadsDir } from "@/lib/agent/downloadFiles";

import { GET } from "./route";

describe("GET /downloads/[filename]", () => {
  it("returns the requested download with attachment headers", async () => {
    readFileMock.mockResolvedValueOnce("name,value\nAcme,1\n");

    const response = await GET(new Request("http://localhost/downloads/report.csv"), {
      params: Promise.resolve({ filename: "report.csv" }),
    });

    await expect(response.text()).resolves.toBe("name,value\nAcme,1\n");
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="report.csv"',
    );
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(readFileMock).toHaveBeenCalledWith(
      join(downloadsDir, "report.csv"),
      "utf8",
    );
  });

  it("returns 404 when the download does not exist", async () => {
    const error = Object.assign(new Error("missing"), { code: "ENOENT" });
    readFileMock.mockRejectedValueOnce(error);

    const response = await GET(new Request("http://localhost/downloads/missing.csv"), {
      params: Promise.resolve({ filename: "missing.csv" }),
    });

    await expect(response.json()).resolves.toEqual({
      error: "Download not found.",
    });
    expect(response.status).toBe(404);
  });
});
