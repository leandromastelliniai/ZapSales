// @vitest-environment node
//
// `node`, e não o jsdom da suíte, pelo mesmo motivo de
// `lib/propostas/documento/pdf-do-documento.test.ts`: o caso LÊ o texto de
// dentro do PDF, e em jsdom o `pdfjs-dist` devolve "no text".
import { describe, expect, it } from "vitest";

import { extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import type { ExportPayload } from "@/lib/lgpd/export-collector";
import { renderLgpdPdf } from "@/lib/lgpd/pdf-renderer";
import { renderDocumentoPdf, type DocumentoPdfInput } from "@/lib/propostas/documento/pdf-do-documento";
import { renderPropostaPdf, type PropostaPdfInput } from "@/lib/propostas/pdf";

/**
 * OS PDFs SAEM NO IDIOMA DA ORGANIZAÇÃO (issue #12).
 *
 * A proposta é lida por quem a RECEBE, cliente da organização; o relatório de
 * LGPD, pelo titular. Nenhum dos dois conhece o idioma de quem apertou o botão —
 * e um PDF com "Válida até" para um cliente que lê inglês parece documento de
 * outra empresa.
 *
 * A asserção é sobre o TEXTO EXTRAÍDO do arquivo, não sobre a árvore React: é o
 * byte que o cliente abre. E cada caso olha os dois lados — o rótulo em inglês
 * presente e o português ausente —, porque "contém Proposal" passaria com o
 * documento meio traduzido.
 */

const normalizado = (texto: string) => texto.replace(/\s+/g, " ");

const PROPOSTA_LEGADA: PropostaPdfInput = {
  titulo: "Website",
  numero: 42,
  ano: 2026,
  versao: 2,
  condicoes: null,
  validUntil: "2026-10-01",
  itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 800000, descontoCents: 0 }],
  totalCents: 800000,
  moeda: "BRL",
  marca: { app_name: null, accent_hex: null, logoUrl: null },
  destinatario: { nome: "Jane Doe", email: null, telefone: null },
};

const DOCUMENTO: DocumentoPdfInput = {
  titulo: "Website",
  numero: 12,
  ano: 2026,
  versao: 1,
  destinatario: { nome: "Jane Doe" },
  secoes: [{ id: "investment", title: "Investment", body: "body", faltantes: [] }],
  itens: [{ descricao: "Site", quantidade: 1, precoUnitarioCents: 350000, descontoCents: 0, imagemUrl: null }],
  totalCents: 350000,
  moeda: "BRL",
  validUntil: "2026-10-16",
  condicoes: null,
  marca: { app_name: null, accent_hex: null, logoUrl: null },
};

/** As frases fixas da proposta em português — nenhuma pode sobrar no PDF em inglês. */
const PORTUGUES_DA_PROPOSTA = ["Proposta ", "Para:", "Válida até", "Proposta comercial", "página", "Prévia"];

function lgpd(): ExportPayload {
  return {
    request_id: "3f2a9c10-0000-4000-8000-000000000001",
    organization_id: "8c1d4e20-0000-4000-8000-000000000002",
    organization_legal_name: "Bem Viver Servicos LTDA",
    organization_display_name: "Bem Viver",
    lei_citada: "LGPD Art. 18, II (Lei nº 13.709/2018)",
    documento_rotulo: "CPF",
    dpo_email: null,
    generated_at: "2030-01-02T13:05:00Z",
    no_local_footprint: true,
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone_number: null,
      cpf_present: true,
      source: null,
      created_at: "2030-01-01T10:00:00Z",
      is_anonymized: false,
      campos_legiveis: [],
    },
    consents: [], conversations: [], messages_count_total: 0, messages_recent: [], leads: [], orders: [],
    activities: [], appointments: [], sales: [], proposals: [], tasks: [], webhook_captures: [],
    audit_log_extract: [], meeting_deliveries: [], voice_calls: [], prospecting_candidates: [], cases: [],
    case_events: [], case_chat_messages: [], checkpoints: [], passagens: [], avisos_de_caso: [], demandas: [],
    campaign_recipients: [], campaign_suppressions: [], appointment_notices: [],
    channel_session_groups: [], group_messages_authored: [],
  } as unknown as ExportPayload;
}

