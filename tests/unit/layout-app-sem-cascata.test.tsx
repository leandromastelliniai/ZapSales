/**
 * O LAYOUT DE `/app` NÃO FAZ CASCATA DE CONSULTAS (issue #65, parte 2 de 3 da #63).
 *
 * Duas propriedades, e as duas são medidas EXECUTANDO o `AppLayout`:
 *
 *  1. Tudo que depende só da organização ativa — a linha da organização, as
 *     conexões caídas, o cadastro e a exigência de MFA, os módulos, a marca da
 *     instalação, o tema de extensão e o cookie da barra lateral — é DISPARADO
 *     antes de qualquer uma delas terminar. O custo do layout passa a ser o da
 *     mais lenta, e não a soma.
 *  2. Os destinos não mudaram: sessão ausente, acesso revogado, organização
 *     suspensa, onboarding pendente e o portão de MFA decidem exatamente como
 *     antes. Paralelizar não pode mover uma guarda.
 *
 * O que NÃO é paralelo, por dependência real: a organização ativa depende do
 * usuário, e a checagem de revogação depende de NÃO haver organização ativa.
 */
import type { ReactElement, ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Adiavel<T> = { promessa: Promise<T>; resolver: (v: T) => void };
function adiavel<T>(): Adiavel<T> {
  let resolver!: (v: T) => void;
  const promessa = new Promise<T>((r) => {
    resolver = r;
  });
  return { promessa, resolver };
}

const estado = vi.hoisted(() => ({
  usuario: null as unknown,
  org: null as unknown,
  revogado: false,
  linha: null as unknown,
  mfaExigido: false,
  temaFalha: false,
  // Quando preenchido, cada leitura espera o seu adiável (modo concorrência).
  esperas: null as null | Record<string, Promise<unknown>>,
  iniciadas: [] as string[],
}));

async function esperar<T>(nome: string, valor: T): Promise<T> {
  estado.iniciadas.push(nome);
  if (estado.esperas?.[nome]) await estado.esperas[nome];
  return valor;
}

const adminClient = {
  from: (tabela: string) => {
    if (tabela === "organizations") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => esperar("organizacao", { data: estado.linha, error: null }),
          }),
        }),
      };
    }
    // organization_extensions (tema): .select().eq().eq().limit()
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: async () => {
              estado.iniciadas.push("tema");
              if (estado.esperas?.tema) await estado.esperas.tema;
              if (estado.temaFalha) throw new Error("tabela ausente");
              return { data: [], error: null };
            },
          }),
        }),
      }),
    };
  },
};

