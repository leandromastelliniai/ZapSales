"use client";
/**
 * O assistente de criação de agente (`/app/ai/agents/new?modo=assistente`): cinco
 * perguntas e o agente sai montado, como rascunho, para testar. É a porta guiada de
 * quem nunca configurou nada; o editor completo (`/app/ai/agents/new`) continua a um
 * clique em todas as estações, levando o que já foi respondido.
 *
 * As duas portas criam o MESMO agente: o assistente compõe os campos (`comporAgente`),
 * monta o payload (`payloadDeCriacao`) e o salva por `createMcpAgentAction`, a ação do
 * `AgentForm` em modo criação, validado pelo mesmo contrato (`agentMcpCreateSchema`).
 *
 * O estado vive no `sessionStorage`: recarregar a página ou sair para cadastrar a chave de
 * IA e voltar não perde as respostas. A leitura acontece depois da montagem (não no
 * primeiro render) para o HTML do servidor e o do cliente coincidirem.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createMcpAgentAction } from "@/app/app/ai/agents/[id]/_actions";
import { CabecalhoDePagina } from "@/components/shell/CabecalhoDePagina";
import { CorpoDaPagina } from "@/components/shell/CorpoDaPagina";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { comporAgente } from "@/lib/ai/agents/assistente/compor";
import { AVISO_DE_RAMO_REGULADO, ramoPorId } from "@/lib/ai/agents/assistente/ramos";
import {
  escolherRamo,
  estadoInicial,
  gravarEstado,
  idiomaDoAgenteDaTela,
  lerEstado,
  limparEstado,
  type Estacao,
  type EstadoDoAssistente,
} from "@/lib/ai/agents/assistente/estado";
import {
  payloadDeCriacao,
  type CapacidadesDoModeloEscolhido,
} from "@/lib/ai/agents/assistente/payload";
import type { IdDoModelo } from "@/lib/ai/agents/modelos";
import type { PadroesDeIa } from "@/lib/ai/agents/padroes-de-ia";
import { agentMcpCreateSchema } from "@/lib/ai/agents/validation";

import { EstacaoCriar } from "./EstacaoCriar";
import { EstacaoModelo } from "./EstacaoModelo";
import { EstacaoNegocio } from "./EstacaoNegocio";
import { EstacaoPessoa } from "./EstacaoPessoa";
import { EstacaoTom } from "./EstacaoTom";
import { LinhaDasEstacoes } from "./LinhaDasEstacoes";
import { PreviaFixa } from "./PreviaFixa";

interface Props {
  padroes: PadroesDeIa;
  funilPadraoId: string | null;
  /** O que cada modelo liga, calculado no servidor (os handlers das ferramentas não vão ao navegador). */
  capacidades: Record<IdDoModelo, CapacidadesDoModeloEscolhido>;
  /** O idioma da tela de quem cria; idioma sem modelo cai em português. */
  idiomaDaTela: string;
}

