/**
 * O CAMINHO DE ENVIO PELO HANDLER — não pelo adapter.
 *
 * `sendMessageHandler` é a ÚNICA porta de saída do sistema (UI, automação, MCP
 * e o agente entram todos aqui). O que o adapter devolve e o que a linha de
 * `messages` acaba dizendo são duas coisas — e é a segunda que o operador vê
 * na tela.
 *
 * ## 1. A coluna do select, que se perde sem barulho
 *
 * O `select` da conversa é uma **string** consumida por `as unknown as Joined`:
 * apagar uma coluna dela não gera erro de tipo, e o valor simplesmente volta
 * `undefined` em runtime. Aqui o dublê de Supabase **projeta a linha pelo
 * `select` que o handler pediu** — coluna que não está no `select` não chega,
 * igual ao PostgREST. Assim o que se prova é o elo, não a grafia dele. (A
 * não-vacuidade do projetor tem caso próprio.)
 *
 * ## 2. Nenhum desfecho pode dizer `sent` sem nada ter saído
 *
 * `sent` é o que a Central mostra como entregue ao canal. Com credencial
 * ausente, o contrato antigo de "canal não conectado" era devolver
 * `{ externalId: null }` sem tocar a rede, e o handler, que só olha se houve
 * exceção, gravava `sent`. O canal oficial trocou esse contrato por LANÇAR
 * `meta_not_configured` (#674), e quem decide passou a ser o `send` (async),
 * porque o pre-check síncrono não alcança o banco — onde a credencial de quem
 * conectou pela tela mora. Este arquivo cobre os dois lados: o envio que SAI
 * com a credencial da sessão e a fila com motivo nomeado quando não há
 * credencial nenhuma.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import {
  colunasDoEmbed,
  colunasDoSelect,
  criarDubleDoHandler,
  projetar,
} from "@/tests/helpers/duble-do-handler";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

// O admin client é usado para assinar mídia e para resolver a credencial de
// sessão. Aqui a sessão NUNCA tem credencial gravada (é o estado de quem só
// configurou env), então o `select` devolve linha vazia.
/**
 * O estado da credencial de sessão que a resolução encontra no "banco".
 *
 * - `token` → instalação de uma organização só (quem conectou pela tela e não
 *   escreveu `.env`);
 * - `porOrg` → busca filtrada por organização (#236): a chave é
 *   `organization_id|phone_number_id`, e cada tenant tem o SEU cifrado e o SEU
 *   token — é o que prova que cada organização envia pelo token dela;
 * - `erro` → falha de consulta (PGRST116 etc.);
 * - `decifravel: false` → a decifra devolve null (GUC da chave ausente).
 */
const credencialDaSessao: {
  token: string | null;
  porOrg: Record<string, { cifrado: string; token: string }> | null;
  erro: { code?: string; message?: string } | null;
  decifravel: boolean;
} = { token: null, porOrg: null, erro: null, decifravel: true };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => ({
          data: { signedUrl: "https://signed.example/a.jpg" },
          error: null,
        }),
      }),
    },
    // Cadeia ENCADEÁVEL: a resolução por sessão filtra `organization_id`, o
    // identificador do provider E `archived_at is null` (issue #236 /
    // migration 0165). Um stub em que `eq()` já entrega `maybeSingle` deixa de
    // casar com o código real — e mock que não casa testa o mock.
    from: () => {
      const filtros: Record<string, unknown> = {};
      const alvo: Record<string, unknown> = {
        maybeSingle: async () => {
          if (credencialDaSessao.erro) return { data: null, error: credencialDaSessao.erro };
          const chave = `${filtros.organization_id ?? ""}|${filtros.meta_phone_number_id ?? ""}`;
          const daOrg = credencialDaSessao.porOrg?.[chave];
          const cifrado = credencialDaSessao.porOrg
            ? (daOrg?.cifrado ?? null)
            : credencialDaSessao.token
              ? "\\xdeadbeef"
              : null;
          return {
            data: cifrado
              ? {
                  meta_phone_number_id: String(filtros.meta_phone_number_id ?? "pn"),
                  meta_token_encrypted: cifrado,
                }
              : null,
            error: null,
          };
        },
      };
      alvo.select = () => alvo;
      alvo.eq = (col: string, val: unknown) => {
        filtros[col] = val;
        return alvo;
      };
      alvo.is = () => alvo;
      return alvo;
    },
    rpc: async (nome: string, args: { ciphertext?: string }) => {
      if (nome !== "fn_decrypt_oauth" || !credencialDaSessao.decifravel) {
        return { data: null, error: null };
      }
      const cifrado = String(args?.ciphertext ?? "");
      const daOrg = Object.values(credencialDaSessao.porOrg ?? {}).find((s) => s.cifrado === cifrado);
      return {
        data: daOrg?.token ?? (credencialDaSessao.porOrg ? null : credencialDaSessao.token),
        error: null,
      };
    },
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

