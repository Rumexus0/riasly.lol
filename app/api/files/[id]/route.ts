import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { uploadDir } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Download disposition for a stored name.
 *
 * Two jobs. First, strip CR/LF and quotes: `name` is the client's own filename, kept
 * in the database for display only, and a header value carrying a newline is a
 * response-splitting primitive. Second, emit the RFC 5987 `filename*` form, because a
 * Turkish name ("profil fotoğrafı.png") cannot survive the ASCII-only
 * `filename="..."` parameter — and putting the raw bytes in the header is worse than
 * ugly: it is a transport error. The ASCII form stays as the fallback for old clients.
 */
function contentDisposition(name: string): string {
  const clean = name.replace(/[\r\n"]/g, "");
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "download";
  const encoded = encodeURIComponent(clean).replace(/'/g, "%27");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const file = await prisma.fileAsset
    .findUnique({ where: { id } })
    .catch(() => null);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Private files are only downloadable by their owner.
  if (file.isPrivate) {
    const session = await auth();
    if (session?.user?.id !== file.ownerId) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const dir = uploadDir();
  const filePath = path.join(dir, path.basename(file.storageKey)); // basename guards traversal

  try {
    await fs.access(filePath);
  } catch {
    return new NextResponse("File missing", { status: 410 });
  }

  // Count the download for real stats (fire-and-forget).
  void prisma.fileAsset
    .update({ where: { id }, data: { downloadCount: { increment: 1 } } })
    .catch(() => {});

  const stream = createReadStream(filePath);
  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": file.mime || "application/octet-stream",
      // nosniff is what makes the stored mime a statement instead of a suggestion:
      // without it a browser that guesses "this looks like HTML" would execute bytes
      // we promised to only hand over as a download.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": contentDisposition(file.name),
      "Content-Length": String(file.size),
      "Cache-Control": "no-store",
    },
  });
}