function armazenamento(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function AssistenteDeAgente({ padroes, funilPadraoId, capacidades, idiomaDaTela }: Props) {
  const t = useT();
  const router = useRouter();
  const idioma = idiomaDoAgenteDaTela(idiomaDaTela);

  const [estado, setEstado] = React.useState<EstadoDoAssistente>(() => estadoInicial(idioma));
  const [lido, setLido] = React.useState(false);
  const [criando, setCriando] = React.useState(false);
  const emCurso = React.useRef(false);

  React.useEffect(() => {
    // O `sessionStorage` só existe no cliente: lê-lo no primeiro render divergiria do HTML
    // do servidor (hidratação), então a leitura acontece depois da montagem.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(lerEstado(armazenamento(), idioma));
    setLido(true);
  }, [idioma]);

  React.useEffect(() => {
    if (lido) gravarEstado(armazenamento(), estado);
  }, [estado, lido]);

  const agente = React.useMemo(() => comporAgente(estado.respostas), [estado.respostas]);
  const ramo = estado.respostas.ramoId ? ramoPorId(estado.respostas.ramoId) : undefined;

  const irPara = (estacao: Estacao) => setEstado((e) => ({ ...e, estacao }));
  const proxima = () => irPara(Math.min(5, estado.estacao + 1) as Estacao);
  const anterior = () => irPara(Math.max(1, estado.estacao - 1) as Estacao);

  function recomecar() {
    limparEstado(armazenamento());
    setEstado(estadoInicial(idioma));
  }

  async function criar() {
    // Duas barreiras contra o duplo clique: o estado (que desabilita o botão no próximo
    // render) e a ref (que vale já no segundo clique do mesmo render).
    if (emCurso.current || !padroes.ok) return;
    emCurso.current = true;
    setCriando(true);
    try {
      const payload = payloadDeCriacao(agente, capacidades[estado.respostas.modeloId], padroes, {
        nome: estado.nome,
        funilPadraoId,
      });
      const validado = agentMcpCreateSchema.safeParse(payload);
      if (!validado.success) {
        toast.error(t("Validação falhou."));
        return;
      }
      const res = await createMcpAgentAction(validado.data);
      if (!res.ok) {
        toast.error(res.message ?? `${t("Erro")}: ${res.error}`);
        return;
      }
      limparEstado(armazenamento());
      toast.success(t("Agent criado."));
      router.push(`/app/ai/agents/${res.data!.agent_id}?aba=test`);
    } finally {
      emCurso.current = false;
      setCriando(false);
    }
  }

  const props = { estado, idioma, mudar: setEstado };

  return (
    <CorpoDaPagina largura="lista">
      <CabecalhoDePagina
        titulo={t("Novo agente")}
        descricao={t("Cinco perguntas e o agente sai montado, pronto para você testar.")}
        acoes={
          <>
            <Button type="button" variant="ghost" onClick={recomecar}>
              {t("Começar de novo")}
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/ai/agents/new?de=assistente" data-testid="ir-para-o-editor">
                {t("Prefiro o editor completo")}
              </Link>
            </Button>
          </>
        }
      />

      <LinhaDasEstacoes atual={estado.estacao} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="space-y-6 rounded-xl border border-border bg-surface p-5 shadow-xs">
          {estado.estacao === 1 ? <EstacaoNegocio {...props} /> : null}
          {estado.estacao === 2 ? <EstacaoModelo {...props} /> : null}
          {estado.estacao === 3 ? <EstacaoTom {...props} /> : null}
          {estado.estacao === 4 ? <EstacaoPessoa estado={estado} mudar={setEstado} /> : null}
          {estado.estacao === 5 ? (
            <EstacaoCriar
              {...props}
              agente={agente}
              padroes={padroes}
              criando={criando}
              criar={criar}
            />
          ) : null}

          {/* Grudado no pé: na estação 1 a lista de negócios é longa, e o "Continuar" não pode ficar
              no fim dela, fora de vista. */}
          <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 rounded-b-xl border-t border-border bg-surface px-5 py-4">
            {estado.estacao > 1 ? (
              <Button type="button" variant="ghost" disabled={criando} onClick={anterior}>
                {t("Voltar")}
              </Button>
            ) : (
              <span />
            )}
            {estado.estacao < 5 ? (
              <span className="flex flex-wrap items-center gap-2">
                {estado.estacao === 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="pular"
                    onClick={() => setEstado((e) => ({ ...escolherRamo(e, null), estacao: 2 }))}
                  >
                    {t("Pular, usar o padrão")}
                  </Button>
                ) : null}
                <Button type="button" onClick={proxima} data-testid="continuar">
                  {t("Continuar")}
                </Button>
              </span>
            ) : null}
          </div>
        </section>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <PreviaFixa agente={agente} nome={estado.nome} />
          {ramo?.regulado ? (
            <p
              role="note"
              data-testid="aviso-de-ramo-regulado"
              className="rounded-lg bg-funil-fundo px-3 py-2 text-sm text-funil"
            >
              {AVISO_DE_RAMO_REGULADO[idioma]}
            </p>
          ) : null}
        </div>
      </div>
    </CorpoDaPagina>
  );
}
