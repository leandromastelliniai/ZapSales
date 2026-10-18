/*
 * Monta `docs/manual/index.html` a partir de:
 *   - conteudo/grupos.json         a ordem e os nomes dos grupos do índice
 *   - conteudo/**\/*.html          uma página do manual por arquivo (veja o README)
 *   - lib/navigation/catalogo.ts   as telas do menu; as que ainda não têm página viram
 *                                  "em breve" no índice, com o que o próprio app diz delas
 *   - modelo.html                  o esqueleto: estilo, busca e navegação
 *
 * Uso:  node docs/manual/ferramentas/montar.mjs
 * Sem dependências: só o Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerCatalogo, ROTULO_DO_PAPEL, ROTULO_DO_GRUPO, RAIZ_DO_REPO } from './catalogo.mjs';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const MANUAL = path.resolve(aqui, '..');
const CONTEUDO = path.join(MANUAL, 'conteudo');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function listarHtml(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listarHtml(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

/* ---------- 1. páginas escritas ---------- */
export function lerPaginas() {
  return listarHtml(CONTEUDO).map((arq) => {
    const bruto = fs.readFileSync(arq, 'utf8');
    const m = bruto.match(/^\s*<!--meta\s+(\{[\s\S]*?\})\s*-->/);
    if (!m) throw new Error(`${path.relative(MANUAL, arq)}: falta a linha <!--meta {...} --> no começo.`);
    let meta;
    try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`${path.relative(MANUAL, arq)}: meta não é JSON válido (${e.message}).`); }
    for (const k of ['id', 'grupo', 'titulo']) if (!meta[k]) throw new Error(`${path.relative(MANUAL, arq)}: meta sem "${k}".`);
    const corpo = bruto.slice(m[0].length).trim();
    return { arq, meta, corpo };
  });
}

