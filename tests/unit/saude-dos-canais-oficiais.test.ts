import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OS CANAIS OFICIAIS ERAM CEGOS À PRÓPRIA QUEDA.
 *
 * ─── O defeito ──────────────────────────────────────────────────────────────
 *
 * Só o canal por QR implementava `checkHealth`. O cron de saúde faz
 * `if (!adapter.checkHealth || !sessionRef) continue` — então a sessão oficial
 * era PULADA, sem log e sem contador, e `channel_sessions.status` só era escrito
 * no instante de conectar. Chave revogada, número suspenso ou permissão retirada
 * viravam silêncio absoluto, para sempre, com a tela dizendo "conectado".
 *
 * ─── Por que quase todo caso é sobre DISTINGUIR desfechos ───────────────────
 *
 * A tentação é devolver "caiu" sempre que algo dá errado. Só que oscilação de
 * rede virando "canal caído" ensina o operador a ignorar o aviso — e um aviso
 * ignorado é pior que nenhum, porque dá a sensação de cobertura. Por isso
 * "não sei" (`reachable: false`) é um desfecho de primeira classe, distinto de
 * "sei que caiu" (`status: FAILED`).
 */

const metaCreds = vi.fn(async () => ({ phoneNumberId: "555", token: "tok" }));

/** A organização atravessa o seam desde a issue #236. */
const ORG = "00000000-0000-4000-8000-000000000236";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) as never }));
vi.mock("@/lib/channels/meta/credentials", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveMetaCreds: (...a: unknown[]) => metaCreds(...(a as [])),
}));

function respondeCom(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  })) as unknown as typeof fetch;
}

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  metaCreds.mockClear();
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

describe("canal oficial direto", () => {
  async function saude() {
    const { metaCloudAdapter } = await import("@/lib/channels/adapters/meta-cloud");
    return metaCloudAdapter.checkHealth!({ organizationId: ORG, sessionRef: "555" });
  }

  it("número responde → está de pé", async () => {
    globalThis.fetch = respondeCom({ display_phone_number: "+595..." });
    expect(await saude()).toEqual({ reachable: true, status: "WORKING", detail: null });
  });

  it("token recusado → FAILED", async () => {
    globalThis.fetch = respondeCom({}, { status: 401 });
    expect(await saude()).toMatchObject({ reachable: true, status: "FAILED" });
  });

  it("erro no CORPO com HTTP 200 também é FAILED", async () => {
    // Comportamento real da Graph: ela devolve 200 com `error` no corpo. Olhar
    // só o status HTTP deixaria passar justamente o token vencido.
    globalThis.fetch = respondeCom({ error: { message: "Session has expired", code: 190 } });
    const r = await saude();
    expect(r.status).toBe("FAILED");
    expect(r.detail).toContain("expired");
  });

  it("rede caída é NÃO SEI", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ETIMEDOUT");
    }) as unknown as typeof fetch;
    expect(await saude()).toMatchObject({ reachable: false, status: null });
  });

  it("sessão sem credencial não vira alarme de queda", async () => {
    metaCreds.mockResolvedValue(null as never);
    expect(await saude()).toMatchObject({ reachable: false, status: null });
  });
});

/**
 * QUEM PODE FECHAR O AVISO.
 *
 * As duas fontes medem coisas diferentes: o empurrão do provedor fala do
 * NÚMERO ("suspenso"), a varredura fala da CREDENCIAL e da conta ("a chave
 * responde, a conta está na lista"). Um número suspenso continua aparecendo na
 * lista de contas — então a varredura via WORKING e resolvia, em ≤5 minutos, o
 * crítico que o empurrão tinha aberto, com o número ainda suspenso.
 *
 * Foi uma revisão adversarial que pegou isto, depois de os testes anteriores
 * passarem: nenhum deles fazia as DUAS fontes se encontrarem.
 */
