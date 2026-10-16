/**
 * A API da resposta em áudio: a chave entra cifrada e nunca volta ao browser nem
 * vai para a auditoria; só admin grava/testa/remove; ligar exige o aceite e uma
 * chave; endereço interno é recusado; e o teste diz o que fazer em cada falha.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  audit: vi.fn(),
  admin: vi.fn(),
  nota: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/audit", () => ({ audit: deps.audit }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
// O ffmpeg não é o assunto aqui (a conversão tem teste próprio) e esta máquina pode não tê-lo.
vi.mock("@/lib/ai/resposta-em-audio/nota-de-voz", () => ({ paraNotaDeVoz: deps.nota }));

import { DELETE, GET, PUT } from "@/app/api/v1/ai/audio/route";
import { POST as TESTAR } from "@/app/api/v1/ai/audio/testar/route";
import { GET as VOZES } from "@/app/api/v1/ai/audio/vozes/route";

const ORG = "11111111-1111-4111-8111-111111111111";
const EU = "22222222-2222-4222-8222-222222222222";
const CHAVE = "sk-chave-de-voz-do-cliente-6789";
const ACEITE = { em: "2026-10-15T12:00:00.000Z", por: EU };

interface Opcoes {
  settings?: Record<string, unknown>;
  /** provedor → últimos 4 */
  chaves?: Record<string, string>;
  cifra?: boolean;
  usoDoMes?: Array<Record<string, unknown>>;
}

/** Banco de mentira: settings da organização, chaves de voz e o uso em llm_calls. */
function bancoFalso(o: Opcoes = {}) {
  const estado = {
    settings: o.settings ?? {},
    chaves: { ...(o.chaves ?? {}) } as Record<string, string>,
    upserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ settings: Record<string, unknown> }>,
    apagados: [] as string[],
  };

  const admin = {
    estado,
    rpc: vi.fn(async (nome: string, args: Record<string, string>) => {
      if (nome === "fn_encrypt_oauth") {
        return o.cifra === false ? { data: null, error: { message: "sem GUC" } } : { data: `\\xENC(${(args.plaintext ?? "").length})`, error: null };
      }
      if (nome === "fn_decrypt_oauth") return { data: CHAVE, error: null };
      return { data: null, error: null };
    }),
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      let apagar = false;
      let atualizar: { settings: Record<string, unknown> } | null = null;
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (coluna: string, valor: unknown) => {
        filtros[coluna] = valor;
        return q;
      };
      q.gte = () => q;
      q.limit = async () => ({ data: o.usoDoMes ?? [], error: null });
      q.update = (v: { settings: Record<string, unknown> }) => {
        atualizar = v;
        return q;
      };
      q.delete = () => {
        apagar = true;
        return q;
      };
      q.upsert = async (v: Record<string, unknown>) => {
        estado.upserts.push(v);
        estado.chaves[String(v.provider)] = String(v.api_key_last4);
        return { error: null };
      };
      q.maybeSingle = async () => {
        if (tabela === "organizations") {
          if (atualizar) {
            estado.settings = atualizar.settings;
            estado.updates.push(atualizar);
          }
          return { data: { settings: estado.settings, locale: "pt-BR" }, error: null };
        }
        if (tabela === "voice_provider_credentials") {
          const last4 = estado.chaves[String(filtros.provider)];
          return {
            data: last4 ? { api_key_last4: last4, api_key_encrypted: "\\xcifrada", updated_at: "2026-10-15T00:00:00Z" } : null,
            error: null,
          };
        }
        return { data: null, error: null };
      };
      // `await q` (delete().eq().eq().select("id"))
      q.then = (ok: (r: unknown) => unknown) => {
        if (tabela === "voice_provider_credentials" && apagar) {
          const provedor = String(filtros.provider);
          const havia = provedor in estado.chaves;
          delete estado.chaves[provedor];
          if (havia) estado.apagados.push(provedor);
          return ok({ data: havia ? [{ id: "x" }] : [], error: null });
        }
        return ok({ data: [], error: null });
      };
      return q;
    },
  };
  return admin;
}

const req = (metodo: string, url: string, corpo?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
const put = (corpo: unknown) => req("PUT", "/api/v1/ai/audio", corpo);

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: EU, idioma: "pt-BR" }, org: { orgId: ORG } });
  deps.nota.mockResolvedValue({ buffer: Buffer.from("ogg"), mime: "audio/ogg;codecs=opus" });
});
afterEach(() => vi.restoreAllMocks());