function montarPagina(p, grupos) {
  const { meta } = p;
  const grupo = grupos.find((g) => g.id === meta.grupo);
  if (!grupo) throw new Error(`${meta.id}: grupo "${meta.grupo}" não existe em grupos.json.`);
  // ids de h2 e h3 ganham o prefixo da página: dois arquivos podem ter "<h2 id="passo-a-passo">" sem colidir
  const corpo = p.corpo.replace(/<(h[23])(\s[^>]*?)?\sid="([^"]+)"/g, (t, tag, antes, id) => `<${tag}${antes ?? ''} id="${meta.id}--${id}"`);
  const ficha = [];
  if (meta.onde) ficha.push(['Onde fica', meta.onde]);
  if (meta.quem) ficha.push(['Quem pode usar', meta.quem]);
  if (meta.rotas?.length) ficha.push(['Endereço', meta.rotas.map((r) => `<code>${esc(r)}</code>`).join(' · ')]);
  return `
<article class="pagina" id="${esc(meta.id)}" data-titulo="${esc(meta.titulo)}" data-grupo="${esc(meta.grupo)}" data-grupo-titulo="${esc(grupo.titulo)}" data-resumo="${esc(meta.resumo)}" data-palavras="${esc((meta.palavras || []).join(' '))}" hidden>
  <p class="migalha"><a href="#inicio">Manual</a> › ${esc(grupo.titulo)} › ${esc(meta.titulo)}</p>
  <h1>${esc(meta.titulo)}</h1>
  ${meta.resumo ? `<p class="lede">${esc(meta.resumo)}</p>` : ''}
  ${ficha.length ? `<dl class="ficha">${ficha.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
  <div class="conteudo-pagina">
${corpo}
  </div>
</article>`;
}

/* ---------- 2. telas do menu ainda sem página ---------- */
function montarStub(item, id) {
  const quem = item.papel === 'viewer' ? 'Todos os papéis' : `${ROTULO_DO_PAPEL[item.papel]} ou acima`;
  const extra = [
    item.modulo ? `Só aparece quando o módulo opcional <code>${esc(item.modulo)}</code> está ligado na instalação.` : '',
    item.capacidade ? `Só aparece quando a organização liga a capacidade <code>${esc(item.capacidade)}</code>.` : '',
  ].filter(Boolean).join(' ');
  const grupo = ROTULO_DO_GRUPO[item.grupo];
  return `
<article class="pagina stub" id="${id}" data-titulo="${esc(item.label)}" data-grupo="${esc(item.grupo)}" data-grupo-titulo="${esc(grupo)}" data-resumo="${esc(item.descricao)}" data-palavras="" hidden>
  <p class="migalha"><a href="#inicio">Manual</a> › ${esc(grupo)} › ${esc(item.label)}</p>
  <h1>${esc(item.label)}</h1>
  <p class="lede">${esc(item.descricao)}</p>
  <dl class="ficha"><dt>Onde fica</dt><dd>${esc(grupo)}${item.secao ? ' › ' + esc(item.secao) : ''} › ${esc(item.label)}</dd><dt>Quem pode usar</dt><dd>${quem}${extra ? '<br>' + extra : ''}</dd><dt>Endereço</dt><dd><code>${esc(item.href)}</code></dd></dl>
  <div class="conteudo-pagina"><div class="pendente-aviso"><strong>Esta seção ainda está sendo escrita.</strong><br>O texto acima é a descrição que o próprio sistema dá para esta tela. A explicação completa — cada botão, cada campo e o passo a passo, com prints — entra nas próximas etapas do manual.</div></div>
</article>`;
}

/* ---------- 3. índice ---------- */
function montarIndice(grupos, paginasPorGrupo, stubsPorGrupo, totais) {
  const blocos = grupos.map((g) => {
    const escritas = paginasPorGrupo.get(g.id) ?? [];
    const stubs = stubsPorGrupo.get(g.id) ?? [];
    if (!escritas.length && !stubs.length) return '';
    const lis = [
      ...escritas.map((p) => `<li><a href="#${esc(p.meta.id)}" data-pagina="${esc(p.meta.id)}">${esc(p.meta.titulo)}</a></li>`),
      ...stubs.map((s) => `<li><a class="pendente" href="#${s.id}" data-pagina="${s.id}"><span>${esc(s.item.label)}</span><em>em breve</em></a></li>`),
    ].join('\n        ');
    return `    <details class="grupo" data-grupo="${g.id}"${g.id === 'comecando' ? ' open' : ''}>
      <summary>${esc(g.titulo)}</summary>
      <ul>
        ${lis}
      </ul>
    </details>`;
  }).join('\n');
  return `    <p class="progresso"><b>${totais.escritas}</b> de <b>${totais.total}</b> telas do menu já documentadas</p>\n${blocos}`;
}

/* ---------- montagem ---------- */
export function montar() {
  const grupos = JSON.parse(fs.readFileSync(path.join(CONTEUDO, 'grupos.json'), 'utf8'));
  const paginas = lerPaginas();
  const ids = new Set();
  for (const p of paginas) {
    if (ids.has(p.meta.id)) throw new Error(`id de página repetido: ${p.meta.id}`);
    ids.add(p.meta.id);
  }
  paginas.sort((a, b) => (a.meta.ordem ?? 999) - (b.meta.ordem ?? 999) || a.meta.titulo.localeCompare(b.meta.titulo, 'pt-BR'));

  const catalogo = lerCatalogo();
  const rotasCobertas = new Set(paginas.flatMap((p) => p.meta.rotas ?? []));
  const faltam = catalogo.filter((i) => !rotasCobertas.has(i.href));
  const stubs = faltam.map((item) => {
    let id = `em-breve-${item.grupo}-${slug(item.label)}`;
    while (ids.has(id)) id += '-2';
    ids.add(id);
    return { item, id };
  });

  const paginasPorGrupo = new Map();
  for (const p of paginas) paginasPorGrupo.set(p.meta.grupo, [...(paginasPorGrupo.get(p.meta.grupo) ?? []), p]);
  const stubsPorGrupo = new Map();
  for (const s of stubs) stubsPorGrupo.set(s.item.grupo, [...(stubsPorGrupo.get(s.item.grupo) ?? []), s]);

  // a ordem do índice é a ordem do DOM: primeiro os grupos, em cada um as páginas e depois as pendentes
  const ordemGrupos = grupos.map((g) => g.id);
  const emOrdem = [
    ...ordemGrupos.flatMap((g) => (paginasPorGrupo.get(g) ?? []).map((p) => ({ tipo: 'p', p }))
      .concat((stubsPorGrupo.get(g) ?? []).map((s) => ({ tipo: 's', s })))),
  ];
  const html = emOrdem.map((x) => (x.tipo === 'p' ? montarPagina(x.p, grupos) : montarStub(x.s.item, x.s.id))).join('\n');

  const indice = montarIndice(grupos, paginasPorGrupo, stubsPorGrupo, {
    escritas: catalogo.length - faltam.length,
    total: catalogo.length,
  });

  let sha = 'desconhecido';
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: RAIZ_DO_REPO, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* fora de um clone */ }
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const rodape = `<div class="rodape-marca"><svg class="simbolo" viewBox="0 0 216 216" aria-hidden="true"><use href="#lg-simbolo"/></svg><strong>ZapSales</strong><span>by</span><svg class="fut" viewBox="0 0 654 115" role="img" aria-label="Futuristas"><use href="#lg-futuristas" width="654" height="115"/></svg></div>Manual do ZapSales · gerado em ${hoje} a partir do código na revisão <code>${sha}</code>. Os prints vêm de uma organização de demonstração, com dados fictícios.`;

  const modelo = fs.readFileSync(path.join(MANUAL, 'modelo.html'), 'utf8');
  const saida = modelo.replace('{{INDICE}}', () => indice).replace('{{PAGINAS}}', () => html).replace('{{RODAPE}}', () => rodape);
  fs.writeFileSync(path.join(MANUAL, 'index.html'), saida, 'utf8');
  return { escritas: paginas.length, pendentes: stubs.length, cobertasDoMenu: catalogo.length - faltam.length, totalDoMenu: catalogo.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = montar();
  console.info(`index.html montado: ${r.escritas} páginas escritas; telas do menu documentadas: ${r.cobertasDoMenu}/${r.totalDoMenu} (${r.pendentes} em breve).`);
}
