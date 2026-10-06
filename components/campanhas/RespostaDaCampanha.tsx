"use client";

/**
 * O que acontece com quem responde a uma campanha (issue #11): quem assume, o
 * que cada botão de resposta rápida do modelo faz e a oferta que vai para o
 * agente. Mora junto do funil e do agente, no cartão "Quem responder".
 *
 * Os valores vão à API como estão; quem valida é o Zod de
 * `lib/campanhas/destino-da-resposta.ts`, no servidor.
 */
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import type { AcaoDoBotao, BotaoDaResposta, QuemAssume } from "@/lib/campanhas/destino-da-resposta";
import { precisaDeAgente as exigeAgente } from "@/lib/campanhas/resposta-na-tela";

const SELECT = "h-9 w-full rounded-md border border-border bg-surface px-2 text-sm";
const OFERTA_MAX = 2000;

const OPCOES_DE_QUEM_ASSUME: Array<{ valor: QuemAssume; rotulo: string; explicacao: string }> = [
  {
    valor: "ia",
    rotulo: "O agente de IA",
    explicacao:
      "O agente responde. Se a pessoa pedir um atendente, a conversa passa para a equipe, como sempre.",
  },
  {
    valor: "humano",
    rotulo: "A fila de atendentes",
    explicacao: "A IA fica calada nesta conversa, e ela entra no rodízio dos atendentes.",
  },
  {
    valor: "ia_e_humano",
    rotulo: "A IA, e depois um atendente",
    explicacao:
      "O agente atende primeiro. Quando a regra de passagem dispara (pedido da pessoa, palavra de passagem, decisão do agente), a conversa entra no rodízio dos atendentes.",
  },
];

const OPCOES_DE_ACAO: Array<{ valor: AcaoDoBotao; rotulo: string }> = [
  { valor: "mover_etapa", rotulo: "Mover o card para uma etapa" },
  { valor: "atribuir_ia", rotulo: "Entregar ao agente de IA" },
  { valor: "atribuir_humano", rotulo: "Entregar a um atendente" },
  { valor: "marcar_perdido", rotulo: "Marcar o negócio como perdido" },
  { valor: "opt_out", rotulo: "Parar de mandar mensagens (opt-out)" },
];

function mesmaChave(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
}

export function RespostaDaCampanha({
  quemAssume,
  onQuemAssume,
  oferta,
  onOferta,
  botoes,
  onBotoes,
  botoesDoModelo,
  etapas,
  temFunil,
  temAgente,
}: {
  quemAssume: QuemAssume;
  onQuemAssume: (v: QuemAssume) => void;
  oferta: string;
  onOferta: (v: string) => void;
  botoes: BotaoDaResposta[];
  onBotoes: (v: BotaoDaResposta[]) => void;
  /** Os rótulos de resposta rápida do modelo escolhido. Vazio = nada a mapear. */
  botoesDoModelo: string[];
  /** As etapas abertas do funil da campanha — para onde um botão pode mover o card. */
  etapas: Array<{ id: string; name: string }>;
  temFunil: boolean;
  temAgente: boolean;
}) {
  const t = useT();
  const escolhida =
    OPCOES_DE_QUEM_ASSUME.find((o) => o.valor === quemAssume) ?? OPCOES_DE_QUEM_ASSUME[0]!;
  const precisaDeAgente = exigeAgente(quemAssume, botoes);

  function trocarAcao(rotulo: string, acao: AcaoDoBotao | "") {
    const resto = botoes.filter((b) => !mesmaChave(b.botao, rotulo));
    if (acao === "") return onBotoes(resto);
    onBotoes([
      ...resto,
      {
        botao: rotulo,
        acao,
        ...(acao === "mover_etapa" ? { stage_id: etapas[0]?.id ?? null } : {}),
      },
    ]);
  }

  function trocarEtapa(rotulo: string, stageId: string) {
    onBotoes(
      botoes.map((b) => (mesmaChave(b.botao, rotulo) ? { ...b, stage_id: stageId || null } : b)),
    );
  }

  return (
    <div className="space-y-4" data-testid="resposta-da-campanha">
      <div className="space-y-2">
        <Label htmlFor="quem-assume">{t("Quem assume a resposta")}</Label>
        <select
          id="quem-assume"
          className={SELECT}
          value={quemAssume}
          onChange={(e) => onQuemAssume(e.target.value as QuemAssume)}
        >
          {OPCOES_DE_QUEM_ASSUME.map((o) => (
            <option key={o.valor} value={o.valor}>
              {t(o.rotulo)}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{t(escolhida.explicacao)}</p>
        {precisaDeAgente && !temAgente && (
          <p role="alert" className="text-sm text-error-fg">
            {t(
              "Escolha o agente da campanha acima: ele é quem atende quando a conversa vai para a IA.",
            )}
          </p>
        )}
      </div>

      {botoesDoModelo.length > 0 && (
        <div className="space-y-2">
          <Label>{t("O que cada botão faz")}</Label>
          <p className="text-sm text-muted-foreground">
            {t(
              "O toque no botão age na hora, sem passar pela IA. Botão sem ação segue como resposta digitada.",
            )}
          </p>
          <ul className="space-y-2">
            {botoesDoModelo.map((rotulo) => {
              const atual = botoes.find((b) => mesmaChave(b.botao, rotulo));
              return (
                <li
                  key={rotulo}
                  className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,10rem)_1fr_1fr] sm:items-center"
                >
                  <span className="truncate text-sm font-medium" title={rotulo}>
                    {rotulo}
                  </span>
                  <select
                    aria-label={t("Ação do botão {rotulo}").replace("{rotulo}", rotulo)}
                    className={SELECT}
                    value={atual?.acao ?? ""}
                    onChange={(e) => trocarAcao(rotulo, e.target.value as AcaoDoBotao | "")}
                  >
                    <option value="">{t("Nenhuma ação")}</option>
                    {OPCOES_DE_ACAO.map((o) => (
                      <option
                        key={o.valor}
                        value={o.valor}
                        disabled={o.valor === "mover_etapa" && !temFunil}
                      >
                        {t(o.rotulo)}
                      </option>
                    ))}
                  </select>
                  {atual?.acao === "mover_etapa" ? (
                    <select
                      aria-label={t("Etapa do botão {rotulo}").replace("{rotulo}", rotulo)}
                      className={SELECT}
                      value={atual.stage_id ?? ""}
                      onChange={(e) => trocarEtapa(rotulo, e.target.value)}
                    >
                      {etapas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
          {!temFunil && (
            <p className="text-sm text-muted-foreground">
              {t("Para um botão mover o card, escolha antes o funil da campanha.")}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="oferta">{t("O que a campanha oferece")}</Label>
        <Textarea
          id="oferta"
          rows={3}
          maxLength={OFERTA_MAX}
          value={oferta}
          onChange={(e) => onOferta(e.target.value)}
          placeholder={t(
            "Ex.: avaliação por R$ 99 até sexta-feira, só para quem responder esta mensagem.",
          )}
        />
        <p className="text-sm text-muted-foreground">
          {t(
            "O agente recebe isto junto com o nome da campanha e a mensagem que a pessoa leu — para responder a um “quero” sabendo do que se trata.",
          )}
        </p>
      </div>
    </div>
  );
}
