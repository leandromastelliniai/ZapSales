/**
 * A INBOX DIZ EM QUE ETAPA DO FUNIL ESTÁ CADA CONVERSA, E QUAL AGENTE DE IA
 * ATENDE — pela tela, com dados reais no banco.
 *
 * Fecha a direção "Linha do Funil" (pedido do dono do produto em 07/10/2026:
 * saber quando um agente de IA está trabalhando, quando passou para uma pessoa,
 * e qual é o atendente). Três provas, todas lendo o que uma pessoa vê:
 *
 *   1. a LINHA da lista mostra a etapa atual do funil do contato
 *      (`funil_do_contato`, calculado pela rota da lista);
 *   2. o CHIP do cabeçalho nomeia o agente da última resposta da IA
 *      (`GET /conversations/{id}/agente-atual`, lendo `metadata.ai_actor_id`);
 *   3. o MARCO da passagem nomeia o agente que passou a conversa
 *      (`passagens_de_atendimento.agente_id`, migration 0545).
 *
 * Uma interceptação, declarada: `/api/v1/ai/automatico-ativo`. Ela responde se a
 * ORGANIZAÇÃO tem algum agente publicado num canal — e a org do e2e pode não ter.
 * Sem ela o cabeçalho diz "Sem atendente" e o chip da IA nem existe. A rota que
 * esta spec prova (`agente-atual`) e todos os dados passam sem dublê.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test, type Page } from "./helpers/test";
import { createClient } from "@supabase/supabase-js";

import { carregarEnvLocal } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), "evidence/inbox-funil-e-nome-do-agente");
const ESPERA = 60_000;

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { id: string; email: string; role: string }>;
}

const env = carregarEnvLocal();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PREFIXO = "Funil e Agente E2E";
const SUFIXO = String(Date.now()).slice(-6);
const NOME_DO_AGENTE = `Sofia ${SUFIXO}`;
const ETAPA_ATUAL = "Proposta enviada";

let creds: Creds;
let conversaAutomatica = "";
let conversaPassada = "";
let agenteId = "";
let funilId = "";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(creds.users.agent!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app/, { timeout: ESPERA });
}

async function captura(page: Page, nome: string): Promise<void> {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCIA, `${nome}.png`), fullPage: true });
}

async function falhou(etapa: string, erro: { message: string } | null): Promise<void> {
  if (erro) throw new Error(`${etapa}: ${erro.message}`);
}

async function limpar(): Promise<void> {
  if (!creds) return;
  const { data } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", creds.org_id)
    .like("display_name", `${PREFIXO}%`);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((c) => c.id);
  if (ids.length > 0) {
    await admin.from("passagens_de_atendimento").delete().in("contact_id", ids);
    await admin.from("messages").delete().in("contact_id", ids);
    await admin.from("crm_leads").delete().in("contact_id", ids);
    await admin.from("conversations").delete().in("contact_id", ids);
    await admin.from("contacts").delete().in("id", ids);
  }
  await admin.from("ai_agents").delete().eq("organization_id", creds.org_id).like("name", "Sofia %");
  await admin.from("crm_stages").delete().eq("organization_id", creds.org_id).like("slug", "funil-agente-e2e-%");
  await admin.from("crm_pipelines").delete().eq("organization_id", creds.org_id).like("slug", "funil-agente-e2e-%");
}

/** Um contato + uma conversa aberta e sem dono, na sessão de canal da org. */
async function conversaNova(sessaoId: string, rotulo: string): Promise<{ contato: string; conversa: string }> {
  const { data: contato, error: e1 } = await admin
    .from("contacts")
    .insert({
      organization_id: creds.org_id,
      display_name: `${PREFIXO} ${rotulo} ${SUFIXO}`,
      phone_number: `+55119${String(Date.now()).slice(-7)}${rotulo.length}`,
    })
    .select("id")
    .single();
  await falhou(`contato ${rotulo}`, e1);
  const agora = new Date().toISOString();
  const { data: conversa, error: e2 } = await admin
    .from("conversations")
    .insert({
      organization_id: creds.org_id,
      contact_id: (contato as { id: string }).id,
      channel_session_id: sessaoId,
      status: "open",
      last_message_at: agora,
      last_inbound_at: agora,
    })
    .select("id")
    .single();
  await falhou(`conversa ${rotulo}`, e2);
  return { contato: (contato as { id: string }).id, conversa: (conversa as { id: string }).id };
}

