import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UMA VALIDAÇÃO DE USUÁRIO POR REQUISIÇÃO LOGADA (issue #64, parte 1/3 da #63).
 *
 * O `proxy` global valida o token no GoTrue; a renderização, a rota, a checagem
 * de MFA (`listFactors` chama `getUser`), a auditoria e o suporte temporário
 * validavam DE NOVO. Em produção cada ida ao GoTrue levou mediana de 332 ms e
 * pico de 2,3 s — o custo da tela era esse múltiplo.
 *
 * ## O seam: o que o GoTrue recebe
 *
 * O teste não olha COMO o código chega lá. Sobe um GoTrue FALSO (HTTP de verdade,
 * em porta local) que CONTA as chamadas a `GET /auth/v1/user`, aponta o app para
 * ele e dirige a requisição como o Next dirige: `proxy` primeiro; depois os
 * cabeçalhos que ELE entregou (`x-middleware-request-*`) viram a requisição que a
 * renderização/rota enxerga. Um refator interno que mantenha o comportamento
 * externo não quebra nada aqui.
 *
 * ## O que NÃO é
 *
 * Não é um `next start` de ponta a ponta — isso pede Supabase local, e o
 * `react.cache` fora do RSC é passa-direto (portanto a contagem aqui é MAIS
 * rígida que a real: nenhuma deduplicação por requisição ajuda). A prova pela
 * tela (DoD 12) fica com o ambiente fresco estilo VPS.
 */

const SENHA_DO_TOKEN = "token-valido-de-teste";
const USUARIO = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "dono@exemplo.test",
  app_metadata: {},
  user_metadata: { full_name: "Dona Ação" },
  factors: [],
  created_at: "2026-01-01T00:00:00Z",
};

// ─── GoTrue falso ──────────────────────────────────────────────────────────────
const chamadas = { user: 0, outras: [] as string[] };
let atrasoDoUserMs = 0;
let servidor: Server;
let urlFalsa = "";

function iniciarServidorFalso(): Promise<void> {
  servidor = createServer((req, res) => {
    const caminho = req.url ?? "";
    const json = (status: number, corpo: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(corpo));
    };
    if (caminho.startsWith("/auth/v1/user")) {
      chamadas.user += 1;
      const valido = req.headers.authorization === `Bearer ${SENHA_DO_TOKEN}`;
      const responder = () =>
        valido
          ? json(200, USUARIO)
          : json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      return atrasoDoUserMs > 0 ? void setTimeout(responder, atrasoDoUserMs) : responder();
    }
    if (caminho.startsWith("/rest/v1/api_tokens") && req.method === "GET") {
      const linha = {
        id: "22222222-2222-4222-8222-222222222222",
        organization_id: "33333333-3333-4333-8333-333333333333",
        scopes: ["mcp:read"],
        revoked_at: null,
        expires_at: null,
        created_by: USUARIO.id,
        organizations: { status: "active" },
      };
      return String(req.headers.accept).includes("vnd.pgrst.object")
        ? json(200, linha)
        : json(200, [linha]);
    }
    if (caminho.startsWith("/rest/v1/rpc/")) return json(200, null);
    if (caminho.startsWith("/rest/v1/")) {
      // Tabelas e RPCs: vazio. O que importa aqui é quantas vezes o GoTrue é visto.
      return String(req.headers.accept).includes("vnd.pgrst.object") ? json(200, null) : json(200, []);
    }
    chamadas.outras.push(caminho);
    return json(404, {});
  });
  return new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
}

// ─── a "requisição atual" que next/headers enxerga ────────────────────────────
const atual: { cookies: Map<string, string>; headers: Headers } = {
  cookies: new Map(),
  headers: new Headers(),
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...atual.cookies].map(([name, value]) => ({ name, value })),
    get: (name: string) => (atual.cookies.has(name) ? { name, value: atual.cookies.get(name) } : undefined),
    set: () => {},
  }),
  headers: async () => atual.headers,
}));
vi.mock("next/navigation", () => ({
  redirect: (alvo: string) => {
    throw new Error(`redirect:${alvo}`);
  },
}));

