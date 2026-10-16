"use client";
/**
 * TestPanel — conversa simulada com uma version (S-13.12; várias trocas na #90).
 *
 * A conversa vive só nesta tela: cada troca manda ao POST `:test` (admin-only) o
 * que já foi dito (`history`) mais a mensagem nova, e o servidor roda o motor
 * real em modo prévia. Nada é enviado pelo WhatsApp, nenhum contato, negócio ou
 * funil é criado ou alterado, e "Reiniciar conversa" é esvaziar a lista — não
 * há conversa guardada no servidor.
 *
 * Cada resposta mostra as ferramentas que o agente chamaria, os tokens e o
 * custo, e oferece "Corrigir esta resposta" (vira proposta; ver
 * `CorrigirResposta`). Quando `INTERNAL_AGENT_RUN_STUB=true` o backend devolve
 * `stub: true`; o componente mostra um aviso amigável.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { agentRunsKey } from "@/hooks/ai/useAgentRuns";
import { useT } from "@/hooks/i18n/useT";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";
import { MENSAGEM_DO_TESTE_MAX } from "@/lib/ai/agents/teste-em-varias-trocas";
import type { TurnoDoTeste } from "@/lib/ai/agents/teste-em-varias-trocas";

import { CorrigirResposta } from "./CorrigirResposta";
import { RunTrace } from "./RunTrace";

interface Props {
  agent: AgentRow;
  draft: AgentVersionRow | null;
  published: AgentVersionRow | null;
  readOnly?: boolean;
}

interface TestResult {
  run_id: string;
  status: string;
  final_text?: string | null;
  tool_calls?: unknown;
  tokens_in?: number;
  tokens_out?: number;
  cost_cents?: number;
  latency_ms?: number;
  would_send_to?: { session?: string | null; chat_id?: string | null };
  stub?: boolean;
  candidates?: Array<{ body: string; trace: Array<{ gate: string; verdict: string }> }>;
  proposals?: Array<{ tool: string; arguments: unknown }>;
  impediments?: Array<{ code: string; message: string }>;
  restrictions?: string[];
  /** Ver lib/ai/agents/avaliar-resposta-de-teste.ts. */
  guardrails?: {
    passou: boolean;
    categorias: string[];
    termos: string[];
    naoAvaliados: Array<{ gate: string; porque: string }>;
  };
}

interface TestResponse {
  data: TestResult;
}

/** Uma troca: o que o cliente simulado disse e, quando o motor respondeu, o resultado. */
interface Troca {
  id: number;
  cliente: string;
  resultado: TestResult;
}

/** O que o agente teria enviado: o texto aceito pela cadeia de verificações, ou nada. */
function respostaDaTroca(r: TestResult): string {
  return (r.candidates ?? []).map((c) => c.body).join("\n\n").trim();
}

/** A conversa até a resposta da troca `ate` (inclusive), no formato que o servidor lê. */
function conversaAte(trocas: readonly Troca[], ate: number): TurnoDoTeste[] {
  return trocas.slice(0, ate + 1).flatMap((tr, i) => {
    const turnos: TurnoDoTeste[] = [{ role: "customer", text: tr.cliente }];
    const resposta = respostaDaTroca(tr.resultado);
    // A resposta da troca corrigida entra sempre (é a que se corrige); nas
    // anteriores, só quando o agente de fato respondeu.
    if (resposta || i === ate) turnos.push({ role: "agent", text: resposta });
    return turnos;
  }).filter((x) => x.text !== "");
}

function fmtCusto(cents: number | undefined): string {
  if (cents === undefined) return "—";
  return `US$ ${(cents / 100).toFixed(4)}`;
}

/**
 * O que as verificações disseram sobre a resposta — e o que elas NÃO puderam
 * dizer.
 *
 * Antes disto, o teste mostrava a resposta e mais nada: nenhum gate a examinava
 * (o runtime desta tela não importa a cadeia), então o usuário publicava achando
 * que tinha visto o comportamento real. Mostrar "não verificado" em voz alta é o
 * conserto — silêncio que parece aprovação foi o defeito.
 */
