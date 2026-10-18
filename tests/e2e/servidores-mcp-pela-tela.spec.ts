/**
 * OS SERVIDORES MCP EXTERNOS, PELA TELA (Agente de IA › Ferramentas externas › Servidores MCP).
 *
 * Issue #96 (parte da #86). O caminho de quem acabou de instalar e NÃO ligou nada: a aba abre dizendo
 * o que é, que o sistema funciona sem isto e que ligar exige um aceite; o administrador liga,
 * tenta cadastrar um endereço da rede interna e a tela RECUSA por segurança; cadastra um endereço
 * público e a conexão que não responde aparece com a causa, SEM esconder que o servidor foi salvo;
 * a credencial fica CIFRADA no banco e nunca aparece na tela; uma ferramenta já escolhida chega ao
 * seletor do agente com o selo «Servidor MCP» (a lista de webhooks não a mostra); desligar tira a
 * ferramenta do atendimento, sem apagar nada.
 *
 * O servidor MCP de verdade (listar, escolher, chamar, aprovar, falhar) é provado com o servidor do
 * SDK oficial em `lib/ai/ferramentas-externas/mcp/cliente.test.ts`, `turno-mcp.test.ts` e
 * `tests/invariants/mcp-externo-no-turno.test.ts`: a organização nunca alcança 127.0.0.1 (rede segura
 * única), então esta spec usa um IPv4 público por literal — que não responde de dentro do CI — e grava
 * a ferramenta escolhida direto pelo service role, porque o que se mede aqui é a TELA.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";
import { admin, captura, creds, registra } from "./qa-l12-comum";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
/** Um IPv4 público por literal: passa pela rede segura sem depender de DNS (e não responde daqui). */
const ENDERECO_PUBLICO = "https://93.184.216.34/mcp-e2e";
const CREDENCIAL = "tok_e2e_credencial_secreta_7788";

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

/** Estado fresco de instalação: recurso desligado, nenhum servidor, nenhuma ferramenta MCP. */
async function instalacaoNova(orgId: string): Promise<void> {
  await admin.from("agent_external_tools").delete().eq("organization_id", orgId);
  await admin.from("mcp_servers").delete().eq("organization_id", orgId);
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).single();
  const settings = { ...((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) };
  delete settings.mcp_externo;
  await admin.from("organizations").update({ settings }).eq("id", orgId);
}

