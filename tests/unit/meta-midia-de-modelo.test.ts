/**
 * A MÍDIA DO CABEÇALHO DE MODELO VAI À API DE UPLOAD DA META (issue #7).
 *
 * A amostra de mídia de um modelo não é um link: a Meta pede o `handle` da API
 * de upload retomável, em dois passos — abrir a sessão no app
 * (`POST /{app}/uploads?file_length&file_type`) e mandar o arquivo para a sessão
 * (`POST /upload:…` com `file_offset: 0` e `Authorization: OAuth`). O `h` que
 * volta é o que vai em `example.header_handle`.
 *
 * Medido pelo fio contra o falso Graph (`tests/support/falso-graph.ts`): os
 * bytes que chegaram, o tamanho e o tipo declarados, o token só no cabeçalho, e
 * a recusa da Meta em cada passo voltando com nome.
 *
 * Medir: `pnpm vitest run tests/unit/meta-midia-de-modelo.test.ts`
 */
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  caminhoDaMidia,
  caminhoEhDaOrganizacao,
  enviarMidiaParaMeta,
  farejarArquivo,
  TETO_POR_FORMATO,
} from "@/lib/channels/meta/midia-de-modelo";
import { CAMINHO_DA_MIDIA } from "@/lib/channels/meta/novo-modelo";

import { ASSINATURAS, arquivoDeTeste } from "../support/arquivos-de-midia";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";

const ORG = "0d0e0007-0000-4000-8000-00000000000a";
const OUTRA = "0d0e0007-0000-4000-8000-00000000000b";
const TOKEN = "EAAG-token-de-teste-com-tamanho-suficiente";
const APP = "5550001112223";

const arquivo = arquivoDeTeste;

let falso: FalsoGraph;

beforeAll(async () => {
  falso = await subirFalsoGraph({
    phoneNumberId: "1103328999528877",
    wabaId: "2434045433735177",
    appId: APP,
  });
  vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await falso.fechar();
});

beforeEach(() => falso.limpar());

