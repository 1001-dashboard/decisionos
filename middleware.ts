import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rinnova la sessione e protegge /app. pathname è già senza basePath.
export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (!p.startsWith("/app") && !p.startsWith("/login")) return NextResponse.next();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return NextResponse.next();
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const to = (path: string) => { const u = req.nextUrl.clone(); u.pathname = path; u.search = ""; return NextResponse.redirect(u); };
  if (p.startsWith("/app") && !user) return to("/login");
  if (p.startsWith("/login") && user) return to("/app");
  return res;
}

export const config = { matcher: ["/app/:path*", "/login"] };
