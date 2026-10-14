import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { fetchDoServidor } from "@/lib/supabase/fetch-do-servidor";
import { urlDoSupabaseNoServidor } from "@/lib/supabase/url-do-servidor";
import { isPublicPath } from "@/lib/auth/public-paths";
import { CABECALHO_SESSAO, assinarSessao } from "@/lib/auth/sessao-repassada";
import { chaveDaSessao, compartilharEmVoo } from "@/lib/auth/validacao-em-rajada";
import {
  verifyImpersonateCookieEdge,
  IMPERSONATE_COOKIE_NAME_EDGE,
} from "@/lib/impersonate/cookie-edge";

const COOKIE_NAME = "sb-zapsales-auth";

/** `Server-Timing` (W3C): nomes genéricos, sem detalhe interno. Só em resposta logada. */
function servidorTiming(inicio: number, autenticacaoMs: number): string {
  const proxyMs = performance.now() - inicio;
  return `proxy;dur=${proxyMs.toFixed(1)}, auth;dur=${autenticacaoMs.toFixed(1)}`;
}

export async function proxy(request: NextRequest) {
  const inicio = performance.now();

  // O resultado da validação do usuário viaja por este cabeçalho (ver
  // `lib/auth/sessao-repassada.ts`). Quem o escreve é SÓ este proxy: o que veio de
  // fora é apagado antes de qualquer decisão, inclusive no caminho público.
  request.headers.delete(CABECALHO_SESSAO);

  // Inject X-Request-Id for downstream correlation (audit log, error wrappers).
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const { pathname, search } = request.nextUrl;
  // Expose pathname to Server Components via header (used by onboarding layout).
  request.headers.set("x-pathname", pathname);

  // A resposta é criada DEPOIS da validação do usuário: o `NextResponse.next`
  // copia os cabeçalhos da requisição no momento em que é chamado, e o usuário
  // assinado (além dos cookies renovados) precisa estar neles.
  const novaResposta = () => {
    const r = NextResponse.next({ request: { headers: request.headers } });
    r.headers.set("x-request-id", requestId);
    r.headers.set("x-pathname", pathname);
    return r;
  };

  // EPIC-11: the admin surface is reached by PATH (`/admin/*`) — the self-host kit
  // points `NEXT_PUBLIC_ADMIN_URL` at the same host as the app and maps no `admin.`
  // sub-domain. The host-based branch below stays a NOOP today and only exists as
  // documentation of the intended deploy topology.
  const host = request.headers.get("host") ?? "";
  const isAdminSurface = host.startsWith("admin.") || pathname.startsWith("/admin");

  if (isPublicPath(pathname)) {
    return novaResposta();
  }

  // Cookies que o refresh de sessão quer gravar; aplicados à resposta final.
  const cookiesParaGravar: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    // #1082: base na URL pública, endereço interno só no transporte (ver
    // `lib/supabase/fetch-do-servidor.ts`). O middleware não gera link, mas
    // segue a mesma regra dos outros dois clients — um desenho só.
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        fetch: fetchDoServidor(
          urlDoSupabaseNoServidor(env.SUPABASE_SERVER_URL, env.NEXT_PUBLIC_SUPABASE_URL),
          env.NEXT_PUBLIC_SUPABASE_URL,
        ),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            cookiesParaGravar.push({ name, value, options });
          });
        },
      },
      cookieOptions: {
        name: COOKIE_NAME,
        sameSite: "strict",
        httpOnly: true,
        secure: cookieSecure(),
        path: "/",
      },
    },
  );

  // Validate JWT server-side (NEVER use getSession on backend per CLAUDE.md).
  const inicioDaAutenticacao = performance.now();
  // Requisições simultâneas da MESMA sessão (a Inbox dispara ~15 ao abrir) dividem
  // uma ida ao GoTrue só — ver `lib/auth/validacao-em-rajada.ts`. Os cookies que o
  // refresh quis gravar viajam junto com o usuário, para quem pegou carona.
  const validar = async () => {
    const antes = cookiesParaGravar.length;
    const {
      data: { user: validado },
    } = await supabase.auth.getUser();
    return { user: validado, cookies: cookiesParaGravar.slice(antes) };
  };
  const chave = await chaveDaSessao(request.cookies.getAll(), COOKIE_NAME);
  const { user, cookies: renovados } = await compartilharEmVoo(chave, validar);
  for (const c of renovados) {
    if (cookiesParaGravar.includes(c)) continue;
    request.cookies.set(c.name, c.value);
    cookiesParaGravar.push(c);
  }
  const autenticacaoMs = performance.now() - inicioDaAutenticacao;

  if (!user) {
    // API routes must respond with JSON envelope (contract: {error:{code,message}})
    // — never redirect HTML to JSON consumers. UI routes redirect to /login as before.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Authentication required",
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": requestId,
          },
        },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  // EPIC-11 S-11.07: validate impersonate cookie on /app/* paths. Middleware
  // runs in Edge — no DB access, only HMAC + expiry. On any failure we delete
  // the presentation cookie. The database support session remains authoritative:
  // expired/revoked support still blocks the app until explicit exit.
  let apagarCookieDeSuporte = false;
  if (pathname.startsWith("/app")) {
    const impCookie = request.cookies.get(IMPERSONATE_COOKIE_NAME_EDGE)?.value;
    if (impCookie) {
      const result = await verifyImpersonateCookieEdge(
        impCookie,
        env.IMPERSONATE_COOKIE_SECRET ?? "",
      );
      if (!result.valid) {
        console.warn(
          `[middleware] impersonate cookie invalid (${result.reason ?? "unknown"}) — clearing`,
        );
        apagarCookieDeSuporte = true;
      }
    }
  }

  // /admin/* additionally requires platform_admin (early gate — authoritative
  // check is server-side in `requirePlatformAdmin`). Skip the RPC for
  // `/admin/forbidden` (rendered to non-admins, would otherwise loop).
  if (isAdminSurface && pathname.startsWith("/admin") && pathname !== "/admin/forbidden") {
    const { data: isAdmin, error } = await supabase.rpc("fn_is_platform_admin");
    if (error || !isAdmin) {
      const negado = NextResponse.redirect(new URL("/admin/forbidden", request.url));
      negado.headers.set("server-timing", servidorTiming(inicio, autenticacaoMs));
      return negado;
    }
  }

  // Repassa ao resto da requisição o usuário que o GoTrue acabou de validar.
  request.headers.set(CABECALHO_SESSAO, await assinarSessao(user));
  const response = novaResposta();
  for (const { name, value, options } of cookiesParaGravar) {
    response.cookies.set(name, value, options);
  }
  if (apagarCookieDeSuporte) response.cookies.delete(IMPERSONATE_COOKIE_NAME_EDGE);
  response.headers.set("server-timing", servidorTiming(inicio, autenticacaoMs));
  return response;
}

export const config = {
  matcher: [
    // Run on all paths except static assets / Next internals — and the upload
    // routes whose ceiling passes the proxy body limit (issue #22). On a path
    // the proxy reaches, Next hands the route only the first
    // `proxyClientMaxBodySize` bytes (10 MB): a 12 MB video arrives cut and
    // `formData()` finds no file. Each of these routes authenticates itself
    // (requireRole / resolveAuthDual), so the proxy had nothing to decide there.
    // Raising the limit instead would let ANY POST, signed in or not, pin 5x
    // more memory before the proxy runs. Kept in sync by
    // tests/unit/proxy-nao-corta-upload-grande.test.ts.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/v1/conversations/[^/]+/(?:notes/)?media$|api/v1/channels/templates/media$|api/v1/ai/knowledge/sources/upload$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
