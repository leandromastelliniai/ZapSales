import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A MENSAGEM QUE O CLIENTE EDITOU OU APAGOU.
 *
 * ─── O defeito, relatado olhando a tela ─────────────────────────────────────
 *
 * O dono editou uma mensagem no celular e o inbox seguiu mostrando o texto
 * antigo. Nenhum erro em lugar nenhum: o evento chega (quando assinado), o
 * parser não o reconhece, a rota responde 200, a linha fica como estava.
 *
 * É pior que uma falha visível. Combinar preço, prazo ou endereço a partir de um
 * texto que o cliente já corrigiu gera uma divergência que ninguém rastreia
 * depois — os dois lados juram ter lido coisas diferentes, e os dois têm razão.
 *
 * ─── O que estes casos prendem ──────────────────────────────────────────────
 *
 * Que a edição case pela mensagem ORIGINAL (não pelo id do evento); que apagar
 * não apague a LINHA; que uma edição de mensagem desconhecida não invente
 * conversa; e que a tela DIGA que houve edição — o texto novo sozinho mente por
 * omissão, porque se lê como se sempre tivesse dito aquilo.
 */
describe("os elos que somem sem barulho", () => {
  it("WAHA casa pela mensagem ORIGINAL, não pelo id do evento", () => {
    // `editedMessageId`/`revokedMessageId` apontam para a mensagem que mudou; o
    // `id` do payload é o do próprio evento. Casar pelo `id` não acharia nada —
    // e o silêncio pareceria "funcionou".
    const fonte = readFileSync("lib/waha/ingest.ts", "utf8");
    expect(fonte).toMatch(/p\.editedMessageId/);
    expect(fonte).toMatch(/p\.revokedMessageId/);
    expect(fonte).toMatch(/eventType === "message\.edited"/);
    expect(fonte).toMatch(/eventType === "message\.revoked"/);
  });

  it("o canal por QR ASSINA os dois eventos — sem isso nada chega", () => {
    // Este é o elo mais silencioso de todos: o código trata os eventos
    // perfeitamente e o transporte nunca os envia. Medido antes desta mudança —
    // `WHATSAPP_HOOK_EVENTS` não tinha nenhum dos dois, e a mensagem editada
    // pelo dono simplesmente nunca chegou ao CRM.
    for (const arquivo of ["docker-compose.prod.yml", "docker-compose.yml"]) {
      const compose = readFileSync(arquivo, "utf8");
      const linha = compose.split("\n").find((l) => l.includes("WHATSAPP_HOOK_EVENTS")) ?? "";
      expect(linha, `${arquivo} não assina message.edited`).toContain("message.edited");
      expect(linha, `${arquivo} não assina message.revoked`).toContain("message.revoked");
    }
  });

  it("as colunas novas chegam à tela — sem elas a bolha nunca sabe", () => {
    // O `select` do handler é a única porta: coluna fora dele não chega, e
    // `conv as unknown as Joined` faz isso NÃO ser erro de tipo.
    const fonte = readFileSync("app/api/v1/messages/_handler.ts", "utf8");
    expect(fonte).toMatch(/edited_at, revoked_at/);
  });

  it("a bolha DIZ que foi editada, e esconde o texto da apagada", () => {
    const fonte = readFileSync("components/inbox/MessageBubble.tsx", "utf8");
    expect(fonte).toMatch(/revoked_at/);
    expect(fonte).toMatch(/Esta mensagem foi apagada/);
    expect(fonte).toMatch(/editada/);
  });
});
