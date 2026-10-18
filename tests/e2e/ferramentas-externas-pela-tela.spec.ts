/**
 * AS FERRAMENTAS EXTERNAS DO AGENTE, PELA TELA (Agente de IA › Ferramentas externas).
 *
 * Issue #94 (parte da #86). O caminho de quem acabou de instalar e NÃO tem nenhuma
 * ferramenta: a tela abre dizendo que o agente ainda não consulta nenhum sistema; o
 * dono tenta cadastrar um endereço da rede interna e a tela RECUSA por segurança;
 * "Altera dados" pode ser escolhido (e liga a aprovação sozinho — #95); cadastra uma consulta de
 * verdade (endereço público por IP, sem depender de DNS), vê a chave de assinatura UMA
 * vez, confere no banco que ela ficou CIFRADA e que a tela nunca mais a mostra; marca a
 * ferramenta no editor do agente (conta no teto) e a desativa.
 *
 * O "Testar de verdade" aponta para um endereço público que não responde de dentro do
 * CI: o que se prova é que a tela explica a falha em vez de dizer "funcionou". O
 * caminho feliz da chamada (assinatura, corpo, resultado como dado, falha na Central,
 * prévia) é provado com um receptor HTTP de verdade em
 * `lib/ai/ferramentas-externas/*.test.ts` e
 * `tests/invariants/ferramenta-externa-no-turno.test.ts`.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";
import { admin, captura, creds, registra } from "./qa-l12-comum";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
/** Um IPv4 público por literal: passa pela rede segura sem depender de DNS. */
const ENDERECO_PUBLICO = "https://93.184.216.34/hook-e2e";

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

/** Estado fresco de instalação: nenhuma ferramenta externa na organização. */
async function semFerramentas(orgId: string): Promise<void> {
  await admin.from("agent_external_tools").delete().eq("organization_id", orgId);
}

