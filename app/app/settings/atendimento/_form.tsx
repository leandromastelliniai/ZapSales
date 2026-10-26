"use client";
/**
 * O formulário da tela de distribuição de atendimento (issue #144), em UM painel e com UM Salvar.
 *
 * A cópia é a parte que importa aqui: quem instala este produto numa VPS não sabe o que é "round
 * robin" nem "visibility mode". Cada opção diz o que ACONTECE com o cliente e com o atendente, e
 * cada modo tem a sua consequência escrita, inclusive a ruim.
 *
 * Duas decisões ficam à vista (quem recebe e o que cada um enxerga), com a recomendação da casa
 * pelo tamanho da equipe e o motivo escrito. O ajuste fino (devolução à IA, silêncio depois do
 * celular, a conversa fica com quem atendeu, assinatura) mora em "Mais ajustes", fechado, com a
 * contagem do que está fora do padrão. As duas gravações (distribuição e assinatura) saem do mesmo
 * botão; os responsáveis por número entram pelo `responsaveis` (cada número tem o seu botão).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { FaixaRecomendada, SeloRecomendado } from "@/components/guia/FaixaRecomendada";
import { SeloDaSecao } from "@/components/guia/SeloDaSecao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Painel } from "@/components/ui/painel";
import { apiClient } from "@/lib/api/client";
import type { VisibilityMode } from "@/lib/auth/types";
import { PRAZO_MAX_MINUTOS, PRAZO_MIN_MINUTOS } from "@/lib/escalacao/devolucao-automatica";
import { PRAZO_PADRAO_DO_SILENCIO_MINUTOS } from "@/lib/escalacao/atendimento-manual";
import type { RecomendacaoDeDistribuicao } from "@/lib/routing/recomendacao-de-distribuicao";
import { ROUTING_MODES, VISIBILITY_MODES, type RoutingMode } from "@/lib/schemas/routing";
import { CaretRight } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

export interface AtendimentoConfig {
  mode: RoutingMode;
  max_retries: number;
  backoff_seconds: number;
  visibility_mode: VisibilityMode;
  /** `null` = nunca devolve sozinho (o padrão do produto). */
  handoff_return_after_minutes: number | null;
  /** "A conversa fica com quem atendeu" — desligado é o padrão do produto. */
  conversation_stays_with_attendant: boolean;
  /** Minutos de silêncio da IA após resposta pelo celular. `null` = o padrão de 60. */
  manual_reply_silence_minutes: number | null;
}

export interface AssinaturaConfig {
  humanos: boolean;
  ia: boolean;
  nome_ia: string;
}

const MODO_COPY: Record<RoutingMode, { titulo: string; corpo: string }> = {
  manual: {
    titulo: "Cada um pega o que quiser",
    corpo:
      "Todo cliente novo cai numa fila aberta e o primeiro atendente que clicar assume. " +
      "Simples, e é onde nasce a discussão de quem furou a fila.",
  },
  round_robin: {
    titulo: "Rodízio automático entre os atendentes",
    corpo:
      "Cliente 1 vai para o atendente A, cliente 2 para o B, e ao acabar a lista volta ao " +
      "primeiro. Quem recebe é sempre quem está há mais tempo sem receber — entre os que " +
      "estão disponíveis e dentro do horário. Ninguém escolhe, então não há fila furada.",
  },
  load: {
    titulo: "Vai para quem tem menos conversas na mão",
    corpo:
      "Cada cliente novo cai com quem está com MENOR número de conversas em aberto. Em caso " +
      "de empate vale o rodízio — quem está há mais tempo sem receber leva. Entre os que estão " +
      "disponíveis e dentro do horário, como nos outros modos. É o modo para time grande, " +
      "onde deixar uma pessoa com tudo e outra parada custa caro.",
  },
};

const VISIBILIDADE_COPY: Record<VisibilityMode, { titulo: string; corpo: string }> = {
  all: {
    titulo: "Todos veem tudo",
    corpo: "Qualquer atendente abre a conversa e o negócio de qualquer colega.",
  },
  own_and_unassigned: {
    titulo: "Os seus, mais os que ainda não têm dono",
    corpo:
      "O atendente vê a própria carteira e a fila de quem chegou agora. Não vê o que já é " +
      "de um colega.",
  },
  own: {
    titulo: "Só os seus",
    corpo:
      "O atendente vê apenas o que foi direcionado a ele — nem a fila. Combine com o " +
      "rodízio: sem alguém distribuindo, ninguém recebe nada e as telas ficam vazias.",
  },
};