describe("GET — o estado, nunca a chave", () => {
  it("instalação nova, sem chave nenhuma: desligada, indisponível, e diz por quê", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const corpo = (await (await GET()).json()).data;
    expect(corpo.config).toMatchObject({ ligado: false, provedor: "openai_compativel", aceite: null });
    expect(corpo.chaves.openai_compativel).toMatchObject({ configurada: false, ultimos4: null });
    expect(corpo.chaves.elevenlabs).toMatchObject({ configurada: false });
    expect(corpo).toMatchObject({ disponivel: false, por_que_indisponivel: "desligado" });
    expect(corpo.padroes).toMatchObject({ endereco: "https://api.openai.com/v1", limite_de_caracteres: 1000 });
  });

  it("com chave: só configurada e os 4 últimos — a cifra não aparece na resposta", async () => {
    deps.admin.mockReturnValue(bancoFalso({ chaves: { openai_compativel: "6789" } }));
    const texto = JSON.stringify(await (await GET()).json());
    expect(JSON.parse(texto).data.chaves.openai_compativel).toMatchObject({ configurada: true, ultimos4: "6789" });
    expect(texto).not.toContain("cifrada");
    expect(texto).not.toContain(CHAVE);
  });

  it("ligado + aceite + chave do provedor: disponível", async () => {
    deps.admin.mockReturnValue(
      bancoFalso({
        settings: { resposta_em_audio: { ligado: true, aceite: ACEITE } },
        chaves: { openai_compativel: "6789" },
      }),
    );
    expect((await (await GET()).json()).data).toMatchObject({ disponivel: true, por_que_indisponivel: null });
  });

  it("ligado mas sem chave do provedor escolhido: indisponível por sem_chave (a chave do OUTRO provedor não vale)", async () => {
    deps.admin.mockReturnValue(
      bancoFalso({
        settings: { resposta_em_audio: { ligado: true, aceite: ACEITE, provedor: "elevenlabs" } },
        chaves: { openai_compativel: "6789" },
      }),
    );
    expect((await (await GET()).json()).data).toMatchObject({ disponivel: false, por_que_indisponivel: "sem_chave" });
  });

  it("o uso do mês: respostas, caracteres, custo conhecido, sem preço e a última falha em conversa real", async () => {
    deps.admin.mockReturnValue(
      bancoFalso({
        usoDoMes: [
          { input_tokens: 100, cost_cents: 0.15, status: "ok", error_code: null, created_at: "2026-10-02T10:00:00Z" },
          { input_tokens: 300, cost_cents: null, status: "ok", error_code: null, created_at: "2026-10-03T10:00:00Z" },
          { input_tokens: 50, cost_cents: null, status: "erro", error_code: "sem_creditos", created_at: "2026-10-04T10:00:00Z" },
          { input_tokens: 60, cost_cents: null, status: "erro", error_code: "chave_invalida", created_at: "2026-10-05T10:00:00Z" },
        ],
      }),
    );
    const uso = (await (await GET()).json()).data.uso;
    expect(uso).toMatchObject({ respostas_em_audio: 2, falhas: 2, caracteres: 400, custo_cents: 0.15, sem_preco: 1 });
    expect(uso.ultima_falha).toMatchObject({ motivo: "chave_invalida", em: "2026-10-05T10:00:00Z" });
    expect(uso.ultima_falha.mensagem).toContain("recusou a chave");
  });

  it("manager lê (a rota exige manager, e não admin, no GET)", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    await GET();
    expect(deps.role).toHaveBeenCalledWith("manager", expect.anything());
  });
});