describe("a varredura não fecha o que o provedor abriu", () => {
  let episodioGravado: string | null = null;
  let resolveu = false;

  function bancoCom(escalado: string | null) {
    episodioGravado = null;
    resolveu = false;
    return {
      from(tabela: string) {
        if (tabela === "channel_session_health") {
          const cadeia: Record<string, unknown> = {
            select: () => cadeia,
            eq: () => cadeia,
            maybeSingle: async () => ({ data: { escalated_status: escalado }, error: null }),
            upsert: async (linha: Record<string, unknown>) => {
              episodioGravado = (linha.escalated_status as string | null) ?? null;
              return { error: null };
            },
          };
          return cadeia;
        }
        const itens: Record<string, unknown> = {
          insert: async () => ({ error: null }),
          update: () => {
            resolveu = true;
            return itens;
          },
          eq: () => itens,
          then: (r: (v: unknown) => void) => Promise.resolve({ error: null }).then(r),
        };
        return itens;
      },
    } as never;
  }

  const DE_PE = { reachable: true, status: "WORKING", detail: null };
  const SESSAO = { id: "s-1", organization_id: "org-1", status: "WORKING" };

  it("número suspenso pelo provedor NÃO é dado como resolvido pela varredura", async () => {
    // O caso que motivou tudo: a conta segue listada, então a varredura vê
    // "WORKING" — mas ela não mediu o número.
    const { sincronizarSaudeDaConexao, PREFIXO_EMPURRAO } = await import("@/lib/channels/health");
    const db = bancoCom(`${PREFIXO_EMPURRAO}FAILED`);
    const r = await sincronizarSaudeDaConexao(db, SESSAO, DE_PE, "Comercial", "varredura");
    expect(r).toBe("sem_mudanca");
    expect(resolveu, "a varredura fechou um aviso que não podia observar").toBe(false);
  });

  it("mas o provedor dizendo que voltou FECHA", async () => {
    // A autoridade sobre o número é quem abriu. Sem este caso, o aviso viraria
    // eterno — que é o defeito que o commit anterior existia para consertar.
    const { sincronizarSaudeDaConexao, PREFIXO_EMPURRAO } = await import("@/lib/channels/health");
    const db = bancoCom(`${PREFIXO_EMPURRAO}FAILED`);
    const r = await sincronizarSaudeDaConexao(db, SESSAO, DE_PE, "Comercial", "empurrao");
    expect(r).toBe("resolvido");
    expect(resolveu).toBe(true);
  });

  it("e a varredura segue fechando o que ela mesma abriu", async () => {
    // O canal por QR depende disto: lá a varredura É a autoridade.
    const { sincronizarSaudeDaConexao } = await import("@/lib/channels/health");
    const db = bancoCom("STOPPED");
    const r = await sincronizarSaudeDaConexao(db, SESSAO, DE_PE, "Vendas", "varredura");
    expect(r).toBe("resolvido");
  });

  it("o episódio do provedor fica MARCADO — é o que permite distinguir depois", async () => {
    const { sincronizarSaudeDaConexao, PREFIXO_EMPURRAO } = await import("@/lib/channels/health");
    const db = bancoCom(null);
    await sincronizarSaudeDaConexao(
      db,
      SESSAO,
      { reachable: true, status: "FAILED", detail: null },
      "Comercial",
      "empurrao",
    );
    expect(episodioGravado).toBe(`${PREFIXO_EMPURRAO}FAILED`);
  });
});

describe("o cron enxerga todos os canais", () => {
  it("todo adapter registrado sabe responder pela própria saúde", async () => {
    // O cron pula quem não implementa, SEM log e sem contador — então um canal
    // sem este método é invisível para a Central, e a ausência não aparece em
    // lugar nenhum. Este caso existe para que o próximo canal não entre mudo.
    // A lista sai de `CHANNEL_CAPABILITIES`, que é a matriz declarada do seam:
    // canal novo entra ali por obrigação, então este caso o alcança sozinho.
    const { getAdapter, CHANNEL_CAPABILITIES } = await import("@/lib/channels");
    const mudos = Object.keys(CHANNEL_CAPABILITIES).filter(
      (p) => typeof getAdapter(p as never).checkHealth !== "function",
    );
    expect(mudos, `canais sem checkHealth: ${mudos.join(", ")}`).toEqual([]);
  });
});
