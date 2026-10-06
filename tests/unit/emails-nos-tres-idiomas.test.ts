import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TODO E-MAIL DO PRODUTO SAI NO IDIOMA DE QUEM LÊ (issue #12).
 *
 * Os quatro e-mails que o produto monta — convite de time, os dois moldes de
 * acesso do GoTrue (confirmar conta, redefinir senha), o relatório de LGPD ao
 * titular e o alarme de prazo de LGPD ao DPO — eram escritos em português fixo,
 * e nem o espanhol, que é `completo` desde antes, os alcançava.
 *
 * As frases passam por `frase()`/`fraseHtml()` (`lib/email/frase.ts`), que o
 * guarda das telas não enxerga. Este arquivo é o guarda deles: monta cada
 * e-mail em cada idioma servido e reprova o que cair no português. Uma frase
 * nova sem tradução volta português, e é aqui que isso fica vermelho.
 */

const enviado = vi.hoisted(() => ({ subject: "", html: "", text: "" }));
const idiomaDaOrg = vi.hoisted(() => ({ valor: "pt-BR" as "pt-BR" | "es" | "en" }));

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));
vi.mock("@/lib/email/roteador", () => ({
  sendEmail: vi.fn(async (e: { subject: string; html: string; text: string }) => {
    enviado.subject = e.subject;
    enviado.html = e.html;
    enviado.text = e.text;
    return { ok: true, id: "msg-1" };
  }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://crm.test" } }));
vi.mock("@/lib/instalacao/config", () => ({ valorDaInstalacao: async () => ({ valor: "" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async () => ({ error: null }) }),
}));
vi.mock("@/lib/i18n/idioma-da-organizacao", () => ({
  idiomaDaOrganizacao: async () => idiomaDaOrg.valor,
}));

import type { MarcaDeSaida } from "@/lib/branding/saida";
import {
  MODELOS_DE_ACESSO,
  assuntoDoModelo,
  montarTemplateDeAcesso,
} from "@/lib/email/templates/acesso-gotrue";
import { buildInviteEmail } from "@/lib/email/templates/invite";
import { tagDeIdioma } from "@/lib/i18n/datas";
import type { Idioma } from "@/lib/i18n/idiomas";
import { sendExportEmail } from "@/lib/lgpd/email-delivery";
import { triggerSlaAlarm } from "@/lib/lgpd/sla-alarm";
import type { LgpdRequest } from "@/lib/lgpd/types";

const MARCA: MarcaDeSaida = {
  nome: "Acme Vendas",
  logoUrl: null,
  accent: "#2f6f4e",
  accentFg: "#ffffff",
  origens: { nome: "banco", cor: "banco" },
};

/**
 * Português que nem o espanhol nem o inglês escrevem: as letras `ã õ ç ê` e
 * palavras funcionais só do português. "está" e "para" ficam de fora — o
 * espanhol as usa.
 */
const PORTUGUES = /[ãõçê]|\b(você|seu|sua|não|pelo|pela|com|sem|olá|solicitação|relatório|convite|senha|acesse|aceitar|prazo)\b/iu;

/** URL e marcação não são frase: o domínio de exemplo tem `.com`. */
function soAProsa(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{\{[^}]*\}\}/g, " ");
}

const OUTROS: Exclude<Idioma, "pt-BR">[] = ["es", "en"];

function semPortugues(rotulo: string, ...partes: string[]) {
  for (const parte of partes) {
    expect(soAProsa(parte), rotulo).not.toMatch(PORTUGUES);
  }
}

const convite = (idioma?: Idioma) =>
  buildInviteEmail({
    inviterName: "Ana",
    orgName: "Acme",
    acceptUrl: "https://crm.test/team/accept-invite/tok",
    role: "agent",
    expiresAt: new Date("2026-08-20T12:00:00.000Z"),
    marca: MARCA,
    idioma,
  });

describe("convite de time", () => {
  it.each(OUTROS)("%s: assunto, corpo e texto puro sem português", (idioma) => {
    const { subject, html, text } = convite(idioma);
    semPortugues(idioma, subject, html, text);
    expect(html).toContain(`lang="${tagDeIdioma(idioma)}"`);
  });

  it("os valores entram nos marcadores de toda língua", () => {
    for (const idioma of ["pt-BR", ...OUTROS] as Idioma[]) {
      const { subject, html, text } = convite(idioma);
      for (const parte of [subject, html, text]) expect(parte, idioma).not.toMatch(/\{[a-z]+\}/);
      expect(html, idioma).toContain("<strong>agent</strong>");
    }
  });

  it("sem idioma, o português de antes não mudou", () => {
    expect(convite().subject).toBe("Ana convidou você para a Acme no Acme Vendas");
    expect(convite().text.split("\n")[0]).toBe("Você foi convidado para a Acme como agent no Acme Vendas.");
  });
});

describe("moldes de acesso do GoTrue", () => {
  it.each(OUTROS)("%s: confirmação e redefinição sem português", (idioma) => {
    for (const modelo of MODELOS_DE_ACESSO) {
      const html = montarTemplateDeAcesso(modelo, MARCA, idioma);
      semPortugues(`${idioma} / ${modelo}`, assuntoDoModelo(modelo, MARCA, idioma), html);
      expect(html).toContain(`lang="${tagDeIdioma(idioma)}"`);
      // A sintaxe do GoTrue sobrevive à tradução: ela é do renderizador, não frase.
      expect(html).toContain("{{ .RedirectTo }}&token_hash={{ .TokenHash }}");
    }
  });

  it("sem idioma, o assunto em português não mudou", () => {
    expect(assuntoDoModelo("recovery", MARCA)).toBe("Redefinir sua senha · Acme Vendas");
  });
});

describe("relatório de LGPD ao titular", () => {
  it.each(OUTROS)("%s: assunto, corpo e texto puro sem português", async (idioma) => {
    await sendExportEmail({
      to: "titular@exemplo.test",
      requestId: "11111111-1111-4111-8111-111111111111",
      signedUrl: "https://crm.test/arquivo?token=x",
      expiresAt: new Date("2026-09-27T12:00:00.000Z"),
      marca: MARCA,
      idioma,
    });
    semPortugues(idioma, enviado.subject, enviado.html, enviado.text);
    // A lei é citada pelo nome em toda língua: é ela que rege o pedido.
    expect(enviado.text).toContain("LGPD");
  });
});

describe("alarme de prazo de LGPD ao DPO", () => {
  const pedido = {
    id: "22222222-2222-4222-8222-222222222222",
    organization_id: "00000000-0000-4000-8000-00000000000b",
    request_type: "data_request",
    status: "pending",
    attempts: 0,
    received_at: "2026-09-20T12:00:00.000Z",
    due_at: "2026-09-27T12:00:00.000Z",
    request_payload: {},
  } as unknown as LgpdRequest;

  beforeEach(() => {
    enviado.subject = enviado.html = enviado.text = "";
  });

  it.each(OUTROS)("%s: sai no idioma da organização, sem português", async (idioma) => {
    idiomaDaOrg.valor = idioma;
    await triggerSlaAlarm({
      request: pedido,
      threshold: "data_request_d5",
      organizationDpoEmail: "dpo@empresa.test",
      organizationName: "Empresa B",
      marca: MARCA,
    });
    expect(enviado.subject, "o alarme não foi enviado").not.toBe("");
    semPortugues(idioma, enviado.subject, enviado.html, enviado.text);
  });
});
