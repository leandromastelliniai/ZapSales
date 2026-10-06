/**
 * UPLOAD MAIOR QUE O LIMITE DE CORPO DO PROXY NÃO PODE PASSAR PELO PROXY (issue #22).
 *
 * ─── O defeito ───────────────────────────────────────────────────────────────
 *
 * Quando o `proxy.ts` alcança um caminho, o Next copia o corpo da requisição
 * para entregá-lo ao proxy e guarda só os primeiros `proxyClientMaxBodySize`
 * bytes (padrão 10 MB) — `next/dist/server/body-streams.js`: "Only the first
 * 10MB will be available unless configured". A rota recebe essa cópia
 * cortada, o `formData()` não acha o arquivo e o operador lê "Campo 'file'
 * obrigatório" depois de escolher um vídeo de 12 MB.
 *
 * O corte só acontece em caminho que o MATCHER do proxy alcança: fora dele não
 * há cópia, e a rota lê o corpo inteiro. Por isso as rotas de upload grande
 * ficam fora do matcher, em vez de subir o limite para toda rota — subir
 * multiplicaria por cinco o que qualquer POST, autenticado ou não, deixa em
 * memória antes de o proxy decidir alguma coisa.
 *
 * ─── Por que uma varredura, e não uma lista ──────────────────────────────────
 *
 * A lista de exclusão do matcher é literal (o Next lê `config` estaticamente).
 * A próxima rota de upload grande nasceria cortada sem que nada avisasse. Este
 * teste descobre toda rota que lê `formData()` e exige que ela declare seu teto
 * aqui: acima do limite, fora do matcher; abaixo, dentro — a exclusão não pode
 * crescer de carona.
 *
 * O matcher é compilado e casado pelas MESMAS funções que o Next usa no build e
 * no servidor (`getMiddlewareMatchers` e `getMiddlewareRouteMatcher`); uma
 * regex reescrita à mão aqui provaria a regex, não o produto.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { defaultConfig } from "next/dist/server/config-shared";
import { getMiddlewareRouteMatcher } from "next/dist/shared/lib/router/utils/middleware-route-matcher";

import { TETO_POR_FORMATO } from "@/lib/channels/meta/midia-de-modelo";
import { TAMANHO_MAXIMO_DE_DOCUMENTO } from "@/lib/ai/rag/ingest/documento";
import { TAMANHO_MAXIMO_DO_LOGO } from "@/lib/branding/logo";
import { TAMANHO_MAXIMO_DA_FOTO } from "@/lib/catalogo/fotos";
import { CSV_MAX_BYTES } from "@/lib/contacts/csv";
import { IMPORT_MAX_BYTES } from "@/lib/crm-b2b/spreadsheet";
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { TAMANHO_MAXIMO_DO_SOM } from "@/lib/notifications/sons-da-org";

const MB = 1024 * 1024;
/** Folga para o envelope do multipart (fronteiras, cabeçalhos, demais campos). */
const ENVELOPE = MB;
const UUID = "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";

/**
 * O teto de cada rota que lê `formData()`, e um caminho concreto dela. Rota
 * nova que lê multipart e não está aqui reprova: quem a escreve decide, com o
 * número na mão, se ela passa pelo proxy.
 */
const ROTAS_COM_MULTIPART: Record<string, { caminho: string; teto: number }> = {
  "app/api/v1/ai/knowledge/sources/upload/route.ts": {
    caminho: "/api/v1/ai/knowledge/sources/upload",
    teto: TAMANHO_MAXIMO_DE_DOCUMENTO,
  },
  // 6 MB é o teto do envelope declarado na própria rota (skill de 5 MB + folga).
  "app/api/v1/ai/skills/import/route.ts": { caminho: "/api/v1/ai/skills/import", teto: 6 * MB },
  "app/api/v1/channels/templates/media/route.ts": {
    caminho: "/api/v1/channels/templates/media",
    teto: Math.max(...Object.values(TETO_POR_FORMATO)),
  },
  "app/api/v1/contacts/import/route.ts": { caminho: "/api/v1/contacts/import", teto: CSV_MAX_BYTES },
  "app/api/v1/conversations/[id]/media/route.ts": {
    caminho: `/api/v1/conversations/${UUID}/media`,
    teto: MAX_MEDIA_BYTES,
  },
  "app/api/v1/conversations/[id]/notes/media/route.ts": {
    caminho: `/api/v1/conversations/${UUID}/notes/media`,
    teto: MAX_MEDIA_BYTES,
  },
  "app/api/v1/imports/route.ts": { caminho: "/api/v1/imports", teto: IMPORT_MAX_BYTES },
  "app/api/v1/leads/import/route.ts": { caminho: "/api/v1/leads/import", teto: CSV_MAX_BYTES },
  "app/api/v1/marca/logo/route.ts": { caminho: "/api/v1/marca/logo", teto: TAMANHO_MAXIMO_DO_LOGO },
  "app/api/v1/products/[id]/fotos/route.ts": {
    caminho: `/api/v1/products/${UUID}/fotos`,
    teto: TAMANHO_MAXIMO_DA_FOTO,
  },
  "app/api/v1/products/import/route.ts": { caminho: "/api/v1/products/import", teto: CSV_MAX_BYTES },
  // 5 MB é constante local da rota.
  "app/api/v1/settings/proposal-templates/importar/route.ts": {
    caminho: "/api/v1/settings/proposal-templates/importar",
    teto: 5 * MB,
  },
  "app/api/v1/settings/sons/route.ts": { caminho: "/api/v1/settings/sons", teto: TAMANHO_MAXIMO_DO_SOM },
};

