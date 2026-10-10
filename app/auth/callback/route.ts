import { NextResponse, type NextRequest } from "next/server";
import { sbServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await (await sbServer()).auth.exchangeCodeForSession(code);
  const u = req.nextUrl.clone(); u.pathname = "/app"; u.search = "";
  return NextResponse.redirect(u);
}