describe("PUT — gravar", () => {
  it("⭐ grava a chave CIFRADA, com os 4 últimos; ela não aparece no banco, na resposta nem na auditoria", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    const res = await PUT(put({ api_key: CHAVE, provedor: "openai_compativel" }) as never);
    expect(res.status).toBe(200);
    const texto = JSON.stringify(await res.json());

    expect(admin.estado.upserts).toHaveLength(1);
    expect(admin.estado.upserts[0]).toMatchObject({
      organization_id: ORG,
      provider: "openai_compativel",
      api_key_last4: "6789",
      updated_by: EU,
    });
    expect(JSON.stringify(admin.estado.upserts[0])).not.toContain(CHAVE);
    expect(texto).not.toContain(CHAVE);
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.audio_reply_credential_saved", organizationId: ORG }),
    );
    expect(JSON.stringify(deps.audit.mock.calls)).not.toContain(CHAVE);
  });

  it("a chave vai para o provedor ESCOLHIDO — não para o que estava gravado", async () => {
    const admin = bancoFalso({ settings: { resposta_em_audio: { provedor: "openai_compativel" } } });
    deps.admin.mockReturnValue(admin);
    await PUT(put({ provedor: "elevenlabs", api_key: "sk_eleven-chave-0001" }) as never);
    expect(admin.estado.upserts[0]).toMatchObject({ provider: "elevenlabs", api_key_last4: "0001" });
  });

  it("⭐ ligar: com chave e aceite, liga e grava a organização, o provedor e QUEM aceitou — sem apagar o resto das settings", async () => {
    const admin = bancoFalso({ settings: { jev: { ligado: false }, branding: { nome: "Acme" } } });
    deps.admin.mockReturnValue(admin);
    const res = await PUT(put({ api_key: CHAVE, ligado: true, aceitar: true }) as never);
    expect(res.status).toBe(200);
    expect(admin.estado.settings).toMatchObject({
      jev: { ligado: false },
      branding: { nome: "Acme" },
      resposta_em_audio: { ligado: true, aceite: { por: EU } },
    });
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ disponivel: true, por_que_indisponivel: null });
    expect(deps.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.audio_reply_config_changed",
        metadata: expect.objectContaining({ ligado: true, aceitou_agora: true }),
      }),
    );
  });

  it("⭐ ligar SEM chave é recusado com a frase do que falta — o recurso nunca fica 'ligado' sem poder funcionar", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    const res = await PUT(put({ ligado: true, aceitar: true }) as never);
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.message).toContain("chave do provedor de voz");
    expect(admin.estado.updates).toHaveLength(0);
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("⭐ ligar SEM o aceite do administrador é recusado", async () => {
    const admin = bancoFalso({ chaves: { openai_compativel: "6789" } });
    deps.admin.mockReturnValue(admin);
    const res = await PUT(put({ ligado: true }) as never);
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toContain("concorda em enviar o texto");
    expect(admin.estado.updates).toHaveLength(0);
  });

  it("religar depois de desligar não pede o aceite de novo (a decisão do administrador fica registrada)", async () => {
    const admin = bancoFalso({
      settings: { resposta_em_audio: { ligado: false, aceite: ACEITE } },
      chaves: { openai_compativel: "6789" },
    });
    deps.admin.mockReturnValue(admin);
    expect((await PUT(put({ ligado: true }) as never)).status).toBe(200);
    expect(admin.estado.settings).toMatchObject({ resposta_em_audio: { ligado: true, aceite: ACEITE } });
  });

  it("⭐ endereço da rede interna / local / privado é recusado ANTES de gravar", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    for (const endereco of ["http://127.0.0.1:8000/v1", "http://localhost/v1", "http://10.0.0.5/v1", "http://169.254.169.254/latest"]) {
      const res = await PUT(put({ endereco }) as never);
      expect(res.status, endereco).toBe(422);
    }
    expect(admin.estado.updates).toHaveLength(0);
  });

  it("recusa o que não parece chave ou tem campo fora do contrato, sem gravar", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    for (const api_key of ["curta", "tem espaço no meio da chave", "x".repeat(301)]) {
      expect((await PUT(put({ api_key }) as never)).status).toBe(422);
    }
    expect((await PUT(put({ campo_inventado: 1 }) as never)).status).toBe(422);
    expect((await PUT(put({ limite_de_caracteres: 99999 }) as never)).status).toBe(422);
    expect((await PUT(put({ provedor: "outro" }) as never)).status).toBe(422);
    expect(admin.estado.upserts).toHaveLength(0);
    expect(admin.estado.updates).toHaveLength(0);
  });

  it("sem cifra no servidor, não grava texto claro", async () => {
    const admin = bancoFalso({ cifra: false });
    deps.admin.mockReturnValue(admin);
    expect((await PUT(put({ api_key: CHAVE }) as never)).status).toBe(500);
    expect(admin.estado.upserts).toHaveLength(0);
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("papel e suporte temporário barram antes de qualquer efeito", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    deps.role.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await PUT(put({ api_key: CHAVE }) as never)).status).toBe(403);
    expect(deps.role).toHaveBeenCalledWith("admin", expect.anything());

    deps.support.mockResolvedValueOnce(new Response(null, { status: 423 }));
    expect((await PUT(put({ api_key: CHAVE }) as never)).status).toBe(423);
    expect(admin.estado.upserts).toHaveLength(0);
    expect(admin.estado.updates).toHaveLength(0);
  });

  it("a organização vem da sessão, nunca do corpo: um organization_id no corpo é recusado", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    const res = await PUT(put({ api_key: CHAVE, organization_id: "99999999-9999-4999-8999-999999999999" }) as never);
    expect(res.status).toBe(422);
    expect(admin.estado.upserts).toHaveLength(0);
  });
});