test.describe("Inbox — a etapa do funil e o nome do agente de IA", () => {
  test.describe.configure({ timeout: 240_000 });

  test.beforeAll(async () => {
    if (!fs.existsSync(CREDS_PATH)) {
      execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    }
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    await limpar();

    const { data: sessao } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", creds.org_id)
      .limit(1)
      .maybeSingle();
    let sessaoId = (sessao as { id: string } | null)?.id ?? null;
    if (!sessaoId) {
      const { data, error } = await admin
        .from("channel_sessions")
        .insert({
          organization_id: creds.org_id,
          waha_session_name: `e2e-funil-agente-${SUFIXO}`,
          webhook_secret_encrypted: "e2e",
        })
        .select("id")
        .single();
      await falhou("channel_sessions", error);
      sessaoId = (data as { id: string }).id;
    }

    agenteId = randomUUID();
    await falhou(
      "ai_agents",
      (await admin.from("ai_agents").insert({
        id: agenteId,
        organization_id: creds.org_id,
        name: NOME_DO_AGENTE,
        system_prompt: "agente da spec de funil e nome",
      })).error,
    );

    // Funil próprio: três etapas, o lead na do meio.
    funilId = randomUUID();
    await falhou(
      "crm_pipelines",
      (await admin.from("crm_pipelines").insert({
        id: funilId,
        organization_id: creds.org_id,
        name: `Funil E2E ${SUFIXO}`,
        slug: `funil-agente-e2e-${SUFIXO}`,
      })).error,
    );
    const etapas = ["Novo contato", ETAPA_ATUAL, "Fechado"].map((nome, i) => ({
      id: randomUUID(),
      organization_id: creds.org_id,
      pipeline_id: funilId,
      name: nome,
      slug: `funil-agente-e2e-${SUFIXO}-${i}`,
      position: i + 1,
    }));
    await falhou("crm_stages", (await admin.from("crm_stages").insert(etapas)).error);

    // (1) + (2): conversa com a IA no comando, um negócio no funil e uma resposta da IA.
    const auto = await conversaNova(sessaoId, "Automatica");
    conversaAutomatica = auto.conversa;
    await falhou(
      "crm_leads",
      (await admin.from("crm_leads").insert({
        organization_id: creds.org_id,
        pipeline_id: funilId,
        stage_id: etapas[1]!.id,
        contact_id: auto.contato,
        title: `Negócio ${SUFIXO}`,
      })).error,
    );
    const base = {
      organization_id: creds.org_id,
      conversation_id: auto.conversa,
      channel_session_id: sessaoId,
      contact_id: auto.contato,
      type: "text" as const,
    };
    const t0 = Date.now() - 60_000;
    await falhou(
      "messages",
      (await admin.from("messages").insert([
        { ...base, direction: "inbound", status: "delivered", sent_via: "external_device", body: "Oi, quero saber o preço", sent_at: new Date(t0).toISOString() },
        { ...base, direction: "outbound", status: "sent", sent_via: "ai", body: "Claro! Te explico agora.", sent_at: new Date(t0 + 1000).toISOString(), metadata: { ai_actor_id: agenteId } },
      ])).error,
    );

    // (3): conversa que a IA passou para a equipe, com o agente gravado na passagem.
    const passada = await conversaNova(sessaoId, "Passada");
    conversaPassada = passada.conversa;
    await falhou(
      "passagens_de_atendimento",
      (await admin.from("passagens_de_atendimento").insert({
        organization_id: creds.org_id,
        contact_id: passada.contato,
        conversation_id: passada.conversa,
        motor: "engine",
        origem: "pedido_explicito",
        motivo_codigo: "requested_human",
        body: "Por que a IA passou: o cliente pediu para falar com uma pessoa.",
        agente_id: agenteId,
      })).error,
    );
  });

  test.afterAll(limpar);

  test("a lista mostra a etapa e o chip nomeia o agente da IA", async ({ page }) => {
    // Ver o cabeçalho do arquivo: só a pergunta "a org tem automático?" é dublê.
    await page.route("**/api/v1/ai/automatico-ativo", (rota) =>
      rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { ativo: true } }) }),
    );
    await login(page);
    await page.goto(`/app/inbox/${conversaAutomatica}`);

    const comando = page.getByTestId("comando-da-conversa");
    await expect(comando, "o chip precisa nomear o agente da última resposta").toContainText(
      `${NOME_DO_AGENTE} (IA) atendendo`,
      { timeout: ESPERA },
    );

    // "Todas": a aba que abre por padrão pode não ser a que contém a conversa.
    await page.getByRole("tab", { name: /^Todas/ }).click();
    const linha = page.locator(`button[data-conversation-id="${conversaAutomatica}"]`);
    await expect(
      linha.getByLabel(`Etapa do funil: ${ETAPA_ATUAL}`),
      "a linha da lista precisa mostrar a etapa atual do negócio do contato",
    ).toBeVisible({ timeout: ESPERA });
    await captura(page, "01-lista-com-etapa-e-chip-com-agente");
  });

  test("o marco da passagem nomeia o agente que passou a conversa", async ({ page }) => {
    await login(page);
    await page.goto(`/app/inbox/${conversaPassada}`);
    const marco = page.getByTestId("marco-da-passagem").first();
    await expect(marco).toBeVisible({ timeout: ESPERA });
    await expect(marco).toContainText(`${NOME_DO_AGENTE} (IA) passou a conversa para a equipe`);
    await captura(page, "02-marco-com-agente");
  });
});
