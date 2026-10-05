"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";
import type { FormatoDeMidia, NovoModelo, TipoDeArquivoDoCabecalho } from "@/lib/channels/meta/novo-modelo";

export interface TemplateSlotView {
  key: string;
  expects: string;
  /** Rótulo humano do endereço: "corpo", "cabeçalho", "card 2 › cabeçalho". */
  onde: string;
  /** A chave deste valor em `template_values` e em `savedValues` (`header:1`). */
  valueKey: string;
}

/** Texto de um componente, inteiro e uma vez só — a UI marca os `{{n}}`. */
export interface TemplatePreview {
  onde: string;
  text: string;
}

export interface TemplateView {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
  qualityScore: string | null;
  parameterFormat: string;
  contractHash: string;
  syncedAt: string;
  /** DERIVADOS do template pela API — nunca digitados, nunca contados à mão. */
  slots: TemplateSlotView[];
  previews: TemplatePreview[];
  /** Links de mídia salvos no modelo — o painel da janela fechada pré-preenche com eles. */
  savedValues: Record<string, string>;
  /**
   * O arquivo que o editor guardou ao criar o modelo, por slot de mídia (issue
   * #7). `url` é um link assinado de 1 hora; opcional para a tela não quebrar
   * com resposta de uma versão anterior da rota.
   */
  storedMedia?: Record<string, { fileName: string; mimeType: string; url: string | null }>;
}

export interface TemplatesPayload {
  /** `null` = canal oficial não conectado. Distinto de "conectado e sem template". */
  waba: string | null;
  templates: TemplateView[];
}

export interface SyncCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  disabled: number;
}

export function useTemplates() {
  return useQuery({
    queryKey: ["channel-templates"],
    queryFn: async () => apiClient.get<{ data: TemplatesPayload }>("/api/v1/channels/templates"),
    staleTime: 30_000,
  });
}

export function useSyncTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => apiClient.post<{ data: SyncCounts }>("/api/v1/channels/templates", {}),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-templates"] });
    },
  });
}

/**
 * Grava (ou esquece, com string vazia) o link de mídia do modelo. Invalida
 * também a lista do painel da janela fechada, que lê a mesma rota com outra
 * chave: sem isso o link salvo aqui só apareceria na conversa depois do
 * `staleTime`.
 */
export function useSaveTemplateValues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { name: string; language: string; values: Record<string, string> }) =>
      apiClient.patch<{ data: { savedValues: Record<string, string> } }>(
        "/api/v1/channels/templates",
        args,
      ),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-templates"] });
      qc.invalidateQueries({ queryKey: ["templates-da-conversa"] });
    },
  });
}

/** O que a rota de criação devolve: a linha do espelho, com o que a Meta respondeu. */
export interface ModeloSubmetidoView {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string | null;
  metaTemplateId: string | null;
}

/**
 * Cria o modelo no editor e o envia à Meta para aprovação (issue #6). O corpo é
 * o `NovoModelo` de `lib/channels/meta/novo-modelo.ts` — o mesmo schema que a
 * rota aplica. A recusa da Meta chega como toast com a frase dela.
 */
export function useSubmitTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modelo: NovoModelo) =>
      apiClient.post<{ data: ModeloSubmetidoView }>("/api/v1/channels/templates/submit", modelo),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channel-templates"] });
      qc.invalidateQueries({ queryKey: ["templates-da-conversa"] });
    },
  });
}

/** O que a rota de upload devolve (`app/api/v1/channels/templates/media`). */
export interface MidiaEnviadaView {
  handle: string;
  path: string;
  mime_type: TipoDeArquivoDoCabecalho;
  file_name: string;
  size_bytes: number;
  format: FormatoDeMidia;
  /** Link assinado de 1 hora, só para o preview do editor. */
  preview_url: string | null;
}

/**
 * Sobe a mídia do cabeçalho de um modelo (issue #7): a rota manda o arquivo à
 * API de upload da Meta e guarda a cópia no storage. Multipart, então fala
 * `fetch` direto, como o upload da conversa (`useUploadMedia`).
 */
export function useUploadTemplateMedia() {
  return useMutation({
    mutationFn: async (args: { file: File; format: FormatoDeMidia }) => {
      const form = new FormData();
      form.append("file", args.file, args.file.name);
      form.append("format", args.format);
      const res = await fetch("/api/v1/channels/templates/media", { method: "POST", body: form });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiErrorBody> & {
        data?: MidiaEnviadaView;
      };
      if (!res.ok || !json.data) {
        const e = json.error;
        throw new ApiError(res.status, e?.code ?? "upload_failed", e?.details, e?.request_id ?? "", e?.message);
      }
      return json.data;
    },
    onError: (err) => showApiError(err),
  });
}
