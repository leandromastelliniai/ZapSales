"use client";

/**
 * AS PÁGINAS DE UM MATERIAL DO TIPO SITE.
 *
 * Responde à pergunta de quem operou: "o agente leu o meu site? quais páginas,
 * e o que deu errado nas que não foram?". Cada página mostra o estado (lida,
 * falhou, aguardando leitura) e, quando falhou, o motivo em frase de gente — sem
 * isso, "O agente não sabe" não tem para onde ir.
 *
 * A lista é editável aqui mesmo (um endereço por linha) e a leitura é MANUAL: não
 * há agendamento nenhum, e ler de novo é um botão. Salvar uma lista nova também
 * lê, porque a pessoa acabou de pedir.
 */
import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  usePaginasDoSite,
  useSalvarPaginasDoSite,
  type PaginaDoSiteRow,
} from "@/hooks/ai/useKnowledgeSources";

interface Props {
  sourceId: string;
  nome: string;
  aberto: boolean;
  onFechar: () => void;
  /** Refaz a leitura do site (o re-treino manual da fonte). */
  onReler: () => void;
  relendo?: boolean;
}

const ROTULO_DO_ESTADO: Record<PaginaDoSiteRow["status"], { rotulo: string; variante: "success" | "error" | "neutral" }> = {
  lida: { rotulo: "Lida", variante: "success" },
  falhou: { rotulo: "Não foi lida", variante: "error" },
  pendente: { rotulo: "Aguardando leitura", variante: "neutral" },
};

export function PaginasDoSiteDialog({ sourceId, nome, aberto, onFechar, onReler, relendo }: Props) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { data: paginas, isLoading, isError } = usePaginasDoSite(sourceId, aberto);
  const salvar = useSalvarPaginasDoSite(sourceId);
  // `null` = a pessoa ainda não mexeu: o campo mostra o que o servidor tem. É derivado, e não
  // copiado para o estado por um efeito — assim acompanha a leitura sem renderização em cascata.
  const [editado, setEditado] = useState<string | null>(null);
  const editando = editado !== null;
  const texto = editado ?? (paginas ?? []).map((p) => p.url).join("\n");

  const quando = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(tagDoIdioma, { dateStyle: "short", timeStyle: "short" }) : null;

  async function salvarLista(): Promise<void> {
    const urls = texto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "");
    await salvar.mutateAsync(urls);
    setEditado(null);
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {t("Páginas de")} “{nome}”
          </DialogTitle>
          <DialogDescription>
            {t(
              "O agente aprende o texto principal de cada página. Quando o site mudar, peça para ler de novo — a leitura é sempre manual.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1" data-testid="site-paginas-lista">
          {isLoading ? <p className="text-sm text-text-muted">{t("Carregando…")}</p> : null}
          {isError ? (
            <p className="text-sm text-error-fg">{t("Não consegui ler as páginas agora.")}</p>
          ) : null}

          {paginas?.map((p) => {
            const estado = ROTULO_DO_ESTADO[p.status];
            return (
              <div
                key={p.id}
                className="rounded-md border border-border bg-surface p-3"
                data-testid={`site-pagina-${p.position}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.title ?? p.url}</p>
                    {p.title ? <p className="truncate text-xs text-text-muted">{p.url}</p> : null}
                  </div>
                  <Badge variant={estado.variante} data-testid={`site-pagina-estado-${p.position}`}>
                    {t(estado.rotulo)}
                  </Badge>
                </div>
                {p.status === "falhou" && p.error_message ? (
                  <p className="mt-2 text-xs text-error-fg" data-testid={`site-pagina-motivo-${p.position}`}>
                    {t(p.error_message)}
                    {p.chunks_count > 0 ? ` ${t("O agente continua com o que leu antes.")}` : ""}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-text-muted">
                  {p.last_read_at ? `${t("Lida em")} ${quando(p.last_read_at)}` : t("Ainda não lida")}
                  {p.status !== "pendente" && p.chunks_count > 0
                    ? ` · ${p.chunks_count} ${t("trechos")}`
                    : ""}
                  {p.last_changed_at && p.status === "lida"
                    ? ` · ${t("Mudou em")} ${quando(p.last_changed_at)}`
                    : ""}
                </p>
              </div>
            );
          })}

          <div className="space-y-2 pt-2">
            <Label htmlFor="site-enderecos">{t("Endereços das páginas (um por linha)")}</Label>
            <Textarea
              id="site-enderecos"
              data-testid="site-enderecos"
              rows={5}
              value={texto}
              onChange={(e) => setEditado(e.target.value)}
              disabled={salvar.isPending}
            />
            <p className="text-xs text-text-muted">
              {t(
                "Só endereços https:// públicos. O sistema lê exatamente estas páginas — não percorre o resto do site.",
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => void salvarLista()}
            disabled={!editando || salvar.isPending}
            data-testid="site-salvar-enderecos"
          >
            {salvar.isPending ? t("Salvando…") : t("Salvar endereços")}
          </Button>
          <Button onClick={onReler} disabled={relendo || editando} data-testid="site-reler">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${relendo ? "animate-spin" : ""}`} aria-hidden />
            {relendo ? t("Lendo…") : t("Ler o site de novo")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
