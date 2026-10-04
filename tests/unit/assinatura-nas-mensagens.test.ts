/**
 * A assinatura do emissor sai PELA CADEIA DE ENVIO (#2066) — não num teste de
 * unidade à parte.
 *
 * A casa de regras (`lib/messaging/assinatura.ts`) é pura e já tem os próprios
 * casos. O que este arquivo prende é a FIAÇÃO dentro do `sendMessageHandler`:
 * a assinatura entra SÓ no que vai ao canal (`adapter.send`, provado no corpo
 * da rede do canal por QR) e NUNCA no que fica gravado em `messages.body`.
 *
 * Três classes que só aparecem deste lado do seam:
 *
 * 1. config ligada + humano → o canal recebe `*Nome*\noi` e o banco guarda `oi`;
 * 2. config ligada + humano → desligada → o canal recebe `oi` (opt-in de verdade);
 * 3. a origem determina a assinatura: automação (webhook_source sem IA) não é
 *    assinada mesmo com config ligada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import { criarDubleDoHandler } from "@/tests/helpers/duble-do-handler";

// O nome do atendente vem de LIB/USERS — resolvedor próprio que fala com o
// GoTrue Admin API. Aqui é dublado de propósito: o que se mede é o handler
// usando o nome para assinar, não a resolução (essa já tem os seus casos).
vi.mock("@/lib/users/nome-do-atendente", () => ({
  nomesDosAtendentes: vi.fn(async () => new Map()),
}));
import { nomesDosAtendentes } from "@/lib/users/nome-do-atendente";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const CONTACT = "33333333-3333-4333-8333-333333333333";
const SESSION = "44444444-4444-4444-8444-444444444444";
const USER = "55555555-5555-4555-8555-555555555555";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
      maybeSingle: async () => ({ data: null, error: null }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const mockedNomes = vi.mocked(nomesDosAtendentes);

type Row = Record<string, unknown>;

interface Forma {
  provider?: string;
}

function conversaCompleta(forma: Forma = {}): Row {
  const provider = forma.provider ?? "waha";
  return {
    id: CONV,
    organization_id: ORG,
    contact_id: CONTACT,
    channel_session_id: SESSION,
    is_group: false,
    group_chat_id: null,
    contacts: { phone_number: "+595991733685", wa_identity: null, wa_lid: null, is_blocked: false },
    channel_sessions: {
      provider,
      waha_session_name: provider === "waha" ? "default" : null,
      meta_phone_number_id: provider === "meta_cloud" ? "1103328999528818" : null,
      status: "WORKING",
      archived_at: null,
    },
  };
}

function dubleDe(linha: Row, settings: unknown) {
  return criarDubleDoHandler({
    conversation: linha,
    organizacao: { settings, status: "active" },
  });
}

/** A mensagem que o canal por QR postou na rede (o canal é o mediador real do envio). */
function mensagemEnviadoNaRede(fetchMock: ReturnType<typeof vi.fn>): unknown {
  const envio = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/api/sendText"));
  const init = envio?.[1] as { body?: string } | undefined;
  return JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
}

const ctx: HandlerCtx = {
  organization_id: ORG,
  actor: { type: "user", id: USER },
  requestId: "req-1",
};
const texto = (over: Partial<SendMessageInput> = {}): SendMessageInput =>
  ({ conversation_id: CONV, type: "text", body: "oi", ...over }) as SendMessageInput;

function respostaOk() {
  return vi.fn(async (..._args: unknown[]) => Response.json({ key: { id: "TEXT1" } }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  mockedNomes.mockReset();
  mockedNomes.mockResolvedValue(new Map());
});

describe("a assinatura sai pela cadeia de envio, sem poluir messages.body", () => {
  it("humano com config ligada: o canal recebe `*Nome*\\noi`, o banco guarda `oi`", async () => {
    mockedNomes.mockResolvedValue(new Map([[USER, "carlos gaban"]]));
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    const fetchMock = respostaOk();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase, capturas } = dubleDe(
      conversaCompleta(),
      { assinatura_mensagens: { humanos: true, ia: false, nome_ia: "Assistente Virtual" } },
    );
    const msg = await sendMessageHandler(supabase, ctx, texto());

    expect(msg.status).toBe("sent");
    expect(mensagemEnviadoNaRede(fetchMock)).toEqual(
      expect.objectContaining({ text: "*Carlos Gaban*\noi" }),
    );
    expect(capturas.inserts.messages!.at(-1)?.["body"]).toBe("oi");
  });

  it("config desligada: o canal recebe o texto como veio (opt-in de verdade)", async () => {
    mockedNomes.mockResolvedValue(new Map([[USER, "carlos gaban"]]));
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    const fetchMock = respostaOk();
    vi.stubGlobal("fetch", fetchMock);

    const { supabase } = dubleDe(
      conversaCompleta(),
      { assinatura_mensagens: { humanos: false, ia: false, nome_ia: "Assistente Virtual" } },
    );
    await sendMessageHandler(supabase, ctx, texto());

    expect(mensagemEnviadoNaRede(fetchMock)).toEqual(expect.objectContaining({ text: "oi" }));
    expect(mockedNomes).not.toHaveBeenCalled();
  });

  it("automação não é assinada, mesmo com a config ligada", async () => {
    vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
    vi.stubEnv("WAHA_API_KEY", "hash123");
    const fetchMock = respostaOk();
    vi.stubGlobal("fetch", fetchMock);

    const automacaoCtx: HandlerCtx = {
      organization_id: ORG,
      actor: { type: "webhook_source", id: "regra-1" },
      requestId: "req-2",
    };
    const { supabase } = dubleDe(
      conversaCompleta(),
      { assinatura_mensagens: { humanos: true, ia: true, nome_ia: "Assistente Virtual" } },
    );
    await sendMessageHandler(supabase, automacaoCtx, texto());

    expect(mensagemEnviadoNaRede(fetchMock)).toEqual(expect.objectContaining({ text: "oi" }));
  });
});