test.describe("Ferramentas externas pela tela", () => {
  test.describe.configure({ timeout: 300_000 });

  test("instalação sem ferramenta: explica; recusa endereço interno; trava 'altera dados'; cadastra, mostra a chave uma vez, marca no agente e desativa", async ({
    page,
  }) => {
    const c = creds();
    await semFerramentas(c.org_id);

    try {
      await loginComTotp(page, c.users.admin!.email, c.password);

      // 1 · Instalação nova: a tela diz o que é e o que fazer.
      await page.goto("/app/ai/external-tools");
      await expect(page.getByTestId("ferramentas-vazio")).toContainText("O agente ainda não consulta nenhum sistema", {
        timeout: 60_000,
      });
      await captura(page, "ferramentas-01-instalacao-nova");

      // 2 · Endereço da rede interna: recusado por segurança, nada é gravado.
      await page.getByTestId("nova-ferramenta").click();
      const formulario = page.getByTestId("formulario-da-ferramenta");
      await formulario.getByLabel("Nome", { exact: true }).fill("Consultar estoque");
      await formulario.getByLabel("Quando o agente deve usar").fill("Quando o cliente perguntar se um produto está disponível.");
      await formulario.getByLabel("Endereço (https)").fill("https://localhost/hook");
      await page.getByTestId("salvar-ferramenta").click();
      await expect(page.getByText("Este endereço não pode ser usado", { exact: false })).toBeVisible({ timeout: 30_000 });
      const { count: gravadasAposRecusa } = await admin
        .from("agent_external_tools")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id);
      expect(gravadasAposRecusa).toBe(0);
      await captura(page, "ferramentas-02-endereco-interno-recusado");

      // 3 · "Altera dados" pode ser escolhido (#95) e liga «Pedir aprovação» sozinho; voltar a «Só
      //     consulta» desliga — a escolha é do padrão do efeito, a pessoa nem precisou tocar na chave.
      await expect(formulario.getByLabel(/Altera dados/)).toBeEnabled();
      await expect(page.getByTestId("pedir-aprovacao")).not.toBeChecked();
      await formulario.getByLabel(/Altera dados/).check();
      await expect(page.getByTestId("pedir-aprovacao")).toBeChecked();
      await formulario.getByLabel(/Só consulta/).check();
      await expect(page.getByTestId("pedir-aprovacao")).not.toBeChecked();

      // 4 · Um campo que o agente preenche, e um endereço público de verdade.
      await page.getByTestId("adicionar-campo").click();
      await page.locator("#ft-c-nome-0").fill("produto");
      await page.locator("#ft-c-desc-0").fill("Nome ou código do produto que o cliente citou");
      await formulario.getByLabel("Endereço (https)").fill(ENDERECO_PUBLICO);
      await captura(page, "ferramentas-03-formulario-preenchido");
      await page.getByTestId("salvar-ferramenta").click();

      // 5 · A chave de assinatura aparece UMA vez.
      const dialogoDaChave = page.getByTestId("chave-da-ferramenta");
      await expect(dialogoDaChave).toBeVisible({ timeout: 30_000 });
      const chave = await dialogoDaChave.getByTestId("chave-em-claro").inputValue();
      expect(chave).toMatch(/^whsec_[0-9a-f]{48}$/);
      await captura(page, "ferramentas-04-chave-mostrada-uma-vez");
      await dialogoDaChave.getByTestId("fechar-chave").click();

      // No banco: a chave está CIFRADA, e a tela só guarda os 4 últimos.
      const { data: linha } = await admin
        .from("agent_external_tools")
        .select("id, slug, effect, active, signing_secret_last4, signing_secret_encrypted")
        .eq("organization_id", c.org_id)
        .single();
      const ferramenta = linha as {
        id: string;
        slug: string;
        effect: string;
        active: boolean;
        signing_secret_last4: string;
        signing_secret_encrypted: string;
      };
      expect(ferramenta.slug).toBe("consultar_estoque");
      expect(ferramenta.effect).toBe("consulta");
      expect(ferramenta.active).toBe(true);
      expect(ferramenta.signing_secret_last4).toBe(chave.slice(-4));
      expect(String(ferramenta.signing_secret_encrypted)).not.toContain(chave);

      // A lista mostra a ferramenta e só "···" + 4 últimos; a chave não está em lugar nenhum da página.
      const cartao = page.getByTestId(`ferramenta-${ferramenta.id}`);
      await expect(cartao).toContainText("Consultar estoque");
      await expect(cartao).toContainText(chave.slice(-4));
      expect(await page.content()).not.toContain(chave);
      await page.reload();
      expect(await page.content()).not.toContain(chave);

      // 6 · "Testar de verdade": o endereço não responde daqui, e a tela EXPLICA — não diz "funcionou".
      await page.getByTestId(`testar-${ferramenta.id}`).click();
      await page.locator("#teste-produto").fill("camiseta azul");
      await page.getByTestId("executar-teste").click();
      const resultado = page.getByTestId("resultado-do-teste");
      await expect(resultado).toBeVisible({ timeout: 90_000 });
      await expect(resultado).toHaveAttribute("data-ok", "nao");
      await expect(resultado).toContainText("Não funcionou");
      registra(`ferramentas externas · teste contra endereço que não responde = ${await resultado.innerText()}`);
      await captura(page, "ferramentas-05-teste-explica-a-falha");
      await page.keyboard.press("Escape");

      // 7 · No editor do agente o grupo lista a ferramenta; marcar conta no teto.
      await page.goto("/app/ai/agents/new");
      const grupo = page.getByTestId("grupo-ferramentas-externas");
      await grupo.scrollIntoViewIfNeeded({ timeout: 60_000 });
      const consumoAntes = await page.getByTestId("consumo-teto").innerText();
      await grupo.getByRole("checkbox", { name: "Consultar estoque" }).check();
      const consumoDepois = await page.getByTestId("consumo-teto").innerText();
      expect(Number(consumoDepois.split(" ")[0])).toBe(Number(consumoAntes.split(" ")[0]) + 1);
      await captura(page, "ferramentas-06-marcada-no-agente");

      // 8 · Desativar: a ferramenta passa a "Desativada" e o grupo só deixa desmarcar.
      await page.goto("/app/ai/external-tools");
      await page.getByTestId(`ativar-${ferramenta.id}`).click();
      await expect(page.getByTestId(`ferramenta-${ferramenta.id}`)).toHaveAttribute("data-ativa", "nao", {
        timeout: 30_000,
      });
      const { data: depois } = await admin.from("agent_external_tools").select("active").eq("id", ferramenta.id).single();
      expect((depois as { active: boolean }).active).toBe(false);
      await captura(page, "ferramentas-07-desativada");
    } finally {
      await semFerramentas(c.org_id);
    }
  });
});
