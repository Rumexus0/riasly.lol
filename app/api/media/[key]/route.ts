import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";

import { prisma } from "@/lib/db";
import { isAllowedInlineMediaMime, isOwnMediaPath } from "@/lib/media-kind";
import { uploadDir } from "@/lib/storage";

export const runtime = "nodejs";

// Inline, byte-range delivery for profile media assets (backgrounds + avatars).
//
// This is deliberately separate from /api/files/[id]: that route exists for
// downloads (attachment disposition, no-store, download counter) which a
// <video> background cannot use — browsers, and Safari/iOS in particular,
// refuse to play media without Range support. Here we serve inline, honour
// Range requests, cache immutably (the storage key is a random UUID and never
// changes) and skip the download counter, because every profile view would
// otherwise write to the database.

const MAX_SEGMENT = 190;

type ByteRange = { start: number; end: number } | null;

// "bytes=0-1023" | "bytes=1024-" | "bytes=-5000"; only single ranges supported.
function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return null;
  const [unit, spec] = header.split("=");
  if ((unit ?? "").trim().toLowerCase() !== "bytes" || !spec) return null;
  const single = spec.split(",")[0]?.trim();
  if (!single) return null;
  const [rawStart, rawEnd] = single.split("-");

  // Suffix range: last N bytes.
  if (rawStart === "" || rawStart === undefined) {
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return null;
    const length = Math.min(n, size);
    return { start: size - length, end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isFinite(start) || start < 0 || start >= size) return null;
  const end = rawEnd === undefined || rawEnd === "" ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

// Plain records so each status branch can state exactly the headers it needs.
// Content-Length is deliberately *not* set here: it must match the bytes actually
// sent, otherwise a 416/304 (empty body) keeps the connection half-written and
// the client aborts with a socket error.
function baseHeaders(opts: { mime: string; etag: string }): Record<string, string> {
  return {
    // No Content-Disposition => rendered inline by the browser.
    "Content-Type": opts.mime,
    // We choose which mime values reach this line (isAllowedInlineMediaMime), but
    // nosniff is the belt-and-braces answer for a stale or spoofed DB row: without
    // it a browser may re-interpret bytes as HTML on *our* origin.
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: opts.etag,
  };
}

function rangeHeaders(
  opts: { mime: string; etag: string; size: number },
  start: number,
  end: number
): Record<string, string> {
  return {
    ...baseHeaders(opts),
    "Content-Range": `bytes ${start}-${end}/${opts.size}`,
    "Content-Length": String(end - start + 1),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: rawKey } = await params;
  // basename() strips any ../ segments before we ever touch the filesystem.
  const key = path.basename(rawKey ?? "").slice(0, MAX_SEGMENT);
  if (!isOwnMediaPath(`/api/media/${key}`)) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const file = await prisma.fileAsset
    .findUnique({ where: { storageKey: key } })
    .catch(() => null);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // Backgrounds and avatars are public by construction; private files are never served here.
  if (file.isPrivate) return new NextResponse("Forbidden", { status: 403 });
  if (!isAllowedInlineMediaMime(file.mime)) {
    return new NextResponse("Unsupported media type", { status: 415 });
  }

  const dir = uploadDir();
  const filePath = path.join(dir, path.basename(file.storageKey));

  let size = 0;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return new NextResponse("Not found", { status: 404 });
    size = stat.size;
  } catch {
    return new NextResponse("File missing", { status: 410 });
  }

  const etag = `W/"${file.storageKey}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const base = { mime: file.mime, etag, size };
  const rangeRequested = request.headers.get("range");
  const range = parseRange(rangeRequested, size);

  // A malformed or unsatisfiable range must be an explicit 416, not a silent
  // full-body 200 (browsers retry the whole file otherwise).
  if (rangeRequested && !range) {
    return new NextResponse(null, {
      status: 416,
      headers: { ...baseHeaders(base), "Content-Range": `bytes */${size}` },
    });
  }

  if (!range) {
    return new NextResponse(createReadStream(filePath) as unknown as ReadableStream, {
      status: 200,
      headers: { ...baseHeaders(base), "Content-Length": String(size) },
    });
  }

  return new NextResponse(
    createReadStream(filePath, { start: range.start, end: range.end }) as unknown as ReadableStream,
    {
      status: 206,
      headers: rangeHeaders(base, range.start, range.end),
    }
  );
}
