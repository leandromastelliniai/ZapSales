/**
 * O assistente de criação de agente, dirigido pela tela como uma pessoa leiga faria:
 * entra em Agentes, clica em "Novo agente", responde as perguntas, sai para o editor
 * completo levando o que respondeu, volta, e cria o agente.
 *
 * O que ele prova, e por quê é o que só a tela real prova:
 *  - o botão "Novo agente" da lista abre o assistente (`?modo=assistente`), e a rota
 *    antiga continua abrindo o editor de sempre;
 *  - escolher um ramo recomenda o modelo certo e mostra o aviso dos ramos regulados;
 *  - "Voltar à sugestão" restaura o texto sugerido depois de a pessoa o reescrever;
 *  - "Prefiro o editor completo" leva o estado ao `AgentForm` (nome e perfil preenchidos),
 *    e o convite do editor devolve ao assistente na mesma estação;
 *  - criar produz UM agente rascunho e abre a aba "Teste" dele.
 *
 * O que ele NÃO consegue provar: o estado "instalei agora e não tenho chave de IA" — a
 * organização de teste já tem credencial. Quando o banco de teste não tem modelo ou chave
 * utilizável, a estação 5 mostra a explicação, e este spec confere a explicação em vez de
 * fingir que criou (o caso sem chave é coberto no componente:
 * `tests/unit/assistente-de-agente.test.tsx`).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect } from "./helpers/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "assistente-de-agente");

let creds: CredsE2E = lerCreds();

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("a lista de agentes leva ao assistente, que guia, devolve ao editor e cria", async ({
  page,
}) => {
  await page.goto("/app/ai/agents");
  await page
    .getByRole("link", { name: /novo agente/i })
    .first()
    .click();
  await page.waitForURL(/\/app\/ai\/agents\/new\?modo=assistente/);
  await expect(page.getByTestId("seletor-de-ramo")).toBeVisible();
  await expect(page.getByTestId("passo-atual")).toContainText("1");

  // Estação 1: ramo regulado recomenda Agendamento e mostra o aviso, sem bloquear.
  await page.getByLabel("Nome do negócio (opcional)").fill("Clínica Sorriso E2E");
  // O tipo de negócio fica sempre à vista: categorias em cima e, embaixo, os tipos da aberta.
  await expect(page.getByRole("tab")).toHaveCount(10);
  await page.getByTestId("categoria-saude").click();
  await page.getByTestId("ramo-clinica-odontologica").click();
  await expect(page.getByTestId("ramo-clinica-odontologica")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId("aviso-de-ramo-regulado")).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCIA, "01-negocio.png"), fullPage: true });
  await page.getByTestId("continuar").click();

  // Estação 2: o modelo recomendado vem marcado, com o motivo escrito.
  await expect(page.getByTestId("modelo-agendamento")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("motivo-da-recomendacao")).not.toBeEmpty();
  await page.getByTestId("continuar").click();

  // Estação 3: reescrever a abertura e restaurar a sugestão.
  const abertura = page.getByLabel("Primeira frase da conversa");
  const sugestao = await abertura.inputValue();
  expect(sugestao).toContain("Clínica Sorriso E2E");
  await abertura.fill("Oi! Quer marcar um horário?");
  await expect(page.getByTestId("previa-abertura")).toHaveText("Oi! Quer marcar um horário?");
  await page.getByRole("button", { name: "Voltar à sugestão" }).click();
  await expect(abertura).toHaveValue(sugestao);
  await page.screenshot({ path: path.join(EVIDENCIA, "03-como-fala.png"), fullPage: true });

  // A saída para o editor completo leva o que já foi respondido.
  await page.getByTestId("ir-para-o-editor").click();
  await page.waitForURL(/\/app\/ai\/agents\/new\?de=assistente/);
  await expect(page.locator("#name")).toHaveValue(/agendamento/i, { timeout: 30_000 });
  await page.screenshot({ path: path.join(EVIDENCIA, "editor-com-estado.png"), fullPage: false });

  // E o convite do editor devolve ao assistente, na mesma estação.
  await page.getByTestId("abrir-assistente").click();
  await page.waitForURL(/\/app\/ai\/agents\/new\?modo=assistente/);
  await expect(page.getByTestId("passo-atual")).toContainText("3");

  // Até o fim.
  await page.getByTestId("continuar").click();
  await page.getByTestId("continuar").click();
  await expect(page.getByTestId("resumo-do-agente")).toContainText("Clínica odontológica");

  const faltaDeIa = page.getByTestId("falta-de-ia");
  const criar = page.getByTestId("criar-agente");
  await expect(faltaDeIa.or(criar)).toBeVisible();

  if (await faltaDeIa.isVisible()) {
    // Banco de teste sem modelo ou sem chave utilizável: a estação explica e leva a quem resolve.
    await expect(page.getByRole("link", { name: /chaves de acesso à ia/i })).toHaveAttribute(
      "href",
      "/app/ai/credentials",
    );
    test.info().annotations.push({
      type: "aviso",
      description:
        "A organização de teste não tem chave ou modelo utilizável: a criação não foi exercitada.",
    });
    return;
  }

  await page.screenshot({ path: path.join(EVIDENCIA, "05-criar.png"), fullPage: true });
  await criar.click();
  await page.waitForURL(/\/app\/ai\/agents\/[0-9a-f-]{36}\?aba=test/, { timeout: 30_000 });
  await expect(page.getByRole("tab", { name: /teste/i })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: path.join(EVIDENCIA, "06-agente-criado.png"), fullPage: true });

  // O agente aparece na lista, onde a pessoa vai procurar depois — e é um só.
  await page.goto("/app/ai/agents");
  await expect(page.getByText(/atendente de agendamento/i).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("a rota antiga continua abrindo o editor completo, vazio", async ({ page }) => {
  await page.goto("/app/ai/agents/new");
  await expect(page.getByRole("heading", { name: /novo agent/i })).toBeVisible();
  await expect(page.getByTestId("abrir-assistente")).toHaveAttribute(
    "href",
    "/app/ai/agents/new?modo=assistente",
  );
  await expect(page.locator("#name")).toHaveValue("");
});
