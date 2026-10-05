/**
 * O WEBHOOK DE MODELO ATUALIZA O ESPELHO E AVISA NA CENTRAL (issue #6).
 *
 * Até aqui a rota gravava só o `status` do `message_template_status_update` e
 * descartava qualidade e categoria; e o aviso `channel_template_review` existia
 * no banco (0120) sem um único emissor. Estes casos prendem:
 *
 *  - status aprovado, recusado, pausado e desativado atualizam a linha;
 *  - recusado, pausado e desativado abrem aviso, com o motivo da Meta;
 *  - mudança de categoria atualiza a categoria e abre aviso de CUSTO;
 *  - o aviso prévio de recategorização avisa sem mexer na linha;
 *  - qualidade vermelha atualiza e avisa; verde só atualiza;
 *  - a Meta reentrega o mesmo evento: a segunda entrega não muda nada e NÃO
 *    abre outro aviso;
 *  - o evento de uma organização nunca escreve na linha de outra.
 *
 * Medir: `pnpm vitest run tests/unit/meta-eventos-de-modelo.test.ts`
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";

import { bancoEmMemoria } from "../support/banco-em-memoria";

import {
  aplicarEventoDeModelo,
  avisoDoEventoDeModelo,
} from "@/lib/channels/meta/eventos-de-modelo";
import type {
  TemplateCategoryEvent,
  TemplateQualityEvent,
  TemplateStatusEvent,
} from "@/lib/channels/meta/webhook";

type Linha = Record<string, unknown>;

const ORG_A = "org-a";
const ORG_B = "org-b";
const WABA = "2434045433735175";

let tabelas: Record<string, Linha[]>;
let db: SupabaseClient;

function modelo(org: string, extra: Linha = {}): Linha {
  return {
    id: `${org}-oferta`,
    organization_id: org,
    waba_id: WABA,
    name: "oferta_de_outubro",
    language: "pt_BR",
    status: "PENDING",
    category: "UTILITY",
    quality_score: null,
    rejected_reason: null,
    ...extra,
  };
}

const chave = { wabaId: WABA, templateName: "oferta_de_outubro", templateLanguage: "pt_BR" };
const status = (event: string, extra: Partial<TemplateStatusEvent> = {}): TemplateStatusEvent => ({
  kind: "template_status",
  ...chave,
  event,
  reason: null,
  ...extra,
});
const categoria = (category: string, efetiva = true): TemplateCategoryEvent => ({
  kind: "template_category",
  ...chave,
  previous: efetiva ? "UTILITY" : null,
  category,
  efetiva,
});
const qualidade = (quality: string): TemplateQualityEvent => ({
  kind: "template_quality",
  ...chave,
  previous: "GREEN",
  quality,
});

const avisos = () => tabelas.agent_inbox_items ?? [];
const linhaDe = (org: string) => tabelas.meta_templates!.find((l) => l.organization_id === org)!;

beforeEach(() => {
  tabelas = { meta_templates: [modelo(ORG_A), modelo(ORG_B)], agent_inbox_items: [] };
  db = bancoEmMemoria(tabelas);
});

describe("status do modelo", () => {
  it("APPROVED atualiza o status e não abre aviso — é a notícia boa, a lista já mostra", async () => {
    expect(await aplicarEventoDeModelo(db, ORG_A, status("APPROVED"))).toBe("modelo:atualizado");
    expect(linhaDe(ORG_A).status).toBe("APPROVED");
    expect(avisos()).toEqual([]);
  });

  it.each([
    ["REJECTED", "warn"],
    ["PAUSED", "critical"],
    ["DISABLED", "critical"],
  ])("%s atualiza o status e abre aviso %s na Central", async (evento, gravidade) => {
    await aplicarEventoDeModelo(
      db,
      ORG_A,
      status(evento, { reason: "INVALID_FORMAT", detail: "Explicação da Meta." }),
    );
    expect(linhaDe(ORG_A).status).toBe(evento);
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toMatchObject({
      organization_id: ORG_A,
      kind: "channel_template_review",
      severity: gravidade,
    });
    expect(String(avisos()[0]!.body)).toContain("oferta_de_outubro");
    expect(String(avisos()[0]!.body)).toContain("Explicação da Meta.");
  });

  it("REJECTED grava o motivo; voltar a APPROVED limpa o motivo", async () => {
    await aplicarEventoDeModelo(db, ORG_A, status("REJECTED", { reason: "INVALID_FORMAT" }));
    expect(linhaDe(ORG_A).rejected_reason).toBe("INVALID_FORMAT");
    await aplicarEventoDeModelo(db, ORG_A, status("APPROVED"));
    expect(linhaDe(ORG_A).rejected_reason).toBeNull();
  });

  it("a reentrega do mesmo evento não muda nada nem abre outro aviso", async () => {
    await aplicarEventoDeModelo(db, ORG_A, status("PAUSED"));
    expect(await aplicarEventoDeModelo(db, ORG_A, status("PAUSED"))).toBe("modelo:sem_mudanca");
    expect(avisos()).toHaveLength(1);
  });

  it("modelo que o espelho não conhece não vira linha nem aviso", async () => {
    const e = { ...status("PAUSED"), templateName: "nunca_sincronizado" };
    expect(await aplicarEventoDeModelo(db, ORG_A, e)).toBe("modelo:desconhecido");
    expect(avisos()).toEqual([]);
  });

  it("o evento de uma organização não toca a linha da outra", async () => {
    await aplicarEventoDeModelo(db, ORG_A, status("DISABLED"));
    expect(linhaDe(ORG_B).status).toBe("PENDING");
    expect(avisos().every((a) => a.organization_id === ORG_A)).toBe(true);
  });
});

describe("categoria do modelo", () => {
  it("mudança efetiva atualiza a categoria e abre aviso de custo", async () => {
    expect(await aplicarEventoDeModelo(db, ORG_A, categoria("MARKETING"))).toBe(
      "modelo:atualizado",
    );
    expect(linhaDe(ORG_A).category).toBe("MARKETING");
    expect(avisos()).toHaveLength(1);
    expect(avisos()[0]).toMatchObject({ kind: "channel_template_review", severity: "warn" });
    expect(String(avisos()[0]!.title)).toMatch(/custo/i);
    expect(String(avisos()[0]!.body)).toMatch(/utilidade.*marketing/i);
  });

  it("a reentrega da mesma mudança não abre outro aviso", async () => {
    await aplicarEventoDeModelo(db, ORG_A, categoria("MARKETING"));
    await aplicarEventoDeModelo(db, ORG_A, categoria("MARKETING"));
    expect(avisos()).toHaveLength(1);
  });

  it("o aviso prévio avisa sem mudar a categoria, e uma só vez", async () => {
    expect(await aplicarEventoDeModelo(db, ORG_A, categoria("MARKETING", false))).toBe(
      "modelo:aviso_previo",
    );
    await aplicarEventoDeModelo(db, ORG_A, categoria("MARKETING", false));
    expect(linhaDe(ORG_A).category).toBe("UTILITY");
    expect(avisos()).toHaveLength(1);
    expect(String(avisos()[0]!.body)).toMatch(/vai/i);
  });
});

describe("qualidade do modelo", () => {
  it("vermelha atualiza e avisa; verde só atualiza", async () => {
    await aplicarEventoDeModelo(db, ORG_A, qualidade("RED"));
    expect(linhaDe(ORG_A).quality_score).toBe("RED");
    expect(avisos()).toHaveLength(1);
    await aplicarEventoDeModelo(db, ORG_A, qualidade("GREEN"));
    expect(linhaDe(ORG_A).quality_score).toBe("GREEN");
    expect(avisos()).toHaveLength(1);
  });
});

describe("avisoDoEventoDeModelo — a decisão pura", () => {
  it("não avisa de pendente, aprovado nem qualidade amarela", () => {
    expect(avisoDoEventoDeModelo(status("PENDING"))).toBeNull();
    expect(avisoDoEventoDeModelo(status("APPROVED"))).toBeNull();
    expect(avisoDoEventoDeModelo(qualidade("YELLOW"))).toBeNull();
  });
});