type Row = Record<string, unknown>;


interface Forma {
  provider?: string;
  /** Canal excluído pela tela (migration 0106) — comporta o ramo `channel_archived`. */
  archivedAt?: string | null;
}

function conversaCompleta(forma: Forma = {}): Row {
  const provider = forma.provider ?? "meta_cloud";
  return {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    contacts: { phone_number: "+595991733685", wa_identity: null, wa_lid: "999888", is_blocked: false },
    channel_sessions: {
      provider,
      waha_session_name: provider === "waha" ? "default" : null,
      meta_phone_number_id: provider === "meta_cloud" ? "1103328999528818" : null,
      status: "WORKING",
      archived_at: forma.archivedAt ?? null,
    },
  };
}

/**
 * O dublê é o COMPARTILHADO (`tests/helpers/duble-do-handler.ts`), LIGADO EM
 * `projetarConversa`: ele honra o `select` como o PostgREST — coluna que não
 * foi pedida não chega —, que é o elo que este arquivo prova. As capturas que
 * os casos leem (`estado.*`) são as do helper, lidas ao vivo.
 */
function dubleDe(linhaCompleta: Row, espelhoDoModelo: Row | null = null) {
  const { supabase, capturas } = criarDubleDoHandler({
    conversation: linhaCompleta,
    templateRow: espelhoDoModelo,
    projetarConversa: true,
  });
  const estado = {
    get selects() {
      return capturas.selects.conversations!;
    },
    get message() {
      return capturas.inserts.messages!.at(-1) ?? null;
    },
    get contactPatch() {
      return capturas.patches.contacts!.at(-1) ?? null;
    },
    get contactFilters() {
      return Object.fromEntries(
        (capturas.filtros.contacts ?? []).map((f) => [f.coluna, f.valor]),
      );
    },
  };
  return { supabase, estado };
}

const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: USER },
  requestId: "req-1",
};
const texto = (over: Partial<SendMessageInput> = {}): SendMessageInput =>
  ({ conversation_id: CONV, type: "text", body: "oi", ...over }) as SendMessageInput;

