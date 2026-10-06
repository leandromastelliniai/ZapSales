"use client";
/**
 * O MODO "DOIS NÚMEROS" de uma campanha oficial (issue #9): o modelo sai pelo
 * número oficial com um botão que abre conversa com um número conectado por QR
 * code, e a conversa segue nesse número — fora da API Oficial.
 *
 * O botão é do MODELO (aprovado pela Meta, não se edita aqui), então a tela
 * confere em vez de montar: sem botão `wa.me` o modo não serve; com URL fixa, ela
 * tem de abrir o número escolhido; com URL dinâmica (`https://wa.me/{{1}}`), o
 * sistema preenche a variável com o número escolhido. O servidor confere de novo
 * (`lib/campanhas/dois-numeros.ts`) — aqui é para o operador saber antes.
 *
 * Controlado: quem guarda o estado é a tela da campanha.
 */
import { Label } from "@/components/ui/label";
import { channelLabel, type ChannelSession } from "@/hooks/channels/useChannelSessions";
import { useT } from "@/hooks/i18n/useT";
import { CHANNEL_PROVIDER_META, transportaMensagem } from "@/lib/channels/capabilities";
import { samePhone } from "@/lib/channels/phone-variants";
import type { ModeloParaCampanha } from "@/lib/campanhas/modelos-da-campanha";

/** Os números que podem receber a conversa: de mensagem, e não oficiais. */
export function numerosDeAtendimento(canais: readonly ChannelSession[]): ChannelSession[] {
  return canais.filter((c) => transportaMensagem(c.provider ?? null) && c.provider !== CHANNEL_PROVIDER_META);
}

/**
 * Por que o par modelo + número não serve — ou `null`. A mesma pergunta do
 * servidor, com o que a tela sabe.
 */
export function problemaDoParDoisNumeros(
  modelo: ModeloParaCampanha | undefined,
  numero: ChannelSession | undefined,
): string | null {
  if (!modelo || !numero) return null;
  if (!numero.phone_number) {
    return "Este número ainda não tem telefone conhecido — conecte-o pelo QR code antes de usá-lo na campanha.";
  }
  if (!modelo.botao_wa_me) {
    return "Este modelo não tem botão de link para wa.me. Escolha um modelo com esse botão (ex.: https://wa.me/{{1}}) ou crie um.";
  }
  const fixo = modelo.botao_wa_me.numero_fixo;
  if (fixo && !samePhone(`+${fixo}`, numero.phone_number)) {
    return `O botão deste modelo abre o número ${fixo}, não o número escolhido.`;
  }
  return null;
}

interface Props {
  canais: readonly ChannelSession[];
  modelo: ModeloParaCampanha | undefined;
  numeroId: string;
  onNumero: (id: string) => void;
}

export function DoisNumeros({ canais, modelo, numeroId, onNumero }: Props) {
  const t = useT();
  const opcoes = numerosDeAtendimento(canais);
  const numero = opcoes.find((c) => c.id === numeroId);
  const problema = problemaDoParDoisNumeros(modelo, numero);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <Label htmlFor="numero-de-atendimento">{t("Quem responde fala com qual número?")}</Label>
      <select
        id="numero-de-atendimento"
        className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
        value={numeroId}
        onChange={(e) => onNumero(e.target.value)}
      >
        <option value="">{t("O próprio número oficial (padrão)")}</option>
        {opcoes.map((c) => (
          <option key={c.id} value={c.id}>
            {t("Outro número")}: {channelLabel(c, t)}
          </option>
        ))}
      </select>
      <p className="text-sm text-muted-foreground">
        {t(
          "Modo dois números: o modelo sai pelo número oficial com um botão que abre conversa com o número escolhido, e a conversa segue nele. Quem clica e escreve continua no mesmo contato da campanha.",
        )}
      </p>
      {numeroId && modelo?.botao_wa_me?.slot && !problema && (
        <p className="text-sm text-muted-foreground" data-testid="botao-wa-me-automatico">
          {t("O link do botão do modelo é preenchido com este número automaticamente.")}
        </p>
      )}
      {numeroId && problema && (
        <p className="text-sm text-warning-fg" role="alert">
          {t(problema)}
        </p>
      )}
      {opcoes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t("Nenhum número conectado por QR code nesta organização para receber a conversa.")}
        </p>
      )}
    </div>
  );
}
