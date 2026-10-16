/*
 * Desenha anotações (contorno + seta + número) por cima da tela, antes do print.
 * Não faz parte do manual publicado: é a ferramenta que gera as imagens dele.
 *
 * Uso (no navegador, com a tela aberta):
 *   window.__anota([
 *     { n: 1, sel: 'button', texto: 'Novo funil', at: 'b' },
 *     { n: 2, sel: 'h1', at: 'r' },
 *   ]);
 *   ... tira o print ...
 *   window.__anotaLimpa();
 *
 * Cada item acha o elemento por `sel` (seletor CSS) e, se houver `texto`, pelo
 * texto exato visível. `at` diz de que lado fica o número: t b l r tl tr bl br.
 * `pad` aumenta o contorno; `dist` afasta o número (padrão 38).
 * Devolve a caixa de cada item, para conferir que nada ficou sem alvo.
 */
(function () {
  const COR = '#e11d48';
  const NS = 'http://www.w3.org/2000/svg';

  // `sobe: N` sobe N níveis a partir do elemento achado (para pegar o cartão, e não o texto dele).
  function acha(it) {
    let e = acha1(it);
    for (let i = 0; e && i < (it.sobe || 0); i++) e = e.parentElement;
    return e;
  }

  function acha1(it) {
    if (it.el) return it.el;
    const raiz = it.dentro ? document.querySelector(it.dentro) : document;
    if (!raiz) return null;
    const lista = Array.from(raiz.querySelectorAll(it.sel || '*'));
    const visiveis = lista.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!it.texto) return visiveis[it.idx || 0] || null;
    // O dinheiro formatado usa espaço "não separável"; \s o cobre. `contem`
    // aceita um trecho em vez do texto inteiro.
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const alvo = norm(it.texto);
    const iguais = visiveis.filter((e) => {
      const t = norm(e.innerText || e.textContent);
      return it.contem ? t.includes(alvo) : t === alvo;
    });
    // o mais interno que casa, para não pegar o contêiner inteiro
    const internos = iguais.filter((e) => !iguais.some((o) => o !== e && e.contains(o)));
    return internos[it.idx || 0] || null;
  }

  function no(nome, attrs) {
    const e = document.createElementNS(NS, nome);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  window.__anotaLimpa = function () {
    const a = document.getElementById('__an');
    if (a) a.remove();
  };

  window.__anota = function (itens) {
    window.__anotaLimpa();
    const svg = no('svg', {
      id: '__an',
      style:
        'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647',
    });
    const defs = no('defs', {});
    const marca = no('marker', {
      id: '__seta',
      viewBox: '0 0 10 10',
      refX: '8',
      refY: '5',
      markerWidth: '7',
      markerHeight: '7',
      orient: 'auto-start-reverse',
    });
    marca.appendChild(no('path', { d: 'M0,0 L10,5 L0,10 z', fill: COR }));
    defs.appendChild(marca);
    svg.appendChild(defs);

    const relatorio = [];
    for (const it of itens) {
      const el = acha(it);
      if (!el) {
        relatorio.push({ n: it.n, achou: false, alvo: it.texto || it.sel });
        continue;
      }
      const r = el.getBoundingClientRect();
      const pad = it.pad == null ? 4 : it.pad;
      const x = r.left - pad,
        y = r.top - pad,
        w = r.width + pad * 2,
        h = r.height + pad * 2;
      svg.appendChild(
        no('rect', {
          x,
          y,
          width: w,
          height: h,
          rx: 8,
          fill: 'rgba(225,29,72,0.08)',
          stroke: COR,
          'stroke-width': 3,
        }),
      );

      const at = it.at || 'tl';
      const d = it.dist == null ? 38 : it.dist;
      const cx = x + w / 2,
        cy = y + h / 2;
      const pontos = {
        t: [cx, y, 0, -1],
        b: [cx, y + h, 0, 1],
        l: [x, cy, -1, 0],
        r: [x + w, cy, 1, 0],
        tl: [x, y, -0.7, -0.7],
        tr: [x + w, y, 0.7, -0.7],
        bl: [x, y + h, -0.7, 0.7],
        br: [x + w, y + h, 0.7, 0.7],
      };
      const [px, py, dx, dy] = pontos[at];
      const bx = Math.max(16, Math.min(window.innerWidth - 16, px + dx * d));
      const by = Math.max(16, Math.min(window.innerHeight - 16, py + dy * d));
      // seta do número até a borda do contorno
      const ang = Math.atan2(py - by, px - bx);
      const sx = bx + Math.cos(ang) * 14,
        sy = by + Math.sin(ang) * 14;
      svg.appendChild(
        no('line', {
          x1: sx,
          y1: sy,
          x2: px,
          y2: py,
          stroke: COR,
          'stroke-width': 3,
          'marker-end': 'url(#__seta)',
        }),
      );
      svg.appendChild(
        no('circle', {
          cx: bx,
          cy: by,
          r: 14,
          fill: COR,
          stroke: '#fff',
          'stroke-width': 2,
        }),
      );
      const t = no('text', {
        x: bx,
        y: by + 5,
        'text-anchor': 'middle',
        'font-size': 15,
        'font-weight': 700,
        'font-family': 'Arial, sans-serif',
        fill: '#fff',
      });
      t.textContent = String(it.n);
      svg.appendChild(t);
      relatorio.push({
        n: it.n,
        achou: true,
        caixa: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      });
    }
    document.body.appendChild(svg);
    // Resposta curta de propósito: só diz quantos acharam e quais não acharam.
    const faltou = relatorio.filter((r) => !r.achou).map((r) => r.n + ':' + r.alvo);
    return { desenhados: relatorio.length - faltou.length, faltou };
  };
})();