/** Resposta da Graph API (canal oficial): o id vem em `messages[0].id`. */
function respostaMeta(messageId = "wamid.M") {
  return vi.fn(async (..._args: unknown[]) => ({
    ok: true,
    status: 200,
    json: async () => ({ messages: [{ id: messageId }] }),
  }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  credencialDaSessao.token = null;
  credencialDaSessao.porOrg = null;
  credencialDaSessao.erro = null;
  credencialDaSessao.decifravel = true;
});

describe("o projetor do dublê é discriminante (guarda de vacuidade)", () => {
  it("coluna fora do select não chega — sem isto, todo caso abaixo passaria por acidente", () => {
    const linha = conversaCompleta();
    expect(projetar(linha, "id, group_chat_id, is_group")).toHaveProperty("is_group");
    expect(projetar(linha, "id, group_chat_id")).not.toHaveProperty("is_group");
  });

  /**
   * O `wa_lid` no embed de contatos NÃO tinha guarda nenhuma — medido nesta
   * árvore: removê-lo do `select` passa `pnpm typecheck` (a linha é consumida por
   * `conv as unknown as Joined`, então o compilador não a vê) e passa a suíte unit
   * INTEIRA: 2199 casos, exit 0.
   *
   * Afere que a coluna foi PEDIDA, não onde ela aparece: reordenar o `select`
   * continua verde, apagar a coluna fica vermelho.
   */
  it("o embed de contatos pede `wa_lid` — sem ele o contato @lid perde a correlação", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ key: { id: "LID1" } })));
    const { supabase, estado } = dubleDe(conversaCompleta({ provider: "waha" }));
    await sendMessageHandler(supabase, ctx, texto());
    expect(estado.selects.length, "guarda de vacuidade: o handler consultou a conversa").toBeGreaterThan(0);
    expect(estado.selects.every((sel) => colunasDoEmbed(sel, "contacts").includes("wa_lid"))).toBe(
      true,
    );
  });

  it("embed entra pelo APELIDO, como o PostgREST devolve", () => {
    expect(colunasDoSelect("id, contacts:contact_id(phone_number, wa_identity), status")).toEqual([
      "id",
      "contacts",
      "status",
    ]);
  });
});