function cookieDeSessao(token: string): string {
  const sessao = {
    access_token: token,
    refresh_token: "refresh-de-teste",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: USUARIO,
  };
  return "base64-" + Buffer.from(JSON.stringify(sessao)).toString("base64url");
}

type Modulos = {
  proxy: (req: NextRequest) => Promise<Response>;
  loadAuthUser: () => Promise<unknown>;
  isMfaEnrolled: () => Promise<boolean>;
  GET_token: (req: NextRequest) => Promise<Response>;
  GET_contatos: (req: NextRequest) => Promise<Response>;
  CABECALHO_SESSAO: string;
  assinarSessao: (u: unknown, agora?: number) => Promise<string>;
  lerSessaoRepassada: (v: string | null, agora?: number) => Promise<unknown>;
};
let m: Modulos;

beforeAll(async () => {
  await iniciarServidorFalso();
  urlFalsa = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.NEXT_PUBLIC_SUPABASE_URL = urlFalsa;
  process.env.SUPABASE_SERVER_URL = urlFalsa;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-de-teste-com-tamanho-suficiente";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.resetModules();
  const sessao = await import("@/lib/auth/sessao-repassada");
  const auth = await import("@/lib/auth/server");
  m = {
    proxy: (await import("../../proxy")).proxy,
    loadAuthUser: auth.loadAuthUser,
    isMfaEnrolled: auth.isMfaEnrolled,
    GET_token: (await import("@/app/api/v1/auth/realtime-token/route")).GET,
    GET_contatos: (await import("@/app/api/v1/contacts/route")).GET as Modulos["GET_contatos"],
    CABECALHO_SESSAO: sessao.CABECALHO_SESSAO,
    assinarSessao: sessao.assinarSessao as Modulos["assinarSessao"],
    lerSessaoRepassada: sessao.lerSessaoRepassada as Modulos["lerSessaoRepassada"],
  };
});

afterAll(async () => {
  await new Promise((ok) => servidor.close(ok));
});

beforeEach(() => {
  chamadas.user = 0;
  chamadas.outras = [];
  atrasoDoUserMs = 0;
  atual.cookies = new Map();
  atual.headers = new Headers();
});

/**
 * Faz o que o Next faz: roda o proxy e, se ele deixou a requisição seguir, monta
 * a requisição que o resto do app enxerga a partir de `x-middleware-request-*`.
 */
async function viaProxy(
  caminho: string,
  init: { cookie?: string; headers?: Record<string, string> } = {},
): Promise<{ resposta: Response; seguiu: boolean }> {
  const headers = new Headers({ host: "localhost:3000", ...(init.headers ?? {}) });
  if (init.cookie) headers.set("cookie", `sb-zapsales-auth=${init.cookie}`);
  const resposta = await m.proxy(new NextRequest(`http://localhost:3000${caminho}`, { headers }));

  const lista = resposta.headers.get("x-middleware-override-headers");
  if (!lista) return { resposta, seguiu: false };
  const a_jusante = new Headers();
  for (const nome of lista.split(",")) {
    const valor = resposta.headers.get(`x-middleware-request-${nome}`);
    if (valor !== null) a_jusante.set(nome, valor);
  }
  atual.headers = a_jusante;
  atual.cookies = new Map(
    (a_jusante.get("cookie") ?? "")
      .split(/;\s*/)
      .filter(Boolean)
      .map((par) => [par.slice(0, par.indexOf("=")), par.slice(par.indexOf("=") + 1)]),
  );
  return { resposta, seguiu: true };
}

