import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HANDLE_RE, RESERVED_HANDLES } from "@/lib/handle";

// Anti-squat: a lightweight in-memory throttle so this endpoint can't be used to
// enumerate which handles are taken. SINGLE-INSTANCE ONLY — the Map resets on a
// cold start and is per-process, so a multi-instance deployment must swap this for
// a shared store (e.g. the SignupAttempt table or Redis). It is a helper for the
// claim UI, not the source of truth: the real write (signUpUser) is separately
// throttled per IP and backed by the DB, so a bypass here cannot create accounts.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Drop the caller's stale timestamps and record this hit; true when over the cap.
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the Map can't grow unbounded across many IPs.
  if (hits.size > 1000) {
    for (const [k, arr] of hits) {
      const alive = arr.filter((t) => now - t < WINDOW_MS);
      if (alive.length) hits.set(k, alive);
      else hits.delete(k);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

export async function GET(request: Request) {
  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return NextResponse.json(
      { available: false, reason: "rate" },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  const handle = (searchParams.get("h") ?? "").trim().toLowerCase();

  if (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  try {
    const taken = await prisma.user.findUnique({ where: { handle } });
    return NextResponse.json({ available: !taken });
  } catch {
    return NextResponse.json(
      { available: false, reason: "db" },
      { status: 503 }
    );
  }
}
