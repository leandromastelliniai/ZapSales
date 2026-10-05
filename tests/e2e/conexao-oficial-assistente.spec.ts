/**
 * A CONEXÃO GUIADA DO NÚMERO OFICIAL, PELA TELA (issue #5).
 *
 * Prova como um administrador leigo faria: entra, abre Conexões › API Oficial,
 * cola o token e a chave secreta, lê o que está errado, corrige, escolhe o
 * número da LISTA (sem digitar id), informa PIN e uso, conecta — e depois vê a
 * saúde do número mudar quando a Meta avisa, com o aviso na Central.
 *
 * A Meta é o FALSO Graph (`tests/support/falso-graph.ts`), servidor HTTP de
 * verdade na porta que o `.env.e2e` aponta (`META_GRAPH_BASE_URL`,
 * `scripts/gerar-env-e2e.sh`). O webhook de saúde é assinado com o App Secret e
 * postado na rota real. O Embedded Signup roda com o SDK da Meta substituído na
 * rede (`page.route`): o botão, a janela, o `postMessage` vindo de facebook.com
 * e a troca do código no servidor são os de produção.
 */
import { createHmac, randomUUID } from "node:crypto";
import * as fs from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { erroDaGraph, subirFalsoGraph, type FalsoGraph } from "../support/falso-graph";
import { expect, test, type Page } from "./helpers/test";

const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, { auth: { persistSession: false } });

const EVIDENCIA = "evidence/conexao-oficial-assistente";
fs.mkdirSync(EVIDENCIA, { recursive: true });

const SUFIXO = randomUUID().slice(0, 8);
const senha = `Local-${randomUUID()}!`;
// Ids numéricos únicos por execução: o índice de número oficial é global.
const sementeNumerica = String(Date.now()).slice(-9);
const NUMERO = `11${sementeNumerica}55`;
const WABA = `24${sementeNumerica}77`;
const APP = `77${sementeNumerica}`;
const TOKEN = `EAAG-token-da-prova-pela-tela-${SUFIXO}`;
const SEGREDO_DO_APP = `segredo-do-app-da-prova-${SUFIXO}`;
const SEGREDO_DA_INSTALACAO = `segredo-da-instalacao-${SUFIXO}`;

let falso: FalsoGraph;
/**
 * `platform_meta_app` é da INSTALAÇÃO inteira e outras specs da mesma parte a
 * leem: o que esta spec liga, ela devolve como estava. Sem DELETE — o
 * `service_role` nem tem esse grant na tabela; a volta é um UPDATE.
 */
let appDaInstalacaoAntes: Record<string, unknown> | null = null;
const COLUNAS_DO_APP =
  "app_id, embedded_signup_config_id, embedded_signup_ligado, app_secret_encrypted, verify_token_encrypted";
let email = "";
let orgId = "";

function portaDoFalso(): number {
  const base = process.env.META_GRAPH_BASE_URL ?? "";
  const porta = Number(new URL(base || "http://127.0.0.1:3995").port);
  return porta || 3995;
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
}

async function abrirAbaOficial(page: Page): Promise<void> {
  await page.goto("/app/connections?aba=oficial");
  await expect(page.getByTestId("canal-oficial-root")).toBeVisible({ timeout: 60_000 });
}

async function preencherCredenciais(page: Page): Promise<void> {
  await page.locator("#assistente-token").fill(TOKEN);
  await page.locator("#assistente-app-secret").fill(SEGREDO_DO_APP);
}