describe("PDF da proposta (legado) no idioma da organização", () => {
  it("em inglês: rótulos e valor em inglês, nenhum rótulo em português", async () => {
    const texto = normalizado(await extractPdfText(await renderPropostaPdf({ ...PROPOSTA_LEGADA, idioma: "en" })));
    for (const v of ["Proposal 0042/2026 — v2", "To: Jane Doe", "Total: R$8,000.00", "Valid until 2026-10-01", "Commercial proposal — page 1 of 1"]) {
      expect(texto).toContain(v);
    }
    for (const v of PORTUGUES_DA_PROPOSTA) expect(texto).not.toContain(v);
  });

  it("sem idioma: o português de sempre", async () => {
    const texto = normalizado(await extractPdfText(await renderPropostaPdf(PROPOSTA_LEGADA)));
    for (const v of ["Proposta 0042/2026 — v2", "Para: Jane Doe", "Total: R$ 8.000,00", "Válida até 2026-10-01", "Proposta comercial — página 1 de 1"]) {
      expect(texto).toContain(v);
    }
  });
});

describe("PDF do documento da proposta no idioma da organização", () => {
  it("em inglês, com número", async () => {
    const texto = normalizado(await extractPdfText(await renderDocumentoPdf({ ...DOCUMENTO, idioma: "en" })));
    for (const v of ["Proposal 0012/2026", "To: Jane Doe", "Total: R$3,500.00", "Valid until 2026-10-16", "Commercial proposal — page 1 of 1"]) {
      expect(texto).toContain(v);
    }
    for (const v of PORTUGUES_DA_PROPOSTA) expect(texto).not.toContain(v);
  });

  it("a prévia sai no mesmo idioma que o cliente vai receber", async () => {
    const texto = normalizado(
      await extractPdfText(await renderDocumentoPdf({ ...DOCUMENTO, numero: null, ano: null, previa: true, idioma: "en" })),
    );
    expect(texto).toContain("Preview — no number");
    expect(texto).not.toContain("Prévia");
  });

  it("em espanhol", async () => {
    const texto = normalizado(await extractPdfText(await renderDocumentoPdf({ ...DOCUMENTO, idioma: "es" })));
    for (const v of ["Propuesta 0012/2026", "Para: Jane Doe", "Válida hasta 2026-10-16", "Propuesta comercial — página 1 de 1"]) {
      expect(texto).toContain(v);
    }
    expect(texto).not.toContain("Válida até");
  });
});

describe("relatório de LGPD no idioma da organização", () => {
  it("em inglês: texto fixo em inglês, controlador e lei citada intactos", async () => {
    const texto = normalizado(await extractPdfText(await renderLgpdPdf(lgpd(), { unsignedWarning: true, idioma: "en" })));
    for (const v of [
      "Data Access Report",
      "Request Metadata",
      "Organization:",
      "Internal ID:",
      "No personal data found in internal systems.",
      "Personal Data (Contact)",
      "Stored (encrypted)",
      "Anonymized:",
      "No consent recorded.",
      "PAdES DIGITAL SIGNATURE PENDING",
      // A entidade e a lei não se traduzem: só a frase em volta delas.
      "Controller: Bem Viver Servicos LTDA",
      "LGPD Art. 18, II (Lei nº 13.709/2018)",
      "not provided by the controller",
    ]) {
      expect(texto).toContain(v);
    }
    for (const v of [
      "Relatório",
      "Metadados",
      "Organização",
      "Nenhum",
      "Consentimentos",
      "Anonimizado",
      "ASSINATURA",
      "Controlador:",
      "Encarregado",
      "não informado",
    ]) {
      expect(texto).not.toContain(v);
    }
  });

  it("sem idioma: o português de sempre", async () => {
    const texto = normalizado(await extractPdfText(await renderLgpdPdf(lgpd())));
    for (const v of [
      "Relatório de Acesso aos Dados",
      "Metadados da Solicitação",
      "Controlador: Bem Viver Servicos LTDA",
      "não informado pelo controlador",
    ]) {
      expect(texto).toContain(v);
    }
  });
});
