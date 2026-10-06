// @vitest-environment node
/**
 * POST /api/v1/channels/templates/media — A ROTA DE UPLOAD DA MÍDIA DE MODELO (issue #7).
 *
 * A rota real, com a Meta pelo falso Graph (HTTP de verdade) e o bucket pelo
 * storage em memória. Dublê, só a identidade de quem chama e a resolução da
 * sessão e da credencial — que o invariante `modelos-do-canal-oficial` exercita
 * contra o banco de verdade.
 *
 * O que se mede:
 *  - o arquivo chega à Meta e ao bucket com os MESMOS bytes, e a resposta traz
 *    o handle, o caminho da organização e o link do preview;
 *  - a Meta vem antes do bucket: recusa dela não deixa arquivo guardado;
 *  - tipo decidido pelo conteúdo, e teto por formato;
 *  - auditoria `meta_template.media_uploaded` com id `uuid`.
 *
 * Medir: `pnpm vitest run tests/unit/meta-midia-de-modelo-rota.test.ts`
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MidiaEnviadaView } from "@/app/api/v1/channels/templates/media/route";

import { ASSINATURAS, arquivoDeTeste } from "../support/arquivos-de-midia";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { storageEmMemoria, type StorageEmMemoria } from "../support/storage-em-memoria";

const ORG = "0d0e0007-0000-4000-8000-00000000000a";
const USER = "0d0e0007-0000-4000-8000-0000000000a1";
const TOKEN = "EAAG-token-de-teste-com-tamanho-suficiente";

const estado = vi.hoisted(() => ({
  storage: null as unknown,
  sessao: { id: "sessao-1", wabaId: "2434045433735188", phoneNumberId: "1103328999528888" } as {
    id: string;
    wabaId: string;
    phoneNumberId: string;
  } | null,
  audit: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/impersonate/support", async (original) => ({
  ...(await original<object>()),
  requireSupportWrite: async () => null,
}));
vi.mock("@/lib/auth/require-role", async (original) => ({
  ...(await original<object>()),
  requireRole: async () => ({
    ok: true,
    user: { id: USER, idioma: "pt-BR" },
    org: { orgId: ORG, role: "admin" },
  }),
}));
vi.mock("@/lib/channels/meta/session", () => ({ metaSessionForOrg: async () => estado.sessao }));
vi.mock("@/lib/channels/meta/credentials", () => ({
  resolveMetaCreds: async () => ({ token: TOKEN, graphVersion: "v26.0" }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: estado.storage }) }));
vi.mock("@/lib/audit", () => ({
  audit: async (e: Record<string, unknown>) => {
    estado.audit.push(e);
  },
}));

let falso: FalsoGraph;
let storage: StorageEmMemoria;

async function subir(bytes: Uint8Array, nome: string, format?: string): Promise<Response> {
  const { POST } = await import("@/app/api/v1/channels/templates/media/route");
  const form = new FormData();
  form.append("file", new File([Buffer.from(bytes)], nome));
  if (format) form.append("format", format);
  return POST(
    new NextRequest("http://localhost/api/v1/channels/templates/media", {
      method: "POST",
      body: form,
    }),
  );
}

interface Corpo {
  data: MidiaEnviadaView;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

async function corpo(res: Response): Promise<Corpo> {
  return (await res.json()) as Corpo;
}

beforeAll(async () => {
  falso = await subirFalsoGraph({ phoneNumberId: "1103328999528888", wabaId: "2434045433735188" });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso.fechar();
});

beforeEach(() => {
  falso.limpar();
  storage = storageEmMemoria();
  estado.storage = storage;
  estado.audit = [];
  estado.sessao = { id: "sessao-1", wabaId: "2434045433735188", phoneNumberId: "1103328999528888" };
});

describe("POST /api/v1/channels/templates/media", () => {
  it("a imagem vai à Meta e ao bucket com os mesmos bytes; a resposta traz handle, caminho e preview", async () => {
    const bytes = arquivoDeTeste(ASSINATURAS.png, 500);
    const res = await subir(bytes, "vitrine.png", "IMAGE");
    const json = await corpo(res);
    expect(res.status, JSON.stringify(json)).toBe(201);

    const data = json.data;
    expect(data).toMatchObject({
      handle: "4::FALSO_HANDLE_1",
      mime_type: "image/png",
      file_name: "vitrine.png",
      size_bytes: 500,
      format: "IMAGE",
    });
    expect(data.path).toMatch(new RegExp(`^${ORG}/templates/[0-9a-f-]{36}\\.png$`));
    expect(data.preview_url).toContain(data.path);

    const [enviado] = falso.arquivosEnviados();
    expect(Buffer.compare(enviado!.bytes, Buffer.from(bytes))).toBe(0);
    const guardado = storage.objetos.get(`whatsapp-media/${data.path}`);
    expect(guardado?.contentType).toBe("image/png");
    expect(Buffer.compare(Buffer.from(guardado!.bytes), Buffer.from(bytes))).toBe(0);

    expect(estado.audit).toEqual([
      expect.objectContaining({
        action: "meta_template.media_uploaded",
        organizationId: ORG,
        actorUserId: USER,
        resourceType: "meta_template_media",
        metadata: expect.objectContaining({ path: data.path, format: "IMAGE", size_bytes: 500 }),
      }),
    ]);
    // `api_audit_log.resource_id` é uuid: o id é o nome do arquivo, não o caminho.
    expect(estado.audit[0]!.resourceId).toBe(data.path.split("/").pop()!.split(".")[0]);
  });

  it("vídeo e documento também; sem `format`, o formato sai do conteúdo", async () => {
    const video = await corpo(await subir(arquivoDeTeste(ASSINATURAS.mp4), "apresentacao.mp4"));
    expect(video.data).toMatchObject({ format: "VIDEO", mime_type: "video/mp4" });
    const pdf = await corpo(
      await subir(arquivoDeTeste(ASSINATURAS.pdf), "catalogo.pdf", "DOCUMENT"),
    );
    expect(pdf.data).toMatchObject({ format: "DOCUMENT", mime_type: "application/pdf" });
    expect(storage.objetos.size).toBe(2);
  });

  it("arquivo que não é JPG, PNG, MP4 nem PDF: 415, e nada vai à Meta nem ao bucket", async () => {
    const res = await subir(arquivoDeTeste([0x47, 0x49, 0x46, 0x38]), "animado.gif");
    expect(res.status).toBe(415);
    expect(falso.chamadas).toEqual([]);
    expect(storage.objetos.size).toBe(0);
  });

  it("arquivo de outro formato que o pedido (PNG num cabeçalho de vídeo): 415 com a frase do formato", async () => {
    const res = await subir(arquivoDeTeste(ASSINATURAS.png), "foto.mp4", "VIDEO");
    expect(res.status).toBe(415);
    expect((await corpo(res)).error.message).toBe("O vídeo precisa ser MP4.");
    expect(falso.chamadas).toEqual([]);
  });

  it("imagem acima de 5 MB: 413, sem ida à Meta", async () => {
    const res = await subir(
      arquivoDeTeste(ASSINATURAS.jpeg, 5 * 1024 * 1024 + 1),
      "grande.jpg",
      "IMAGE",
    );
    expect(res.status).toBe(413);
    expect(falso.chamadas).toEqual([]);
  });

  it("vídeo de 12 MB (acima do antigo teto de 9 MB): vai inteiro à Meta e ao bucket", async () => {
    // O caso da issue #22. A rota agora fica fora do matcher do proxy, que
    // cortaria o corpo em 10 MB; aqui a prova é que a rota aceita o tamanho.
    const bytes = arquivoDeTeste(ASSINATURAS.mp4, 12 * 1024 * 1024);
    const res = await subir(bytes, "demonstracao.mp4", "VIDEO");
    const json = await corpo(res);
    expect(res.status, JSON.stringify(json.error)).toBe(201);
    expect(json.data.size_bytes).toBe(12 * 1024 * 1024);
    const [enviado] = falso.arquivosEnviados();
    expect(Buffer.compare(enviado!.bytes, Buffer.from(bytes))).toBe(0);
  });

  it("vídeo acima de 16 MB (o teto da Meta): 413 com o número, sem ida à Meta", async () => {
    const res = await subir(
      arquivoDeTeste(ASSINATURAS.mp4, 16 * 1024 * 1024 + 1),
      "longo.mp4",
      "VIDEO",
    );
    expect(res.status).toBe(413);
    expect((await corpo(res)).error.message).toBe("Este tipo de arquivo precisa ter até 16 MB.");
    expect(falso.chamadas).toEqual([]);
  });

  it("a Meta recusa: 422 com a etapa, e o bucket fica vazio", async () => {
    falso.programar(
      { metodo: "POST", terminaCom: "/uploads" },
      erroDaGraph(100, { message: "(#100) recusado" }),
    );
    const res = await subir(arquivoDeTeste(ASSINATURAS.jpeg), "a.jpg", "IMAGE");
    expect(res.status).toBe(422);
    const json = await corpo(res);
    expect(json.error).toMatchObject({
      code: "meta_media_refused",
      details: { etapa: "sessao", codigo: 100 },
    });
    expect(storage.objetos.size).toBe(0);
    expect(estado.audit).toEqual([]);
  });

  it("o bucket falha depois da Meta: 500 que manda tentar de novo, sem auditoria", async () => {
    storage.falharProximoUpload("cota estourada");
    const res = await subir(arquivoDeTeste(ASSINATURAS.jpeg), "a.jpg", "IMAGE");
    expect(res.status).toBe(500);
    expect((await corpo(res)).error.message).toContain("Tente de novo");
    expect(falso.arquivosEnviados()).toHaveLength(1);
    expect(estado.audit).toEqual([]);
  });

  it("sem canal oficial: 400 `no_meta_channel`, sem ida à Meta", async () => {
    estado.sessao = null;
    const res = await subir(arquivoDeTeste(ASSINATURAS.jpeg), "a.jpg", "IMAGE");
    expect(res.status).toBe(400);
    expect((await corpo(res)).error.message).toBe("no_meta_channel");
    expect(falso.chamadas).toEqual([]);
  });

  it("o nome do arquivo vai sem pasta", async () => {
    const res = await subir(
      arquivoDeTeste(ASSINATURAS.jpeg),
      "C:\\Users\\ana\\vitrine.jpg",
      "IMAGE",
    );
    expect((await corpo(res)).data.file_name).toBe("vitrine.jpg");
  });
});
