/**
 * AS AÇÕES EXTERNAS COM APROVAÇÃO, PELA TELA (Central de avisos + Ferramentas externas).
 *
 * Issue #95 (parte da #86). O caminho de quem tem um agente que quer ALTERAR algo num outro
 * sistema: o dono cadastra a ferramenta como «Altera dados» (que nasce pedindo aprovação),
 * o pedido do agente chega à Central com o que ele quer fazer e os dados, e o dono decide.
 *
 *   - cadastro: «Altera dados» pode ser escolhido, liga «Pedir aprovação» sozinho, e a lista
 *     mostra «Pede aprovação»;
 *   - Central: o cartão do pedido mostra a ferramenta, os dados e os dois botões; aprovar
 *     pede confirmação e EXECUTA uma vez (o endereço público do teste não responde de dentro
 *     do CI: a tela diz que NÃO foi possível confirmar e que a ação NÃO foi repetida);
 *   - execução única: duas decisões simultâneas do mesmo pedido → uma 200 e uma 409;
 *   - recusar: nada é enviado, o pedido fica «Recusada» e o aviso sai de «Abertos»;
 *   - pedido vencido nunca executa (409) e o agente é quem fica sabendo.
 *
 * O PEDIDO nasce do turno do agente (provado com receptor HTTP de verdade em
 * `tests/invariants/ferramenta-externa-no-turno.test.ts`); aqui ele é gravado direto pelo
 * service role, porque o que se mede é a TELA e a rota de decisão. O receptor local não
 * serve a esta spec: a organização nunca alcança 127.0.0.1 (rede segura única).
 */
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "./helpers/test";
import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";
import { admin, captura, creds, registra } from "./qa-l12-comum";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
/** Um IPv4 público por literal: passa pela rede segura sem depender de DNS (e não responde daqui). */
const ENDERECO_PUBLICO = "https://93.184.216.34/hook-e2e-aprovacao";

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

async function limpa(orgId: string): Promise<void> {
  await admin.from("agent_external_tool_requests").delete().eq("organization_id", orgId);
  await admin.from("agent_inbox_items").delete().eq("organization_id", orgId).eq("kind", "external_tool_approval");
  await admin.from("agent_inbox_items").delete().eq("organization_id", orgId).eq("kind", "external_tool_failed");
  await admin.from("agent_external_tools").delete().eq("organization_id", orgId);
}

/** Grava o que o turno do agente gravaria: o pedido pendente e o aviso da Central. */
async function pedidoPendente(
  orgId: string,
  ferramentaId: string,
  dados: Record<string, string>,
  expiraEmMs = 3_600_000,
): Promise<{ pedido: string; aviso: string }> {
  const pedido = randomUUID();
  const { data: aviso, error: erroDoAviso } = await admin
    .from("agent_inbox_items")
    .insert({
      organization_id: orgId,
      kind: "external_tool_approval",
      severity: "warn",
      title: `Aprovar «Criar pedido» — produto: ${dados.produto} (#${pedido.slice(0, 4)})`,
      body: `O agente quer executar «Criar pedido» e espera a sua decisão. Dados: produto: ${dados.produto}. Nada foi enviado ao outro sistema.`,
      ref_kind: "external_tool_request",
      ref_id: pedido,
    })
    .select("id")
    .single();
  if (erroDoAviso) throw new Error(`aviso: ${erroDoAviso.message}`);
  const { error } = await admin.from("agent_external_tool_requests").insert({
    id: pedido,
    organization_id: orgId,
    tool_id: ferramentaId,
    origin: "live",
    status: "pending",
    arguments: dados,
    arguments_hash: createHash("sha256").update(JSON.stringify(dados) + pedido).digest("hex"),
    inbox_item_id: (aviso as { id: string }).id,
    expires_at: new Date(Date.now() + expiraEmMs).toISOString(),
  });
  if (error) throw new Error(`pedido: ${error.message}`);
  return { pedido, aviso: (aviso as { id: string }).id };
}

const estadoDo = async (pedido: string) =>
  (
    (await admin.from("agent_external_tool_requests").select("status, uncertain, executed_at").eq("id", pedido).single())
      .data as { status: string; uncertain: boolean; executed_at: string | null }
  );

