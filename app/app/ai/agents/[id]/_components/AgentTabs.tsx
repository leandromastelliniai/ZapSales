"use client";
/**
 * Tabs do detalhe de agent. Wave 12 (S-13.12) entrega Test, Runs e History.
 */
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/hooks/i18n/useT";
import {
  ChatsCircle,
  ClockCounterClockwise,
  ListMagnifyingGlass,
  Lightbulb,
  PuzzlePiece,
  SlidersHorizontal,
} from "@/lib/ui/icons";
import { AgentForm, type ChannelSessionLite } from "./AgentForm";
import type { CoberturaPorFunil } from "./FunisDoAgente";
import type { MaterialDoAcervo } from "./BasesDoAgente";
import type { FunilDaResposta } from "@/hooks/pipelines/usePipelines";
import { TestPanel } from "./TestPanel";
import { RunsTable } from "./RunsTable";
import { UsoDasCapacidades } from "./UsoDasCapacidades";
import { VersionHistory } from "./VersionHistory";
import { ProposalsPanel } from "./ProposalsPanel";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";
import type { CredentialRow } from "@/hooks/ai/useCredentials";

interface Props {
  /** Funis da org, para a marcação de escopo do agente (spec 17 passo 3). */
  funis?: FunilDaResposta[];
  cobertura?: CoberturaPorFunil;
  /** O acervo da organização, para a seção "o que ele consulta" (0181). */
  materiais?: MaterialDoAcervo[];
  agent: AgentRow;
  draft: AgentVersionRow | null;
  published: AgentVersionRow | null;
  /** De onde o formulário se hidrata — ver `lib/ai/agents/versoes-da-tela.ts`. */
  base?: AgentVersionRow | null;
  /** Rascunho anterior à publicada: existe, mas não abre nem publica. */
  draftObsoleto?: AgentVersionRow | null;
  versions: AgentVersionRow[];
  credentials: CredentialRow[];
  /** Provedores cuja chave veio na instalação — ver `AgentForm`. */
  provedoresDaInstalacao?: string[];
  channelSessions: ChannelSessionLite[];
  routerMembership?: { routerId: string; routerName: string } | null;
  readOnly?: boolean;
  organizationTimezone?: string;
  /** A aba que abre primeiro (`?aba=test`, de onde o assistente de criação leva a pessoa). */
  abaInicial?: string;
}

type Aba = "configuration" | "test" | "capacidades" | "runs" | "history" | "proposals";

/** Cada aba diz o que se faz nela, numa frase — o nome sozinho ("Execuções") não diz. */
const ABAS: ReadonlyArray<{ id: Aba; nome: string; Icone: typeof ChatsCircle; frase: string }> = [
  {
    id: "configuration",
    nome: "Configuração",
    Icone: SlidersHorizontal,
    frase: "Como ele fala, o que sabe e o que pode fazer. Mudanças ficam num rascunho até você publicar.",
  },
  {
    id: "test",
    nome: "Teste",
    Icone: ChatsCircle,
    frase: "Converse com ele como se fosse um cliente. Nada é enviado no WhatsApp.",
  },
  {
    id: "capacidades",
    nome: "Capacidades",
    Icone: PuzzlePiece,
    frase: "Se as ações que você ligou estão funcionando: o que ele usa, o que falha e o que nunca foi usado.",
  },
  {
    id: "runs",
    nome: "Execuções",
    Icone: ListMagnifyingGlass,
    frase: "Cada resposta que ele deu, passo a passo — para entender por que respondeu o que respondeu.",
  },
  {
    id: "history",
    nome: "Histórico",
    Icone: ClockCounterClockwise,
    frase: "Todas as versões, o que mudou de uma para outra e como voltar a uma anterior.",
  },
  {
    id: "proposals",
    nome: "Propostas",
    Icone: Lightbulb,
    frase: "Melhorias que o sistema sugere a partir das conversas reais. Nada muda sem você aprovar.",
  },
];

export function AgentTabs(props: Props) {
  const t = useT();
  const [tab, setTab] = React.useState<Aba>(
    ABAS.some((a) => a.id === props.abaInicial) ? (props.abaInicial as Aba) : "configuration",
  );
  const hasVersion = !!(props.draft || props.published);
  const atual = ABAS.find((a) => a.id === tab) ?? ABAS[0]!;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as Aba)}
      className="flex flex-col gap-3"
    >
      <div className="space-y-2">
        <TabsList className="h-auto justify-start self-start">
          {ABAS.map((aba) => (
            <TabsTrigger
              key={aba.id}
              value={aba.id}
              disabled={aba.id === "test" && !hasVersion}
              className="gap-1.5 px-3 py-1.5"
            >
              <aba.Icone size={16} aria-hidden />
              {t(aba.nome)}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="text-sm text-muted-foreground" data-testid="frase-da-aba">
          {t(atual.frase)}
        </p>
      </div>

      <TabsContent value="configuration" className="m-0">
        <AgentForm
          mode="edit"
          agent={props.agent}
          draft={props.draft}
          published={props.published}
          base={props.base}
          draftObsoleto={props.draftObsoleto}
          credentials={props.credentials}
          provedoresDaInstalacao={props.provedoresDaInstalacao}
          channelSessions={props.channelSessions}
          funis={props.funis}
          cobertura={props.cobertura}
          materiais={props.materiais}
          routerMembership={props.routerMembership}
          readOnly={props.readOnly}
          organizationTimezone={props.organizationTimezone}
        />
      </TabsContent>

      <TabsContent value="test" className="m-0">
        <TestPanel
          agent={props.agent}
          draft={props.draft}
          published={props.published}
          readOnly={props.readOnly}
        />
      </TabsContent>

      <TabsContent value="capacidades" className="m-0">
        <UsoDasCapacidades agentId={props.agent.id} active={tab === "capacidades"} />
      </TabsContent>

      <TabsContent value="runs" className="m-0">
        <RunsTable agentId={props.agent.id} active={tab === "runs"} readOnly={props.readOnly} />
      </TabsContent>

      <TabsContent value="proposals" className="m-0">
        <ProposalsPanel
          agentId={props.agent.id}
          active={tab === "proposals"}
          readOnly={props.readOnly}
        />
      </TabsContent>

      <TabsContent value="history" className="m-0">
        <VersionHistory
          agentId={props.agent.id}
          versions={props.versions}
          readOnly={props.readOnly}
        />
      </TabsContent>
    </Tabs>
  );
}