describe("DELETE — remover a chave", () => {
  it("remove, audita e devolve o estado; sem chave, não audita remoção que não houve", async () => {
    const admin = bancoFalso({ chaves: { elevenlabs: "0001" } });
    deps.admin.mockReturnValue(admin);
    const r1 = await DELETE(req("DELETE", "/api/v1/ai/audio?provedor=elevenlabs") as never);
    expect((await r1.json()).data).toMatchObject({ removida: true });
    expect(admin.estado.apagados).toEqual(["elevenlabs"]);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "ai.audio_reply_credential_removed" }));

    deps.audit.mockClear();
    const r2 = await DELETE(req("DELETE", "/api/v1/ai/audio?provedor=elevenlabs") as never);
    expect((await r2.json()).data).toMatchObject({ removida: false });
    expect(deps.audit).not.toHaveBeenCalled();
  });

  it("exige o provedor na URL", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    expect((await DELETE(req("DELETE", "/api/v1/ai/audio") as never)).status).toBe(422);
    expect((await DELETE(req("DELETE", "/api/v1/ai/audio?provedor=outro") as never)).status).toBe(422);
  });

  it("remover a chave do provedor em uso NÃO desliga a organização — o estado explica que falta a chave", async () => {
    const admin = bancoFalso({
      settings: { resposta_em_audio: { ligado: true, aceite: ACEITE } },
      chaves: { openai_compativel: "6789" },
    });
    deps.admin.mockReturnValue(admin);
    const corpo = (await (await DELETE(req("DELETE", "/api/v1/ai/audio?provedor=openai_compativel") as never)).json()).data;
    expect(corpo).toMatchObject({ disponivel: false, por_que_indisponivel: "sem_chave" });
    expect(corpo.config.ligado).toBe(true);
  });
});