function Verificacoes({ g }: { g: NonNullable<TestResult["guardrails"]> }) {
  const t = useT();
  return (
    <div className="space-y-2" data-testid="teste-verificacoes">
      {g.passou ? (
        <p
          data-testid="teste-vazamento-limpo"
          className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs"
        >
          {t("A resposta não usa palavras internas do sistema.")}
        </p>
      ) : (
        <div
          data-testid="teste-vazamento-achado"
          className="rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs"
        >
          <p className="font-medium text-destructive">
            {t("Esta resposta usa palavras que o cliente não deveria ver.")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t("Em produção ela seria barrada e o assistente teria que reescrever. Encontrado:")}{" "}
            <span className="font-mono">{g.termos.join(", ")}</span>
          </p>
        </div>
      )}

      {/*
        A lista do que NÃO foi checado. Ela é o que separa este conserto de uma
        mentira mais bonita: as verificações que dependem do turno real não podem
        ser avaliadas aqui, e inventá-las daria um veredito com aparência de
        prova. O usuário precisa saber a diferença entre "passou em tudo" e
        "passou no que dava para checar sem uma conversa de verdade".

        (O texto dizia "os seis gates" enquanto a lista renderizava nove — número
        que já foi verdade para um subconjunto e envelheceu. A contagem agora sai
        da própria lista, logo abaixo, e não de prosa.)

        Esta lista responde "o que este teste NÃO checou"; a aba "Confere antes de
        enviar" responde "o que é checado, e o que cada uma protege". São
        perguntas diferentes, e por isso há um ponteiro em vez de uma cópia — as
        duas saem da mesma cadeia, cada uma com o seu teste de casamento.
      */}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer" data-testid="teste-nao-verificado">
          {t("O teste não consegue verificar tudo (")}
          {g.naoAvaliados.length} {t("verificações ficam de fora)")}
        </summary>
        <ul className="mt-2 space-y-1 pl-4">
          {g.naoAvaliados.map((n) => (
            <li key={n.gate}>— {n.porque}</li>
          ))}
        </ul>
        <p className="mt-2">
          {t(
            "Estas só acontecem numa conversa real, com um cliente de verdade do outro lado. Para ver a lista inteira do que é conferido — e o que cada verificação protege — abra a aba",
          )}{" "}
          <span className="font-medium text-foreground">{t("Confere antes de enviar")}</span>.
        </p>
      </details>
    </div>
  );
}

/** Os detalhes de uma resposta: ferramentas, tokens, custo e o que a cadeia disse. */
function DetalhesDaResposta({ r }: { r: TestResult }) {
  const t = useT();
  const ferramentas = Array.isArray(r.tool_calls)
    ? (r.tool_calls as Array<{ tool?: string; arguments?: unknown }>).map((c, i) => ({
        step: i + 1,
        tool_name: c.tool,
        args: c.arguments,
      }))
    : [];
  const propostas = new Set((r.proposals ?? []).map((p) => p.tool));

  return (
    <div className="space-y-2" data-testid="teste-detalhes">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span data-testid="teste-tokens">
          {t("Tokens in/out")}: {r.tokens_in?.toLocaleString() ?? "—"} /{" "}
          {r.tokens_out?.toLocaleString() ?? "—"}
        </span>
        <span data-testid="teste-custo">
          {t("Custo")}: {fmtCusto(r.cost_cents)}
        </span>
        <span>
          {t("Latência")}: {typeof r.latency_ms === "number" ? `${r.latency_ms}ms` : "—"}
        </span>
      </div>

      <details className="text-xs" data-testid="teste-ferramentas">
        <summary className="cursor-pointer text-muted-foreground">
          {t("Ferramentas que o agente chamou")} ({ferramentas.length})
        </summary>
        <div className="mt-2">
          <RunTrace
            toolCalls={ferramentas}
            finalText={null}
            emptyMessage={t("Sem tool calls (resposta direta do LLM).")}
          />
          {propostas.size > 0 ? (
            <p className="mt-2 text-muted-foreground" data-testid="teste-nao-executadas">
              {t("No teste estas ações não são executadas, só mostradas:")}{" "}
              <span className="font-mono">{[...propostas].join(", ")}</span>
            </p>
          ) : null}
        </div>
      </details>

      {r.candidates ? (
        <div className="space-y-2 text-xs">
          {r.candidates.map((candidate, i) => (
            <details key={i}>
              <summary className="cursor-pointer text-muted-foreground">
                {t("Verificações da resposta")}
              </summary>
              <pre className="overflow-auto whitespace-pre-wrap">
                {JSON.stringify(candidate.trace, null, 2)}
              </pre>
            </details>
          ))}
          {r.impediments?.map((x, i) => (
            <p role="status" key={i}>
              {x.message}
            </p>
          ))}
        </div>
      ) : null}

      {r.guardrails ? <Verificacoes g={r.guardrails} /> : null}
    </div>
  );
}

