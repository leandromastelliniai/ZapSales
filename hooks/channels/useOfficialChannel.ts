"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { UsoDoNumero } from "@/lib/channels/uso";

export interface OfficialChannelState {
  channel_session_id?: string | null;
  connected: boolean;
  /** Existe token gravado? O token em si NUNCA volta — ver a rota. */
  hasToken: boolean;
  phoneNumberId: string | null;
  wabaId: string | null;
  /** Conta de mensagens (Graph v26). Opcional: ausente em servidor antigo. */
  messagingAccountId?: string | null;
  /** Base pública da API — usada no painel "Para integrar". */
  endpoint: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  status: string | null;
  webhook: {
    callbackUrl: string;
    verifyToken: string | null;
    /**
     * De onde vem o token que vale. `instalacao` = cadastrado na tela de
     * administração: existe, mas não volta num GET (foi mostrado uma vez, lá).
     * Opcional: ausente é lido como desconhecido, e a tela cai no aviso genérico.
     */
    verifyTokenOrigem?: "ambiente" | "instalacao" | "numero" | null;
    /** Onde se cadastra o App da Meta — só para quem pode abrir a tela da instalação. */
    configurarEm?: string | null;
    fields: string[];
  } | null;
  /**
   * O que a instalação já fez SOZINHA com o webhook deste número (fatia F1 da #850):
   * a Meta foi apontada para o endereço desta sessão, ou ainda não.
   *
   * `registrado: false` NÃO é canal quebrado: ele envia normalmente; o que depende
   * disto é a ENTREGA. Nulo = banco sem a migration 0311 (a tela volta ao passo
   * manual, que é o estado anterior — e continua verdadeiro).
   */
  webhookRegistro: {
    registrado: boolean;
    url: string | null;
    erro: string | null;
    em: string | null;
  } | null;
  /** Uso declarado (issue #5). Opcional: ausente em servidor antigo. */
  uso?: UsoDoNumero | null;
  /** Saúde que a Meta informa (qualidade, limite do portfólio, último evento). */
  saude?: SaudeDoNumero | null;
  numeroRegistradoEm?: string | null;
  /** O número usa o app próprio trazido pelo assistente (SE existe, nunca QUAL). */
  appProprio?: boolean;
  /** Embedded Signup v4 — só quando a instalação ligou a chave. */
  embeddedSignup?: { appId: string; configId: string } | null;
}

export interface SaudeDoNumero {
  qualidade: string | null;
  limite: string | null;
  evento: string | null;
  em: string | null;
}

export interface ConnectInput {
  phone_number_id: string;
  waba_id: string;
  token: string;
  /** Opcional — só obrigatória para a Meta quando o token alcança mais de uma conta. */
  messaging_account_id?: string;
  /** Do assistente (issue #5): app próprio, PIN de registro e uso declarado. */
  app_secret?: string;
  verify_token?: string;
  pin?: string;
  uso?: UsoDoNumero;
}

/** O que o diagnóstico do assistente devolve — ver `lib/channels/meta/conexao-guiada.ts`. */
export interface DiagnosticoDaCredencial {
  ok: boolean;
  problemas: Array<{ codigo: string; mensagem: string; detalhe?: string | null }>;
  avisos: Array<{ codigo: string; mensagem: string; detalhe?: string | null }>;
  appId: string | null;
  permissoes: string[];
  contas: Array<{
    wabaId: string;
    nome: string | null;
    erro: string | null;
    checklist: Array<{
      item: "app_live" | "forma_de_pagamento" | "empresa_verificada";
      estado: "ok" | "pendente" | "desconhecido";
      mensagem: string;
      detalhe?: string | null;
    }>;
    numeros: Array<{
      id: string;
      numeroExibido: string | null;
      nomeVerificado: string | null;
      qualidade: string | null;
      limite: string | null;
      status: string | null;
      modo: string | null;
    }>;
  }>;
}

export interface ResultadoDaConexao {
  connected: boolean;
  displayName: string;
  phoneNumber: string | null;
  numeroRegistrado?: boolean;
  webhookRegistro?: { registrado: boolean; erro: string | null } | null;
  webhookDoApp?: { assinado: boolean; erro: string | null } | null;
}

export interface RegistroDoWebhook {
  registrado: boolean;
  url: string | null;
  erro: string | null;
  em: string;
  callbackUrl: string;
}

export function useOfficialChannel() {
  return useQuery({
    queryKey: ["official-channel"],
    queryFn: async () => apiClient.get<{ data: OfficialChannelState }>("/api/v1/channels/official"),
    staleTime: 15_000,
  });
}

export function useConnectOfficialChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectInput) =>
      apiClient.post<{ data: ResultadoDaConexao }>("/api/v1/channels/official", input),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["official-channel"] });
    },
  });
}

/**
 * "Tentar de novo" o registro do webhook — sem pedir a credencial outra vez.
 *
 * A rota responde 200 mesmo quando a Meta recusa (o motivo vem em `erro`), e é de
 * propósito: aqui o que interessa é o MOTIVO na tela. Por isso não há toast de erro
 * genérico no sucesso — a invalidação recarrega o estado e o aviso âmbar com o motivo
 * fica onde o operador pode lê-lo, em vez de desaparecer em três segundos.
 */
export function useRegistrarWebhookOficial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      apiClient.post<{ data: RegistroDoWebhook }>("/api/v1/channels/official/webhook", {}),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["official-channel"] });
    },
  });
}

/**
 * O primeiro passo do assistente: testa o token (e o App Secret) e devolve
 * problemas, avisos, contas, números e checklist. Não grava nada.
 */
export function useDiagnosticarCredencial() {
  return useMutation({
    mutationFn: async (input: { token: string; app_secret?: string }) =>
      apiClient.post<{ data: DiagnosticoDaCredencial }>("/api/v1/channels/official/assistente", input),
    onError: showApiError,
  });
}

/** Troca o uso declarado do número sem pedir credencial. */
export function useDeclararUso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { channelSessionId: string; uso: UsoDoNumero }) =>
      apiClient.patch<{ data: { id: string; uso: UsoDoNumero } }>(
        `/api/v1/channel-sessions/${input.channelSessionId}/uso`,
        { uso: input.uso },
      ),
    onError: showApiError,
    // DEVOLVE a releitura: a mutation fica pendente até o estado novo chegar, e a
    // tela não pisca de volta para o valor antigo no meio do caminho.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["official-channel"] }),
  });
}

/** A volta do Embedded Signup: o código e os ids vão ao servidor, que troca e conecta. */
export function useConectarPeloEmbeddedSignup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; waba_id: string; phone_number_id: string; pin: string; uso: UsoDoNumero }) =>
      apiClient.post<{ data: ResultadoDaConexao }>("/api/v1/channels/official/embedded-signup", input),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["official-channel"] });
    },
  });
}