describe("POST /testar — o botão Testar", () => {
  const MP3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0x21]);
  const testar = (corpo: unknown) => req("POST", "/api/v1/ai/audio/testar", corpo);

  it("⭐ testa a chave colada ANTES de gravar: sintetiza de verdade, converte, e não grava nada", async () => {
    const admin = bancoFalso();
    deps.admin.mockReturnValue(admin);
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );
    const res = await TESTAR(testar({ api_key: CHAVE, provedor: "openai_compativel" }) as never);
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ ok: true, somente_a_chave: false });
    expect(deps.nota).toHaveBeenCalledTimes(1);

    // saiu para a OpenAI com a chave no cabeçalho, e a chave não vazou para a resposta
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CHAVE}`);
    expect(JSON.stringify(corpo)).not.toContain(CHAVE);
    expect(admin.estado.upserts).toHaveLength(0);
    expect(admin.estado.updates).toHaveLength(0);
  });

  it("chave recusada: ok:false com o motivo e a frase do que fazer (HTTP 200 — é resultado do teste)", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), { status: 401 }),
    );
    const res = await TESTAR(testar({ api_key: CHAVE }) as never);
    expect(res.status).toBe(200);
    const corpo = (await res.json()).data;
    expect(corpo).toMatchObject({ ok: false, motivo: "chave_invalida" });
    expect(corpo.mensagem).toContain("recusou a chave");
    expect(deps.nota).not.toHaveBeenCalled();
  });

  it("conta sem créditos: motivo sem_creditos", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 }),
    );
    expect((await (await TESTAR(testar({ api_key: CHAVE }) as never)).json()).data).toMatchObject({
      ok: false,
      motivo: "sem_creditos",
    });
  });

  it("servidor sem ffmpeg: o teste diz conversao_falhou (o recurso não funcionaria em produção)", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const { ErroDeVoz } = await import("@/lib/ai/resposta-em-audio/tipos");
    deps.nota.mockRejectedValue(new ErroDeVoz("conversao_falhou", { detalhe: "ffmpeg_spawn_failed" }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );
    expect((await (await TESTAR(testar({ api_key: CHAVE }) as never)).json()).data).toMatchObject({
      ok: false,
      motivo: "conversao_falhou",
    });
  });

  it("endereço interno no teste: recusado pela régua de destino, sem sair nenhum byte", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const f = vi.spyOn(globalThis, "fetch");
    const corpo = (await (await TESTAR(testar({ api_key: CHAVE, endereco: "http://127.0.0.1:9000/v1" }) as never)).json()).data;
    expect(corpo).toMatchObject({ ok: false, motivo: "endereco_recusado" });
    expect(f).not.toHaveBeenCalled();
  });

  it("sem chave nenhuma, pede uma", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    expect((await TESTAR(testar({}) as never)).status).toBe(422);
  });

  it("ElevenLabs sem voz padrão: prova a chave listando as vozes da conta", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "Rachel" }, { voice_id: "v2", name: "Adam" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const corpo = (await (await TESTAR(testar({ provedor: "elevenlabs", api_key: "sk_eleven-chave-0001" }) as never)).json()).data;
    expect(corpo).toMatchObject({ ok: true, somente_a_chave: true, vozes: 2 });
    expect((f.mock.calls[0] as [string])[0]).toBe("https://api.elevenlabs.io/v1/voices");
  });

  it("papel e suporte temporário barram antes de gastar a conta do cliente", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const f = vi.spyOn(globalThis, "fetch");
    deps.support.mockResolvedValueOnce(new Response(null, { status: 423 }));
    expect((await TESTAR(testar({ api_key: CHAVE }) as never)).status).toBe(423);
    deps.role.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 403 }) });
    expect((await TESTAR(testar({ api_key: CHAVE }) as never)).status).toBe(403);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("GET /vozes — a lista de vozes da conta do cliente", () => {
  const vozes = (q = "") => req("GET", `/api/v1/ai/audio/vozes${q}`);

  it("lista as vozes com a chave GRAVADA (lida no servidor; nunca vem do corpo nem volta)", async () => {
    deps.admin.mockReturnValue(bancoFalso({ chaves: { elevenlabs: "0001" } }));
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "Rachel", category: "premade" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const texto = JSON.stringify(await (await VOZES(vozes() as never)).json());
    expect(JSON.parse(texto).data).toMatchObject({ ok: true, disponivel: true, vozes: [{ id: "v1", nome: "Rachel" }] });
    expect(texto).not.toContain(CHAVE);
    expect(((f.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>)["xi-api-key"]).toBe(CHAVE);
  });

  it("sem chave da ElevenLabs gravada: diz o que fazer, sem chamar ninguém", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    const f = vi.spyOn(globalThis, "fetch");
    expect((await (await VOZES(vozes() as never)).json()).data).toMatchObject({ ok: false, motivo: "sem_chave" });
    expect(f).not.toHaveBeenCalled();
  });

  it("chave recusada pela ElevenLabs: a frase certa no lugar da lista", async () => {
    deps.admin.mockReturnValue(bancoFalso({ chaves: { elevenlabs: "0001" } }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: { status: "invalid_api_key" } }), { status: 401 }),
    );
    const corpo = (await (await VOZES(vozes() as never)).json()).data;
    expect(corpo).toMatchObject({ ok: false, motivo: "chave_invalida" });
    expect(corpo.mensagem).toContain("recusou a chave");
  });

  it("o provedor compatível com a OpenAI não tem catálogo de vozes por conta", async () => {
    deps.admin.mockReturnValue(bancoFalso());
    expect((await (await VOZES(vozes("?provedor=openai_compativel") as never)).json()).data).toMatchObject({
      ok: true,
      disponivel: false,
      vozes: [],
    });
  });
});
