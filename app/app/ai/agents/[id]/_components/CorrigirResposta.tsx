"use client";
/**
 * "Corrigir esta resposta" (issue #90): a pessoa escreve o que o agente deveria
 * ter dito. Vira uma PROPOSTA na aba Propostas — e só muda o agente quando
 * alguém a aprova lá.
 *
 * O texto da tela diz isso em voz alta, nos dois lugares em que a pessoa poderia
 * achar o contrário: antes de enviar ("o agente só muda depois que você
 * aprovar") e depois ("proposta criada"). Quem corrige uma resposta e vê o
 * agente mudar sozinho perde a confiança no botão; quem corrige e não vê nada
 * acontecer acha que ele não funcionou.
 */
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEnviarCorrecao, type OrigemDaCorrecao } from "@/hooks/ai/useCorrecaoDeResposta";
import { useT } from "@/hooks/i18n/useT";
import { CORRECAO_MAX } from "@/lib/ai/agents/evidencia-de-correcao";
import { ApiError } from "@/lib/api/types";
import { randomId } from "@/lib/random-id";

interface Props {
  agentId: string;
  /** De onde vem a resposta. `null` enquanto a conversa ainda não foi lida. */
  origem: OrigemDaCorrecao | null;
  /** Identifica o botão quando há vários na mesma tela (um por resposta do agente). */
  rotulo?: string;
  readOnly?: boolean;
}

export function CorrigirResposta({ agentId, origem, rotulo, readOnly }: Props) {
  const t = useT();
  const enviar = useEnviarCorrecao(agentId);
  const [aberto, setAberto] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [enviada, setEnviada] = React.useState(false);
  // A mesma chave até o envio dar certo: um clique duplo é UMA proposta.
  const chave = React.useRef(randomId());
  const campoId = React.useId();

  if (readOnly || origem === null) return null;

  if (enviada) {
    return (
      <p
        role="status"
        data-testid="correcao-enviada"
        className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs"
      >
        {t("Proposta criada. Ela aparece na aba Propostas e só muda o agente depois que você aprovar.")}
      </p>
    );
  }

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-auto self-start px-1 py-0.5 text-xs"
        onClick={() => setAberto(true)}
        data-testid="corrigir-resposta"
        aria-label={rotulo ? `${t("Corrigir esta resposta")}: ${rotulo}` : t("Corrigir esta resposta")}
      >
        {t("Corrigir esta resposta")}
      </Button>
    );
  }

  async function handleEnviar() {
    if (!texto.trim() || origem === null) return;
    try {
      await enviar.mutateAsync({ origem, textoCorrigido: texto.trim(), chave: chave.current });
      chave.current = randomId();
      setEnviada(true);
      toast.success(t("Proposta criada na aba Propostas."));
    } catch (err) {
      toast.error(
        err instanceof ApiError ? t(err.message) : t("Não foi possível criar a proposta."),
      );
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3" data-testid="corrigir-resposta-form">
      <Label htmlFor={campoId} className="text-xs">
        {t("O que o agente deveria ter dito?")}
      </Label>
      <Textarea
        id={campoId}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={CORRECAO_MAX}
        rows={3}
        disabled={enviar.isPending}
        placeholder={t("Escreva a resposta que você esperava.")}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          "Isto cria uma proposta na aba Propostas. O agente só muda depois que você aprovar — nada é alterado agora.",
        )}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void handleEnviar()}
          disabled={enviar.isPending || !texto.trim()}
        >
          {enviar.isPending ? t("Enviando…") : t("Enviar como proposta")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setAberto(false)}
          disabled={enviar.isPending}
        >
          {t("Cancelar")}
        </Button>
      </div>
    </div>
  );
}