test.describe("assistente de conexão oficial", () => {
  test.describe.configure({ mode: "serial", timeout: 240_000 });

  test.beforeAll(async () => {
    const antes = await db.from("platform_meta_app").select(COLUNAS_DO_APP).eq("id", 1).maybeSingle();
    if (antes.error) throw antes.error;
    appDaInstalacaoAntes = (antes.data as Record<string, unknown> | null) ?? null;

    falso = await subirFalsoGraph({
      phoneNumberId: NUMERO,
      wabaId: WABA,
      appId: APP,
      appSecret: SEGREDO_DO_APP,
      segredoDaTroca: SEGREDO_DA_INSTALACAO,
      numeroExibido: "+55 31 97777-0000",
      nomeVerificado: `Loja Prova ${SUFIXO}`,
      tokenDoEmbeddedSignup: `EAAG-token-de-negocio-${SUFIXO}`,
      porta: portaDoFalso(),
    });

    email = `assistente-oficial-${SUFIXO}@invariant.test`;
    const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error || !data.user) throw error;
    const org = await db
      .from("organizations")
      .insert({
        slug: `assistente-oficial-${SUFIXO}`,
        legal_name: `Assistente Oficial ${SUFIXO}`,
        display_name: `Assistente Oficial ${SUFIXO}`,
        onboarded_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (org.error) throw org.error;
    orgId = (org.data as { id: string }).id;
    const vinculo = await db.from("user_organizations").insert({
      organization_id: orgId,
      user_id: data.user.id,
      role: "admin",
      accepted_at: new Date().toISOString(),
    });
    if (vinculo.error) throw vinculo.error;
  });

  test.afterAll(async () => {
    await db
      .from("platform_meta_app")
      .update(
        appDaInstalacaoAntes ?? {
          app_id: null,
          embedded_signup_config_id: null,
          embedded_signup_ligado: false,
          app_secret_encrypted: null,
          verify_token_encrypted: null,
        },
      )
      .eq("id", 1);
    if (orgId) await db.from("organizations").delete().eq("id", orgId);
    await falso?.fechar();
  });

  test("token expirado e app em desenvolvimento: cada um com a sua frase, e nada é gravado", async ({ page }) => {
    await login(page);
    await abrirAbaOficial(page);
    await page.screenshot({ path: `${EVIDENCIA}/00-aba-oficial.png`, fullPage: true });

    falso.programar({ metodo: "GET", terminaCom: "/debug_token" }, erroDaGraph(190, { status: 401, subcode: 463 }));
    await preencherCredenciais(page);
    await page.getByTestId("assistente-testar").click();
    await expect(page.getByTestId("assistente-problema-token_expirado")).toContainText(/expirou/i, {
      timeout: 30_000,
    });
    await page.screenshot({ path: `${EVIDENCIA}/01-token-expirado.png`, fullPage: true });

    falso.programar(
      { metodo: "GET", terminaCom: `/${WABA}` },
      {
        status: 200,
        corpo: {
          id: WABA,
          name: "Conta da Prova",
          primary_funding_id: "1",
          business_verification_status: "verified",
          health_status: { entities: [{ entity_type: "APP", id: APP, can_send_message: "LIMITED" }] },
        },
      },
    );
    await page.getByTestId("assistente-testar").click();
    await expect(page.getByTestId("assistente-problema-app_em_desenvolvimento")).toContainText(/Live/, {
      timeout: 30_000,
    });
    // Com problema, o passo de escolher o número nem aparece.
    await expect(page.getByTestId("assistente-passo-numero")).toHaveCount(0);
    await page.screenshot({ path: `${EVIDENCIA}/02-app-em-desenvolvimento.png`, fullPage: true });

    const { count } = await db
      .from("channel_sessions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    expect(count).toBe(0);
  });

  test("do token ao número conectado, escolhendo da lista — registro e assinatura feitos pelo assistente", async ({
    page,
  }) => {
    await login(page);
    await abrirAbaOficial(page);
    falso.limpar();

    await preencherCredenciais(page);
    await page.getByTestId("assistente-testar").click();
    const passoNumero = page.getByTestId("assistente-passo-numero");
    await expect(passoNumero).toBeVisible({ timeout: 30_000 });
    await expect(passoNumero.getByTestId("checklist-app_live")).toHaveAttribute("data-estado", "ok");
    await expect(passoNumero.getByTestId("checklist-forma_de_pagamento")).toHaveAttribute("data-estado", "ok");
    await expect(passoNumero.getByTestId("checklist-empresa_verificada")).toHaveAttribute("data-estado", "ok");
    await expect(passoNumero).toContainText("+55 31 97777-0000");
    // Um número só na conta: ele já vem escolhido.
    await expect(page.getByTestId(`assistente-numero-${NUMERO}`)).toBeChecked();
    await page.screenshot({ path: `${EVIDENCIA}/03-numeros-e-checklist.png`, fullPage: true });

    await page.locator("#assistente-pin").fill("246810");
    await page.getByTestId("assistente-uso-campanha").check();
    await page.getByTestId("assistente-conectar").click();

    await expect(page.getByTestId("canal-conectado")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("canal-uso")).toContainText(/Campanha/);
    await expect(page.getByTestId("canal-app")).toContainText(/app próprio/);
    await expect(page.getByTestId("saude-qualidade")).toContainText(/Verde/);
    await page.screenshot({ path: `${EVIDENCIA}/04-conectado.png`, fullPage: true });

    const vistas = falso.chamadas.map((c) => `${c.metodo} ${c.caminho}`);
    expect(vistas).toContain(`POST /${NUMERO}/register`);
    expect(vistas).toContain(`POST /${WABA}/subscribed_apps`);
    expect(vistas).toContain(`POST /${APP}/subscriptions`);

    // Os segredos não voltam: nem no HTML, nem no estado que a tela lê.
    await page.reload();
    await expect(page.getByTestId("canal-conectado")).toBeVisible({ timeout: 60_000 });
    const html = await page.content();
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain(SEGREDO_DO_APP);
    const estado = await page.request.get("/api/v1/channels/official");
    const corpo = await estado.text();
    expect(corpo).not.toContain(TOKEN);
    expect(corpo).not.toContain(SEGREDO_DO_APP);
  });

  test("a Meta avisa que a qualidade caiu: o painel muda e o aviso chega à Central", async ({ page }) => {
    await login(page);
    const estado = (await (await page.request.get("/api/v1/channels/official")).json()) as {
      data: { webhook: { callbackUrl: string } };
    };
    const tokenDoCaminho = estado.data.webhook.callbackUrl.split("/").pop()!;

    falso.programar(
      { metodo: "GET", terminaCom: `/${NUMERO}` },
      { status: 200, corpo: { id: NUMERO, quality_rating: "RED", whatsapp_business_manager_messaging_limit: "TIER_2K" } },
    );
    const corpo = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: WABA,
          changes: [
            {
              field: "phone_number_quality_update",
              value: { display_phone_number: "5531977770000", event: "FLAGGED", max_daily_conversations_per_business: "TIER_2K" },
            },
          ],
        },
      ],
    });
    const assinatura = `sha256=${createHmac("sha256", SEGREDO_DO_APP).update(corpo, "utf8").digest("hex")}`;
    const r = await page.request.post(`/api/v1/webhooks/meta/${tokenDoCaminho}`, {
      data: corpo,
      headers: { "content-type": "application/json", "x-hub-signature-256": assinatura },
    });
    expect(r.status(), await r.text()).toBe(200);

    await abrirAbaOficial(page);
    await expect(page.getByTestId("saude-qualidade")).toContainText(/Vermelha/, { timeout: 30_000 });
    await page.screenshot({ path: `${EVIDENCIA}/05-qualidade-vermelha.png`, fullPage: true });

    await page.goto("/app/ai/inbox");
    await expect(page.getByTestId("inbox-item").filter({ hasText: /vermelha/i }).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: `${EVIDENCIA}/06-aviso-na-central.png`, fullPage: true });
  });

  test("o uso declarado muda pela tela e fica salvo", async ({ page }) => {
    await login(page);
    await abrirAbaOficial(page);
    await page.getByTestId("uso-conectado-ambos").check();
    await expect(page.getByTestId("canal-uso")).toContainText(/Ambos/, { timeout: 30_000 });
    await page.reload();
    await expect(page.getByTestId("uso-conectado-ambos")).toBeChecked({ timeout: 60_000 });
  });

  test("Embedded Signup: desligado não aparece; ligado conecta pelo falso Graph", async ({ page }) => {
    await login(page);
    await abrirAbaOficial(page);
    await expect(page.getByTestId("embedded-signup")).toHaveCount(0);

    // Liga a chave da instalação, com o App Secret da instalação cifrado.
    const cifrar = async (texto: string) => {
      const { data, error } = await db.rpc("fn_encrypt_oauth", { plaintext: texto });
      if (error) throw error;
      return data as string;
    };
    const { error } = await db.from("platform_meta_app").upsert(
      {
        id: 1,
        app_id: APP,
        embedded_signup_config_id: "9988776655",
        embedded_signup_ligado: true,
        app_secret_encrypted: await cifrar(SEGREDO_DA_INSTALACAO),
        verify_token_encrypted: await cifrar(`verifica-${SUFIXO}`),
      },
      { onConflict: "id" },
    );
    if (error) throw error;

    // O SDK da Meta, substituído na rede: abre uma "janela" de facebook.com que
    // anuncia a WABA e o número, e devolve o código ao callback do login.
    await page.route("https://connect.facebook.net/**", (rota) =>
      rota.fulfill({
        contentType: "application/javascript",
        body: `window.FB = {
          init: function () {},
          login: function (cb) {
            var f = document.createElement("iframe");
            f.src = "https://www.facebook.com/embedded-signup-falso";
            f.style.display = "none";
            document.body.appendChild(f);
            setTimeout(function () { cb({ authResponse: { code: "codigo-de-uso-unico-${SUFIXO}" } }); }, 300);
          }
        };
        if (window.fbAsyncInit) window.fbAsyncInit();`,
      }),
    );
    await page.route("https://www.facebook.com/embedded-signup-falso", (rota) =>
      rota.fulfill({
        contentType: "text/html",
        body: `<script>parent.postMessage(JSON.stringify({type:"WA_EMBEDDED_SIGNUP",event:"FINISH",data:{phone_number_id:"${NUMERO}",waba_id:"${WABA}"}}),"*");</script>`,
      }),
    );

    // A credencial da instalação tem memória de 30 s no servidor.
    await expect(async () => {
      await abrirAbaOficial(page);
      await expect(page.getByTestId("embedded-signup")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    await page.screenshot({ path: `${EVIDENCIA}/07-embedded-signup-ligado.png`, fullPage: true });

    falso.limpar();
    await page.locator("#es-pin").fill("135790");
    await page.getByTestId("embedded-signup").getByLabel(/Atendimento/).check();
    await page.getByTestId("embedded-signup-abrir").click();

    await expect(page.getByTestId("canal-uso")).toContainText(/Atendimento/, { timeout: 60_000 });
    await expect(page.getByTestId("canal-app")).toContainText(/app da instalação/);
    expect(falso.chamadas.some((c) => c.caminho === "/oauth/access_token")).toBe(true);
    expect(falso.chamadas.some((c) => c.caminho === `/${NUMERO}/register`)).toBe(true);
    await page.screenshot({ path: `${EVIDENCIA}/08-conectado-pelo-embedded-signup.png`, fullPage: true });
  });
});
