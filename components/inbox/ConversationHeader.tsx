"use client";
import { useState, type RefObject } from "react";
import { useT } from "@/hooks/i18n/useT";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JanelaSelo } from "@/components/inbox/JanelaSelo";
import { ChipDeComando } from "@/components/inbox/visual/QuemAtende";
import { ArrowRight, MagnifyingGlass } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useClaimConversation } from "@/hooks/inbox/useClaimConversation";
import { useReleaseConversation } from "@/hooks/inbox/useReleaseConversation";
import {
  useArchiveConversation,
  useCloseConversation,
  useReopenConversation,
} from "@/hooks/inbox/useCloseConversation";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";
import { comandoDaConversa, esperaDaConversa, ROTULO_DO_MOTIVO } from "@/lib/inbox/comando-da-conversa";
import { ReassignDialog } from "@/components/inbox/ReassignDialog";
import { SnoozeButton } from "@/components/inbox/SnoozeButton";
import { DialButton } from "@/components/voice/DialButton";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";

interface Props {
  conversation: ConversationWithContact;
  /**
   * A busca DENTRO da conversa (#1793): abre um campo que filtra só as
   * mensagens já carregadas. O ref devolve o foco a este botão quando o campo
   * fecha — senão o Esc largava o foco no `body`.
   */
  onBuscar?: () => void;
  buscaAberta?: boolean;
  botaoBuscaRef?: RefObject<HTMLButtonElement | null>;
  /** Seleciona outra conversa no Inbox — a aba Número do Transferir abre a do outro número. */
  onAbrirConversa?: (id: string) => void;
}

/**
 * O CHIP NOMEIA CICLO DE VIDA, NÃO COMANDO.
 *
 * Ele afirmava quem manda — "Automático atendendo", "Aguardando atendente" — a
 * 20px de um selo que responde a MESMA pergunta por outra fonte, e as duas se
 * contradiziam na tela: `conversations.status` não acompanha silêncio, trava de
 * contato nem atribuição, e o motor nunca o lê. Medido em 2026-08-30 num print
 * do dono: "Aguardando atendente" e "Automático" no mesmo cabeçalho.
 *
 * Quem responde "quem manda" é o `OwnerBadge`, que vem de `comandoDaConversa`.
 * Aqui fica só o que o status realmente sabe: o episódio está aberto ou acabou.
 *
 * Cobre os SETE valores do CHECK de propósito — o call site é
 * `t(STATUS_LABEL[status] ?? status)`, e um buraco imprime o token cru em inglês
 * no rosto do atendente. Vigiado pelo invariante de espelho.
 */
const STATUS_LABEL: Record<string, string> = {
  open: "Aberta",
  pending: "Aberta",
  claimed: "Aberta",
  ai_handling: "Aberta",
  resolved: "Resolvida",
  closed: "Fechada",
  archived: "Arquivada",
};

