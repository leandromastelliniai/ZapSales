/**
 * Criar modelo de mensagem — o editor completo, provado pela TELA.
 *
 * O que o dono pediu: cadastrar o modelo como no ManyChat — nome, categoria
 * (Utilidade ou Marketing), idiomas, cabeçalho (texto, imagem, vídeo, arquivo),
 * a mensagem com as variáveis dentro do texto, rodapé e botões.
 *
 * A spec NÃO envia nada à Meta: o instalador fresco não tem canal oficial, e o
 * que se prova aqui é a tela — as três colunas, os idiomas, o cabeçalho de texto,
 * a variável destacada, o botão de ligar e as recusas no campo (o que a Meta
 * recusaria nunca vai ao servidor). O corpo que vai à Meta é medido em
 * `tests/unit/meta-novo-modelo-editor-completo.test.ts`.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

let creds = lerCreds();

// Duas entradas de login na mesma spec: o segundo espera a virada da janela TOTP (30 s).
test.describe.configure({ timeout: 90_000 });
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");
mkdirSync(EVIDENCE, { recursive: true });

async function semOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(m.scrollWidth, `${contexto}: sem transbordo horizontal`).toBeLessThanOrEqual(m.clientWidth + 1);
}

test("Criar modelo: nome, categoria, idiomas, cabeçalho de texto, variável destacada e botão de ligar", async ({
  page,
}) => {
  creds = await loginComoAdmin(page, creds);

  // O que o editor manda ao servidor: nada, enquanto houver recusa no campo.
  const envios: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1/channels/templates/submit")) envios.push(r.url());
  });

  await page.goto("/app/connections/modelos/novo");
  await expect(page.getByRole("heading", { name: "Criar modelo", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Modelos de mensagem" })).toHaveAttribute(
    "href",
    "/app/connections?aba=oficial&sub=templates",
  );
  await expect(page.getByTestId("editor-de-modelo")).toBeVisible();

  // Categoria: Marketing e Utilidade, e o aviso do que a Meta espera de Utilidade.
  const categoria = page.getByTestId("modelo-categoria");
  await expect(categoria.locator("option")).toHaveText(["Marketing", "Utilidade"]);
  await categoria.selectOption("UTILITY");
  await expect(page.getByTestId("dica-da-categoria")).toContainText("passa para Marketing");

  // Nome: o campo já escreve no formato da Meta.
  await page.getByTestId("modelo-nome").fill("Aviso de Entrega");
  await expect(page.getByTestId("modelo-nome")).toHaveValue("aviso_de_entrega");
  await expect(page.getByTestId("titulo-do-modelo")).toContainText("aviso_de_entrega • Português (Brasil)");

  // Cabeçalho de texto com uma variável.
  await page.getByTestId("modelo-cabecalho-TEXT").click();
  await page.getByTestId("modelo-cabecalho-texto").fill("Pedido de ");
  await page.getByTestId("btn-variavel-titulo").click();
  await expect(page.getByTestId("modelo-cabecalho-texto")).toHaveValue("Pedido de {{variavel_titulo}}");
  await page.getByTestId("modelo-cabecalho-exemplo-variavel_titulo").fill("Ana");

  // A mensagem: o esqueleto com variáveis com nome, destacadas atrás do texto.
  const corpo = page.getByTestId("modelo-corpo");
  await corpo.fill("Olá , seu pedido saiu para entrega hoje.");
  await corpo.evaluate((el) => (el as HTMLTextAreaElement).setSelectionRange(4, 4));
  await page.getByTestId("variavel-sugerida-nome").click();
  await expect(corpo).toHaveValue("Olá {{nome}}, seu pedido saiu para entrega hoje.");
  await expect(page.getByTestId("modelo-corpo-destaque").locator("mark")).toHaveText(["{{nome}}"]);
  await page.getByTestId("modelo-exemplo-nome").fill("Ana");

  // O preview mostra o título e o corpo com os exemplos no lugar das variáveis.
  await expect(page.getByTestId("preview-titulo")).toHaveText("Pedido de Ana");
  await expect(page.getByTestId("preview-corpo")).toContainText("Olá Ana, seu pedido saiu");

  // O destaque cai em cima do texto: a camada e o campo têm a mesma altura e a mesma largura.
  const medidas = await page.evaluate(() => {
    const campo = document.querySelector('[data-testid="modelo-corpo"]') as HTMLElement;
    const camada = document.querySelector('[data-testid="modelo-corpo-destaque"]') as HTMLElement;
    const a = campo.getBoundingClientRect();
    const b = camada.getBoundingClientRect();
    return { dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height) };
  });
  for (const [eixo, valor] of Object.entries(medidas)) {
    expect(valor, `o destaque tem de cobrir o campo (${eixo})`).toBeLessThan(1);
  }

  // Botão de ligar: sem o código do país, a recusa aparece no campo e nada vai ao servidor.
  await page.getByTestId("btn-add-ligar").click();
  await page.getByTestId("botao-texto").fill("Ligar agora");
  await page.getByTestId("botao-telefone").fill("11999998888");
  await page.getByTestId("btn-enviar-modelo").click();
  await expect(page.getByText("Use o número com o código do país, ex.: +5511999998888.")).toBeVisible();
  await expect(page.getByTestId("modelo-tem-problemas")).toBeVisible();
  expect(envios, "o que a Meta recusaria não vai ao servidor").toEqual([]);

  // Idiomas: "Novo idioma" parte de uma cópia e cada idioma tem a própria versão.
  await page.getByTestId("botao-telefone").fill("+5511999998888");
  await page.getByTestId("novo-idioma").selectOption("en_US");
  await expect(page.getByTestId("titulo-do-modelo")).toContainText("aviso_de_entrega • Inglês (EUA)");
  await expect(page.getByTestId("idioma-en_US")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("modelo-corpo")).toHaveValue("Olá {{nome}}, seu pedido saiu para entrega hoje.");
  await page.getByTestId("modelo-corpo").fill("Hello {{name}}, your order is out for delivery today.");
  // A variável nova ainda não tem exemplo: o idioma é apontado e o envio não sai.
  await page.getByTestId("btn-enviar-modelo").click();
  await expect(page.getByTestId("idioma-en_US").getByText("corrigir")).toBeVisible();
  expect(envios).toEqual([]);

  await page.getByTestId("idioma-pt_BR").click();
  await expect(page.getByTestId("modelo-corpo")).toHaveValue("Olá {{nome}}, seu pedido saiu para entrega hoje.");

  await semOverflowHorizontal(page, "editor de modelo a 1280px");
  await page.screenshot({ path: path.join(EVIDENCE, "editor-de-modelo.png"), fullPage: true });
});

test.describe("celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Criar modelo cabe em 390px, sem transbordo horizontal", async ({ page }) => {
    creds = await loginComoAdmin(page, creds);
    await page.goto("/app/connections/modelos/novo");
    await expect(page.getByTestId("editor-de-modelo")).toBeVisible();
    await page.getByTestId("modelo-cabecalho-TEXT").click();
    await page.getByTestId("modelo-corpo").fill("Olá {{nome}} tudo bem com você hoje, esta é uma mensagem longa para quebrar linha.");
    await semOverflowHorizontal(page, "editor de modelo a 390px");
  });
});
