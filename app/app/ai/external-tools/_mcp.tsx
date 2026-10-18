"use client";
/**
 * A aba «Servidores MCP» de Ferramentas externas (issue #96, parte da #86).
 *
 * Um servidor MCP é um sistema de terceiro que oferece ferramentas ao agente. Quem decide é um
 * ADMINISTRADOR, em quatro passos, cada um com a sua frase quando não dá certo:
 *   1. ligar o recurso para a organização (desligado por padrão, com o aceite);
 *   2. cadastrar o servidor (endereço, credencial que nunca mais é mostrada) — o teste de conexão
 *      acompanha o cadastro;
 *   3. escolher quais ferramentas ficam disponíveis, marcando «só consulta» ou «altera dados»
 *      (o padrão é «altera dados»);
 *   4. marcar, na tela do agente, quais agentes podem usá-las (grupo «Ferramentas externas»).
 *
 * Com o recurso desligado a aba explica o que é e como ligar; a instalação segue útil sem ele.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import type { ServidorCadastrado } from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import { ROTULO_DO_EFEITO } from "@/lib/ai/ferramentas-externas/tipos";

import { TesteDaFerramentaDialog } from "./_dialogs";
import { EscolherFerramentasDialog, FormularioDoServidorDialog } from "./_mcp-dialogs";

interface EstadoDoMcp {
  ligado: boolean;
  aceite: { em: string; por: string } | null;
  servidores: number;
  ferramentas_ativas: number;
}

const CHAVE_DO_ESTADO = ["ai", "mcp"] as const;
const CHAVE_DOS_SERVIDORES = ["ai", "mcp-servers"] as const;
/**
 * A lista de ferramentas tem chave PRÓPRIA (filha da do seletor e da aba de webhooks). A aba de webhooks
 * semeia `["ai","external-tools"]` com `initialData` só de webhooks, e com `staleTime` global esse dado vale
 * como fresco: a aba MCP herdava uma lista sem as ferramentas MCP (achado no e2e do CI). Invalidar a chave
 * PAI, como abaixo, atualiza as três.
 */
