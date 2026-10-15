"use client";

import { useState, useSyncExternalStore } from "react";

import { AuthProvider } from "@/hooks/auth/AuthProvider";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { VoiceCallProvider } from "@/components/voice/VoiceCallContext";
import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import { ConversationListItem } from "@/components/inbox/ConversationListItem";
import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import { ChatThread } from "@/components/inbox/ChatThread";
import { Composer } from "@/components/inbox/Composer";
import { FaixaDaJornada } from "@/components/inbox/visual/FaixaDaJornada";
import { AvatarDoContato } from "@/components/inbox/visual/AvatarDoContato";
import { LogotipoDoProduto } from "@/components/branding/MarcaDoProduto";
import { useMarcaDaInstalacao } from "@/lib/branding/contexto";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CalendarBlank,
  ChartBar,
  ChatCircle,
  Funnel,
  Gear,
  IdentificationCard,
  Megaphone,
  Robot,
  Users,
} from "@/lib/ui/icons";

import { ANA_PAULA_ID, CONVERSA_ABERTA, ETAPAS, FOTOS, LISTA, ORG_ID } from "./_dados";
import { instalarRedeDeExemplo } from "./_rede";

// Antes de qualquer componente montar: a primeira busca já tem de cair aqui.
instalarRedeDeExemplo();

const USUARIO = {
  id: ANA_PAULA_ID,
  email: "ana.paula@exemplo.invalid",
  full_name: "Ana Paula",
  avatar_url: null,
  is_platform_admin: false,
  idioma: "pt-BR",
  organizations: [{ organization_id: ORG_ID, organization_name: "Clínica Sorriso Vivo", role: "admin" }],
} as unknown as AuthUser;

const ORGANIZACAO = {
  orgId: ORG_ID,
  name: "Clínica Sorriso Vivo",
  role: "admin",
  visibility_mode: "all",
} as unknown as ActiveOrg;

const TRILHO = [
  { rotulo: "Conversas", Icone: ChatCircle, ativo: true },
  { rotulo: "Funil", Icone: Funnel },
  { rotulo: "Contatos", Icone: Users },
  { rotulo: "Campanhas", Icone: Megaphone },
  { rotulo: "Agenda", Icone: CalendarBlank },
  { rotulo: "Agentes de IA", Icone: Robot },
  { rotulo: "Relatórios", Icone: ChartBar },
] as const;

/**
 * A VITRINE DA INBOX — a direção "Linha do Funil" com dados de exemplo.
 *
 * Os componentes são os do produto (`components/inbox/**`); a casca em volta
 * (topo e trilho) é uma reprodução estática, porque a casca real depende de
 * sessão. É contra esta página que a comparação com a imagem aprovada roda.
 */
export function VitrineDaInbox() {
  const [filtros, setFiltros] = useState<InboxFiltersValue>({
    tab: "unassigned",
    search: "",
    onlyUnread: false,
  });
  const marca = useMarcaDaInstalacao();
  const aberta = LISTA[0]!;
  const contato = aberta.conversa.contacts!;
  // Só no navegador: os dados de exemplo usam "agora" (horários de hoje, espera
  // de 12 minutos) e a rede de exemplo só existe aqui. Desenhar no servidor
  // produziria horários que não batem com os do navegador.
  const noNavegador = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!noNavegador) return null;

  return (
    <AuthProvider user={USUARIO} activeOrg={ORGANIZACAO}>
      <VoiceCallProvider>
        <div className="flex h-dvh flex-col bg-bg text-text" data-testid="vitrine-inbox">
          <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
            <LogotipoDoProduto nome={marca.name} className="h-10 w-auto" />
            <span className="h-6 w-px bg-border" aria-hidden />
            <span className="text-base font-semibold">Clínica Sorriso Vivo</span>
            <span className="flex-1" />
            <Bell size={20} className="text-text-muted" aria-hidden />
            <span className="flex items-center gap-2 text-sm">
              <AvatarDoContato nome="Ana Paula" fotoUrl={FOTOS.anaPaula} tamanho="conversa" />
              Ana Paula
            </span>
          </header>
          <div className="flex min-h-0 flex-1">
            <nav
              aria-label="Navegação de exemplo"
              className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-3"
            >
              {TRILHO.map(({ rotulo, Icone, ...resto }) => (
                <span
                  key={rotulo}
                  title={rotulo}
                  className={
                    "ativo" in resto
                      ? "flex h-11 w-11 items-center justify-center rounded-lg bg-accent text-accent-foreground"
                      : "flex h-11 w-11 items-center justify-center rounded-lg text-text-muted"
                  }
                >
                  <Icone size={20} weight={"ativo" in resto ? "fill" : "regular"} aria-hidden />
                </span>
              ))}
              <span className="flex-1" />
              <span title="Configurações" className="flex h-11 w-11 items-center justify-center text-text-muted">
                <Gear size={20} aria-hidden />
              </span>
            </nav>
            <main className="min-h-0 min-w-0 flex-1 p-3">
              <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
                <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
                  <InboxFilters value={filtros} onChange={setFiltros} />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {LISTA.map((linha) => (
                      <ConversationListItem
                        key={linha.conversa.id}
                        conversation={linha.conversa}
                        isSelected={linha.conversa.id === CONVERSA_ABERTA}
                        onSelect={() => undefined}
                        automaticoDaOrg
                        fotoUrl={linha.foto}
                        funil={{ etapas: ETAPAS, atualId: linha.etapaAtual }}
                      />
                    ))}
                  </div>
                </section>
                <section className="flex min-h-0 min-w-0 flex-col gap-3">
                  <FaixaDaJornada
                    nome="Mariana Costa"
                    telefone="+55 11 98765-4321"
                    fotoUrl={FOTOS.mariana}
                    canal={aberta.conversa.channel_sessions ?? null}
                    campanha="Clareamento Outubro"
                    funil={{ nome: "Comercial", etapas: ETAPAS, atualId: "e4" }}
                    valor="R$ 1.150,00"
                    proximoPasso="confirmar quinta 14h"
                    etiquetas={contato.tags ?? []}
                    acaoDaFicha={
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Ficha completa"
                        title="Ficha completa"
                      >
                        <IdentificationCard size={15} aria-hidden />
                      </Button>
                    }
                  />
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
                    <ConversationHeader conversation={aberta.conversa} />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <ChatThread
                        conversationId={CONVERSA_ABERTA}
                        dono={{ userId: ANA_PAULA_ID, nome: "Ana Paula" }}
                        contatoId={contato.id}
                        cliente={{ nome: "Mariana Costa", fotoUrl: FOTOS.mariana }}
                      />
                    </div>
                    <Composer conversationId={CONVERSA_ABERTA} contactName="Mariana Costa" />
                  </div>
                </section>
              </div>
            </main>
          </div>
        </div>
      </VoiceCallProvider>
    </AuthProvider>
  );
}
