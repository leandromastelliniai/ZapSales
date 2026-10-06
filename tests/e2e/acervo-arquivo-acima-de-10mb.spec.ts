/**
 * UM ARQUIVO DE 12 MB CHEGA INTEIRO À ROTA, PELA TELA (issue #22).
 *
 * O defeito: em caminho que o `proxy.ts` alcança, o Next entrega à rota só os
 * primeiros 10 MB do corpo (`proxyClientMaxBodySize`). Um arquivo de 12 MB
 * chegava cortado, o `formData()` não achava o campo `file`, e a pessoa lia
 * "Campo 'file' (multipart) obrigatório." depois de escolher um arquivo que a
 * própria tela prometia aceitar ("até 20 MB").
 *
 * O acervo de conhecimento é a porta usada aqui porque é a única rota de upload
 * grande alcançável num banco fresco sem canal conectado: mídia de conversa
 * exige conversa, e mídia de modelo exige o canal oficial da Meta. As quatro
 * rotas saíram do matcher pelo mesmo mecanismo, e a cobertura de todas elas é
 * de `tests/unit/proxy-nao-corta-upload-grande.test.ts` (o matcher compilado
 * pelas funções do próprio Next).
 *
 * Roda contra `next start` (o `e2e` do CI), o mesmo servidor da VPS.
 */
import { expect, test } from "./helpers/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const MB = 1024 * 1024;
const NOME = `E2E Manual de 12 MB ${Date.now()}`;

/** Texto puro de 12 MB, acima dos 10 MB do proxy e abaixo dos 20 MB do acervo. */
function textoDe12MB(): Buffer {
  const linha = "Política de troca: até 30 dias corridos, produto sem uso e na embalagem original.\n";
  return Buffer.from(linha.repeat(Math.ceil((12 * MB) / Buffer.byteLength(linha))), "utf8");
}

test.describe("arquivo acima do limite de corpo do proxy", () => {
  test.describe.configure({ timeout: 180_000 });

  let criado: string | null = null;

  test.afterEach(async ({ page }) => {
    // O material é descartável: tirá-lo deixa o acervo da organização do CI
    // como a próxima spec espera encontrá-lo.
    if (criado) await page.request.delete(`/api/v1/ai/knowledge/sources/${criado}`);
  });

  test("um arquivo de 12 MB sobe pelo diálogo e vira material do acervo", async ({ page }) => {
    await loginComoAdmin(page, lerCreds());
    await page.goto("/app/ai/knowledge/sources");

    await page.getByTestId("acervo-adicionar").click();
    await page.getByTestId("material-tipo-documento").click();
    await page.getByTestId("material-nome").fill(NOME);

    const arquivo = textoDe12MB();
    expect(arquivo.byteLength).toBeGreaterThan(12 * MB - 1);
    await page.getByTestId("material-arquivo").setInputFiles({
      name: "manual-de-12mb.txt",
      mimeType: "text/plain",
      buffer: arquivo,
    });

    const resposta = page.waitForResponse(
      (r) => r.url().endsWith("/api/v1/ai/knowledge/sources/upload") && r.request().method() === "POST",
    );
    await page.getByTestId("material-criar").click();
    const r = await resposta;
    const corpo = (await r.json()) as {
      data?: { id: string };
      error?: { code: string; message: string };
    };
    // Antes da #22: 422 "Campo 'file' (multipart) obrigatório." — o corpo cortado.
    expect(r.status(), JSON.stringify(corpo.error ?? null)).toBe(201);
    criado = corpo.data?.id ?? null;

    // A prova que a pessoa vê: o material aparece no acervo com o nome dado.
    await expect(page.getByText(NOME, { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: test.info().outputPath("material-de-12mb-no-acervo.png"), fullPage: true });
  });
});
