"use client";
/**
 * SAÚDE E USO DO NÚMERO OFICIAL (issue #5).
 *
 * O que a Meta diz do número — qualidade, limite diário do portfólio e o último
 * evento que ela empurrou pelo webhook — e para que o administrador declarou o
 * número. A queda de qualidade também abre aviso na Central; aqui é o painel
 * que mostra o estado a qualquer hora.
 */
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useDeclararUso, type SaudeDoNumero } from "@/hooks/channels/useOfficialChannel";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import type { UsoDoNumero } from "@/lib/channels/uso";

import { corDaQualidade, rotuloDaQualidade, rotuloDoLimite, USOS_NA_TELA } from "./rotulos-do-numero";

export function SaudeDoNumeroOficial({
  channelSessionId,
  saude,
  uso,
}: {
  channelSessionId: string;
  saude: SaudeDoNumero | null | undefined;
  uso: UsoDoNumero | null | undefined;
}) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const declarar = useDeclararUso();
  // O clique marca NA HORA: enquanto a gravação está em curso, vale o valor
  // pedido. Ligado só ao valor do servidor, o rádio voltava ao antigo até a
  // gravação responder — a pessoa via o clique "não pegar" (medido pela prova em
  // tela da issue #5). Falhou, a mutation sai de pendente e volta o salvo.
  const escolhido: UsoDoNumero | null =
    declarar.isPending && declarar.variables ? declarar.variables.uso : (uso ?? null);

  async function trocarUso(novo: UsoDoNumero) {
    if (novo === escolhido) return;
    try {
      await declarar.mutateAsync({ channelSessionId, uso: novo });
      toast.success(t("Uso do número salvo."));
    } catch {
      // O motivo já foi mostrado pelo `onError` do hook.
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="saude-do-numero">
      <div>
        <h2 className="font-medium">{t("Saúde do número")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("A Meta avisa quando a qualidade ou o limite mudam. Se a qualidade cair, um aviso também aparece na Central.")}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("Qualidade")}</dt>
          <dd>
            <Badge variant="outline" className={corDaQualidade(saude?.qualidade)} data-testid="saude-qualidade">
              {rotuloDaQualidade(saude?.qualidade, t)}
            </Badge>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("Limite do portfólio")}
          </dt>
          <dd className="text-sm" data-testid="saude-limite">
            {rotuloDoLimite(saude?.limite, t, idioma)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("Última atualização")}
          </dt>
          <dd className="text-sm text-muted-foreground" data-testid="saude-atualizada">
            {saude?.em ? new Date(saude.em).toLocaleString(idioma) : t("Ainda não informada")}
            {saude?.evento ? <span className="ml-1 font-mono text-xs">({saude.evento})</span> : null}
          </dd>
        </div>
      </dl>

      <fieldset className="flex flex-col gap-2" data-testid="uso-do-numero">
        <legend className="text-sm font-medium">{t("Uso do número")}</legend>
        {!escolhido ? (
          <p className="text-xs text-warning-fg">
            {t("Ainda não declarado. Diga para que serve este número — o sistema usa isso para orientar os disparos.")}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-3">
          {USOS_NA_TELA.map((u) => (
            <label
              key={u.valor}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-foreground"
            >
              <input
                type="radio"
                name="uso-do-numero-conectado"
                value={u.valor}
                checked={escolhido === u.valor}
                disabled={declarar.isPending}
                onChange={() => void trocarUso(u.valor)}
                data-testid={`uso-conectado-${u.valor}`}
                className="mt-0.5"
              />
              <span className="flex flex-col">
                <span className="font-medium">{t(u.rotulo)}</span>
                <span className="text-xs text-muted-foreground">{t(u.descricao)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}
