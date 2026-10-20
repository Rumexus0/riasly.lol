// riasly — the storage rules that decide what may be written and how much of it.
//
// Why: lib/storage.ts is the only place that names the upload root, collapses a
// web-executable extension and enforces the plan's storage ceiling. Each rule is a
// one-line answer today and a security boundary tomorrow, so they are pinned rather
// than reasoned about from a Set literal.
import { beforeEach, describe, expect, it, vi } from "vitest";

// lib/storage.ts imports the Prisma client for the quota aggregate. Mocking the
// module (not the client) keeps `npm test` runnable on a fresh clone with no
// DATABASE_URL and no database. vi.hoisted is required: the mock factory is moved
// above the imports, so plain consts would still be in their temporal dead zone.
const { findUnique, aggregate } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  aggregate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique },
    fileAsset: { aggregate },
  },
}));

import {
  fileQuotaBytes,
  overUploadQuota,
  safeExtFor,
  uploadDir,
} from "@/lib/storage";

describe("uploadDir", () => {
  const saved = process.env.UPLOAD_DIR;
  beforeEach(() => {
    if (saved === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = saved;
  });

  // The default is the fix for the web-root exposure, so it must not be able to
  // drift back to public/ silently: an unset env on a deployment would otherwise
  // reintroduce the exact bug Phase 2 removed.
  it("defaults outside the web root", () => {
    delete process.env.UPLOAD_DIR;
    expect(uploadDir()).toBe("./storage/uploads");
    expect(uploadDir()).not.toContain("public");
  });

  it("honours an explicit override", () => {
    process.env.UPLOAD_DIR = "/var/data/riasly";
    expect(uploadDir()).toBe("/var/data/riasly");
  });
});

describe("safeExtFor", () => {
  it("collapses anything a browser would execute onto .bin", () => {
    for (const name of [
      "evil.html",
      "evil.HTM",
      "page.xhtml",
      "icon.svg",
      "payload.xml",
      "script.js",
      "mod.mjs",
      "style.css",
      "shell.php",
      "run.exe",
      "install.bat",
      "thing.vbs",
      "flash.swf",
    ]) {
      expect(safeExtFor(name), name).toBe(".bin");
    }
  });

  it("keeps the extensions the product actually stores", () => {
    expect(safeExtFor("photo.PNG")).toBe(".png");
    expect(safeExtFor("clip.MP4")).toBe(".mp4");
    expect(safeExtFor("loop.gif")).toBe(".gif");
    expect(safeExtFor("track.mp3")).toBe(".mp3");
    expect(safeExtFor("archive.zip")).toBe(".zip");
  });

  it("never returns a path separator or an empty-looking hazard", () => {
    for (const name of ["", "noext", "a/b/c.html", "..", "../..", "x."]) {
      const ext = safeExtFor(name);
      expect(ext).not.toContain("/");
      expect(ext).not.toContain("\\");
      expect(ext === "" || /^\.[a-z0-9]{1,10}$/.test(ext), `${name} -> ${ext}`).toBe(
        true
      );
    }
  });

  // The key is matched by OWN_MEDIA_RE, whose extension class is 2–5 characters.
  // safeExtFor caps at 10 (pre-existing behaviour, kept on purpose because
  // ensureMediaKey re-derives the real extension from the stored mime), so a long
  // client extension is tolerated for downloads but never reaches a media path.
  it("caps the length instead of trusting the client", () => {
    // 10 characters kept, the rest dropped — never a full client-supplied string.
    expect(safeExtFor("file.abcdefghijklmnopqrstuvwxyz")).toBe(".abcdefghij");
    expect(safeExtFor("file.docx123456789")).toBe(".docx123456");
  });
});

describe("fileQuotaBytes", () => {
  const saved = process.env.FILE_QUOTA_GB;
  beforeEach(() => {
    if (saved === undefined) delete process.env.FILE_QUOTA_GB;
    else process.env.FILE_QUOTA_GB = saved;
  });

  it("defaults to the number the pricing card promises", () => {
    delete process.env.FILE_QUOTA_GB;
    expect(fileQuotaBytes("FREE")).toBe(5 * 1024 * 1024 * 1024);
  });

  it("leaves Premium unlimited", () => {
    process.env.FILE_QUOTA_GB = "5";
    expect(fileQuotaBytes("PREMIUM")).toBeNull();
  });

  it("treats 0 and garbage as 'no ceiling' rather than 'no uploads'", () => {
    // A misread env must not lock a paying customer out of their own storage.
    process.env.FILE_QUOTA_GB = "0";
    expect(fileQuotaBytes("FREE")).toBeNull();
    process.env.FILE_QUOTA_GB = "banana";
    expect(fileQuotaBytes("FREE")).toBeNull();
    process.env.FILE_QUOTA_GB = "-1";
    expect(fileQuotaBytes("FREE")).toBeNull();
  });
});

describe("overUploadQuota", () => {
  beforeEach(() => {
    findUnique.mockReset();
    aggregate.mockReset();
    process.env.FILE_QUOTA_GB = "5";
  });

  const GB = 1024 * 1024 * 1024;

  it("answers false while the account is under its ceiling", async () => {
    findUnique.mockResolvedValue({ plan: "FREE" });
    aggregate.mockResolvedValue({ _sum: { size: 4 * GB } });
    await expect(overUploadQuota("u1", GB / 2)).resolves.toBe(false);
  });

  it("answers true on the byte that crosses it", async () => {
    findUnique.mockResolvedValue({ plan: "FREE" });
    aggregate.mockResolvedValue({ _sum: { size: 4.9 * GB } });
    await expect(overUploadQuota("u1", 0.2 * GB)).resolves.toBe(true);
  });

  it("never asks the database for a Premium account", async () => {
    findUnique.mockResolvedValue({ plan: "PREMIUM" });
    await expect(overUploadQuota("u1", 100 * GB)).resolves.toBe(false);
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("refuses to store for an owner row that is gone", async () => {
    // Orphan bytes nobody can delete through the app are worse than a refused
    // upload: the aggregate below would still report 0 used for ever.
    findUnique.mockResolvedValue(null);
    await expect(overUploadQuota("u1", 1)).resolves.toBe(true);
  });

  it("fails open when the database is unreachable", async () => {
    findUnique.mockRejectedValue(new Error("connection lost"));
    await expect(overUploadQuota("u1", 1)).resolves.toBe(false);
  });

  it("counts an empty account as zero, not null", async () => {
    // Prisma returns { _sum: { size: null } } when no row matches — the `?? 0`
    // is what stops the first upload of a fresh account from comparing to NaN.
    findUnique.mockResolvedValue({ plan: "FREE" });
    aggregate.mockResolvedValue({ _sum: { size: null } });
    await expect(overUploadQuota("u1", 1)).resolves.toBe(false);
  });
});
