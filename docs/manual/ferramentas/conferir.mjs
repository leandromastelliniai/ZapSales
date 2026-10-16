/*
 * Confere o manual montado. Falha (saída 1) quando há defeito que o leitor veria:
 *   - imagem apontada que não existe;
 *   - imagem sem texto alternativo;
 *   - link interno (#...) que não leva a lugar nenhum;
 *   - id repetido;
 *   - página escrita cuja "rota" não existe no menu e não é de tela interna conhecida.
 * E informa, sem falhar, a COBERTURA: quantas telas do menu já têm página.
 * Com --estrito a cobertura incompleta também falha — é o critério final do manual.
 *
 * Uso:  node docs/manual/ferramentas/conferir.mjs [--estrito]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerCatalogo } from './catalogo.mjs';
import { montar, lerPaginas } from './montar.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const MANUAL = path.resolve(aqui, '..');
const estrito = process.argv.includes('--estrito');

const resumo = montar();
const html = fs.readFileSync(path.join(MANUAL, 'index.html'), 'utf8');
// o <script> do molde monta links com texto ("'<a href=\"#' + id"): não são links do manual
const semScript = html.replace(/<script[\s\S]*?<\/script>/g, '');
const erros = [];

// 1. ids repetidos
const ids = [...semScript.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const vistos = new Set();
for (const id of ids) {
  if (vistos.has(id)) erros.push(`id repetido: #${id}`);
  vistos.add(id);
}

// 2. links internos
for (const m of semScript.matchAll(/<a\b[^>]*\shref="#([^"]*)"/g)) {
  const alvo = decodeURIComponent(m[1]);
  if (alvo && !vistos.has(alvo)) erros.push(`link interno quebrado: #${alvo}`);
}

// 3. imagens
const usadas = new Set();
for (const m of semScript.matchAll(/<img\b([^>]*)>/g)) {
  const attrs = m[1];
  const src = attrs.match(/\ssrc="([^"]*)"/)?.[1];
  if (!src) continue; // a do lightbox nasce vazia e é preenchida por script
  usadas.add(src);
  if (!fs.existsSync(path.join(MANUAL, src))) erros.push(`imagem não existe: ${src}`);
  const alt = attrs.match(/\salt="([^"]*)"/)?.[1];
  if (!alt || alt.trim().length < 8) erros.push(`imagem sem texto alternativo útil: ${src}`);
}
const dirImg = path.join(MANUAL, 'img');
const soltas = fs.existsSync(dirImg) ? fs.readdirSync(dirImg).filter((f) => !usadas.has('img/' + f)) : [];

// 4. rotas declaradas pelas páginas
const catalogo = lerCatalogo();
const hrefs = new Set(catalogo.map((i) => i.href));
const dinamica = /\[[^\]]+\]/;
// Hubs de grupo ("Ver tudo em ...") e telas de criação (/new) não são itens do catálogo, mas são telas reais.
const hubs = new Set(['/app/crm', '/app/ai', '/app/analise', '/app/campaigns/settings', '/app/settings']);
const criacao = /\/(new|novo|invite)$/;
for (const p of lerPaginas()) {
  for (const r of p.meta.rotas ?? []) {
    if (!hrefs.has(r) && !dinamica.test(r) && !hubs.has(r) && !criacao.test(r)) erros.push(`${p.meta.id}: rota "${r}" não está em lib/navigation/catalogo.ts (se é tela interna, use o formato /app/x/[id])`);
  }
}

// relatório
console.info(`Páginas escritas: ${resumo.escritas}`);
console.info(`Telas do menu documentadas: ${resumo.cobertasDoMenu}/${resumo.totalDoMenu} (${resumo.pendentes} em breve)`);
if (soltas.length) console.info(`Aviso: imagens que nenhuma página usa: ${soltas.join(', ')}`);
if (resumo.pendentes) {
  const faltam = catalogo.filter((i) => !lerPaginas().some((p) => (p.meta.rotas ?? []).includes(i.href)));
  console.info('Faltam: ' + faltam.map((i) => i.label).join(', '));
}
if (estrito && resumo.pendentes) erros.push(`cobertura incompleta: ${resumo.pendentes} tela(s) do menu sem página (--estrito)`);

if (erros.length) {
  console.error('\nDEFEITOS:\n - ' + [...new Set(erros)].join('\n - '));
  process.exit(1);
}
console.info('\nOK: nenhum defeito encontrado.');