export function ConversationHeader({
  conversation,
  onAbrirConversa,
  onBuscar,
  buscaAberta,
  botaoBuscaRef,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const claim = useClaimConversation();
  const release = useReleaseConversation();
  const close = useCloseConversation();
  const reopen = useReopenConversation();
  const arquivar = useArchiveConversation();
  const retomar = useResumeAiAttendance();
  const pausar = usePauseAiAttendance();
  // "Existe automático nesta org?" — sem isto o selo afirmava que o robô estava
  // atendendo em instalação que nunca configurou agente nenhum.
  const automaticoDaOrg = useAutomaticoAtivo();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [confirmFecharOpen, setConfirmFecharOpen] = useState(false);
  const [confirmArquivarOpen, setConfirmArquivarOpen] = useState(false);

  const c = conversation.contacts ?? null;
  const displayName = rotuloDoContato(c, t);
  const status = conversation.status;
  const isMineAssigned = conversation.assigned_to_user_id === user.id;
  const isOpen = status === "open" || conversation.assigned_to_user_id == null;

  /**
   * QUEM MANDA, uma pergunta com uma resposta.
   *
   * Este bloco era três leituras parciais. O selo e o botão de volta liam duas
   * travas (`bot_silenced_until || force_human`); a linha da lista lia uma, por
   * COR; o painel não lia nenhuma. Desde a 0173 há uma quarta situação —
   * "alguém assumiu" — e continuar somando condições à mão aqui é como as três
   * leituras divergiram em primeiro lugar. A regra mora em `lib/inbox`,
   * espelhando os gates que o MOTOR lê, e esta tela só a consome.
   */
  const { comando, automaticoAtivo, travaVigente, motivo } = comandoDaConversa({
    status,
    assigned_to_user_id: conversation.assigned_to_user_id,
    assigned_to_user_name: conversation.assigned_to_user_name ?? null,
    assignee_kind: conversation.assignee_kind ?? null,
    bot_silenced_until: conversation.bot_silenced_until ?? null,
    last_handoff_reason: conversation.last_handoff_reason ?? null,
    force_human: c?.force_human ?? null,
    is_blocked: conversation.contacts?.is_blocked ?? null,
    is_group: conversation.is_group ?? false,
    automaticoDaOrg: automaticoDaOrg.data,
  });

  const encerrada = status === "closed" || status === "archived" || status === "resolved";
  /**
   * A VOLTA aparece sempre que há algo a devolver — inclusive em conversa
   * ENCERRADA. Antes ela era condicionada a `status !== "closed"`, e o resultado
   * era um beco sem saída medido: atendente assume, fecha, sai de férias; a
   * conversa fica com o automático parado e, para qualquer colega, sem NENHUMA
   * porta — "Liberar" só existe para o próprio dono e a rota recusa quem não é.
   * `devolverAtendimentoAoAgente` funciona nesse estado (o status fechado está na
   * lista de reativáveis), então esconder o botão escondia uma ação que existe.
   *
   * A condição é `travaVigente`, e NÃO `!automaticoAtivo`: conversa encerrada tem
   * o automático inativo sem ter trava nenhuma, e sair do segundo faria o botão
   * aparecer em toda conversa fechada — clicá-lo REABRIRIA uma conversa que
   * ninguém pediu para reabrir. Oferecer uma ação que não deveria acontecer é
   * pior que não oferecer nenhuma.
   */
  const podeDevolver = travaVigente;
  /**
   * PAUSAR só aparece quando pausar é um gesto DIFERENTE de assumir.
   *
   * Desde a 0173 "Assumir" já cala o automático (a RPC grava o silêncio). Numa
   * conversa sem dono, portanto, "Assumir" e "Pausar o automático" teriam
   * exatamente o mesmo efeito — dois botões para um ato é a confusão que esta
   * entrega existe para acabar, não para dobrar.
   *
   * Sobra o caso em que ele é próprio: a conversa JÁ tem dono e o automático
   * continua de pé. Isso é real e não é raro — o rodízio (`reason='routing'`)
   * distribui sem calar, de propósito, senão uma org em round_robin ficaria sem
   * automático nenhum.
   */
  const podePausar =
    automaticoAtivo && !encerrada && conversation.assigned_to_user_id !== null;

  if (user.support?.access_mode === "support_readonly") return <header className="flex items-center justify-between border-b p-4">
    <strong>{displayName}</strong><span className="text-sm text-muted-foreground">{STATUS_LABEL[status] ?? status} · Somente leitura</span>
  </header>;
  return (
    // `flex-wrap` porque este header travava a LARGURA DA TELA INTEIRA. Ele
    // media 707px de `min-content` — a identidade do contato encolhia bem
    // (`min-w-0` + `truncate`), mas a barra de ações era `shrink-0` e não
    // quebrava. Como a coluna do meio do inbox é `1fr`, que é
    // `minmax(auto, 1fr)`, ela não podia ficar menor que esses 707px, e o
    // painel de CRM era empurrado 311px para fora da viewport em 1280px.
    //
    // Reorganizar em vez de esconder: acima de ~1440px o header fica IDÊNTICO ao
    // de antes (uma linha), e quando aperta a barra desce para a linha de baixo.
    // Nenhuma ação some — um menu "mais" esconderia o "Lembrar" que a spec
    // `canais-baseline` clica, e, pior, esconderia ação de quem atende.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-surface px-4 py-2">
      {/*
        QUEM ESTÁ NO COMANDO, num chip só, com nome, desde quando e quem passou
        (direção "Linha do Funil"). A identidade do cliente — nome, telefone,
        campanha — subiu para a faixa da jornada, acima desta barra.
        O `data-testid` é contrato: `inbox-quem-manda.spec.ts` lê o comando aqui.
      */}
      {/* A linha inteira para QUEM ATENDE: o chip não divide espaço com os botões
          (cortado, ele perdia justo o "transferida pela IA"). */}
      <div className="flex min-w-0 basis-full flex-wrap items-center gap-2">
        <span data-testid="comando-da-conversa" className="min-w-0 max-w-full">
          <ChipDeComando
            comando={comando}
            desde={conversation.assigned_at ?? null}
            transferidaPelaIa={comando.quem === "humano" && Boolean(conversation.last_handoff_at)}
            esperaDesde={esperaDaConversa(conversation)}
          />
        </span>
        {status !== "open" ? (
          <Badge variant="outline" className="h-5 shrink-0 px-2 text-[11px]">
            {t(STATUS_LABEL[status] ?? status)}
          </Badge>
        ) : null}
        {/* "Dá para escrever agora?" se pergunta ANTES de digitar. */}
        <JanelaSelo
          provider={conversation.channel_sessions?.provider ?? null}
          lastInboundAt={conversation.last_inbound_at}
        />
        {motivo !== null && (
          <Badge variant="outline" className="h-5 w-fit max-w-full truncate px-2 text-[11px]"
            title={t(ROTULO_DO_MOTIVO[motivo])} data-testid="badge-atendimento-humano">
            {t(ROTULO_DO_MOTIVO[motivo])}
          </Badge>
        )}
        <h2 className="sr-only">{displayName}</h2>
      </div>

      {/* `shrink-0` saiu daqui: era ele que impunha o piso de largura. Agora a
          barra pode encolher e quebrar internamente, e os botões continuam
          todos visíveis e clicáveis — só que em duas linhas quando preciso.
          Esta coluna existe para o selo do automático morar ABAIXO da barra
          (#1625): na linha do nome ele alargava a identidade e empurrava a
          barra inteira para baixo. Ela também não é `shrink-0`, pelo mesmo
          motivo da barra. */}
      <div className="flex min-w-0 flex-col items-end gap-1">
      {/* Botões compactos (h-8): a barra divide a linha com o chip de comando. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 [&>button]:h-8 [&>button]:px-2.5 [&>button]:text-xs [&>a]:h-8 [&>a]:text-xs">
        {/* Primeira da barra e sem rótulo escrito: é ferramenta de LEITURA, não
            ação de atendimento, e não muda de lugar com o estado da conversa.
            Só o ícone porque a barra já quebrou a caixa útil em 1280px uma vez
            (ver o comentário do interruptor abaixo). */}
        {onBuscar && (
          <Button
            ref={botaoBuscaRef}
            size="sm"
            variant="ghost"
            className="w-11 px-0 lg:w-8"
            onClick={onBuscar}
            aria-label={t("Buscar nesta conversa")}
            title={t("Buscar nesta conversa")}
            aria-expanded={buscaAberta}
          >
            <MagnifyingGlass size={16} aria-hidden />
          </Button>
        )}
        {/* A chamada usa o telefone da ficha, mesmo quando o contato chegou por
            outro canal. Grupos não representam uma pessoa para ligar. */}
        {!conversation.is_group && c?.id && (
          <DialButton contactId={c.id} hasPhone={!!c.phone_number} />
        )}
        {/* Assumir a própria conversa não muda nada: o botão some quando ela já é
            de quem está olhando (antes aparecia ao lado de "Liberar"). */}
        {isOpen && !isMineAssigned && (
          <Button
            size="sm"
            variant="default"
            disabled={claim.isPending}
            // O rótulo NÃO muda (é contrato: `inbox-header-nao-trava` e o
            // dicionário de espanhol o citam). O que faltava era a consequência
            // dita: desde a 0173 assumir também para o atendimento automático, e
            // um botão que muda duas coisas precisa anunciar as duas.
            title={t("Você passa a responder esta conversa e o atendimento automático para aqui.")}
            onClick={() =>
              claim.mutate({
                conversation_id: conversation.id,
                expected_assignee: conversation.assigned_to_user_id,
              })
            }
          >
            {t("Assumir")}
          </Button>
        )}
        {isMineAssigned && (
          <Button
            size="sm"
            variant="outline"
            disabled={release.isPending}
            onClick={() => release.mutate({ conversation_id: conversation.id })}
          >
            {t("Liberar")}
          </Button>
        )}
        {/* O INTERRUPTOR. Um botão, dois rótulos, um slot.
            Fica ANTES de transferir/fechar porque é a ação que a pessoa procura
            quando terminou o que tinha para fazer aqui.

            Dois botões lado a lado foi medido e recusado: a barra de ações já
            estourou a caixa útil de 392px em 1280px uma vez (ver o comentário no
            topo do JSX), e um botão a mais custa ~85px — o cabeçalho ganharia uma
            segunda fileira justo na largura mais apertada. Os dois estados são
            mutuamente exclusivos, então nunca precisam existir juntos.

            O `data-testid` do lado de VOLTA é o mesmo de antes: `escalacao-ciclo`
            o clica, e rótulo/testid visível é contrato. */}
        {podeDevolver && (
          <Button
            size="sm"
            variant="outline"
            disabled={retomar.isPending}
            data-testid="devolver-ao-automatico"
            // O ALCANCE DA VOLTA NÃO É SEMPRE O MESMO, e a tela precisa dizer qual é.
            //
            // `devolverAtendimentoAoAgente` limpa `contacts.force_human`, que é do
            // CLIENTE e não desta conversa: quando foi ela que travou, o clique
            // religa o automático para TODAS as conversas daquela pessoa. Um botão
            // que às vezes faz mais do que o nome promete precisa dizer quando.
            title={
              motivo === "contato_travado"
                ? t("Religa o atendimento automático para este cliente — vale para todas as conversas dele.")
                : t("Devolve esta conversa ao atendimento automático.")
            }
            onClick={() => retomar.mutate({ conversation_id: conversation.id })}
          >
            {retomar.isPending ? t("Devolvendo...") : t("Devolver ao automático")}
          </Button>
        )}
        {podePausar && (
          <Button
            size="sm"
            variant="outline"
            disabled={pausar.isPending}
            data-testid="pausar-o-automatico"
            // `podePausar` já exige dono != null, então este botão NUNCA aparece
            // sem dono — prometer "você assume" aqui seria prometer o que a rota
            // não faz: com dono, ela só cala, nunca rouba a conversa de quem a tem.
            title={t("O atendimento automático para nesta conversa. O dono não muda.")}
            onClick={() => pausar.mutate({ conversation_id: conversation.id })}
          >
            {pausar.isPending ? t("Pausando...") : t("Pausar o automático")}
          </Button>
        )}
        {!encerrada && (
          <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>
            {t("Transferir")}
          </Button>
        )}
        {!encerrada && (
          <SnoozeButton
            conversationId={conversation.id}
            snoozeUntil={conversation.snooze_until ?? null}
          />
        )}
        {!encerrada && (
          <Button
            size="sm"
            variant="outline"
            disabled={close.isPending}
            onClick={() => setConfirmFecharOpen(true)}
          >
            {t("Fechar")}
          </Button>
        )}
        {encerrada && <Button size="sm" variant="outline" disabled={reopen.isPending}
          onClick={() => reopen.mutate({ conversation_id: conversation.id, expected_revision: conversation.service_revision })}>
          {t("Reabrir")}
        </Button>}
        {/* ARQUIVAR (#923): tira da frente sem destruir.
            A conversa já arquivada não mostra o botão — arquivar duas vezes não
            é um gesto que exista, e o botão só reapareceria como um clique que
            não muda nada. Fechada E resolvida mostram: são exatamente as que se
            quer mandar para o arquivo depois de encerradas, e é o caminho que
            faz a aba "Arquivadas" deixar de ser uma pasta morta.
            A permissão é a mesma de fechar (a rota `/conversations/[id]` é
            `requireSupportWrite`): quem pode encerrar, pode arquivar. */}
        {status !== "archived" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={arquivar.isPending}
            onClick={() => setConfirmArquivarOpen(true)}
          >
            {arquivar.isPending ? t("Arquivando...") : t("Arquivar")}
          </Button>
        )}
        {/* Visível em toda largura. Até 07/10/2026 ele tinha `xl:hidden`, porque
            a partir de 1280px o painel lateral de CRM entrava na tela com um
            "Ver contato" próprio. Na direção "Linha do Funil" a ficha virou
            gaveta, fechada até alguém abrir: esta voltou a ser a única porta
            direta para o contato em qualquer largura. */}
        {c?.id && (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/app/contacts/${c.id}`} className="flex items-center gap-1">
              {t("Ver contato")}
              <ArrowRight size={12} weight="regular" aria-hidden />
            </Link>
          </Button>
        )}
      </div>
        {/* O aviso pertence à operação automática. Abaixo da barra ele não
            alarga a ficha do contato nem muda a posição dos botões.
            Sem esta marca, a conversa em que o robô está calado tem exatamente
            a mesma cara de uma conversa normal. O testid é contrato:
            `escalacao-ciclo.spec.ts` o clica. */}
      </div>
      <ReassignDialog
        conversationId={conversation.id}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        numero={
          onAbrirConversa && c?.id
            ? {
                contactId: c.id,
                contactPhone: c.phone_number ?? null,
                channelSessionId: conversation.channel_session_id,
                onAbrirConversa,
              }
            : undefined
        }
      />
      <AlertDialog open={confirmFecharOpen} onOpenChange={setConfirmFecharOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Fechar esta conversa?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O atendimento é encerrado. Se o cliente escrever de novo, você pode reabrir.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                close.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Fechar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* A confirmação precisa dizer o que ACONTECE, e o que acontece depende
          do estado. `fn_conversation_set_status` trata `archived` como
          terminal: encerra o atendimento (grava `service_closed_at`,
          incrementa a revisão) e, com isso, desfaz a pausa do automático. Um
          atendente que leia "arquivar = tirar da vista, volto depois"
          encerraria o atendimento sem saber — e o robô voltaria a responder
          no próximo "oi" do cliente. Por isso a descrição só aparece quando
          `!encerrada`: quando já está encerrada, arquivar não muda o
          atendimento, só o lugar onde a conversa mora. */}
      <AlertDialog open={confirmArquivarOpen} onOpenChange={setConfirmArquivarOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Arquivar esta conversa?")}</AlertDialogTitle>
            {!encerrada && (
              <AlertDialogDescription>
                {t(
                  "Arquivar encerra este atendimento e guarda a conversa no histórico. Se o cliente escrever de novo, ela volta.",
                )}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                arquivar.mutate({
                  conversation_id: conversation.id,
                  expected_revision: conversation.service_revision,
                })
              }
            >
              {t("Arquivar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
