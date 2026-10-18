// lib/propostas/pdf-da-proposta.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CampoFaltando } from "./documento/documento-da-proposta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks: Record<string, any> = vi.hoisted(() => ({
  montarDocumentoDaProposta: vi.fn(),
  renderDocumentoPdf: vi.fn(),
  marcaDaOrganizacaoParaPdf: vi.fn(),
  buscarImagemParaPdf: vi.fn(),
  destinosInternosAutorizados: vi.fn(),
}));

const estado: { camposFaltando: CampoFaltando[] } = vi.hoisted(() => ({ camposFaltando: [] }));

vi.mock("./documento/documento-da-proposta", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, montarDocumentoDaProposta: mocks.montarDocumentoDaProposta };
});
vi.mock("./documento/pdf-do-documento", () => ({ renderDocumentoPdf: mocks.renderDocumentoPdf }));
vi.mock("./marca-da-organizacao-para-pdf", () => ({
  marcaDaOrganizacaoParaPdf: mocks.marcaDaOrganizacaoParaPdf,
}));

vi.mock("./imagem-para-pdf", () => ({ buscarImagemParaPdf: mocks.buscarImagemParaPdf }));
vi.mock("@/lib/automation/destinos-internos-autorizados", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, destinosInternosAutorizados: mocks.destinosInternosAutorizados };
});

import { montarPdfDaProposta, type PropostaParaPdf } from "./pdf-da-proposta";

const ORG_ID = "22222222-2222-4222-8222-222222222222";

function propostaBase(slug: string | null): PropostaParaPdf {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    contact_id: "contato-1",
    titulo: "Site da imobiliária",
    versao: 1,
    condicoes: "50% no aceite",
    template_slug: slug,
    secoes_editadas: null,
    briefing_json: { project: { name: "Site da imobiliária" } },
    total_cents: 350000,
    moeda: "BRL",
    prazo_dias_uteis: 30,
    valid_until: "2026-12-31",
    created_at: "2026-09-26T00:00:00.000Z",
  };
}

const PRODUTO_ID = "33333333-3333-4333-8333-333333333333";

/** `produtoComImagem`: o item do catálogo existe e `catalog_products.imagem_url` vale isto. */
function montarAdmin(localeDaOrganizacao?: string, produtoComImagem?: string) {
  return {
    from: vi.fn((tabela: string) => {
      if (tabela === "organizations" && localeDaOrganizacao !== undefined) {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { locale: localeDaOrganizacao }, error: null }) }),
          }),
        };
      }
      if (tabela === "crm_proposal_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      descricao: "Site institucional",
                      quantidade: 1,
                      preco_unitario_cents: 350000,
                      desconto_cents: 0,
                      product_id: produtoComImagem === undefined ? null : PRODUTO_ID,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (tabela === "catalog_products") {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: [{ id: PRODUTO_ID, imagem_url: produtoComImagem }], error: null }),
            }),
          }),
        };
      }
      if (tabela === "contacts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { name: "Maria", display_name: "Maria", email: null, phone_number: null },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    }),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  estado.camposFaltando = [];
  mocks.montarDocumentoDaProposta.mockImplementation(
    async (_db: unknown, _org: string, proposta: PropostaParaPdf) => {
      if (!proposta.template_slug) return null;
      return {
        modelo: { slug: proposta.template_slug },
        secoes: [{ id: "resumo", body: "Projeto: [a definir]", faltantes: [] }],
        pendencias: estado.camposFaltando.map((c) => c.caminho),
        camposFaltando: estado.camposFaltando,
      };
    },
  );
  mocks.marcaDaOrganizacaoParaPdf.mockResolvedValue({ appName: "Loja X", accentHex: "#111111", logoUrl: null });
  mocks.renderDocumentoPdf.mockImplementation(async () => Buffer.from("%PDF-1.4 proposta"));
  mocks.buscarImagemParaPdf.mockResolvedValue(null);
  mocks.destinosInternosAutorizados.mockResolvedValue([]);
});