vi.mock("@/lib/channels/health", () => ({
  listarConexoesCaidas: () => esperar("conexoes", []),
}));
const avisos = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => void avisos.push(a), info: () => {}, error: () => {}, debug: () => {} },
}));
vi.mock("@/lib/instalacao/modulos", () => ({ modulosLigados: () => esperar("modulos", []) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminClient }));
vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => estado.usuario,
  resolveActiveOrg: async () => estado.org,
  isMfaEnrolled: () => esperar("cadastro-mfa", true),
  requiresMfa: () => esperar("exigencia-mfa", estado.mfaExigido),
}));
vi.mock("@/lib/auth/vinculo-revogado", () => ({ acessoFoiRevogado: async () => estado.revogado }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect:${destino}`);
  },
}));
vi.mock("next/headers", () => ({
  cookies: () => esperar("cookies", { get: () => undefined }),
}));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: () => esperar("marca", {}) }));
vi.mock("@/lib/branding/organizacao", () => ({
  resolverMarcaDaOrganizacao: () => ({
    name: "ZapSales",
    logoUrl: null,
    cor: "#000000",
    origens: { nome: "instalacao", logoUrl: "instalacao", cor: "instalacao" },
  }),
}));

const USUARIO = {
  id: "user-1",
  idioma: "pt-BR",
  is_platform_admin: false,
  support: null,
  organizations: [],
};

function achar(no: ReactNode, alvo: unknown): ReactElement | null {
  if (!no || typeof no !== "object") return null;
  if (Array.isArray(no)) {
    for (const filho of no) {
      const achado = achar(filho as ReactNode, alvo);
      if (achado) return achado;
    }
    return null;
  }
  const elemento = no as ReactElement<{ children?: ReactNode }>;
  if (elemento.type === alvo) return elemento;
  return achar(elemento.props?.children, alvo);
}

async function soltarMicrotarefas() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

// A importação fria do layout (árvore grande de módulos) custa segundos e, sob
// carga, estourava o prazo do PRIMEIRO caso — deixando um render pendurado que
// contaminava o seguinte. Importar uma vez, aqui, mede só o comportamento.
let AppLayout: typeof import("@/app/app/layout").default;
let MfaEnrollGate: typeof import("@/components/auth/MfaEnrollGate").MfaEnrollGate;
beforeAll(async () => {
  AppLayout = (await import("@/app/app/layout")).default;
  MfaEnrollGate = (await import("@/components/auth/MfaEnrollGate")).MfaEnrollGate;
}, 120_000);

beforeEach(() => {
  estado.usuario = USUARIO;
  estado.org = { orgId: "org-1", role: "admin", interface_settings: null };
  estado.revogado = false;
  estado.linha = { onboarded_at: "2026-01-01", status: "active", settings: null };
  estado.mfaExigido = false;
  estado.temaFalha = false;
  estado.esperas = null;
  estado.iniciadas = [];
  avisos.length = 0;
});

describe("layout de /app — consultas independentes em paralelo", () => {
  it("dispara todas as leituras da organização ativa antes de qualquer uma terminar", async () => {
    const nomes = [
      "organizacao",
      "conexoes",
      "cadastro-mfa",
      "exigencia-mfa",
      "modulos",
      "marca",
      "tema",
      "cookies",
    ];
    const portas = new Map(nomes.map((n) => [n, adiavel<void>()]));
    estado.esperas = Object.fromEntries(nomes.map((n) => [n, portas.get(n)!.promessa]));

    const render = AppLayout({ children: null });
    await soltarMicrotarefas();

    // Nenhuma terminou (todas seguram), e MESMO ASSIM todas já começaram.
    expect([...estado.iniciadas].sort()).toEqual([...nomes].sort());

    for (const n of nomes) portas.get(n)!.resolver();
    await expect(render).resolves.toBeTruthy();
  });

  it("sem organização ativa, MFA e cookie também correm juntos", async () => {
    estado.org = null;
    const nomes = ["cadastro-mfa", "exigencia-mfa", "cookies"];
    const portas = new Map(nomes.map((n) => [n, adiavel<void>()]));
    estado.esperas = Object.fromEntries(nomes.map((n) => [n, portas.get(n)!.promessa]));

    const render = AppLayout({ children: null });
    await soltarMicrotarefas();

    expect([...estado.iniciadas].sort()).toEqual([...nomes].sort());
    for (const n of nomes) portas.get(n)!.resolver();
    await expect(render).resolves.toBeTruthy();
  });
});

describe("layout de /app — guardas e redirecionamentos idênticos", () => {
  it("sessão ausente vai para /login e não consulta nada", async () => {
    estado.usuario = null;
    await expect(AppLayout({ children: null })).rejects.toThrow("redirect:/login");
    expect(estado.iniciadas).toEqual([]);
  });

  it("acesso revogado (sem organização ativa) vai para /acesso-revogado", async () => {
    estado.org = null;
    estado.revogado = true;
    await expect(AppLayout({ children: null })).rejects.toThrow("redirect:/acesso-revogado");
  });

  it("revogação não é consultada para sessão de suporte", async () => {
    estado.org = null;
    estado.revogado = true;
    estado.usuario = { ...USUARIO, support: { organization_id: "org-1", name: "X", expires_at: "", access_mode: "full" } };
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("organização suspensa vai para /account-suspended", async () => {
    estado.linha = { onboarded_at: "2026-01-01", status: "suspended", settings: null };
    await expect(AppLayout({ children: null })).rejects.toThrow("redirect:/account-suspended");
  });

  it("onboarding pendente vai para /onboarding, exceto em suporte", async () => {
    estado.linha = { onboarded_at: null, status: "active", settings: null };
    await expect(AppLayout({ children: null })).rejects.toThrow("redirect:/onboarding");

    estado.usuario = { ...USUARIO, support: { organization_id: "org-1", name: "X", expires_at: "", access_mode: "full" } };
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("MFA em dívida envolve a casca no portão; sem dívida, não", async () => {

    estado.mfaExigido = true;
    const comPortao = (await AppLayout({ children: null })) as ReactElement;
    expect(achar(comPortao, MfaEnrollGate)).not.toBeNull();

    estado.mfaExigido = false;
    const semPortao = (await AppLayout({ children: null })) as ReactElement;
    expect(achar(semPortao, MfaEnrollGate)).toBeNull();
  });

  it("tema de extensão que falha NUNCA derruba a casca", async () => {
    estado.temaFalha = true;
    await expect(AppLayout({ children: null })).resolves.toBeTruthy();
  });

  it("leitura da organização que falha ainda lança, mesmo com o tema em voo", async () => {
    estado.linha = null;
    // `esperar` devolve erro nulo; força o erro trocando a linha por um erro explícito
    const antigo = adminClient.from;
    adminClient.from = (t: string) =>
      t === "organizations"
        ? ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "reset" } }) }) }) } as never)
        : antigo(t);
    try {
      await expect(AppLayout({ children: null })).rejects.toThrow(/organizacao_ilegivel/);
    } finally {
      adminClient.from = antigo;
    }
  });
});

describe("layout de /app — tempo da etapa no log do servidor", () => {
  it("navegação rápida não gera linha de log", async () => {
    await AppLayout({ children: null });
    expect(avisos).toEqual([]);
  });

  it("navegação lenta registra etapa e duração, sem dado do usuário", async () => {
    const porta = adiavel<void>();
    estado.esperas = { organizacao: porta.promessa };
    const agora = vi.spyOn(performance, "now");
    agora.mockReturnValueOnce(0).mockReturnValue(450);
    const render = AppLayout({ children: null });
    await soltarMicrotarefas();
    porta.resolver();
    await render;
    agora.mockRestore();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]?.[1]).toEqual({ etapa: "layout", dur_ms: 450 });
  });
});