describe("requisição logada: uma validação de usuário no GoTrue", () => {
  it("página do dashboard: proxy + o que o layout usa para auth = 1 chamada", async () => {
    const { resposta, seguiu } = await viaProxy("/app/inbox", {
      cookie: cookieDeSessao(SENHA_DO_TOKEN),
    });
    expect(seguiu).toBe(true);
    expect(resposta.status).toBe(200);

    // O que `app/app/layout.tsx` consulta de identidade: o usuário e a MFA.
    const user = (await m.loadAuthUser()) as { id: string } | null;
    expect(user?.id).toBe(USUARIO.id);
    await m.isMfaEnrolled(); // `listFactors` → `getUser()` por dentro do auth-js

    expect(chamadas.user).toBe(1);
  });

  it("rota de API por cookie: proxy + handler = 1 chamada", async () => {
    const { seguiu } = await viaProxy("/api/v1/auth/realtime-token", {
      cookie: cookieDeSessao(SENHA_DO_TOKEN),
    });
    expect(seguiu).toBe(true);

    const res = await m.GET_token(new NextRequest("http://localhost:3000/api/v1/auth/realtime-token"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { access_token: string } }).data.access_token).toBe(
      SENHA_DO_TOKEN,
    );
    expect(chamadas.user).toBe(1);
  });

  it("rota de API por token zps_: responde e não faz chamada de sessão de cookie", async () => {
    const bearer = `Bearer zps_${"a".repeat(40)}`;
    const { seguiu } = await viaProxy("/api/v1/contacts", { headers: { authorization: bearer } });
    expect(seguiu).toBe(true);

    const res = await m.GET_contatos(
      new NextRequest("http://localhost:3000/api/v1/contacts", { headers: { authorization: bearer } }),
    );
    expect(res.status).toBe(200);
    expect(chamadas.user).toBe(0);
  });
});

describe("o cabeçalho de identidade não se forja", () => {
  it("valor forjado de fora, sem sessão: o proxy trata como requisição sem sessão (401)", async () => {
    // Um valor bem formado, mas fabricado por quem não tem a chave do servidor.
    const corpo = Buffer.from(
      JSON.stringify({ u: USUARIO, e: Date.now() + 60_000 }),
    ).toString("base64url");
    const forjado = `${corpo}.${Buffer.from("assinatura-falsa").toString("base64url")}`;

    const { resposta, seguiu } = await viaProxy("/api/v1/auth/realtime-token", {
      headers: { [m.CABECALHO_SESSAO]: forjado },
    });
    expect(seguiu).toBe(false);
    expect(resposta.status).toBe(401);
    expect(chamadas.user).toBe(0);
  });

  it("onde o proxy NÃO alcança (upload grande), o valor forjado é ignorado pela rota", async () => {
    const corpo = Buffer.from(
      JSON.stringify({ u: USUARIO, e: Date.now() + 60_000 }),
    ).toString("base64url");
    // Sem passar pelo proxy: a requisição chega à rota com o cabeçalho de fora.
    atual.headers = new Headers({
      [m.CABECALHO_SESSAO]: `${corpo}.${Buffer.from("assinatura-falsa").toString("base64url")}`,
    });
    const res = await m.GET_token(new NextRequest("http://localhost:3000/api/v1/auth/realtime-token"));
    expect(res.status).toBe(401);
  });

  it("valor assinado mas adulterado ou vencido não vale", async () => {
    const valido = await m.assinarSessao(USUARIO, 1_000);
    expect(await m.lerSessaoRepassada(valido, 1_000)).toMatchObject({ id: USUARIO.id });
    // vencido
    expect(await m.lerSessaoRepassada(valido, 1_000 + 10 * 60_000)).toBeNull();
    // adulterado: troca o id dentro do corpo e mantém a assinatura
    const [corpo, assinatura] = valido.split(".") as [string, string];
    const outro = Buffer.from(
      Buffer.from(corpo, "base64url").toString().replace(USUARIO.id, "99999999-9999-4999-8999-999999999999"),
    ).toString("base64url");
    expect(await m.lerSessaoRepassada(`${outro}.${assinatura}`, 1_000)).toBeNull();
    expect(await m.lerSessaoRepassada("lixo", 1_000)).toBeNull();
    expect(await m.lerSessaoRepassada(null, 1_000)).toBeNull();
  });
});

