/**
 * A RESPOSTA EM ÁUDIO, PELA TELA (Agente de IA › Provedores › "Resposta em áudio").
 *
 * Issue #91 (parte da #86). O caminho de quem acabou de instalar e NÃO tem nenhuma chave
 * de voz: o cartão abre dizendo por que o recurso está indisponível e não deixa ligar;
 * o admin cola a chave do provedor, marca que concorda em enviar o texto das respostas,
 * liga e salva — e confere no banco que a chave ficou CIFRADA, que o aceite carimbou
 * QUEM aceitou, e que a chave nunca voltou ao browser. O "Testar" chama o provedor de
 * verdade com uma chave falsa: o que se prova é que a tela explica a recusa em vez de
 * dizer "funcionou" (o caminho feliz, com chave real, é provado na instalação — nenhuma
 * chave de voz vai para o CI).
 *
 * Depois, o editor do agente: a opção vem DESLIGADA, e a seção diz qual provedor está
 * em uso. O envio em si (texto → nota de voz, queda para texto, ordem depois da cadeia)
 * é provado com um endpoint de voz de verdade em
 * `tests/invariants/resposta-em-audio-no-turno.test.ts`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";
import { admin, captura, creds, registra } from "./qa-l12-comum";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const CHAVE = `sk-chave-falsa-de-voz-e2e-${`${Date.now()}`.slice(-6)}`;

/** O `admin` da organização de teste tem TOTP; sem ele o login para em /login/mfa. */
async function loginComTotp(page: import("@playwright/test").Page, email: string, senha: string): Promise<void> {
  const segredo = (JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as { admin_totp?: { secret: string } }).admin_totp
    ?.secret;
  if (!segredo) throw new Error("sem admin_totp em .e2e-creds.json");

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click({ timeout: 15_000 });
  await page.waitForURL(/\/login\/mfa/, { timeout: 90_000 });

  const digito1 = page.locator('input[aria-label="Dígito 1"]');
  const recusa = page.locator("form").getByRole("alert");
  for (let i = 0; i < 3; i++) {
    if (msUntilNextTotpWindow() < 3_000) await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    await digito1.click({ timeout: 15_000 });
    await page.keyboard.type(generateTotp(segredo), { delay: 40 });
    const desfecho = await Promise.race([
      page.waitForURL(/\/app\//, { timeout: 60_000 }).then(() => "entrou" as const, () => "nada" as const),
      recusa.waitFor({ state: "visible", timeout: 60_000 }).then(() => "recusado" as const, () => "nada" as const),
    ]);
    if (desfecho === "entrou") return;
    registra(`[ambiente] MFA de ${email}: tentativa ${i + 1} = ${desfecho}`);
    await page.waitForTimeout(msUntilNextTotpWindow() + 200);
  }
  throw new Error(`MFA falhou para ${email} (url=${page.url()})`);
}

/** Estado fresco de instalação: sem chave de voz e sem a configuração da resposta em áudio. */
async function voltaAoEstadoDeInstalacaoNova(orgId: string): Promise<void> {
  await admin.from("voice_provider_credentials").delete().eq("organization_id", orgId);
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const { resposta_em_audio: _tirada, ...resto } = settings;
  void _tirada;
  await admin.from("organizations").update({ settings: resto }).eq("id", orgId);
}

test.describe("Resposta em áudio pela tela", () => {
  test.describe.configure({ timeout: 300_000 });

  test("instalação sem chave de voz: explica e não deixa ligar; grava cifrada, aceita, liga; o teste explica a recusa; o agente nasce com a opção desligada", async ({
    page,
  }) => {
    const c = creds();
    await voltaAoEstadoDeInstalacaoNova(c.org_id);

    try {
      await loginComTotp(page, c.users.admin!.email, c.password);
      await page.goto("/app/ai/providers");
      const cartao = page.getByTestId("cartao-de-resposta-em-audio");
      await cartao.scrollIntoViewIfNeeded({ timeout: 60_000 });

      // 1 · Instalação nova: indisponível, com a explicação, e o interruptor travado.
      await expect(cartao.getByTestId("audio-estado")).toHaveText("Indisponível", { timeout: 30_000 });
      await expect(cartao.getByTestId("audio-por-que")).toContainText("Desligada");
      await expect(cartao.getByTestId("audio-ligado")).toBeDisabled();
      await expect(cartao.getByTestId("audio-ligar-bloqueado")).toBeVisible();
      await expect(cartao.getByTestId("audio-testar")).toBeDisabled();
      await captura(page, "audio-01-instalacao-sem-chave");

      // 2 · Cola a chave, aceita e liga.
      await cartao.getByTestId("audio-chave").fill(CHAVE);
      await expect(cartao.getByTestId("audio-ligado")).toBeDisabled(); // falta o aceite
      await cartao.getByTestId("audio-aceite").check();
      await expect(cartao.getByTestId("audio-ligado")).toBeEnabled();
      await cartao.getByTestId("audio-ligado").click();
      await captura(page, "audio-02-chave-colada-e-aceite");
      await cartao.getByTestId("audio-salvar").click();
      await expect(cartao.getByTestId("audio-estado")).toHaveText("Disponível", { timeout: 30_000 });
      await expect(cartao.getByTestId("audio-chave-gravada")).toContainText(`···${CHAVE.slice(-4)}`);
      await captura(page, "audio-03-disponivel");

      // No banco: os 4 últimos e a chave CIFRADA; a configuração ligada, com QUEM aceitou.
      // Na tela: o campo limpo e a chave em lugar nenhum.
      const { data: linha } = await admin
        .from("voice_provider_credentials")
        .select("provider, api_key_last4, api_key_encrypted")
        .eq("organization_id", c.org_id)
        .single();
      const chave = linha as { provider: string; api_key_last4: string; api_key_encrypted: string };
      expect(chave.provider).toBe("openai_compativel");
      expect(chave.api_key_last4).toBe(CHAVE.slice(-4));
      expect(String(chave.api_key_encrypted)).not.toContain(CHAVE);
      const { data: org } = await admin.from("organizations").select("settings").eq("id", c.org_id).single();
      const cfg = ((org as { settings: { resposta_em_audio?: { ligado: boolean; aceite: { por: string } | null } } }).settings
        .resposta_em_audio ?? null) as { ligado: boolean; aceite: { por: string } | null } | null;
      expect(cfg?.ligado).toBe(true);
      expect(cfg?.aceite?.por).toBe(c.users.admin!.id);
      await expect(cartao.getByTestId("audio-chave")).toHaveValue("");
      expect(await page.content()).not.toContain(CHAVE);

      // 3 · Testar a gravada: o provedor recusa a chave falsa, e a tela explica em vez de dizer "funcionou".
      await cartao.getByTestId("audio-testar").click();
      const resultado = cartao.getByTestId("audio-resultado");
      await expect(resultado).toBeVisible({ timeout: 45_000 });
      await expect(resultado).not.toContainText("Funcionou");
      registra(`resposta em áudio · teste com chave falsa = ${await resultado.innerText()}`);
      await captura(page, "audio-04-teste-explica-a-recusa");

      // 4 · O editor do agente: a opção nasce DESLIGADA e a seção diz qual provedor está em uso.
      await page.goto("/app/ai/agents/new");
      const doAgente = page.getByTestId("resposta-em-audio-do-agente");
      await doAgente.scrollIntoViewIfNeeded({ timeout: 60_000 });
      await expect(doAgente.getByTestId("audio-reply-enabled")).toHaveAttribute("aria-checked", "false");
      await expect(doAgente.getByTestId("audio-reply-estado")).toContainText("Compatível com a OpenAI", {
        timeout: 30_000,
      });
      await captura(page, "audio-05-editor-do-agente");

      // 5 · Remove a chave: o recurso continua ligado e a tela volta a explicar o que falta.
      await page.goto("/app/ai/providers");
      const cartao2 = page.getByTestId("cartao-de-resposta-em-audio");
      await cartao2.scrollIntoViewIfNeeded({ timeout: 60_000 });
      await cartao2.getByTestId("audio-remover").click();
      await expect(cartao2.getByTestId("audio-estado")).toHaveText("Indisponível", { timeout: 30_000 });
      await expect(cartao2.getByTestId("audio-por-que")).toContainText("falta gravar a chave");
      const { count } = await admin
        .from("voice_provider_credentials")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id);
      expect(count).toBe(0);
    } finally {
      await voltaAoEstadoDeInstalacaoNova(c.org_id);
    }
  });
});
