/*
 * Utilitário de captura dos prints do manual, para uso com o Playwright (MCP ou script).
 * Entra na conta da organização de demonstração, abre a tela, desenha as anotações
 * (ferramentas/anotar.js) e grava o PNG direto em docs/manual/img/.
 *
 * No `browser_run_code_unsafe` do Playwright MCP:
 *
 *   const { entrar, capturar } = await import('file:///C:/dev/zapsales-manual/docs/manual/ferramentas/capturar.mjs');
 *   await entrar(page, 'https://<host>', 'manual-demo@example.com', '<senha>');   // uma vez por sessão
 *   return await capturar(page, {
 *     url: '/app/kanban', nome: 'funis-lista', esperar: 'h1',
 *     itens: [{ n: 1, sel: 'button', texto: 'Novo funil', at: 't' }],
 *   });
 *
 * Opções de `capturar`: url, nome (sem .png), esperar (seletor), espera (ms extras), w, h
 * (janela, padrão 1440×900), antes(page) (clicar/abrir algo antes de anotar), itens (veja
 * anotar.js), clip ({x,y,width,height}), semAnotar. Devolve quantos números foram
 * desenhados e quais não foram achados — confira que `faltou` vem vazio.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ANOTAR = path.join(aqui, 'anotar.js');
const IMG = path.resolve(aqui, '..', 'img');
let BASE = '';

export async function entrar(page, base, email, senha) {
  BASE = base.replace(/\/$/, '');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Senha' }).fill(senha);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/app|\/onboarding|\/get-started/, { timeout: 60000 });
  // tema claro: os prints do manual são sempre claros
  await page.goto(BASE + '/app/kanban', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header button[aria-label^="Tema"]', { timeout: 60000 });
  for (let i = 0; i < 3; i++) {
    const rotulo = await page.locator('header button[aria-label^="Tema"]').getAttribute('aria-label');
    if (/light|claro/i.test(rotulo)) break;
    await page.locator('header button[aria-label^="Tema"]').click();
    await page.waitForTimeout(250);
  }
  return page.url();
}

export async function capturar(page, o) {
  if (o.w || o.h) await page.setViewportSize({ width: o.w || 1440, height: o.h || 900 });
  if (o.url) await page.goto(BASE + o.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (o.esperar) await page.waitForSelector(o.esperar, { timeout: 60000 });
  await page.waitForTimeout(o.espera ?? 1500);
  if (o.antes) await o.antes(page);
  await page.addScriptTag({ path: ANOTAR });
  let r = { desenhados: 0, faltou: [] };
  if (!o.semAnotar && o.itens?.length) r = await page.evaluate((i) => window.__anota(i), o.itens);
  await page.screenshot({ path: path.join(IMG, o.nome + '.png'), clip: o.clip });
  await page.evaluate(() => window.__anotaLimpa && window.__anotaLimpa());
  return { nome: o.nome, ...r };
}
