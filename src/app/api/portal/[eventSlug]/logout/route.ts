import { NextResponse } from "next/server";
import { clearPortalSessionCookie } from "@/lib/portal/session";

export async function POST() {
  const res = NextResponse.json({ success: true });
  clearPortalSessionCookie(res);
  return res;
}
