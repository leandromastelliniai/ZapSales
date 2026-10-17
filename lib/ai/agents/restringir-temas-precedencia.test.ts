/**
 * PRECEDÊNCIA DO PEDIDO DE ATENDENTE HUMANO E DO OPT-OUT SOBRE "RESTRINGIR TEMAS" (#92).
 *
 * A restrição é instrução ao modelo (`comporInstrucoes`). Já o pedido de atendente
 * humano e o opt-out são detectados EM CÓDIGO, sobre o texto da mensagem, antes de o
 * modelo ser chamado (`inbound-turn.ts`: `detectHumanHandoffRequest` e
 * `matchesHandoffKeyword`; ingestão: `lib/opt-out`). Portanto a restrição não tem
 * por onde alcançá-los: as duas funções nem recebem a configuração do agente.
 *
 * Esta prova fixa os dois lados dessa garantia:
 *  1. os pedidos que a seção "Assuntos permitidos" cita como exceção SÃO reconhecidos
 *     pelos detectores — se alguém afrouxar um detector, a promessa do texto quebra aqui;
 *  2. uma pergunta apenas fora do tema (o caso que recebe a resposta padrão) NÃO é
 *     tomada por nenhum dos dois — a precedência não vira buraco na restrição.
 */
import { describe, expect, it } from "vitest";

import { detectHumanHandoffRequest } from "@/lib/agent-engine/agent/human-handoff";
import { ehPedidoDeOptOut } from "@/lib/opt-out/deteccao";

describe("restringir temas: atendente humano e opt-out nunca são 'fora do tema'", () => {
  it.each([
    "Quero falar com um atendente",
    "me passa para uma pessoa de verdade",
    "quero falar com um humano",
  ])("pedido de atendente humano é reconhecido em código: %s", (mensagem) => {
    expect(detectHumanHandoffRequest(mensagem)).toBe(true);
  });

  it.each(["parar", "sair da lista", "não quero mais receber mensagens"])(
    "opt-out é reconhecido em código: %s",
    (mensagem) => {
      expect(ehPedidoDeOptOut(mensagem)).toBe(true);
    },
  );

  it.each(["Quem ganhou o jogo de futebol ontem?", "Qual a previsão do tempo amanhã?"])(
    "pergunta só fora do tema não é tomada por handoff nem por opt-out (controle): %s",
    (mensagem) => {
      expect(detectHumanHandoffRequest(mensagem)).toBe(false);
      expect(ehPedidoDeOptOut(mensagem)).toBe(false);
    },
  );
});