test.describe("Ações externas com aprovação pela tela", () => {
  test.describe.configure({ timeout: 360_000 });

  test("cadastra «Altera dados» (nasce pedindo aprovação), decide na Central: aprova uma vez, recusa sem enviar, vencido não executa", async ({
    page,
  }) => {
    const c = creds();
    await limpa(c.org_id);

    try {
      await loginComTotp(page, c.users.admin!.email, c.password);

      // 1 · Cadastro: «Altera dados» pode ser escolhido e liga «Pedir aprovação» sozinho.
      await page.goto("/app/ai/external-tools");
      await page.getByTestId("nova-ferramenta").click();
      const formulario = page.getByTestId("formulario-da-ferramenta");
      await formulario.getByLabel("Nome", { exact: true }).fill("Criar pedido");
      await formulario.getByLabel("Quando o agente deve usar").fill("Quando o cliente confirmar que quer fechar o pedido.");
      await formulario.getByLabel("Endereço (https)").fill(ENDERECO_PUBLICO);
      await page.getByTestId("adicionar-campo").click();
      await page.locator("#ft-c-nome-0").fill("produto");
      await page.locator("#ft-c-desc-0").fill("Produto que o cliente quer comprar");
      await expect(formulario.getByLabel(/Altera dados/)).toBeEnabled();
      await formulario.getByLabel(/Altera dados/).check();
      await expect(page.getByTestId("pedir-aprovacao")).toBeChecked();
      await expect(page.getByTestId("validade-do-pedido")).toHaveValue("24");
      await captura(page, "acoes-01-cadastro-altera-dados");
      await page.getByTestId("salvar-ferramenta").click();
      await page.getByTestId("fechar-chave").click({ timeout: 30_000 });

      const { data: linha } = await admin
        .from("agent_external_tools")
        .select("id, effect, require_approval, approval_ttl_hours")
        .eq("organization_id", c.org_id)
        .single();
      const ferramenta = linha as { id: string; effect: string; require_approval: boolean | null; approval_ttl_hours: number };
      expect(ferramenta.effect).toBe("altera");
      // Quem cadastrou não decidiu a chave: fica NULA e o padrão do efeito (altera pede) vale.
      expect(ferramenta.require_approval).toBeNull();
      expect(ferramenta.approval_ttl_hours).toBe(24);
      await expect(page.getByTestId(`aprovacao-${ferramenta.id}`)).toHaveAttribute("data-pede", "sim");
      await expect(page.getByTestId(`aprovacao-${ferramenta.id}`)).toContainText("Pede aprovação");

      // 2 · A Central: o pedido do agente, com o que ele quer fazer e os dados.
      const a = await pedidoPendente(c.org_id, ferramenta.id, { produto: "camiseta azul" });
      await page.goto("/app/ai/inbox");
      const cartao = page.getByTestId("aprovacao-do-pedido").first();
      await expect(cartao).toBeVisible({ timeout: 60_000 });
      await expect(cartao).toContainText("Criar pedido");
      await expect(cartao).toContainText("Altera dados");
      await expect(page.getByTestId("dados-do-pedido")).toContainText("camiseta azul");
      await expect(cartao).toContainText("Nada foi enviado ao outro sistema");
      await captura(page, "acoes-02-central-pedido-pendente");

      // 3 · Aprovar pede confirmação, executa UMA vez e diz a verdade: o endereço do teste não
      //     responde daqui, então NÃO foi possível confirmar — e a ação NÃO foi repetida.
      await cartao.getByTestId("aprovar-pedido").click();
      await expect(page.getByTestId("confirmar-aprovacao")).toBeVisible();
      await captura(page, "acoes-03-confirmar-aprovacao");
      await page.getByTestId("confirmar-aprovar").click();
      const desfecho = cartao.getByTestId("desfecho-do-pedido");
      await expect(desfecho).toBeVisible({ timeout: 90_000 });
      await expect(desfecho).toContainText("Não foi possível confirmar");
      await expect(desfecho).toContainText("não foi repetida");
      registra(`ações externas · aprovação contra endereço que não responde = ${await desfecho.innerText()}`);
      await captura(page, "acoes-04-aprovado-falha-incerta");
      const aposAprovar = await estadoDo(a.pedido);
      expect(aposAprovar.status).toBe("failed");
      expect(aposAprovar.uncertain).toBe(true);
      expect(aposAprovar.executed_at).toBeNull();
      // O aviso do pedido saiu de «Abertos» e a falha virou aviso próprio, dizendo que não foi repetida.
      const { data: avisoDoPedido } = await admin.from("agent_inbox_items").select("status").eq("id", a.aviso).single();
      expect((avisoDoPedido as { status: string }).status).toBe("resolved");
      const { data: falhas } = await admin
        .from("agent_inbox_items")
        .select("body")
        .eq("organization_id", c.org_id)
        .eq("kind", "external_tool_failed")
        .eq("status", "open");
      expect(falhas ?? []).toHaveLength(1);
      expect((falhas as Array<{ body: string }>)[0]!.body).toContain("Não foi repetida");

      // 4 · Execução única: duas decisões SIMULTÂNEAS do mesmo pedido — uma 200, a outra 409.
      const b = await pedidoPendente(c.org_id, ferramenta.id, { produto: "camiseta verde" });
      const status = await page.evaluate(async (id) => {
        const decidir = () =>
          fetch(`/api/v1/ai/external-tool-requests/${id}/decide`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
          }).then((r) => r.status);
        return Promise.all([decidir(), decidir()]);
      }, b.pedido);
      expect([...status].sort()).toEqual([200, 409]);
      expect((await estadoDo(b.pedido)).status).toBe("failed");

      // 5 · Recusar: nada é enviado e o pedido fica «Recusada».
      const d = await pedidoPendente(c.org_id, ferramenta.id, { produto: "camiseta preta" });
      await page.goto("/app/ai/inbox");
      const cartaoDoD = page.getByTestId("aprovacao-do-pedido").filter({ hasText: "camiseta preta" });
      await expect(cartaoDoD).toBeVisible({ timeout: 60_000 });
      await cartaoDoD.getByTestId("recusar-pedido").click();
      await expect(cartaoDoD.getByTestId("desfecho-do-pedido")).toContainText("Nada foi enviado");
      await expect(cartaoDoD.getByTestId("estado-do-pedido")).toContainText("Recusada");
      await captura(page, "acoes-05-recusado");
      expect((await estadoDo(d.pedido)).status).toBe("rejected");
      const aposRecusa = await estadoDo(d.pedido);
      expect(aposRecusa.executed_at).toBeNull();

      // 6 · Pedido VENCIDO nunca executa: a rota recusa (409) e o pedido vira «expirado».
      const v = await pedidoPendente(c.org_id, ferramenta.id, { produto: "camiseta rosa" }, -60_000);
      const resposta = await page.evaluate(async (id) => {
        const r = await fetch(`/api/v1/ai/external-tool-requests/${id}/decide`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: "approve" }),
        });
        return { status: r.status, corpo: await r.json() };
      }, v.pedido);
      expect(resposta.status).toBe(409);
      expect(resposta.corpo.error.code).toBe("request_expired");
      expect((await estadoDo(v.pedido)).status).toBe("expired");
    } finally {
      await limpa(c.org_id);
    }
  });
});
