import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ORIGEM_DO_WHATSAPP, origemDoNegocioPeloCanal } from "@/lib/channels/origem-do-negocio";
import { DICIONARIO } from "@/lib/i18n/dicionario";

/**
 * O NEGÓCIO DIZ POR ONDE O CLIENTE CHEGOU.
 *
 * `garantirLeadDaConversa` assume WhatsApp quando ninguém diz o canal; a
 * ingestão compartilhada diz pela tradução canal → origem. Estes casos prendem
 * a tradução e a tradução do motivo para os outros idiomas.
 */

describe("a origem do negócio sai do canal da conversa", () => {
  it("sem canal, é WhatsApp — o caminho do QR e do número oficial", () => {
    expect(origemDoNegocioPeloCanal(undefined)).toEqual({
      rotulo: "WhatsApp",
      source: "whatsapp",
      motivo: "primeira mensagem recebida no WhatsApp",
    });
    expect(origemDoNegocioPeloCanal("whatsapp").source).toBe("whatsapp");
  });

  it("canal desconhecido não inventa origem", () => {
    // Cai no padrão em vez de gravar um `source` que nenhum relatório conhece.
    expect(origemDoNegocioPeloCanal("linkedin").source).toBe("whatsapp");
    expect(origemDoNegocioPeloCanal("rede-que-nao-existe").source).toBe("whatsapp");
  });
});

describe("o motivo do nascimento tem tradução", () => {
  // A linha do tempo mostra o motivo por `t(item.reason)` (LeadTimeline). Sem a
  // chave no dicionário, quem usa o CRM em espanhol ou inglês lê o motivo em
  // português.
  const en = JSON.parse(readFileSync("lib/i18n/traducoes/en.json", "utf8")) as Record<string, string>;
  const motivos = [
    ORIGEM_DO_WHATSAPP.motivo,
    // `workers/voice-agent/index.ts` e o cliente que volta (`nascimento-do-lead.ts`).
    "primeira ligação recebida",
    "cliente conhecido voltou a escrever",
  ];

  it.each(motivos)("%s — espanhol e inglês", (motivo) => {
    expect(DICIONARIO[motivo]?.es, `sem espanhol: ${motivo}`).toBeTruthy();
    expect(en[motivo], `sem inglês: ${motivo}`).toBeTruthy();
  });

  it("a origem padrão é UM objeto só — não uma segunda cópia do texto", () => {
    expect(origemDoNegocioPeloCanal(undefined)).toBe(ORIGEM_DO_WHATSAPP);
    const nascimento = readFileSync("lib/leads/nascimento-do-lead.ts", "utf8");
    expect(nascimento).toMatch(/const ORIGEM_PADRAO: OrigemDoNascimento = ORIGEM_DO_WHATSAPP;/);
    expect(nascimento).not.toMatch(/motivo: "primeira mensagem recebida no WhatsApp"/);
  });
});
