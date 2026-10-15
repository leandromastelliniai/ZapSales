/**
 * A etiqueta "Grupo" na lista de conversas.
 *
 * `conversations.is_group` já chega no `SELECT_COLS` do handler (schema
 * original) — este teste prende só a LEITURA na tela: quem abre o inbox
 * precisa distinguir uma conversa de grupo de uma individual sem abrir cada
 * uma. Props mínimas copiadas de `ConversationList.tsx`, via
 * `__fixtures__/conversa.ts`.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConversationListItem } from "./ConversationListItem";
import { conversaDeExemplo } from "./__fixtures__/conversa";

describe("ConversationListItem — etiqueta de grupo", () => {
  it("conversa de grupo tem a etiqueta Grupo", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, is_group: true }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.getByText("Grupo")).toBeInTheDocument();
  });

  it("conversa individual não tem", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, is_group: false }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.queryByText("Grupo")).toBeNull();
  });
});

/**
 * A bolinha no canto do avatar. A cor sai de quem está no comando, mas cor
 * sozinha não se explica — a palavra vem junto, no `title` e no nome acessível.
 */
describe("ConversationListItem — bolinha de quem atende", () => {
  it("a bolinha do avatar diz em palavras quem está no comando", () => {
    render(
      <ConversationListItem
        conversation={{
          ...conversaDeExemplo.conversation,
          assigned_to_user_id: "user-1",
          assigned_to_user_name: "Ana",
          assignee_kind: "user",
        }}
        {...conversaDeExemplo.props}
      />,
    );
    const bolinha = screen.getByRole("img", { name: "Em atendimento" });
    expect(bolinha).toHaveAttribute("title", "Em atendimento");
  });

  it("conversa encerrada: a bolinha diz Encerrada", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, status: "closed" }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.getByRole("img", { name: "Encerrada" })).toHaveAttribute("title", "Encerrada");
  });

  // O caminho comum da aba de fechadas: alguém assumiu e fechou. Fechar não solta
  // o dono (`fn_service_status`), e `comandoDaConversa` segue dizendo `humano` de
  // propósito — mas a PALAVRA "Em atendimento" afirmaria um atendimento que acabou.
  it("conversa encerrada COM dono: a bolinha diz Encerrada, nunca Em atendimento", () => {
    render(
      <ConversationListItem
        conversation={{
          ...conversaDeExemplo.conversation,
          status: "closed",
          assigned_to_user_id: "user-1",
          assigned_to_user_name: "Ana",
          assignee_kind: "user",
        }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.getByRole("img", { name: "Encerrada" })).toHaveAttribute("title", "Encerrada");
    expect(screen.queryByRole("img", { name: "Em atendimento" })).toBeNull();
  });
});

/**
 * A linha do funil na lista vem da ROTA (`funil_do_contato`), não de prop
 * montada à mão: antes deste campo a lista real nunca a desenhava, só a vitrine.
 */
describe("ConversationListItem — linha do funil vinda da lista", () => {
  const funil = {
    nome: "Comercial",
    etapa_atual_id: "e2",
    etapas: [
      { id: "e1", nome: "Novo", perdida: false },
      { id: "e2", nome: "Proposta", perdida: false },
      { id: "e3", nome: "Fechado", perdida: false },
    ],
  };

  it("desenha a etapa atual do contato", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, funil_do_contato: funil }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.getByLabelText("Etapa do funil: Proposta")).toBeInTheDocument();
  });

  it("sem negócio em funil, a linha não aparece", () => {
    render(
      <ConversationListItem
        conversation={{ ...conversaDeExemplo.conversation, funil_do_contato: null }}
        {...conversaDeExemplo.props}
      />,
    );
    expect(screen.queryByLabelText(/^Etapa do funil/)).toBeNull();
  });
});
