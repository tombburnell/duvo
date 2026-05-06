import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const downloadsDir = join(process.cwd(), "public", "downloads");
const maxFilenameLength = 128;
const maxFileBytes = 500_000;
const allowedTextExtensions = new Set([
  ".csv",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

export interface WriteDownloadFileInput {
  content: string;
  filename: string;
}

export interface WriteDownloadFileResult {
  filename: string;
}

function getExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");

  if (dotIndex <= 0) {
    return "";
  }

  return filename.slice(dotIndex).toLowerCase();
}

export function sanitizeDownloadFilename(filename: string): string {
  const trimmedFilename = filename.trim();
  const baseFilename = basename(trimmedFilename);

  if (
    !baseFilename ||
    baseFilename !== trimmedFilename ||
    baseFilename.includes("..") ||
    baseFilename.length > maxFilenameLength
  ) {
    throw new Error("Download filename is not safe.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(baseFilename)) {
    throw new Error("Download filename contains unsupported characters.");
  }

  const extension = getExtension(baseFilename);

  if (!allowedTextExtensions.has(extension)) {
    throw new Error("Download filename must use a supported text extension.");
  }

  return baseFilename;
}

export async function writeDownloadFile({
  content,
  filename,
}: WriteDownloadFileInput): Promise<WriteDownloadFileResult> {
  const canonicalFilename = sanitizeDownloadFilename(filename);
  const contentBytes = Buffer.byteLength(content, "utf8");

  if (contentBytes > maxFileBytes) {
    throw new Error("Download file is too large.");
  }

  await mkdir(downloadsDir, { recursive: true });
  await writeFile(join(downloadsDir, canonicalFilename), content, "utf8");

  return { filename: canonicalFilename };
}

/** Read back a file previously written under public/downloads (validates filename). */
export async function readDownloadFileContent(
  filename: string,
): Promise<string> {
  const canonicalFilename = sanitizeDownloadFilename(filename);

  return readFile(join(downloadsDir, canonicalFilename), "utf8");
}