function Escolha({
  nome,
  valor,
  atual,
  titulo,
  corpo,
  onPick,
  disabled,
  recomendada,
}: {
  nome: string;
  valor: string;
  atual: string;
  titulo: string;
  corpo: string;
  onPick: (v: string) => void;
  disabled: boolean;
  recomendada?: boolean;
}) {
  const marcado = atual === valor;
  return (
    <label
      data-testid={`opcao-${nome}-${valor}`}
      data-marcada={marcado ? "sim" : "nao"}
      className={cn(
        "flex cursor-pointer items-start gap-3 border-t border-border px-3.5 py-3 transition-colors first:border-t-0",
        marcado ? "bg-ia-fundo" : "hover:bg-surface-elevated/60",
      )}
    >
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={marcado}
        onChange={() => onPick(valor)}
        disabled={disabled}
        className="mt-1 h-4 w-4 shrink-0 accent-primary"
        aria-label={titulo}
      />
      <span className="space-y-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {titulo}
          {recomendada ? <SeloRecomendado /> : null}
        </span>
        <span className="block text-xs text-muted-foreground">{corpo}</span>
      </span>
    </label>
  );
}

/** Uma decisão do painel: título, estado e o que vem dentro, separada da vizinha por filete. */
function Secao({
  titulo,
  descricao,
  estado,
  children,
}: {
  titulo: string;
  descricao?: string;
  estado?: "pronto" | "revisar";
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t border-border px-5 py-4 first:border-t-0">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base leading-tight font-semibold tracking-tight">{titulo}</h2>
          {descricao ? <p className="text-sm text-muted-foreground">{descricao}</p> : null}
        </div>
        {estado ? <SeloDaSecao estado={estado} /> : null}
      </header>
      {children}
    </section>
  );
}

interface Props {
  initial: AtendimentoConfig;
  /** Sem isto, a seção de assinatura não aparece (e a gravação dela não sai). */
  assinatura?: AssinaturaConfig;
  /** A recomendação pelo tamanho da equipe; sem ela, nenhuma opção ganha o selo. */
  recomendacao?: RecomendacaoDeDistribuicao & { total: number };
  /** Ninguém pode receber agora (a faixa "Quem recebe agora" explica); marca a parte para revisar. */
  ninguemDisponivel?: boolean;
  /** O bloco de responsáveis por número, entre as decisões e o "Mais ajustes". */
  responsaveis?: ReactNode;
}