function matcherDoProxy(): string[] {
  const fonte = readFileSync("proxy.ts", "utf8");
  const bloco = /matcher:\s*\[([\s\S]*?)\]\s*,?\s*\}/.exec(fonte)?.[1];
  if (!bloco) throw new Error("proxy.ts sem `config.matcher` — o teste não tem o que medir");
  const semComentario = bloco
    .split("\n")
    .filter((linha) => !/^\s*\/\//.test(linha))
    .join("\n");
  return [...semComentario.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(m[0]) as string);
}

// A função do build que compila o matcher (`get-page-static-info`). Ela existe
// no JS do Next, mas o `.d.ts` publicado não a declara — daí o `require` tipado.
const { getMiddlewareMatchers } = createRequire(import.meta.url)(
  "next/dist/build/analysis/get-page-static-info",
) as {
  getMiddlewareMatchers: (
    matcher: string[],
    nextConfig: { i18n: null },
  ) => Parameters<typeof getMiddlewareRouteMatcher>[0];
};

const proxyAlcanca = getMiddlewareRouteMatcher(
  getMiddlewareMatchers(matcherDoProxy(), { i18n: null }),
);
const alcanca = (caminho: string) => proxyAlcanca(caminho, {} as never, {});

function limiteDoCorpo(): number {
  // `next.config.ts` não sobrescreve o limite; se passar a sobrescrever, este
  // teste precisa ler o valor de lá em vez do padrão.
  expect(readFileSync("next.config.ts", "utf8")).not.toMatch(/proxyClientMaxBodySize/);
  const limite = defaultConfig.experimental?.proxyClientMaxBodySize;
  expect(typeof limite).toBe("number");
  return limite as number;
}

function rotasQueLeemMultipart(): string[] {
  const saida = execFileSync("git", ["ls-files", "app/**/route.ts"], { encoding: "utf8" });
  return saida
    .split("\n")
    .filter(Boolean)
    .filter((arquivo) => readFileSync(arquivo, "utf8").includes("formData()"));
}

describe("o matcher do proxy e o limite de corpo", () => {
  const limite = limiteDoCorpo();

  it("toda rota que lê multipart declara seu teto aqui", () => {
    const semTeto = rotasQueLeemMultipart().filter((rota) => !(rota in ROTAS_COM_MULTIPART));
    expect(semTeto, "rota nova com multipart: declare o teto em ROTAS_COM_MULTIPART").toEqual([]);
  });

  it("nenhuma entrada da tabela é rota que já não existe", () => {
    const existentes = new Set(rotasQueLeemMultipart());
    expect(Object.keys(ROTAS_COM_MULTIPART).filter((rota) => !existentes.has(rota))).toEqual([]);
  });

  for (const [rota, { caminho, teto }] of Object.entries(ROTAS_COM_MULTIPART)) {
    const grande = teto + ENVELOPE > limite;
    it(`${caminho} (${(teto / MB).toFixed(1)} MB) ${grande ? "fica FORA" : "fica DENTRO"} do proxy`, () => {
      expect(alcanca(caminho), rota).toBe(!grande);
    });
  }

  it("rota fora do proxy recusa pelo Content-Length ANTES de ler o corpo", () => {
    // Fora do matcher, nada corta o corpo antes da rota: sem esta guarda, uma
    // sessão válida faria o servidor bufferizar gigabytes até o `file.size`.
    const semGuarda = Object.entries(ROTAS_COM_MULTIPART)
      .filter(([, { teto }]) => teto + ENVELOPE > limite)
      .filter(([rota]) => {
        const fonte = readFileSync(rota, "utf8");
        const guarda = fonte.indexOf('req.headers.get("content-length")');
        return guarda === -1 || guarda > fonte.indexOf("formData()");
      })
      .map(([rota]) => rota);
    expect(semGuarda).toEqual([]);
  });

  it("a exclusão é ancorada — vizinhos das rotas de upload seguem pelo proxy", () => {
    // Exclusão sem âncora é como o proxy deixa de proteger tela inteira.
    for (const vizinho of [
      "/app/inbox",
      "/api/v1/conversations",
      `/api/v1/conversations/${UUID}`,
      `/api/v1/conversations/${UUID}/messages`,
      `/api/v1/conversations/${UUID}/media-extra`,
      `/api/v1/conversations/${UUID}/notes`,
      `/api/v1/conversations/${UUID}/notes/media/x`,
      "/api/v1/channels/templates",
      "/api/v1/channels/templates/media/x",
      "/api/v1/ai/knowledge/sources",
      "/api/v1/ai/knowledge/sources/upload/x",
    ]) {
      expect(alcanca(vizinho), vizinho).toBe(true);
    }
  });

  it("os ativos estáticos seguem fora, como antes", () => {
    expect(alcanca("/_next/static/chunks/app.js")).toBe(false);
    expect(alcanca("/favicon.ico")).toBe(false);
  });
});
