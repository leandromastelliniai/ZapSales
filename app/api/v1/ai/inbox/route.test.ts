/**
 * A Central de avisos (GET) anexa o PEDIDO aos avisos de aprovação de ação externa (#95):
 * o que o agente quer executar, o estado EFETIVO (pendente vencido já é expirado) e um
 * resumo dos dados SEM segredos — nunca os dados crus. Falhar ao ler os pedidos não derruba
 * a lista (o aviso aparece sem os botões), e a consulta dos pedidos é filtrada pela
 * organização da sessão.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  admin: vi.fn(),
  destinos: vi.fn(),
  pedidos: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/inbox-destino", () => ({ resolverDestinosDosAvisos: deps.destinos }));
vi.mock("@/lib/ai/ferramentas-externas/pedidos-api", () => ({ pedidosDosAvisos: deps.pedidos }));

import { GET } from "@/app/api/v1/ai/inbox/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const PEDIDO = "22222222-2222-4222-8222-222222222222";

const item = (extra: Record<string, unknown> = {}) => ({
  id: "33333333-3333-4333-8333-333333333333",
  kind: "external_tool_approval",
  severity: "warn",
  title: "Aprovar «Criar pedido»",
  body: "O agente quer executar",
  ref_kind: "external_tool_request",
  ref_id: PEDIDO,
  status: "open",
  created_at: "2026-10-18T10:00:00Z",
  ...extra,
});

/**
 * O admin client: a rota busca a fila aberta POR CAMADA de gravidade; o dublê responde as linhas só
 * na camada `warn` (as outras voltam vazias) e o resto das cadeias (contagem) devolve o total.
 */
function adminCom(linhas: unknown[]) {
  const cadeia = () => {
    let gravidade: string | null = null;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit"]) q[m] = () => q;
    q.eq = (coluna: string, valor: string) => {
      if (coluna === "severity") gravidade = valor;
      return q;
    };
    q.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve({
        data: gravidade === null || gravidade === "warn" ? linhas : [],
        error: null,
        count: linhas.length,
      }).then(ok);
    return q;
  };
  return { from: () => cadeia() };
}

const req = () => new NextRequest("http://localhost/api/v1/ai/inbox?status=open");

beforeEach(() => {
  vi.clearAllMocks();
  deps.role.mockResolvedValue({ ok: true, user: { id: "u", idioma: "pt-BR" }, org: { orgId: ORG, role: "manager" } });
  deps.destinos.mockImplementation(async (_c, _o, _r, itens: unknown[]) =>
    itens.map((i) => ({ ...(i as object), destination: { estado: "sem_destino", orientacao: "x" } })),
  );
});

describe("GET /api/v1/ai/inbox — o pedido anexado ao aviso de aprovação", () => {
  it("anexa o pedido com o resumo SEM segredos e o estado efetivo", async () => {
    deps.admin.mockReturnValue(adminCom([item()]));
    deps.pedidos.mockResolvedValue(
      new Map([
        [
          PEDIDO,
          {
            id: PEDIDO,
            tool_name: "Criar pedido",
            effect: "altera",
            origin: "live",
            status: "pending",
            // venceu há um minuto: o cron ainda não passou, mas a tela já lê «expirada»
            expires_at: new Date(Date.now() - 60_000).toISOString(),
            arguments: { produto: "camiseta azul", senha: "xyz-segredo" },
          },
        ],
      ]),
    );
    const res = await GET(req());
    const corpo = JSON.stringify(await res.json());
    expect(deps.pedidos).toHaveBeenCalledWith(expect.anything(), ORG, [PEDIDO]);
    const { data } = JSON.parse(corpo);
    expect(data.items[0].approval).toMatchObject({
      request_id: PEDIDO,
      tool_name: "Criar pedido",
      effect: "altera",
      status: "expired",
      summary: [
        { campo: "produto", valor: "camiseta azul" },
        { campo: "senha", valor: "•••" },
      ],
    });
    // Os dados crus nunca chegam ao navegador.
    expect(corpo).not.toContain("xyz-segredo");
    expect(data.items[0].approval).not.toHaveProperty("arguments");
  });

  it("aviso de outro tipo não consulta pedido nenhum", async () => {
    deps.admin.mockReturnValue(adminCom([item({ kind: "handoff", ref_kind: "conversation" })]));
    deps.pedidos.mockResolvedValue(new Map());
    const res = await GET(req());
    expect(deps.pedidos).toHaveBeenCalledWith(expect.anything(), ORG, []);
    expect((await res.json()).data.items[0]).not.toHaveProperty("approval");
  });

  it("falha ao ler os pedidos não derruba a lista: o aviso aparece sem os botões", async () => {
    deps.admin.mockReturnValue(adminCom([item()]));
    deps.pedidos.mockRejectedValue(new Error("banco fora"));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).not.toHaveProperty("approval");
  });
});