export function AtendimentoForm({
  initial,
  assinatura: assinaturaInicial,
  recomendacao,
  ninguemDisponivel = false,
  responsaveis,
}: Props) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState<AtendimentoConfig>(initial);
  const [salvo, setSalvo] = useState<AtendimentoConfig>(initial);
  const [ass, setAss] = useState<AssinaturaConfig | undefined>(assinaturaInicial);
  const [assSalva, setAssSalva] = useState<AssinaturaConfig | undefined>(assinaturaInicial);
  const [isPending, startTransition] = useTransition();

  const mudouRota = JSON.stringify(form) !== JSON.stringify(salvo);
  const mudouAss = JSON.stringify(ass) !== JSON.stringify(assSalva);
  const sujo = mudouRota || mudouAss;

  /**
   * O aviso que evita o pior par de escolhas. Não é decoração: "só os seus" com
   * distribuição manual significa que ninguém enxerga a fila para pegar, então
   * nada é atendido — e a tela de todo mundo fica vazia sem explicação.
   */
  const combinacaoMorta = form.visibility_mode === "own" && form.mode === "manual";

  const devolveSozinho = form.handoff_return_after_minutes !== null;

  /** Quantos ajustes finos estão fora do padrão: o "Mais ajustes" fechado não esconde o que está ligado. */
  const foraDoPadrao =
    (form.handoff_return_after_minutes !== null ? 1 : 0) +
    (form.manual_reply_silence_minutes !== null ? 1 : 0) +
    (form.conversation_stays_with_attendant ? 1 : 0) +
    (ass && (ass.humanos || ass.ia) ? 1 : 0);

  function salvar() {
    startTransition(async () => {
      let algumErro = false;
      if (mudouRota) {
        try {
          await apiClient.patch("/api/v1/settings/routing", form);
          setSalvo(form);
          toast.success(t("Distribuição de atendimento salva."));
        } catch (err) {
          algumErro = true;
          toast.error(err instanceof Error ? t(err.message) : t("Não consegui salvar."));
        }
      }
      if (mudouAss && ass) {
        try {
          await apiClient.patch("/api/v1/settings/assinatura", ass);
          setAssSalva(ass);
          toast.success(t("Assinatura salva."));
        } catch (err) {
          algumErro = true;
          toast.error(err instanceof Error ? t(err.message) : t("Não consegui salvar."));
        }
      }
      // A faixa "Quem recebe agora" lê o modo salvo: relê a página para ela acompanhar.
      if (!algumErro) router.refresh();
    });
  }

  const motivoDoModo: Record<RecomendacaoDeDistribuicao["motivoDoModo"], string> = {
    sem_equipe: t(
      "“cada um pega” basta. Motivo: com uma pessoa só não há o que distribuir, e ela mesma vê a fila.",
    ),
    rodizio: t(
      "o rodízio. Motivo: ninguém escolhe, então ninguém fura a fila, e cada um recebe na sua vez.",
    ),
    carga: t(
      "“menos conversas”. Motivo: com muita gente, o rodízio puro deixa um com a carteira cheia enquanto outro está parado.",
    ),
  };
  const motivoDaVisibilidade: Record<RecomendacaoDeDistribuicao["motivoDaVisibilidade"], string> = {
    equipe_pequena: t(
      "todos veem tudo. Motivo: numa equipe pequena as pessoas se ajudam, e esconder a carteira do colega só atrapalha.",
    ),
    carteira_propria: t(
      "cada um vê os seus e a fila. Motivo: cada um foca na própria carteira e ainda enxerga quem acabou de chegar.",
    ),
  };

  const opcoesDeAssinatura = [
    {
      chave: "humanos" as const,
      titulo: t("Assinar as mensagens dos atendentes"),
      corpo: t("Cada atendente aparece pelo próprio nome, com as iniciais em maiúscula."),
    },
    {
      chave: "ia" as const,
      titulo: t("Assinar as mensagens da IA"),
      corpo: t("A IA aparece pelo nome abaixo, nunca pelo nome de um atendente."),
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="form-atendimento">
      <Painel semRecuo>
        <Secao
          titulo={t("Quem recebe o cliente novo")}
          descricao={t("Vale para conversa que chega sem dono.")}
          estado={ninguemDisponivel && form.mode !== "manual" ? "revisar" : "pronto"}
        >
          {recomendacao ? (
            <FaixaRecomendada testId="recomendado-modo">
              {t("Para a sua equipe")} ({recomendacao.total}): {motivoDoModo[recomendacao.motivoDoModo]}
            </FaixaRecomendada>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border">
            {ROUTING_MODES.map((m) => (
              <Escolha
                key={m}
                nome="modo"
                valor={m}
                atual={form.mode}
                titulo={t(MODO_COPY[m].titulo)}
                corpo={t(MODO_COPY[m].corpo)}
                disabled={isPending}
                recomendada={recomendacao?.modo === m}
                onPick={(v) => setForm((f) => ({ ...f, mode: v as RoutingMode }))}
              />
            ))}
          </div>

          {form.mode !== "manual" ? (
            <div className="grid gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="max_retries">{t("Tentativas antes de desistir")}</Label>
                <Input
                  id="max_retries"
                  type="number"
                  min={0}
                  max={20}
                  value={form.max_retries}
                  disabled={isPending}
                  onChange={(e) => setForm((f) => ({ ...f, max_retries: Number(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Quando não há ninguém disponível, o sistema tenta de novo mais tarde. Ao estourar, a conversa fica na fila esperando alguém.",
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="backoff_seconds">{t("Espera entre tentativas (segundos)")}</Label>
                <Input
                  id="backoff_seconds"
                  type="number"
                  min={1}
                  max={3600}
                  value={form.backoff_seconds}
                  disabled={isPending}
                  onChange={(e) => setForm((f) => ({ ...f, backoff_seconds: Number(e.target.value) }))}
                />
              </div>
            </div>
          ) : null}
        </Secao>

        <Secao
          titulo={t("O que cada atendente enxerga")}
          descricao={`${t("Restringe apenas quem tem o papel")} ${t("Atendente")}. ${t("Gerente e administrador continuam vendo a operação inteira.")}`}
          estado={combinacaoMorta ? "revisar" : "pronto"}
        >
          {recomendacao ? (
            <FaixaRecomendada testId="recomendado-visibilidade">
              {t("Para a sua equipe")} ({recomendacao.total}): {motivoDaVisibilidade[recomendacao.motivoDaVisibilidade]}
            </FaixaRecomendada>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border">
            {VISIBILITY_MODES.map((v) => (
              <Escolha
                key={v}
                nome="visibilidade"
                valor={v}
                atual={form.visibility_mode}
                titulo={t(VISIBILIDADE_COPY[v].titulo)}
                corpo={t(VISIBILIDADE_COPY[v].corpo)}
                disabled={isPending}
                recomendada={recomendacao?.visibilidade === v}
                onPick={(x) => setForm((f) => ({ ...f, visibility_mode: x as VisibilityMode }))}
              />
            ))}
          </div>

          {combinacaoMorta ? (
            <p
              data-testid="aviso-combinacao-morta"
              className="rounded-lg border border-warning/40 bg-warning-bg p-3 text-xs"
            >
              {t("Com")} <strong>&ldquo;{t("só os seus")}&rdquo;</strong>{" "}
              {t(
                "e distribuição manual, ninguém enxerga a fila para pegar — e nenhum cliente é atendido. Ligue o rodízio para que alguém receba.",
              )}
            </p>
          ) : null}
        </Secao>
      </Painel>

      {responsaveis}

      <details
        data-testid="mais-ajustes"
        className="group overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <CaretRight
            size={16}
            aria-hidden
            className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span className="text-base font-semibold tracking-tight">{t("Mais ajustes")}</span>
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {t("A IA volta, silêncio depois do celular, a conversa fica com quem atendeu, assinatura")}
          </span>
          <span
            className="ml-auto shrink-0 rounded-full bg-surface-elevated px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
            data-testid="mais-ajustes-contagem"
          >
            {foraDoPadrao === 0
              ? t("valores padrão")
              : foraDoPadrao === 1
                ? t("1 fora do padrão")
                : `${foraDoPadrao} ${t("fora do padrão")}`}
          </span>
        </summary>

        <div className="border-t border-border">
          <div className="space-y-3 px-5 py-4" data-testid="devolucao-ao-agente">
            <div>
              <h3 className="text-sm font-semibold">{t("Quando a pessoa some, a IA volta?")}</h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Quando alguém assume uma conversa, o agente de IA para de responder nela até ser devolvido. Se ninguém devolve, o cliente que escreve de novo fica sem resposta.",
                )}
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                data-testid="devolver-sozinho"
                checked={devolveSozinho}
                disabled={isPending}
                onChange={(e) =>
                  setForm((f) => ({ ...f, handoff_return_after_minutes: e.target.checked ? 60 : null }))
                }
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {t("Devolver ao agente sozinho depois de um tempo sem resposta da equipe")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    "O tempo conta a partir do último sinal de uma pessoa na conversa: assumir, responder pela tela ou pelo celular. Só devolve onde há agente publicado. Desligado, vale a regra de sempre: a IA só volta quando alguém clica em Devolver.",
                  )}
                </span>
              </span>
            </label>
            {devolveSozinho ? (
              <div className="max-w-xs space-y-1 pt-1">
                <Label htmlFor="handoff_return_after_minutes">{t("Minutos sem resposta da equipe")}</Label>
                <Input
                  id="handoff_return_after_minutes"
                  type="number"
                  min={PRAZO_MIN_MINUTOS}
                  max={PRAZO_MAX_MINUTOS}
                  value={form.handoff_return_after_minutes ?? 60}
                  disabled={isPending}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, handoff_return_after_minutes: Number(e.target.value) }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Entre 5 minutos e 24 horas. Sessenta minutos é a ordem de grandeza de um atendimento humano.",
                  )}
                </p>
              </div>
            ) : null}
          </div>

          <div
            className="space-y-3 border-t border-border px-5 py-4"
            data-testid="silencio-apos-resposta-pelo-celular"
          >
            <div>
              <h3 className="text-sm font-semibold">
                {t("Quando alguém responde pelo celular, a IA espera quanto tempo?")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Quando alguém da equipe responde o cliente direto pelo celular, fora do sistema, o agente de IA fica calado naquela conversa por este tempo. Cada nova resposta pelo celular recomeça a contagem.",
                )}
              </p>
            </div>
            <div className="max-w-xs space-y-1">
              <Label htmlFor="manual_reply_silence_minutes">
                {t("Minutos de silêncio da IA depois de uma resposta pelo celular")}
              </Label>
              <Input
                id="manual_reply_silence_minutes"
                type="number"
                min={PRAZO_MIN_MINUTOS}
                max={PRAZO_MAX_MINUTOS}
                value={form.manual_reply_silence_minutes ?? PRAZO_PADRAO_DO_SILENCIO_MINUTOS}
                disabled={isPending}
                onChange={(e) =>
                  setForm((f) => ({ ...f, manual_reply_silence_minutes: Number(e.target.value) }))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Entre 5 minutos e 24 horas. O padrão é 60. Quem atende o dia inteiro pelo celular costuma preferir um prazo curto, como 15, para a IA voltar a responder entre um atendimento e outro.",
                )}
              </p>
            </div>
          </div>

          <div
            className="space-y-3 border-t border-border px-5 py-4"
            data-testid="conversa-fica-com-quem-atendeu"
          >
            <div>
              <h3 className="text-sm font-semibold">
                {t("Quando alguém responde, a conversa fica com essa pessoa?")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Desligado, vale a regra de sempre: responder pela tela cala a IA por alguns minutos, e a conversa encerrada que recebe mensagem nova volta para a fila.",
                )}
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                data-testid="fica-com-quem-atendeu"
                checked={form.conversation_stays_with_attendant}
                disabled={isPending}
                onChange={(e) =>
                  setForm((f) => ({ ...f, conversation_stays_with_attendant: e.target.checked }))
                }
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">{t("A conversa fica com quem atendeu")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t(
                    "Responder pelo Inbox numa conversa sem dono passa a assumi-la, e a IA fica calada até alguém devolver. Quando o cliente escreve numa conversa encerrada, ela volta direto para o último atendente, sem passar pela distribuição, se ele ainda faz parte da equipe.",
                  )}
                </span>
              </span>
            </label>
          </div>

          {ass ? (
            <div className="space-y-3 border-t border-border px-5 py-4" data-testid="assinatura">
              <div>
                <h3 className="text-sm font-semibold">{t("Quem fala aparece na mensagem?")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Ligado, a mensagem que vai ao cliente ganha o nome de quem fala em negrito, na linha de cima. O histórico do CRM guarda o texto como foi escrito. Campanhas, lembretes e integrações por token não assinam.",
                  )}
                </p>
              </div>
              {opcoesDeAssinatura.map((o) => (
                <label key={o.chave} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    data-testid={`assinatura-${o.chave}`}
                    checked={ass[o.chave]}
                    disabled={isPending}
                    onChange={(e) => setAss((a) => (a ? { ...a, [o.chave]: e.target.checked } : a))}
                    className="mt-1 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="space-y-1">
                    <span className="block text-sm font-medium">{o.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{o.corpo}</span>
                  </span>
                </label>
              ))}
              <div className="max-w-sm space-y-1">
                <Label htmlFor="assinatura-nome-ia">{t("Nome da IA")}</Label>
                <Input
                  id="assinatura-nome-ia"
                  value={ass.nome_ia}
                  maxLength={120}
                  disabled={isPending}
                  onChange={(e) => setAss((a) => (a ? { ...a, nome_ia: e.target.value } : a))}
                />
                <p className="text-xs text-muted-foreground">{t("Sem asteriscos nem quebra de linha.")}</p>
              </div>
            </div>
          ) : null}
        </div>
      </details>

      <div
        className="sticky bottom-0 z-10 flex items-center gap-3 rounded-xl border border-border bg-surface/95 px-4 py-3 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-surface/85"
        data-testid="barra-de-salvar-distribuicao"
      >
        {sujo ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-sm text-funil">
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            {t("Há mudanças não salvas.")}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t("Tudo salvo")}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {sujo ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setForm(salvo);
                setAss(assSalva);
              }}
            >
              {t("Descartar alterações")}
            </Button>
          ) : null}
          <Button type="button" onClick={salvar} disabled={isPending || !sujo}>
            {isPending ? t("Salvando…") : t("Salvar")}
          </Button>
        </div>
      </div>
    </div>
  );
}