const CHAVE_DAS_FERRAMENTAS = ["ai", "external-tools", "mcp"] as const;
const CHAVE_PAI_DAS_FERRAMENTAS = ["ai", "external-tools"] as const;

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function ServidoresMcpClient({ souAdmin }: { souAdmin: boolean }) {
  const t = useT();
  const qc = useQueryClient();

  const estado = useQuery({
    queryKey: CHAVE_DO_ESTADO,
    queryFn: async () => (await apiClient.get<{ data: EstadoDoMcp }>("/api/v1/ai/mcp")).data,
  });
  const ligado = estado.data?.ligado === true;

  const servidores = useQuery({
    queryKey: CHAVE_DOS_SERVIDORES,
    queryFn: async () => (await apiClient.get<{ data: ServidorCadastrado[] }>("/api/v1/ai/mcp-servers")).data,
    enabled: souAdmin && ligado,
  });
  const ferramentas = useQuery({
    queryKey: CHAVE_DAS_FERRAMENTAS,
    queryFn: async () => (await apiClient.get<{ data: FerramentaExterna[] }>("/api/v1/ai/external-tools")).data,
    enabled: souAdmin && ligado,
  });

  const [aceitou, setAceitou] = useState(false);
  const [alterando, setAlterando] = useState(false);
  const [formulario, setFormulario] = useState<{ aberto: boolean; editando: ServidorCadastrado | null }>({
    aberto: false,
    editando: null,
  });
  const [escolhendo, setEscolhendo] = useState<ServidorCadastrado | null>(null);
  const [testandoFerramenta, setTestandoFerramenta] = useState<FerramentaExterna | null>(null);
  const [apagando, setApagando] = useState<ServidorCadastrado | null>(null);
  const [desligando, setDesligando] = useState(false);
  const [testandoServidor, setTestandoServidor] = useState<string | null>(null);
  const [resultadoDoTeste, setResultadoDoTeste] = useState<Record<string, { ok: boolean; texto: string }>>({});

  const recarregarTudo = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: CHAVE_DO_ESTADO }),
      qc.invalidateQueries({ queryKey: CHAVE_DOS_SERVIDORES }),
      qc.invalidateQueries({ queryKey: CHAVE_PAI_DAS_FERRAMENTAS }),
    ]);
  };

  async function mudarInterruptor(corpo: { ligado: boolean; aceitar?: true }) {
    setAlterando(true);
    try {
      await apiClient.put("/api/v1/ai/mcp", corpo);
      toast.success(corpo.ligado ? t("Servidores MCP ligados.") : t("Servidores MCP desligados."));
      setDesligando(false);
      await recarregarTudo();
    } catch (err) {
      showApiError(err);
    } finally {
      setAlterando(false);
    }
  }

  async function testarConexao(s: ServidorCadastrado) {
    setTestandoServidor(s.id);
    try {
      const res = await apiClient.post<{
        data: { ok: true; tools_offered: number } | { ok: false; message: string };
      }>(`/api/v1/ai/mcp-servers/${s.id}/test`, {}, { timeoutMs: 45_000 });
      const r = res.data;
      setResultadoDoTeste((antes) => ({
        ...antes,
        [s.id]: r.ok
          ? { ok: true, texto: `${t("Conectou.")} ${r.tools_offered} ${r.tools_offered === 1 ? t("ferramenta oferecida.") : t("ferramentas oferecidas.")}` }
          : { ok: false, texto: r.message },
      }));
      await qc.invalidateQueries({ queryKey: CHAVE_DOS_SERVIDORES });
    } catch (err) {
      showApiError(err);
    } finally {
      setTestandoServidor(null);
    }
  }

  async function alternarServidor(s: ServidorCadastrado, ativo: boolean) {
    try {
      await apiClient.patch(`/api/v1/ai/mcp-servers/${s.id}`, { ativo });
      toast.success(ativo ? t("Servidor ativado.") : t("Servidor desativado."));
      await recarregarTudo();
    } catch (err) {
      showApiError(err);
    }
  }

  async function alternarFerramenta(f: FerramentaExterna, ativa: boolean) {
    try {
      await apiClient.patch(`/api/v1/ai/external-tools/${f.id}`, { ativa });
      toast.success(ativa ? t("Ferramenta ativada.") : t("Ferramenta desativada."));
      await qc.invalidateQueries({ queryKey: CHAVE_PAI_DAS_FERRAMENTAS });
    } catch (err) {
      showApiError(err);
    }
  }

  async function apagar(s: ServidorCadastrado) {
    try {
      await apiClient.delete(`/api/v1/ai/mcp-servers/${s.id}`);
      toast.success(t("Servidor apagado."));
      setApagando(null);
      await recarregarTudo();
    } catch (err) {
      setApagando(null);
      showApiError(err);
    }
  }

  if (estado.isLoading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="mcp-carregando">
        {t("Carregando…")}
      </p>
    );
  }
  if (estado.isError || !estado.data) {
    return (
      <p role="alert" className="text-sm text-destructive" data-testid="mcp-erro">
        {t("Não foi possível carregar os servidores MCP. Recarregue a página.")}
      </p>
    );
  }

  // ── Desligado (o estado de toda instalação nova) ────────────────────────────
  if (!ligado) {
    return (
      <Card className="space-y-4 p-6" data-testid="mcp-desligado">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium">{t("Servidores MCP externos")}</h2>
            <Badge variant="outline" className="text-[11px]" data-testid="mcp-estado">
              {t("Desligado")}
            </Badge>
          </div>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Um servidor MCP é um sistema de terceiro que oferece ferramentas ao agente — consultar pedidos, criar tarefas, buscar um cadastro. Você conecta o servidor, escolhe quais ferramentas ele pode usar e, por padrão, cada uma que altera algo espera a sua aprovação na Central de avisos.",
            )}
          </p>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t("O sistema funciona normalmente sem isto. Enquanto estiver desligado, nenhum servidor é cadastrado nem chamado.")}
          </p>
        </div>

        {souAdmin ? (
          <div className="space-y-3 rounded-md border border-border/60 p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={aceitou}
                onChange={(e) => setAceitou(e.target.checked)}
                className="mt-1 h-4 w-4 rounded-md border-border accent-primary"
                data-testid="mcp-aceite"
              />
              <span>
                {t(
                  "Entendo que, ao ligar, o agente pode enviar aos servidores que eu cadastrar os dados que ele preencher ao usar uma ferramenta, e que o que eles responderem é tratado como informação, nunca como ordem.",
                )}
              </span>
            </label>
            <Button
              data-testid="mcp-ligar"
              disabled={alterando || (!aceitou && estado.data.aceite === null)}
              onClick={() => void mudarInterruptor({ ligado: true, ...(estado.data.aceite === null ? { aceitar: true as const } : {}) })}
            >
              {alterando ? t("Ligando…") : t("Ligar servidores MCP")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="mcp-so-admin">
            {t("Só um administrador da organização pode ligar este recurso.")}
          </p>
        )}
      </Card>
    );
  }

  // ── Ligado ──────────────────────────────────────────────────────────────────
  if (!souAdmin) {
    return (
      <Card className="space-y-2 p-6" data-testid="mcp-so-admin">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium">{t("Servidores MCP externos")}</h2>
          <Badge variant="outline" className="text-[11px]" data-testid="mcp-estado">
            {t("Ligado")}
          </Badge>
        </div>
        <p className="max-w-[65ch] text-sm text-muted-foreground">
          {t(
            "Os servidores MCP são cadastrados e escolhidos por um administrador. As ferramentas já escolhidas aparecem na tela do agente, no grupo «Ferramentas externas».",
          )}
        </p>
      </Card>
    );
  }

  const lista = servidores.data ?? [];
  const todas = ferramentas.data ?? [];

  return (
    <div className="space-y-5" data-testid="mcp-ligado">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]" data-testid="mcp-estado">
            {t("Ligado")}
          </Badge>
          <p className="text-sm text-muted-foreground">
            {lista.length === 0
              ? t("Nenhum servidor cadastrado ainda.")
              : `${lista.length} ${lista.length === 1 ? t("servidor") : t("servidores")}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="mcp-desligar" onClick={() => setDesligando(true)}>
            {t("Desligar")}
          </Button>
          <Button data-testid="novo-servidor" onClick={() => setFormulario({ aberto: true, editando: null })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {t("Adicionar servidor")}
          </Button>
        </div>
      </div>

      {servidores.isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : servidores.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {t("Não foi possível carregar os servidores MCP. Recarregue a página.")}
        </p>
      ) : lista.length === 0 ? (
        <Card className="space-y-2 p-6" data-testid="mcp-sem-servidor">
          <h2 className="text-base font-medium">{t("O agente ainda não usa nenhum servidor MCP")}</h2>
          <p className="max-w-[65ch] text-sm text-muted-foreground">
            {t(
              "Adicione o endereço do servidor (começa com https://) e, se ele pedir, a credencial. Depois você vê as ferramentas que ele oferece e escolhe quais o agente pode usar. A credencial é guardada cifrada e nunca é mostrada de novo.",
            )}
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lista.map((s) => {
            const dele = todas.filter((f) => f.mcp?.server_id === s.id);
            const teste = resultadoDoTeste[s.id];
            return (
              <li key={s.id}>
                <Card className="space-y-3 p-4" data-testid={`servidor-${s.id}`} data-ativo={s.active ? "sim" : "nao"}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-medium">{s.name}</h2>
                        {!s.active ? (
                          <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                            {t("Desativado")}
                          </Badge>
                        ) : null}
                        {s.last_check_ok === true ? (
                          <Badge variant="outline" className="text-[11px]" data-testid={`conexao-${s.id}`} data-ok="sim">
                            {t("Conectou")}
                          </Badge>
                        ) : s.last_check_ok === false ? (
                          <Badge variant="outline" className="border-destructive/40 text-[11px] text-destructive" data-testid={`conexao-${s.id}`} data-ok="nao">
                            {t("Não conectou")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]" data-testid={`conexao-${s.id}`} data-ok="nunca">
                            {t("Ainda não testado")}
                          </Badge>
                        )}
                      </div>
                      <p className="break-all text-xs text-muted-foreground">
                        {host(s.url)}
                        {s.server_name ? ` · ${s.server_name}${s.server_version ? ` ${s.server_version}` : ""}` : ""}
                        {" · "}
                        {s.has_credential ? `${t("credencial")} …${s.credential_last4}` : t("sem credencial")}
                        {" · "}
                        {s.tools_enabled} {s.tools_enabled === 1 ? t("ferramenta escolhida") : t("ferramentas escolhidas")}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={s.active}
                        onCheckedChange={(v) => void alternarServidor(s, v)}
                        aria-label={s.active ? t("Desativar") : t("Ativar")}
                        data-testid={`ativar-servidor-${s.id}`}
                      />
                      {s.active ? t("Ativo") : t("Desativado")}
                    </label>
                  </div>

                  {teste ? (
                    <p
                      role="status"
                      data-testid={`resultado-conexao-${s.id}`}
                      data-ok={teste.ok ? "sim" : "nao"}
                      className={`rounded-md border p-2 text-xs ${
                        teste.ok ? "border-success/40 bg-success-bg text-success-fg" : "border-destructive/40 bg-destructive/10 text-destructive"
                      }`}
                    >
                      {teste.texto}
                    </p>
                  ) : s.last_check_ok === false && s.last_check_reason ? (
                    <p className="text-xs text-muted-foreground">{t("O último teste de conexão não deu certo. Use «Testar conexão» para ver o motivo.")}</p>
                  ) : null}

                  {dele.length > 0 ? (
                    <ul className="divide-y divide-border/60 rounded-md border border-border/60" data-testid={`ferramentas-de-${s.id}`}>
                      {dele.map((f) => {
                        const pede = decidirSePedeAprovacao({ effect: f.effect, requireApproval: f.require_approval, modo: "ao_vivo" }).pede;
                        return (
                          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-2" data-testid={`ferramenta-mcp-${f.id}`}>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{f.name}</span>
                                <Badge variant="outline" className="text-[11px]">
                                  {t(ROTULO_DO_EFEITO[f.effect])}
                                </Badge>
                                <Badge variant="outline" className="text-[11px]">
                                  {pede ? t("Pede aprovação") : t("Executa direto")}
                                </Badge>
                                {!f.active ? (
                                  <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                                    {t("Desativada")}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="max-w-[65ch] text-xs text-muted-foreground">{f.when_to_use}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="secondary" data-testid={`testar-ferramenta-${f.id}`} onClick={() => setTestandoFerramenta(f)}>
                                {t("Testar de verdade")}
                              </Button>
                              <Switch
                                checked={f.active}
                                onCheckedChange={(v) => void alternarFerramenta(f, v)}
                                aria-label={f.active ? t("Desativar") : t("Ativar")}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`testar-conexao-${s.id}`}
                      disabled={testandoServidor === s.id}
                      onClick={() => void testarConexao(s)}
                    >
                      {testandoServidor === s.id ? t("Testando…") : t("Testar conexão")}
                    </Button>
                    <Button size="sm" data-testid={`escolher-ferramentas-${s.id}`} onClick={() => setEscolhendo(s)}>
                      {t("Escolher ferramentas")}
                    </Button>
                    <Button size="sm" variant="outline" data-testid={`editar-servidor-${s.id}`} onClick={() => setFormulario({ aberto: true, editando: s })}>
                      {t("Editar")}
                    </Button>
                    <Button size="sm" variant="ghost" data-testid={`apagar-servidor-${s.id}`} onClick={() => setApagando(s)}>
                      {t("Apagar")}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <FormularioDoServidorDialog
        aberto={formulario.aberto}
        editando={formulario.editando}
        onFechar={() => setFormulario({ aberto: false, editando: null })}
        onSalvo={recarregarTudo}
        onEscolherFerramentas={(s) => {
          setFormulario({ aberto: false, editando: null });
          setEscolhendo(s);
        }}
      />

      <EscolherFerramentasDialog
        servidor={escolhendo}
        onFechar={() => setEscolhendo(null)}
        onSalvo={recarregarTudo}
      />

      <TesteDaFerramentaDialog ferramenta={testandoFerramenta} onFechar={() => setTestandoFerramenta(null)} />

      <AlertDialog open={desligando} onOpenChange={(aberto) => (aberto ? null : setDesligando(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Desligar os servidores MCP?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Nada é apagado: os servidores, as credenciais e as ferramentas escolhidas ficam guardados. Mas o agente deixa de usar as ferramentas de servidores MCP, e um pedido de aprovação que esteja esperando não pode ser executado até você ligar de novo.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction data-testid="confirmar-desligar-mcp" onClick={() => void mudarInterruptor({ ligado: false })}>
              {t("Desligar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={apagando !== null} onOpenChange={(aberto) => (aberto ? null : setApagando(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Apagar este servidor?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "O servidor, a credencial guardada e as ferramentas escolhidas dele deixam de existir. Se algum agente já usou uma delas numa versão publicada, o sistema não deixa apagar — nesse caso, desative o servidor.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction data-testid="confirmar-apagar-servidor" onClick={() => apagando && void apagar(apagando)}>
              {t("Apagar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