export function TestPanel({ agent, draft, published, readOnly }: Props) {
  const t = useT();
  const target = draft ?? published;
  const qc = useQueryClient();

  const [message, setMessage] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [trocas, setTrocas] = React.useState<Troca[]>([]);
  const proximoId = React.useRef(1);
  const fimDaConversa = React.useRef<HTMLDivElement | null>(null);

  // Outra versão é outro agente: a conversa de uma não vale para a outra. O reset
  // acontece na renderização (estado derivado da chave), não num efeito: um efeito
  // desenharia uma vez a conversa antiga sobre a versão nova.
  const versaoId = target?.id;
  const [versaoDaConversa, setVersaoDaConversa] = React.useState(versaoId);
  if (versaoDaConversa !== versaoId) {
    setVersaoDaConversa(versaoId);
    setTrocas([]);
  }

  React.useEffect(() => {
    fimDaConversa.current?.scrollIntoView?.({ block: "end" });
  }, [trocas.length, pending]);

  if (!target) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("Configure e salve uma versão antes de testar.")}
      </p>
    );
  }

  const versionLabel =
    target.status === "published"
      ? `v${target.version_number} ${t("(publicada)")}`
      : `v${target.version_number} ${t("(rascunho)")}`;

  async function handleEnviar() {
    const texto = message.trim();
    if (!texto) {
      toast.error(t("Informe uma mensagem de teste."));
      return;
    }
    if (!target) return;
    setPending(true);
    try {
      // O que já foi dito: cada troca respondida vira o par cliente/agente. Uma
      // troca em que o agente não respondeu (bloqueada pela cadeia) entra só
      // com a fala do cliente — foi o que a conversa teve.
      const history: TurnoDoTeste[] = trocas.length ? conversaAte(trocas, trocas.length - 1) : [];
      const body: Record<string, unknown> = { sample_message: texto };
      if (history.length) body.history = history;
      if (contactName.trim() || contactPhone.trim()) {
        body.sample_contact = {
          ...(contactName.trim() ? { name: contactName.trim() } : {}),
          ...(contactPhone.trim() ? { phone: contactPhone.trim() } : {}),
        };
      }
      const res = await apiClient.post<TestResponse>(
        `/api/v1/ai/agents/${agent.id}/versions/${target.id}/test`,
        body,
        // ⚠️ O padrão do cliente é 10s, e um turno de agente NÃO cabe nele: o
        // teste roda o motor inteiro (classificador de etapa, jailbreak, o
        // agente com as ferramentas, checkpoint, verificação de promessa).
        // Medido numa instalação real: 14,5s só na chamada ao modelo. Com 10s,
        // o resultado nunca chegava — o painel ficava em "Nenhum teste
        // executado ainda" enquanto o servidor terminava e devolvia para
        // ninguém (issue #783).
        //
        // 120s é o teto do orçamento de passos do agente, não um chute
        // confortável: acima disso o problema é o agente, não a espera.
        { timeoutMs: 120_000 },
      );
      setTrocas((atual) => [...atual, { id: proximoId.current++, cliente: texto, resultado: res.data }]);
      setMessage("");
      qc.invalidateQueries({ queryKey: agentRunsKey(agent.id) });
    } catch (err) {
      // A mensagem fica na caixa: a troca que falhou não entra na conversa, e a
      // pessoa tenta de novo sem redigitar.
      if (err instanceof ApiError) {
        toast.error(t(err.message) || `${t("Erro")}: ${err.code}`);
      } else {
        toast.error(t("Erro inesperado."));
      }
    } finally {
      setPending(false);
    }
  }

  function handleReiniciar() {
    setTrocas([]);
    setMessage("");
  }

  const stub = trocas.some((x) => x.resultado.stub);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("Versão alvo")}
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">{versionLabel}</Badge>
            <span className="font-mono text-xs">
              {target.provider} / {target.model}
            </span>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleReiniciar}
          disabled={pending || (trocas.length === 0 && !message)}
          data-testid="teste-reiniciar"
        >
          {t("Reiniciar conversa")}
        </Button>
      </div>

      <div className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs">
        <p className="font-medium text-warning-fg">
          {t("⚠ Modo teste consome créditos do provider.")}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t(
            "Nenhuma mensagem é enviada via WhatsApp e nenhum contato, negócio ou funil é criado ou alterado. O gasto conta no orçamento de IA da organização.",
          )}
        </p>
        <p className="mt-1 text-muted-foreground">
          {t("Mesmo motor e conhecimento do agente; nenhuma alteração é aplicada ao cliente.")}
        </p>
      </div>

      {stub ? (
        <p className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs text-muted-foreground">
          {t(
            "Provedor de teste controlado. O motor e as verificações são os mesmos; não há chamada a uma IA externa.",
          )}
        </p>
      ) : null}

      <div
        className="flex min-h-[16rem] flex-col gap-4 rounded-md border border-border/60 bg-muted/20 p-4"
        data-testid="teste-conversa"
        aria-live="polite"
      >
        {trocas.length === 0 && !pending ? (
          <p className="text-sm text-muted-foreground">
            {t("Converse com o agente como um cliente faria. Cada troca mantém o contexto das anteriores.")}
          </p>
        ) : null}

        {trocas.map((troca, i) => {
          const resposta = respostaDaTroca(troca.resultado);
          return (
            <div key={troca.id} className="flex flex-col gap-2" data-testid="teste-troca">
              <div className="max-w-[85%] self-end rounded-lg bg-accent-soft px-3 py-2 text-sm whitespace-pre-wrap">
                {troca.cliente}
              </div>
              <div className="flex max-w-[92%] flex-col gap-2 self-start">
                <div
                  className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm whitespace-pre-wrap"
                  data-testid="teste-resposta"
                >
                  {resposta ? (
                    resposta
                  ) : (
                    <span className="text-muted-foreground">
                      {t("O agente não gerou uma resposta para enviar nesta troca.")}
                    </span>
                  )}
                </div>
                <DetalhesDaResposta r={troca.resultado} />
                {resposta ? (
                  <CorrigirResposta
                    agentId={agent.id}
                    origem={{ origem: "teste", conversa: conversaAte(trocas, i) }}
                    rotulo={resposta.slice(0, 40)}
                    readOnly={readOnly}
                  />
                ) : null}
              </div>
            </div>
          );
        })}

        {pending ? (
          <p className="self-start text-sm text-muted-foreground" data-testid="teste-pensando">
            {t("O agente está respondendo…")}
          </p>
        ) : null}
        <div ref={fimDaConversa} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="test-message">{t("Mensagem do cliente (sample)")}</Label>
        <Textarea
          id="test-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!pending && !readOnly) void handleEnviar();
            }
          }}
          maxLength={MENSAGEM_DO_TESTE_MAX}
          placeholder={t("Oi, quanto custa X?")}
          rows={3}
          disabled={pending || readOnly}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("Enter envia; Shift+Enter quebra a linha.")}
          </p>
          <Button onClick={() => void handleEnviar()} disabled={pending || readOnly}>
            {pending ? t("Executando…") : t("Enviar")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label htmlFor="test-name">{t("Nome (opcional)")}</Label>
          <Input
            id="test-name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Maria"
            disabled={pending || readOnly || trocas.length > 0}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-phone">{t("Telefone (opcional)")}</Label>
          <Input
            id="test-phone"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+55..."
            disabled={pending || readOnly || trocas.length > 0}
          />
        </div>
      </div>
    </div>
  );
}
