"use client";
/**
 * O ARQUIVO DO CABEÇALHO DE MÍDIA DE UM MODELO (issue #7).
 *
 * Escolher o arquivo já o envia: a rota manda à API de upload da Meta e guarda
 * a cópia no storage (`useUploadTemplateMedia`). O que volta — o `handle` da
 * amostra e o caminho da cópia — é o que vai no modelo. O link assinado do
 * preview sobe para quem desenha o balão (`onLink`).
 *
 * O formato vem de fora: no modelo padrão e na oferta ele é escolhido ao lado,
 * no carrossel é um só para todos os cards. Arquivo de outro formato não é
 * aceito pelo seletor nem pela rota (que fareja o conteúdo).
 */
import { Loader2, Paperclip } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useUploadTemplateMedia } from "@/hooks/channels/useTemplates";
import { useT } from "@/hooks/i18n/useT";
import type { CabecalhoDoModelo, FormatoDeMidia } from "@/lib/channels/meta/novo-modelo";

/** O que o seletor do sistema mostra para cada formato. */
const ACEITA: Record<FormatoDeMidia, string> = {
  IMAGE: "image/jpeg,image/png",
  VIDEO: "video/mp4",
  DOCUMENT: "application/pdf",
};

const DICA: Record<FormatoDeMidia, string> = {
  IMAGE: "JPG ou PNG, até 5 MB.",
  VIDEO: "MP4, até 16 MB.",
  DOCUMENT: "PDF, até 50 MB.",
};

export function CampoDeMidia({
  cabecalho,
  onMudar,
  onLink,
  testId,
}: {
  cabecalho: CabecalhoDoModelo;
  onMudar: (c: CabecalhoDoModelo) => void;
  onLink: (path: string, link: string) => void;
  testId: string;
}) {
  const t = useT();
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const subir = useUploadTemplateMedia();
  const formato = cabecalho.format;

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const r = await subir.mutateAsync({ file: arquivo, format: formato });
      if (r.preview_url) onLink(r.path, r.preview_url);
      onMudar({
        format: r.format,
        media: { handle: r.handle, path: r.path, mime_type: r.mime_type, file_name: r.file_name },
      });
    } catch {
      // A recusa já virou aviso na tela (`showApiError` do hook); o campo fica como estava.
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <input
        ref={entrada}
        id={id}
        type="file"
        accept={ACEITA[formato]}
        className="sr-only"
        onChange={(e) => void escolher(e.target.files?.[0])}
        data-testid={`${testId}-arquivo`}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={subir.isPending}
        onClick={() => entrada.current?.click()}
        data-testid={`${testId}-escolher`}
      >
        {subir.isPending ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Paperclip className="size-3.5" aria-hidden />
        )}
        {subir.isPending
          ? t("Enviando…")
          : cabecalho.media
            ? t("Trocar arquivo")
            : t("Escolher arquivo")}
      </Button>
      {cabecalho.media ? (
        <span className="min-w-0 truncate text-xs" data-testid={`${testId}-nome`}>
          {cabecalho.media.file_name}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">{t(DICA[formato])}</span>
      )}
    </div>
  );
}
