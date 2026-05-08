import { NextResponse } from "next/server";

import {
  readDownloadFileContent,
  sanitizeDownloadFilename,
} from "@/lib/agent/downloadFiles";

export const runtime = "nodejs";

const contentTypesByExtension: Record<string, string> = {
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "application/yaml; charset=utf-8",
  ".yml": "application/yaml; charset=utf-8",
};

interface DownloadRouteContext {
  params: Promise<{
    filename: string;
  }>;
}

function getContentType(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  const extension = dotIndex > 0 ? filename.slice(dotIndex).toLowerCase() : "";

  return contentTypesByExtension[extension] ?? "text/plain; charset=utf-8";
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isInvalidFilenameError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Download filename ");
}

export async function GET(
  _request: Request,
  context: DownloadRouteContext,
): Promise<NextResponse> {
  try {
    const { filename } = await context.params;
    const canonicalFilename = sanitizeDownloadFilename(filename);
    const content = await readDownloadFileContent(canonicalFilename);

    return new NextResponse(content, {
      headers: {
        "Content-Disposition": `attachment; filename="${canonicalFilename}"`,
        "Content-Type": getContentType(canonicalFilename),
      },
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      console.error("Download file was not found", { error });

      return NextResponse.json({ error: "Download not found." }, { status: 404 });
    }

    if (isInvalidFilenameError(error)) {
      console.error("Invalid download filename requested", { error });

      return NextResponse.json(
        { error: "Download filename is invalid." },
        { status: 400 },
      );
    }

    console.error("Failed to read download file", { error });

    return NextResponse.json(
      { error: "Unable to read download." },
      { status: 500 },
    );
  }
}
