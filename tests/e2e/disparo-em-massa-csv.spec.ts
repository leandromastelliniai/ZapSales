/**
 * Disparo em massa — a lista subida dentro da campanha, provada pela TELA.
 *
 * O que o dono pediu: achar o disparo no menu lateral, subir um CSV com nome e
 * telefone dentro da campanha, ver o formato do telefone antes de enviar, e ter
 * as pessoas do arquivo como público — sem mexer em etiqueta nenhuma.
 *
 * Roda num banco novo, como o de uma instalação recém-feita: sem canal Meta e
 * sem nenhum contato prévio da planilha.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { test, expect } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");
mkdirSync(EVIDENCE, { recursive: true });

/** Telefones únicos por execução: o banco do e2e é compartilhado e reaproveitado. */
function telefonesDaRodada(): { a: string; b: string } {
  const n = String(Date.now()).slice(-8);
  return { a: `+55119${n}`, b: `(21) 9${n}` };
}

test("Disparo em massa: está no menu lateral e a lista CSV vira o público da campanha", async ({ page }) => {
  creds = await loginComoAdmin(page, creds);

  // 1. A porta: o item está no menu lateral, com o nome explícito.
  const menu = page.getByRole("navigation", { name: "Navegação principal" });
  const link = menu.getByRole("link", { name: "Disparo em massa" });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/app\/campaigns$/);
  await expect(page.getByRole("heading", { name: "Disparo em massa" })).toBeVisible();

  // 2. Nova campanha: a caixa de lista, com o formato do telefone à vista.
  await page.goto("/app/campaigns/new");
  const caixa = page.getByTestId("subir-lista-csv");
  await expect(caixa).toBeVisible();
  const formatos = page.getByTestId("formatos-de-telefone");
  await expect(formatos).toContainText("+5511999998888");
  await expect(formatos).toContainText("(11) 99999-8888");
  await expect(formatos).toContainText("+351912345678");
  await expect(caixa.getByRole("button", { name: "Baixar planilha modelo" })).toBeVisible();

  // 3. A planilha modelo é um CSV que a própria importação lê.
  const baixando = page.waitForEvent("download");
  await caixa.getByRole("button", { name: "Baixar planilha modelo" }).click();
  const download = await baixando;
  expect(download.suggestedFilename()).toBe("lista-para-disparo.csv");

  // 4. Sobe uma lista: 2 boas, 1 com telefone inválido, 1 sem telefone.
  const { a, b } = telefonesDaRodada();
  const csv = [
    "nome;telefone;email",
    `Ana do Teste;${a};`,
    `Bia do Teste;${b};`,
    "Caio Inválido;abc;",
    "Dani Sem Telefone;;dani@example.com",
  ].join("\n");
  await page.locator("#lista-csv").setInputFiles({
    name: "lista.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await caixa.getByRole("button", { name: "Enviar lista" }).click();

  const resumo = page.getByTestId("resumo-da-lista");
  await expect(resumo).toContainText("4 linha(s) lidas");
  await expect(resumo).toContainText("2 novo(s) em Contatos");
  await expect(resumo).toContainText("2 com erro (ficam de fora)");
  // O erro diz a linha (a do editor de planilhas) e o motivo, com o exemplo de formato.
  await expect(resumo).toContainText("Linha 4");
  await expect(resumo).toContainText("telefone inválido");
  await expect(resumo).toContainText("Linha 5");
  await expect(resumo).toContainText("sem telefone");
  await expect(page.getByTestId("total-da-lista")).toContainText("2");

  // 5. A lista sozinha já é um público: "Ver quantas pessoas" conta as 2 — e só elas.
  await page.getByRole("button", { name: "Ver quantas pessoas" }).click();
  await expect(page.getByText(/podem receber/)).toBeVisible();
  await expect(page.locator("p", { hasText: "podem receber" }).locator("strong")).toHaveText("2");

  // 6. Sobem de novo as mesmas pessoas: elas já existem, e continuam sendo 2 no público.
  await page.locator("#lista-csv").setInputFiles({
    name: "lista.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await caixa.getByRole("button", { name: "Enviar lista" }).click();
  await expect(resumo).toContainText("0 novo(s) em Contatos");
  await expect(resumo).toContainText("2 já existiam");
  await expect(page.getByTestId("total-da-lista")).toContainText("2");

  await page.screenshot({ path: path.join(EVIDENCE, "disparo-em-massa-lista-csv.png"), fullPage: true });

  // 7. Tirar a lista devolve o público ao estado sem critério.
  await caixa.getByRole("button", { name: "Tirar a lista" }).click();
  await expect(page.getByTestId("total-da-lista")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ver quantas pessoas" })).toBeDisabled();
});