describe("montarPdfDaProposta", () => {
  it("sem permitirPendencias, campo faltando recusa com o motivo", async () => {
    estado.camposFaltando = [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["resumo"] },
    ];
    const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.motivo).toContain("Faltam 1 campo(s)");
    expect(mocks.renderDocumentoPdf).not.toHaveBeenCalled();
  });

  it("com permitirPendencias, campo faltando devolve ok", async () => {
    estado.camposFaltando = [
      { caminho: "project.name", rotulo: "Nome do projeto", onde: "briefing", secoes: ["resumo"] },
    ];
    const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
      permitirPendencias: true,
    });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.buffer.length).toBeGreaterThan(0);
    expect(mocks.renderDocumentoPdf).toHaveBeenCalled();
  });

  it("sem modelo recusa nos dois casos", async () => {
    const admin = montarAdmin() as never;
    const semOpcao = await montarPdfDaProposta(admin, ORG_ID, propostaBase(null), {
      numero: null,
      ano: null,
      t: (texto: string) => texto,
    });
    expect(semOpcao.ok).toBe(false);
    if (!semOpcao.ok) expect(semOpcao.motivo).toContain("modelo da proposta");

    const comOpcao = await montarPdfDaProposta(admin, ORG_ID, propostaBase(null), {
      numero: null,
      ano: null,
      t: (texto: string) => texto,
      permitirPendencias: true,
    });
    expect(comOpcao.ok).toBe(false);
    if (!comOpcao.ok) expect(comOpcao.motivo).toContain("modelo da proposta");
    expect(mocks.renderDocumentoPdf).not.toHaveBeenCalled();
  });

  // Issue #12: quem recebe o PDF é cliente da ORGANIZAÇÃO, então o arquivo sai
  // no idioma dela — e não no de quem está na tela (o `t` do chamador, que só
  // serve ao motivo da recusa). Lido aqui dentro, o envio e a prévia não têm
  // como divergir.
  it("o PDF sai no idioma da organização, não no do `t` de quem chamou", async () => {
    const resultado = await montarPdfDaProposta(montarAdmin("en") as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
    });
    expect(resultado.ok).toBe(true);
    expect(mocks.renderDocumentoPdf).toHaveBeenCalledWith(expect.objectContaining({ idioma: "en" }));
  });

  it("leitura do idioma que falha cai no português, sem barrar o PDF", async () => {
    // O dublê sem `organizations` lança — `idiomaPeloCliente` nunca lança.
    const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), {
      numero: 1,
      ano: 2026,
      t: (texto: string) => texto,
    });
    expect(resultado.ok).toBe(true);
    expect(mocks.renderDocumentoPdf).toHaveBeenCalledWith(expect.objectContaining({ idioma: "pt-BR" }));
  });

  // Issue #109: `imagem_url` do produto e o logo da marca NÃO chegam mais ao
  // `@react-pdf` como URL — ele as buscaria no servidor, com o `fetch` do Node.
  // Quem busca é a rede segura; o renderizador recebe o resultado (data URI).
  describe("imagens do PDF", () => {
    const opcoes = { numero: 1, ano: 2026, t: (texto: string) => texto };

    it("a imagem do produto chega ao renderizador como os bytes buscados, nunca como a URL", async () => {
      mocks.buscarImagemParaPdf.mockResolvedValue("data:image/png;base64,AAAA");
      const resultado = await montarPdfDaProposta(
        montarAdmin(undefined, "https://cdn.exemplo.com/sofa.png") as never,
        ORG_ID,
        propostaBase("site"),
        opcoes,
      );
      expect(resultado.ok).toBe(true);
      expect(mocks.buscarImagemParaPdf).toHaveBeenCalledWith("https://cdn.exemplo.com/sofa.png");
      const entrada = mocks.renderDocumentoPdf.mock.calls[0]![0];
      expect(entrada.itens[0].imagemUrl).toBe("data:image/png;base64,AAAA");
    });

    it("imagem do produto que não veio vira sem imagem e a proposta sai", async () => {
      mocks.buscarImagemParaPdf.mockResolvedValue(null);
      const resultado = await montarPdfDaProposta(
        montarAdmin(undefined, "http://169.254.169.254/latest/meta-data/") as never,
        ORG_ID,
        propostaBase("site"),
        opcoes,
      );
      expect(resultado.ok).toBe(true);
      expect(mocks.renderDocumentoPdf.mock.calls[0]![0].itens[0].imagemUrl).toBeNull();
    });

    it("produto sem imagem_url não busca nada", async () => {
      await montarPdfDaProposta(montarAdmin(undefined, undefined) as never, ORG_ID, propostaBase("site"), opcoes);
      expect(mocks.buscarImagemParaPdf).not.toHaveBeenCalled();
    });

    it("o logo também é buscado, com a lista de destinos internos da INSTALAÇÃO; o do produto, sem", async () => {
      mocks.marcaDaOrganizacaoParaPdf.mockResolvedValue({
        appName: "Loja X",
        accentHex: null,
        logoUrl: "https://storage.exemplo.com/logo.png",
      });
      mocks.destinosInternosAutorizados.mockResolvedValue(["10.0.0.0/8"]);
      mocks.buscarImagemParaPdf.mockImplementation(async (url: string) => `data:image/png;base64,${url.length}`);

      await montarPdfDaProposta(
        montarAdmin(undefined, "https://cdn.exemplo.com/sofa.png") as never,
        ORG_ID,
        propostaBase("site"),
        opcoes,
      );

      const entrada = mocks.renderDocumentoPdf.mock.calls[0]![0];
      expect(entrada.marca.logoUrl).toBe(`data:image/png;base64,${"https://storage.exemplo.com/logo.png".length}`);

      const chamadaDoLogo = mocks.buscarImagemParaPdf.mock.calls.find((c: [string, ...unknown[]]) => c[0].endsWith("logo.png"))!;
      expect(chamadaDoLogo[1].politica.ipPermitido("10.1.2.3")).toBe(true);
      expect(chamadaDoLogo[1].politica.ipPermitido("192.168.0.1")).toBe(false);
      const chamadaDoProduto = mocks.buscarImagemParaPdf.mock.calls.find((c: [string, ...unknown[]]) => c[0].endsWith("sofa.png"))!;
      expect(chamadaDoProduto[1]).toBeUndefined();
    });

    it("logo que não veio vira sem logo e a proposta sai", async () => {
      mocks.marcaDaOrganizacaoParaPdf.mockResolvedValue({
        appName: "Loja X",
        accentHex: "#111111",
        logoUrl: "https://storage.exemplo.com/logo.png",
      });
      mocks.buscarImagemParaPdf.mockResolvedValue(null);
      const resultado = await montarPdfDaProposta(montarAdmin() as never, ORG_ID, propostaBase("site"), opcoes);
      expect(resultado.ok).toBe(true);
      expect(mocks.renderDocumentoPdf.mock.calls[0]![0].marca).toEqual({
        app_name: "Loja X",
        accent_hex: "#111111",
        logoUrl: null,
      });
    });
  });
});
