import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A MÍDIA QUE O CLIENTE MANDA, EM QUALQUER CANAL.
 *
 * ─── O defeito, medido em produção ──────────────────────────────────────────
 *
 * Um canal novo entrou e a mídia recebida por ele virava linha `type:"image"`
 * SEM bytes: o worker chamava `fetchWahaMedia` FIXO, e mesmo acordado e com
 * URL ele baixaria pelo transporte errado. O atendente via "imagem" sem imagem
 * — perda de informação do cliente, irreversível quando a plataforma descarta
 * o arquivo.
 *
 * O conserto foi pôr quem baixa atrás do seam (`fetchInboundMedia`). Estes
 * casos prendem esse elo: o worker pergunta ao adapter, nunca a um canal fixo.
 */

const WORKER = readFileSync("workers/media-persist-worker.ts", "utf8");
const TYPES = readFileSync("lib/channels/types.ts", "utf8");

describe("quem baixa é o CANAL, não uma função fixa", () => {
  it("o seam declara `fetchInboundMedia`, COM o escopo de tenant", () => {
    // O `ChannelTenantScope &` não é enfeite: sem a organização, quem baixa a
    // mídia resolve a credencial por um identificador de provider que não é
    // único, e a issue #236 mediu esse caminho terminando na conta do `.env`.
    expect(TYPES).toMatch(/fetchInboundMedia\?\(input: ChannelTenantScope & \{/);
  });

  it("o worker despacha pelo adapter", () => {
    expect(WORKER).toMatch(/await adapter\.fetchInboundMedia\(\{/);
  });

  it("e NÃO chama mais a função de um canal só", () => {
    // Era esta linha que fazia a mídia de qualquer outro canal virar linha sem
    // bytes. O guarda primário é o `lint:channels`; este caso é a rede de baixo.
    // A CHAMADA, não a menção: o comentário que explica o defeito cita o nome
    // da função, e a primeira versão deste caso ficava vermelha por causa da
    // própria documentação da correção.
    expect(WORKER, "o worker voltou a chamar o transporte fixo").not.toMatch(
      /await fetchWahaMedia\(|= fetchWahaMedia\(/,
    );
  });

  it("pede a sessão para resolver QUEM baixa", () => {
    // Sem `channel_session_id` no select, não há como pedir o adapter — e o
    // worker voltaria a depender de um canal fixo por falta de dado.
    expect(WORKER).toMatch(/channel_session_id/);
    expect(WORKER).toMatch(/CHANNEL_SESSION_REF_COLUMNS/);
  });

  it("canal que não sabe baixar é PULADO, não marcado como falho", () => {
    // É o estado normal de um canal sem mídia de entrada. Marcar `failed` faria
    // a Central acusar um defeito que não existe.
    expect(WORKER).toMatch(/status: "skipped", detail: "canal_sem_midia_de_entrada"/);
  });

  it("o worker não nomeia nenhum provider", () => {
    expect(WORKER, "o worker está decidindo por provider").not.toMatch(
      /"waha"|"meta_cloud"/,
    );
  });
});

describe("o que cada canal faz com a URL", () => {
  it("o canal por QR delega no que já existia — comportamento idêntico", () => {
    // O risco desta mudança é mexer no canal que funciona bem. Ele chama a
    // MESMA função, com os mesmos argumentos; só mudou quem a escolhe.
    const w = readFileSync("lib/channels/adapters/waha.ts", "utf8");
    expect(w).toMatch(/return fetchWahaMedia\(input\.url, input\.hintMime \?\? null\)/);
  });

  it("o seam devolve o MESMO tipo, reusado e não redefinido", () => {
    // Um segundo tipo com os mesmos campos diverge em silêncio na primeira vez
    // que um lado ganhar um campo — é a doutrina do topo de `types.ts`.
    expect(TYPES).toMatch(/\}\): Promise<FetchedMedia>;/);
  });
});