describe("farejarArquivo — o tipo pelo conteúdo, não pelo nome", () => {
  it("reconhece JPEG, PNG, MP4 e PDF", () => {
    expect(farejarArquivo(arquivo(ASSINATURAS.jpeg))).toBe("image/jpeg");
    expect(farejarArquivo(arquivo(ASSINATURAS.png))).toBe("image/png");
    expect(farejarArquivo(arquivo(ASSINATURAS.mp4))).toBe("video/mp4");
    expect(farejarArquivo(arquivo(ASSINATURAS.pdf))).toBe("application/pdf");
  });

  it("o resto não serve de cabeçalho de modelo", () => {
    expect(farejarArquivo(arquivo([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(farejarArquivo(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(farejarArquivo(new Uint8Array())).toBeNull();
  });

  it("tem teto por formato: o da Meta, sem passar do bucket (50 MB)", () => {
    expect(TETO_POR_FORMATO.IMAGE).toBe(5 * 1024 * 1024);
    // Vídeo: o teto da Meta. Até a #22 ficava em 9 MB por causa do corte do proxy.
    expect(TETO_POR_FORMATO.VIDEO).toBe(16 * 1024 * 1024);
    // Documento: a Meta aceita 100 MB, mas a cópia vai para o bucket de 50 MB.
    expect(TETO_POR_FORMATO.DOCUMENT).toBe(50 * 1024 * 1024);
  });

  it("a dica do campo na tela diz o mesmo teto que a rota aplica", () => {
    // A dica é texto literal (precisa estar no dicionário); um teto mudado só
    // aqui deixaria a tela prometendo um número que a rota recusa.
    const campo = readFileSync("components/connections/CampoDeMidia.tsx", "utf8");
    for (const teto of Object.values(TETO_POR_FORMATO)) {
      expect(campo).toContain(`até ${teto / (1024 * 1024)} MB.`);
    }
  });
});

describe("caminho no storage", () => {
  it("mora em <org>/templates/, a pasta que a retenção de mídia não poda", () => {
    const caminho = caminhoDaMidia(ORG, "video/mp4");
    expect(caminho).toMatch(new RegExp(`^${ORG}/templates/[0-9a-f-]{36}\\.mp4$`));
    expect(caminho).toMatch(CAMINHO_DA_MIDIA);
    expect(caminhoEhDaOrganizacao(caminho, ORG)).toBe(true);
    expect(caminhoEhDaOrganizacao(caminho, OUTRA)).toBe(false);
    expect(caminhoEhDaOrganizacao(`${ORG}/avatars/x.jpg`, ORG)).toBe(false);
  });
});

describe("enviarMidiaParaMeta — a API de upload retomável", () => {
  it("abre a sessão no app do token, manda o arquivo e devolve o handle", async () => {
    const bytes = arquivo(ASSINATURAS.png, 300);
    const r = await enviarMidiaParaMeta({
      token: TOKEN,
      graphVersion: "v26.0",
      bytes,
      tipo: "image/png",
      nome: "vitrine de outubro.png",
    });
    expect(r).toEqual({ ok: true, handle: "4::FALSO_HANDLE_1" });

    const [app, sessao, envio] = falso.chamadas;
    // O app dono do token — é nele que a sessão de upload abre.
    expect(app).toMatchObject({ metodo: "GET", caminho: "/app", versao: "v26.0" });
    expect(sessao).toMatchObject({ metodo: "POST", caminho: `/${APP}/uploads` });
    const busca = new URLSearchParams(sessao!.busca);
    expect(busca.get("file_length")).toBe("300");
    expect(busca.get("file_type")).toBe("image/png");
    expect(busca.get("file_name")).toBe("vitrine de outubro.png");
    // O token NUNCA na URL — em nenhum dos três pedidos.
    for (const c of falso.chamadas) {
      expect(c.busca).not.toContain(TOKEN);
      expect(c.authorization).toMatch(new RegExp(`^(Bearer|OAuth) ${TOKEN}$`));
    }
    // O id da sessão vai à URL como a Meta o deu, com o `?sig=`.
    expect(envio).toMatchObject({
      caminho: "/upload:FALSO_1",
      busca: "?sig=ASSINATURA_1",
      fileOffset: "0",
    });
    expect(envio!.authorization).toBe(`OAuth ${TOKEN}`);
    expect(Buffer.compare(envio!.bytes, Buffer.from(bytes))).toBe(0);
  });

  it("recusa ao abrir a sessão volta com o código e a frase", async () => {
    falso.programar(
      { metodo: "POST", terminaCom: "/uploads" },
      erroDaGraph(100, { message: "(#100) tipo não aceito" }),
    );
    const r = await enviarMidiaParaMeta({
      token: TOKEN,
      graphVersion: "v26.0",
      bytes: arquivo(ASSINATURAS.jpeg),
      tipo: "image/jpeg",
      nome: "a.jpg",
    });
    expect(r).toMatchObject({ ok: false, etapa: "sessao", codigo: 100 });
    expect(falso.arquivosEnviados()).toHaveLength(0);
  });

  it("token sem app (recusado no `GET /app`) não abre sessão nenhuma", async () => {
    falso.programar(
      { metodo: "GET", terminaCom: "/app" },
      erroDaGraph(190, { status: 401, message: "(#190) token inválido" }),
    );
    const r = await enviarMidiaParaMeta({
      token: TOKEN,
      graphVersion: "v26.0",
      bytes: arquivo(ASSINATURAS.jpeg),
      tipo: "image/jpeg",
      nome: "a.jpg",
    });
    expect(r).toMatchObject({ ok: false, etapa: "app", codigo: 190 });
    expect(falso.chamadas.map((c) => c.caminho)).toEqual(["/app"]);
  });

  it("recusa no envio do arquivo volta com a etapa", async () => {
    falso.programar(
      { metodo: "POST", terminaCom: "/upload:FALSO_1" },
      erroDaGraph(131053, { message: "Media upload error" }),
    );
    const r = await enviarMidiaParaMeta({
      token: TOKEN,
      graphVersion: "v26.0",
      bytes: arquivo(ASSINATURAS.mp4),
      tipo: "video/mp4",
      nome: "a.mp4",
    });
    expect(r).toMatchObject({ ok: false, etapa: "arquivo", codigo: 131053 });
  });

  it("rede fora do ar é uma recusa com nome, não exceção", async () => {
    vi.stubEnv("META_GRAPH_BASE_URL", "http://127.0.0.1:9");
    try {
      const r = await enviarMidiaParaMeta({
        token: TOKEN,
        graphVersion: "v26.0",
        bytes: arquivo(ASSINATURAS.pdf),
        tipo: "application/pdf",
        nome: "a.pdf",
      });
      expect(r).toMatchObject({ ok: false, etapa: "app", codigo: null });
    } finally {
      vi.stubEnv("META_GRAPH_BASE_URL", falso.base);
    }
  });
});
