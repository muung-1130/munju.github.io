import { NextResponse } from "next/server";

/** Lightweight process health endpoint used by Kubernetes probes. */
export function GET() {
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
