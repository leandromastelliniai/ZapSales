/*
 * Lê os destinos do menu direto de `lib/navigation/catalogo.ts` — a única lista
 * de telas do app. O manual não guarda cópia dela: o que o catálogo declara é o
 * que o manual precisa cobrir, e o conferidor reprova quando falta.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ_DO_REPO = path.resolve(aqui, '..', '..', '..');
const ARQUIVO = path.join(RAIZ_DO_REPO, 'lib', 'navigation', 'catalogo.ts');

const campo = (bloco, nome) => {
  const m = bloco.match(new RegExp('\\n    ' + nome + ':\\s*\\n?\\s*(["\'`])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1'));
  return m ? m[2].replace(/\\(["'`])/g, '$1') : null;
};
const marca = (bloco, nome) => new RegExp('\\n    ' + nome + ':\\s*true').test(bloco);

export function lerCatalogo() {
  const fonte = fs.readFileSync(ARQUIVO, 'utf8');
  const inicio = fonte.indexOf('export const NAV_CATALOG');
  if (inicio < 0) throw new Error('NAV_CATALOG não encontrado em ' + ARQUIVO);
  const fim = fonte.indexOf('] as const', inicio);
  const corpo = fonte.slice(inicio, fim);
  const itens = [];
  for (const m of corpo.matchAll(/\n  \{\n([\s\S]*?)\n  \},?(?=\n)/g)) {
    const b = '\n' + m[1];
    const href = campo(b, 'href');
    if (!href) continue;
    itens.push({
      href,
      label: campo(b, 'label'),
      descricao: campo(b, 'description'),
      grupo: campo(b, 'group'),
      secao: campo(b, 'section'),
      papel: campo(b, 'minRole') || 'viewer',
      modulo: campo(b, 'modulo'),
      capacidade: campo(b, 'capacidade'),
      noMenuLateral: marca(b, 'sidebar'),
    });
  }
  return itens;
}

export const ROTULO_DO_PAPEL = {
  viewer: 'Somente leitura',
  agent: 'Atendente',
  manager: 'Gerente',
  admin: 'Administrador',
};

export const ROTULO_DO_GRUPO = {
  atendimento: 'Atendimento',
  crm: 'CRM',
  ia: 'Agente de IA',
  canais: 'Canais',
  analise: 'Análise',
  organizacao: 'Organização e configurações',
};