describe("nenhum desfecho diz `sent` sem nada ter saído", () => {
  it("o canal oficial com env incompleto fica `queued`, com o motivo nomeado", async () => {
    // Desde a #674 a decisão de elegibilidade é do `send` (o pre-check síncrono
    // não alcança o banco): ele resolve a sessão, cai no env e, sem credencial
    // nenhuma, LANÇA — o handler traduz o prefixo para `queued` com motivo.
    vi.stubEnv("META_PHONE_NUMBER_ID", "");
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "tok");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("queued");
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe("meta_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * A promessa da TELA de conexão, do lado do handler (issue #674): quem conectou
 * o número oficial pela Central de Conexões guarda a credencial cifrada no
 * banco — e o envio tem de SAIR, sem `.env`. O pre-check síncrono respondia
 * "não configurado" para essa instalação e a mensagem morria em fila, sem erro,
 * sem nunca tentar.
 */
describe("canal oficial conectado pela TELA — a credencial da sessão manda (#674)", () => {
  it("sessão válida SEM ambiente: a mensagem SAI, com o token da sessão", async () => {
    credencialDaSessao.token = "tok-da-sessao";
    const fetchMock = respostaMeta("wamid.M1");
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("sent");
    expect(msg.external_id).toBe("wamid.M1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/1103328999528818/messages");
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer tok-da-sessao");
  });

  it("sessão ausente e sem ambiente: `queued` com `meta_not_configured`, nada na rede", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("queued");
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe("meta_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de CONSULTA fecha a ação com o código — não engole em `sent`", async () => {
    // Doutrina da #236: resolução que falha fecha a ação e abre a informação.
    credencialDaSessao.erro = { code: "PGRST116", message: "duas linhas casaram" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("failed");
    expect(msg.error_code).toBe("meta_error");
    expect(String(msg.error_message)).toMatch(/meta_creds_lookup_failed/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decifragem que falha e sem env: `queued` — canal não conectado é recuperável", async () => {
    credencialDaSessao.token = "cifrado-existe";
    credencialDaSessao.decifravel = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("queued");
    expect((msg.metadata as Record<string, unknown>).queued_reason).toBe("meta_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sessão ARQUIVADA: `failed` com `channel_archived`, sem consultar credencial", async () => {
    credencialDaSessao.token = "tok-que-nao-deve-ser-usado";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(
      conversaCompleta({ provider: "meta_cloud", archivedAt: "2026-08-01T00:00:00.000Z" }),
    );
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("failed");
    expect(msg.error_code).toBe("channel_archived");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("duas organizações: cada envio sai com o token do SEU tenant", async () => {
    const OUTRA = "99999999-9999-4999-8999-999999999999";
    credencialDaSessao.porOrg = {
      [`${ORG}|1103328999528818`]: { cifrado: "\\xaa", token: "tok-A" },
      [`${OUTRA}|1103328999528818`]: { cifrado: "\\xbb", token: "tok-B" },
    };
    const fetchMock = respostaMeta("wamid.T");
    vi.stubGlobal("fetch", fetchMock);

    const { supabase: sbA } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    await sendMessageHandler(sbA, ctx, texto());
    const { supabase: sbB } = dubleDe(conversaCompleta({ provider: "meta_cloud" }));
    await sendMessageHandler(sbB, { ...ctx, organization_id: OUTRA }, texto());

    const auth = fetchMock.mock.calls.map(
      (c) => (c[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(auth).toEqual(["Bearer tok-A", "Bearer tok-B"]);
  });
});

/**
 * O MODELO do canal oficial, pelo HANDLER (fatia F4 da #850, PR #863).
 *
 * `sendTemplateForSession` resolve a credencial pelo par (organização, número
 * DESTA conexão) — e o número chega do handler, em `sessionRef`. A suíte do PR
 * prova a função com o número entregue na mão; nenhum caso atravessava o call
 * site. Medido na revisão do PR: trocar o `sessionRef` do handler por `""`
 * deixava 19 arquivos / 209 casos verdes. O efeito é o defeito que a fatia
 * fecha, de volta pela porta dos fundos: sem número, a resolução não casa
 * linha nenhuma e o modelo sai pelo `.env`.
 *
 * Por isso o ambiente deste caso tem OUTRO número e OUTRO token, de propósito:
 * é a instalação em que a regressão não se anuncia — o modelo sai, a linha
 * diz `sent`, e só o endereço e a autorização da chamada denunciam o número
 * errado. É isso que o caso afere.
 */
describe("o MODELO do canal oficial sai pela credencial da sessão, não pelo .env (#863)", () => {
  const NUMERO_DA_SESSAO = "1103328999528818";
  const NUMERO_DO_ENV = "999000999000";

  const espelho: Row = {
    name: "boas_vindas",
    language: "pt_BR",
    status: "APPROVED",
    contract_hash: "hash-do-espelho",
    components: [{ type: "BODY", text: "Olá, {{1}}! Seu atendimento está aberto." }],
  };

  it("credencial só na sessão e .env com outro número: a Graph recebe o número e o token da SESSÃO", async () => {
    credencialDaSessao.porOrg = {
      [`${ORG}|${NUMERO_DA_SESSAO}`]: { cifrado: "\\xsessao", token: "tok-da-sessao" },
    };
    vi.stubEnv("META_PHONE_NUMBER_ID", NUMERO_DO_ENV);
    vi.stubEnv("META_SYSTEM_USER_TOKEN", "tok-do-env");
    const fetchMock = respostaMeta("wamid.MODELO");
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(conversaCompleta({ provider: "meta_cloud" }), espelho);
    const msg = await sendMessageHandler(
      supabase,
      ctx,
      texto({
        type: "template",
        body: undefined,
        template_name: "boas_vindas",
        template_language: "pt_BR",
        template_values: { "1": "Ana" },
      }),
    );

    expect(msg.status).toBe("sent");
    expect(msg.external_id).toBe("wamid.MODELO");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(String(url)).toContain(`/${NUMERO_DA_SESSAO}/messages`);
    expect(String(url)).not.toContain(NUMERO_DO_ENV);
    expect(init.headers.Authorization).toBe("Bearer tok-da-sessao");
    // Guarda de vacuidade: foi o MODELO que saiu, não um texto por outro ramo.
    expect(JSON.parse(String(init.body))).toMatchObject({
      type: "template",
      template: { name: "boas_vindas", language: { code: "pt_BR" } },
    });
  });
});
