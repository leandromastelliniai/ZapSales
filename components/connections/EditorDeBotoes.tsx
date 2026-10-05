"use client";
/**
 * OS BOTÕES DE UM MODELO — no modelo padrão, na oferta e em cada card do
 * carrossel (issues #6 e #7).
 *
 * Quem decide QUAIS tipos cabem é o chamador (`tipos`): o card só aceita
 * resposta rápida e link, a oferta só copiar código e link. A regra que diz se
 * a combinação vale continua em `problemasDoModelo`; aqui só a edição.
 */
import { ClipboardList, Copy, ExternalLink, Reply, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import type { BotaoDoModelo } from "@/lib/channels/meta/novo-modelo";

type TipoDeBotao = BotaoDoModelo["type"];

export function botaoNovo(tipo: TipoDeBotao): BotaoDoModelo {
  if (tipo === "QUICK_REPLY") return { type: "QUICK_REPLY", text: "" };
  if (tipo === "URL") return { type: "URL", text: "", url: "https://" };
  if (tipo === "FLOW")
    return { type: "FLOW", text: "", flow_id: "", flow_action: "navigate", navigate_screen: "" };
  return { type: "COPY_CODE", example: "" };
}

const ROTULO: Record<TipoDeBotao, string> = {
  QUICK_REPLY: "Resposta rápida",
  URL: "Link",
  COPY_CODE: "Copiar código",
  FLOW: "Flow",
};

const ICONE = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  COPY_CODE: Copy,
  FLOW: ClipboardList,
} as const;

const ID_DO_ADICIONAR: Record<TipoDeBotao, string> = {
  QUICK_REPLY: "btn-add-resposta",
  URL: "btn-add-link",
  COPY_CODE: "btn-add-codigo",
  FLOW: "btn-add-flow",
};

const SELECT = "w-full rounded-md border bg-background p-2 text-sm";

export function EditorDeBotoes({
  botoes,
  tipos,
  onMudar,
  erros,
  /** Prefixo dos `data-testid` — o card usa o dele para não colidir com o do modelo. */
  prefixo = "",
}: {
  botoes: BotaoDoModelo[];
  tipos: readonly TipoDeBotao[];
  onMudar: (botoes: BotaoDoModelo[]) => void;
  /** As recusas de cada botão (`buttons.<i>…`) e do conjunto (`buttons`). */
  erros: (campo: string) => ReactNode;
  prefixo?: string;
}) {
  const t = useT();
  const mudarBotao = (i: number, parcial: Partial<BotaoDoModelo>) =>
    onMudar(botoes.map((b, j) => (j === i ? ({ ...b, ...parcial } as BotaoDoModelo) : b)));

  return (
    <div className="flex flex-col gap-2">
      {botoes.map((b, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-md border p-3"
          data-testid={`${prefixo}modelo-botao`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs tracking-wide text-muted-foreground uppercase">
              {t(ROTULO[b.type])}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("Remover botão")}
              onClick={() => onMudar(botoes.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          </div>
          {b.type !== "COPY_CODE" ? (
            <Input
              aria-label={t("Texto do botão")}
              placeholder={t("Texto do botão")}
              value={b.text}
              onChange={(e) => mudarBotao(i, { text: e.target.value })}
              data-testid={`${prefixo}botao-texto`}
            />
          ) : null}
          {b.type === "URL" ? (
            <>
              <Input
                aria-label={t("Endereço do link")}
                value={b.url}
                onChange={(e) => mudarBotao(i, { url: e.target.value })}
                data-testid={`${prefixo}botao-url`}
              />
              {/\{\{/.test(b.url) ? (
                <Input
                  aria-label={t("Exemplo do final do link")}
                  placeholder={t("Exemplo do final do link")}
                  value={b.example ?? ""}
                  onChange={(e) => mudarBotao(i, { example: e.target.value })}
                  data-testid={`${prefixo}botao-url-exemplo`}
                />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("Para um link diferente por cliente, termine o endereço com {{1}}.")}
                </span>
              )}
            </>
          ) : null}
          {b.type === "COPY_CODE" ? (
            <Input
              aria-label={t("Código de exemplo")}
              placeholder={t("Código de exemplo")}
              value={b.example}
              onChange={(e) => mudarBotao(i, { example: e.target.value })}
              data-testid={`${prefixo}botao-codigo`}
            />
          ) : null}
          {b.type === "FLOW" ? (
            <>
              <Input
                aria-label={t("ID do flow")}
                placeholder={t("ID do flow")}
                inputMode="numeric"
                value={b.flow_id}
                onChange={(e) => mudarBotao(i, { flow_id: e.target.value.replace(/\D+/g, "") })}
                data-testid={`${prefixo}botao-flow-id`}
              />
              <select
                aria-label={t("O que o botão faz")}
                className={SELECT}
                value={b.flow_action}
                onChange={(e) =>
                  mudarBotao(i, { flow_action: e.target.value as "navigate" | "data_exchange" })
                }
                data-testid={`${prefixo}botao-flow-acao`}
              >
                <option value="navigate">{t("Abrir numa tela do flow")}</option>
                <option value="data_exchange">{t("Perguntar ao servidor do flow")}</option>
              </select>
              {b.flow_action === "navigate" ? (
                <Input
                  aria-label={t("Tela de entrada")}
                  placeholder={t("Tela de entrada (ex.: WELCOME_SCREEN)")}
                  value={b.navigate_screen ?? ""}
                  onChange={(e) => mudarBotao(i, { navigate_screen: e.target.value })}
                  data-testid={`${prefixo}botao-flow-tela`}
                />
              ) : null}
              <span className="text-xs text-muted-foreground">
                {t("O flow precisa estar publicado no WhatsApp Manager da mesma conta.")}
              </span>
            </>
          ) : null}
          {erros(`buttons.${i}`)}
        </div>
      ))}
      {erros("buttons")}
      <div className="flex flex-wrap gap-2">
        {tipos.map((tipo) => {
          const Icone = ICONE[tipo];
          return (
            <Button
              key={tipo}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMudar([...botoes, botaoNovo(tipo)])}
              data-testid={`${prefixo}${ID_DO_ADICIONAR[tipo]}`}
            >
              <Icone className="size-3.5" aria-hidden /> {t(ROTULO[tipo])}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
