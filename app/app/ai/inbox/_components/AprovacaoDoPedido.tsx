"use client";

import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { useDecidirPedidoExterno, type DesfechoDaDecisao, type PedidoDoAviso } from "@/hooks/ai/useAgentInbox";
import { ROTULO_DO_EFEITO, ROTULO_DO_ESTADO } from "@/lib/ai/ferramentas-externas/tipos";

/**
 * O PEDIDO DE UMA AÇÃO EXTERNA, dentro do aviso da Central (issue #95).
 *
 * Mostra o que o agente quer executar e os dados que ele preencheu (resumo sem segredos), e
 * dá a quem pode decidir (gerente ou acima) os dois botões: aprovar executa a ação UMA vez;
 * recusar a cancela. Quem não pode decidir lê o pedido sem botões. O resultado de aprovar
 * aparece aqui mesmo — inclusive a falha incerta, dita com todas as letras: a ação NÃO foi
 * repetida e pode ter sido feita lá.
 */
export function AprovacaoDoPedido({
  pedido,
  podeDecidir,
  onDecidido,
}: {
  pedido: PedidoDoAviso;
  podeDecidir: boolean;
  onDecidido?: (desfecho: DesfechoDaDecisao) => void;
}) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const decidir = useDecidirPedidoExterno();
  const [confirmando, setConfirmando] = useState(false);
  const [desfecho, setDesfecho] = useState<DesfechoDaDecisao | null>(null);

  const pendente = pedido.status === "pending" && desfecho === null;
  const vence = formatDistanceToNowStrict(new Date(pedido.expires_at), { addSuffix: true, locale: localeDaData });

  async function enviar(decision: "approve" | "reject") {
    try {
      const r = await decidir.mutateAsync({ id: pedido.request_id, decision });
      setDesfecho(r);
      onDecidido?.(r);
      if (r.status === "rejected") toast.success(t("Pedido recusado. Nada foi enviado."));
      else if (r.status === "executed") toast.success(t("Ação executada no outro sistema."));
    } catch (err) {
      showApiError(err);
    }
  }

  return (
    <div
      className="mt-2 space-y-2 rounded-md border border-border/60 p-3 text-xs"
      data-testid="aprovacao-do-pedido"
      data-estado={desfecho ? desfecho.status : pedido.status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{pedido.tool_name}</span>
        <Badge variant="outline" className="text-[11px]">
          {t(ROTULO_DO_EFEITO[pedido.effect])}
        </Badge>
        {pedido.origin === "assisted" ? (
          <Badge variant="outline" className="text-[11px]">
            {t("Rascunho do modo Assistido")}
          </Badge>
        ) : null}
        {!pendente ? (
          <Badge variant="outline" className="text-[11px]" data-testid="estado-do-pedido">
            {t(ROTULO_DO_ESTADO[desfecho ? desfecho.status : pedido.status])}
          </Badge>
        ) : null}
      </div>

      <div>
        <p className="font-medium">{t("Dados que o agente preencheu")}</p>
        {pedido.summary.length === 0 ? (
          <p className="text-muted-foreground">{t("(sem dados)")}</p>
        ) : (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5" data-testid="dados-do-pedido">
            {pedido.summary.map((l) => (
              <div key={l.campo} className="contents">
                <dt className="font-mono text-muted-foreground">{l.campo}</dt>
                <dd className="break-words">{l.valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {pendente ? (
        <>
          <p className="text-muted-foreground">
            {t("Nada foi enviado ao outro sistema. Se ninguém decidir, o pedido expira")} {vence}.
          </p>
          {podeDecidir ? (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={decidir.isPending}
                onClick={() => setConfirmando(true)}
                data-testid="aprovar-pedido"
              >
                {t("Aprovar e executar")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={decidir.isPending}
                onClick={() => void enviar("reject")}
                data-testid="recusar-pedido"
              >
                {t("Recusar")}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("Peça a um gerente para aprovar ou recusar.")}</p>
          )}
        </>
      ) : null}

      {desfecho?.status === "rejected" ? (
        <p role="status" data-testid="desfecho-do-pedido">
          {t("Pedido recusado. Nada foi enviado ao outro sistema.")}
        </p>
      ) : null}
      {desfecho?.status === "executed" ? (
        <div role="status" data-testid="desfecho-do-pedido" className="space-y-1">
          <p>
            {t("A ação foi executada. O outro sistema respondeu")} {desfecho.http_status}.
          </p>
          {desfecho.content ? (
            <div className="space-y-1">
              <p className="font-medium">
                {t("O que o outro sistema devolveu")}
                {desfecho.truncated ? ` (${t("cortado")})` : ""}:
              </p>
              <pre
                className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2 font-mono text-[11px]"
                data-testid="resposta-do-outro-sistema"
              >
                {desfecho.content}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
      {desfecho?.status === "failed" ? (
        <p role="alert" data-testid="desfecho-do-pedido" className="text-destructive">
          {desfecho.message}
        </p>
      ) : null}
      {/* Estados finais lidos do servidor (quem abre o aviso depois de decidido, ou na aba Resolvidos). */}
      {!pendente && !desfecho ? (
        <p className="text-muted-foreground" data-testid="situacao-do-pedido">
          {pedido.status === "expired"
            ? t("O pedido expirou sem decisão. A ação não foi feita e o agente foi informado.")
            : pedido.status === "rejected"
              ? t("Pedido recusado. Nada foi enviado ao outro sistema.")
              : pedido.status === "executed"
                ? t("A ação foi executada no outro sistema.")
                : pedido.status === "failed"
                  ? t("A ação foi aprovada e não foi concluída. Veja o aviso da falha: se o resultado ficou incerto, ela não foi repetida.")
                  : t("A ação está sendo executada agora.")}
        </p>
      ) : null}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent data-testid="confirmar-aprovacao">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Executar esta ação agora?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "A ação é enviada ao outro sistema uma única vez, com os dados acima. Se o outro sistema não responder, ela não é repetida sozinha.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirmar-aprovar"
              onClick={() => {
                setConfirmando(false);
                void enviar("approve");
              }}
            >
              {t("Aprovar e executar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