describe("identidade que muda dentro da requisição", () => {
  it("signOut num cliente tira o repasse dos outros: o getUser seguinte vai ao GoTrue", async () => {
    await viaProxy("/api/v1/auth/realtime-token", { cookie: cookieDeSessao(SENHA_DO_TOKEN) });
    const { createClient } = await import("@/lib/supabase/server");
    const a = await createClient();
    const b = await createClient();
    await b.auth.getUser();
    expect(chamadas.user).toBe(1); // só a do proxy
    await a.auth.signOut();
    await b.auth.getUser();
    expect(chamadas.user).toBe(2); // voltou a perguntar
  });
});

describe("tempo por etapa e guardas", () => {
  it("resposta logada traz Server-Timing com proxy e auth; a anônima não precisa", async () => {
    const logada = await viaProxy("/app/inbox", { cookie: cookieDeSessao(SENHA_DO_TOKEN) });
    expect(logada.resposta.headers.get("server-timing")).toMatch(
      /^proxy;dur=\d+(\.\d+)?, auth;dur=\d+(\.\d+)?$/,
    );

    const anonima = await viaProxy("/login");
    expect(anonima.resposta.headers.get("server-timing")).toBeNull();
  });

  it("sem sessão: página redireciona ao login e API responde 401 JSON — como antes", async () => {
    const pagina = await viaProxy("/app/inbox?aba=1");
    expect(pagina.resposta.status).toBe(307);
    expect(pagina.resposta.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fapp%2Finbox%3Faba%3D1",
    );

    const api = await viaProxy("/api/v1/auth/realtime-token");
    expect(api.resposta.status).toBe(401);
    expect(await api.resposta.json()).toMatchObject({ error: { code: "unauthenticated" } });
  });

  it("token inválido no cookie: o GoTrue recusa uma vez e o proxy manda ao login", async () => {
    const r = await viaProxy("/app/inbox", { cookie: cookieDeSessao("token-revogado") });
    expect(r.resposta.status).toBe(307);
    expect(chamadas.user).toBe(1);
  });
});

describe("rajada: requisições simultâneas da mesma sessão (Inbox abre ~15 de uma vez)", () => {
  it("15 chamadas de API ao mesmo tempo com o mesmo token = 1 ida ao GoTrue, e todas passam", async () => {
    atrasoDoUserMs = 80; // o GoTrue real leva 100+ ms; sem demora não há sobreposição
    const cookie = cookieDeSessao(SENHA_DO_TOKEN);
    const rotas = Array.from({ length: 15 }, (_, i) => `/api/v1/conversations?i=${i}`);
    const resultados = await Promise.all(rotas.map((r) => viaProxy(r, { cookie })));
    expect(resultados.every((r) => r.seguiu)).toBe(true);
    expect(chamadas.user).toBe(1);
  });

  it("não guarda resultado: depois que a ida termina, a requisição seguinte pergunta de novo", async () => {
    const cookie = cookieDeSessao(SENHA_DO_TOKEN);
    await viaProxy("/api/v1/conversations", { cookie });
    await viaProxy("/api/v1/conversations", { cookie });
    expect(chamadas.user).toBe(2);
  });

  it("sessões diferentes ao mesmo tempo NÃO compartilham: o token inválido continua 401", async () => {
    atrasoDoUserMs = 80;
    const [boa, ruim] = await Promise.all([
      viaProxy("/api/v1/conversations", { cookie: cookieDeSessao(SENHA_DO_TOKEN) }),
      viaProxy("/api/v1/conversations", { cookie: cookieDeSessao("token-invalido") }),
    ]);
    expect(boa.seguiu).toBe(true);
    expect(ruim.seguiu).toBe(false);
    expect(ruim.resposta.status).toBe(401);
    expect(chamadas.user).toBe(2);
  });
});