test.describe("Servidores MCP pela tela", () => {
  test.describe.configure({ timeout: 360_000 });

  test("instalação nova: explica e exige o aceite; recusa endereço interno; salva o servidor mesmo sem conexão, com a causa; a credencial fica cifrada; a ferramenta chega ao agente e some ao desligar", async ({
    page,
  }) => {
    const c = creds();
    await instalacaoNova(c.org_id);

    try {
      await loginComTotp(page, c.users.admin!.email, c.password);

      // 1 · Instalação nova: a aba MCP está desligada e explica; a aba de webhooks segue como sempre.
      await page.goto("/app/ai/external-tools");
      await expect(page.getByTestId("ferramentas-vazio")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("aba-mcp").click();
      const desligado = page.getByTestId("mcp-desligado");
      await expect(desligado).toBeVisible({ timeout: 30_000 });
      await expect(desligado).toContainText("sistema de terceiro que oferece ferramentas ao agente");
      await expect(desligado).toContainText("funciona normalmente sem isto");
      await captura(page, "mcp-01-instalacao-nova-desligado");

      // 2 · Ligar exige o aceite: sem marcar, o botão não funciona.
      const ligar = page.getByTestId("mcp-ligar");
      await expect(ligar).toBeDisabled();
      await page.getByTestId("mcp-aceite").check();
      await expect(ligar).toBeEnabled();
      await ligar.click();
      await expect(page.getByTestId("mcp-ligado")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("mcp-sem-servidor")).toContainText("Adicione o endereço do servidor");
      const { data: org } = await admin.from("organizations").select("settings").eq("id", c.org_id).single();
      const mcp = (org as { settings: { mcp_externo?: { ligado: boolean; aceite: { por: string } | null } } }).settings.mcp_externo;
      expect(mcp?.ligado).toBe(true);
      expect(mcp?.aceite?.por).toBeTruthy();
      await captura(page, "mcp-02-ligado-sem-servidor");

      // 3 · Endereço da rede interna: recusado por segurança, nada é gravado.
      await page.getByTestId("novo-servidor").click();
      const formulario = page.getByTestId("formulario-do-servidor");
      await formulario.getByTestId("servidor-nome").fill("ERP da loja");
      await formulario.getByTestId("servidor-url").fill("https://localhost/mcp");
      await formulario.getByTestId("salvar-servidor").click();
      await expect(page.getByText("Este endereço não pode ser usado", { exact: false })).toBeVisible({ timeout: 30_000 });
      const { count: gravadosAposRecusa } = await admin
        .from("mcp_servers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id);
      expect(gravadosAposRecusa).toBe(0);
      await captura(page, "mcp-03-endereco-interno-recusado");

      // 4 · Endereço público que NÃO responde: o servidor é salvo, a conexão falha e a tela diz a causa.
      await formulario.getByTestId("servidor-url").fill(ENDERECO_PUBLICO);
      await formulario.getByTestId("servidor-credencial").fill(CREDENCIAL);
      await captura(page, "mcp-04-formulario-preenchido");
      await formulario.getByTestId("salvar-servidor").click();
      const naoConectou = page.getByTestId("cadastro-nao-conectou");
      await expect(naoConectou).toBeVisible({ timeout: 90_000 });
      await expect(naoConectou).toContainText("foi salvo, mas a conexão não deu certo");
      registra(`servidores MCP · cadastro contra endereço que não responde = ${await naoConectou.innerText()}`);
      await captura(page, "mcp-05-salvo-mas-nao-conectou");
      await page.getByTestId("concluir-cadastro").click();

      // 5 · No banco: a credencial está CIFRADA, e a tela só guarda os 4 últimos.
      const { data: linha } = await admin
        .from("mcp_servers")
        .select("id, url, credential_encrypted, credential_last4, last_check_ok, active")
        .eq("organization_id", c.org_id)
        .single();
      const servidor = linha as {
        id: string;
        url: string;
        credential_encrypted: string | null;
        credential_last4: string | null;
        last_check_ok: boolean | null;
        active: boolean;
      };
      expect(servidor.url).toBe(ENDERECO_PUBLICO);
      expect(servidor.credential_last4).toBe(CREDENCIAL.slice(-4));
      expect(String(servidor.credential_encrypted)).not.toContain(CREDENCIAL);
      expect(servidor.last_check_ok).toBe(false);

      // A lista mostra o servidor, «Não conectou» e só «…» + 4 últimos; a credencial não está na página.
      const cartao = page.getByTestId(`servidor-${servidor.id}`);
      await expect(cartao).toContainText("ERP da loja");
      await expect(cartao).toContainText(`credencial …${CREDENCIAL.slice(-4)}`);
      await expect(page.getByTestId(`conexao-${servidor.id}`)).toHaveAttribute("data-ok", "nao");
      expect(await page.content()).not.toContain(CREDENCIAL);
      await page.reload();
      await page.getByTestId("aba-mcp").click();
      await expect(page.getByTestId(`servidor-${servidor.id}`)).toBeVisible({ timeout: 30_000 });
      expect(await page.content()).not.toContain(CREDENCIAL);

      // 6 · «Testar conexão» explica de novo, sem dizer que funcionou.
      await page.getByTestId(`testar-conexao-${servidor.id}`).click();
      const resultado = page.getByTestId(`resultado-conexao-${servidor.id}`);
      await expect(resultado).toBeVisible({ timeout: 90_000 });
      await expect(resultado).toHaveAttribute("data-ok", "nao");
      await captura(page, "mcp-06-testar-conexao-explica-a-falha");

      // 7 · Uma ferramenta escolhida (gravada direto: o servidor de verdade é provado nos testes de servidor).
      //     O risco PADRÃO é «altera dados», e a aprovação já vem ligada.
      const { data: ferramenta } = await admin
        .from("agent_external_tools")
        .insert({
          organization_id: c.org_id,
          kind: "mcp",
          name: "Criar pedido no ERP",
          slug: "criar_pedido_erp",
          when_to_use: "Quando o cliente confirmar que quer fechar o pedido.",
          parameters: [{ nome: "produto", tipo: "texto", descricao: "Produto do pedido", obrigatorio: true }],
          effect: "altera",
          active: true,
          mcp_server_id: servidor.id,
          mcp_tool_name: "criar_pedido",
        })
        .select("id")
        .single();
      const ferramentaId = (ferramenta as { id: string }).id;
      await page.reload();
      await page.getByTestId("aba-mcp").click();
      const dele = page.getByTestId(`ferramenta-mcp-${ferramentaId}`);
      await expect(dele).toContainText("Criar pedido no ERP");
      await expect(dele).toContainText("Altera dados");
      await expect(dele).toContainText("Pede aprovação");
      await captura(page, "mcp-07-ferramenta-escolhida");
      // A aba de webhooks NÃO lista a ferramenta de servidor MCP.
      await page.getByTestId("aba-webhooks").click();
      await expect(page.getByTestId("ferramentas-vazio")).toBeVisible();

      // 8 · No editor do agente a ferramenta aparece no grupo «Ferramentas externas», com o selo «Servidor MCP».
      await page.goto("/app/ai/agents/new");
      const grupo = page.getByTestId("grupo-ferramentas-externas");
      await grupo.scrollIntoViewIfNeeded({ timeout: 60_000 });
      const linhaNoGrupo = page.getByTestId(`ferramenta-externa-${ferramentaId}`);
      await expect(linhaNoGrupo).toContainText("Criar pedido no ERP");
      await expect(linhaNoGrupo).toContainText("Servidor MCP");
      await expect(linhaNoGrupo).toContainText("Altera dados");
      const consumoAntes = await page.getByTestId("consumo-teto").innerText();
      await grupo.getByRole("checkbox", { name: "Criar pedido no ERP" }).check();
      const consumoDepois = await page.getByTestId("consumo-teto").innerText();
      expect(Number(consumoDepois.split(" ")[0])).toBe(Number(consumoAntes.split(" ")[0]) + 1);
      await captura(page, "mcp-08-marcada-no-agente");

      // 9 · Desligar o recurso: nada é apagado, e a ferramenta deixa de poder ser marcada no agente.
      await page.goto("/app/ai/external-tools");
      await page.getByTestId("aba-mcp").click();
      await page.getByTestId("mcp-desligar").click();
      await page.getByTestId("confirmar-desligar-mcp").click();
      await expect(page.getByTestId("mcp-desligado")).toBeVisible({ timeout: 30_000 });
      const { count: aindaGuardados } = await admin
        .from("mcp_servers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", c.org_id);
      expect(aindaGuardados).toBe(1);
      await page.goto("/app/ai/agents/new");
      const grupo2 = page.getByTestId("grupo-ferramentas-externas");
      await grupo2.scrollIntoViewIfNeeded({ timeout: 60_000 });
      await expect(page.getByTestId(`indisponivel-${ferramentaId}`)).toContainText("desligados");
      await expect(grupo2.getByRole("checkbox", { name: "Criar pedido no ERP" })).toBeDisabled();
      await captura(page, "mcp-09-desligado-some-do-agente");
    } finally {
      await instalacaoNova(c.org_id);
    }
  });
});
