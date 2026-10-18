"use client";
/**
 * Os diálogos da aba «Servidores MCP» (issue #96): cadastrar ou editar um servidor, e escolher quais
 * das ferramentas que ele oferece ficam disponíveis para os agentes.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { urlDaFerramentaSchema } from "@/lib/ai/ferramentas-externas/esquema";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import type { ServidorCadastrado } from "@/lib/ai/ferramentas-externas/mcp/repositorio";
import type { FerramentaDescoberta } from "@/lib/ai/ferramentas-externas/mcp/selecao";
import {
  CABECALHO_PADRAO_DA_CREDENCIAL,
  FRASE_DA_FERRAMENTA_NAO_SUPORTADA,
  FRASE_DO_CABECALHO_RECUSADO,
  LIMITES_DO_SERVIDOR,
  motivoDaRecusaDoCabecalho,
} from "@/lib/ai/ferramentas-externas/mcp/tipos";
import {
  LIMITES_DA_FERRAMENTA,
  ROTULO_DO_TIPO,
  type EfeitoDaFerramenta,
} from "@/lib/ai/ferramentas-externas/tipos";
import { randomId } from "@/lib/random-id";

// ─── Cadastro e edição do servidor ───────────────────────────────────────────

interface FormularioProps {
  aberto: boolean;
  editando: ServidorCadastrado | null;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
  /** Depois de cadastrar com sucesso, o caminho natural: ver as ferramentas que o servidor oferece. */
  onEscolherFerramentas: (servidor: ServidorCadastrado) => void;
}

type Conexao =
  | { ok: true; ferramentas_oferecidas: number; lista_incompleta: boolean }
  | { ok: false; motivo: string; http_status: number | null; message: string };

export function FormularioDoServidorDialog(props: FormularioProps) {
  const t = useT();
  return (
    <Dialog open={props.aberto} onOpenChange={(aberto) => (aberto ? null : props.onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="formulario-do-servidor">
        <DialogHeader>
          <DialogTitle>{props.editando ? t("Editar servidor MCP") : t("Adicionar servidor MCP")}</DialogTitle>
          <DialogDescription>
            {t("O sistema conecta ao servidor, mostra as ferramentas que ele oferece e deixa você escolher quais o agente pode usar.")}
          </DialogDescription>
        </DialogHeader>
        {/* Monta SÓ aberto: o estado do formulário nasce limpo a cada abertura. */}
        {props.aberto ? <Formulario {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ editando, onFechar, onSalvo, onEscolherFerramentas }: FormularioProps) {
  const t = useT();
  const [nome, setNome] = useState(editando?.name ?? "");
  const [url, setUrl] = useState(editando?.url ?? "");
  const [credencial, setCredencial] = useState("");
  const [removerCredencial, setRemoverCredencial] = useState(false);
  const cabecalhoAtual = editando?.auth_header ?? CABECALHO_PADRAO_DA_CREDENCIAL;
  const [outroCabecalho, setOutroCabecalho] = useState(cabecalhoAtual.toLowerCase() !== CABECALHO_PADRAO_DA_CREDENCIAL);
  const [nomeDoCabecalho, setNomeDoCabecalho] = useState(
    cabecalhoAtual.toLowerCase() !== CABECALHO_PADRAO_DA_CREDENCIAL ? cabecalhoAtual : "",
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Depois de cadastrar: o servidor e o resultado do teste de conexão que acompanha o cadastro. */
  const [cadastrado, setCadastrado] = useState<{ servidor: ServidorCadastrado; conexao: Conexao } | null>(null);
  // Uma chave por abertura: o duplo clique em «Cadastrar» não cria dois servidores.
  const [chaveDeIdempotencia] = useState(() => randomId());

  function validar(): { cabecalho: string } | null {
    if (nome.trim().length < LIMITES_DO_SERVIDOR.nome.min) {
      setErro(t("Dê um nome ao servidor (pelo menos 3 letras)."));
      return null;
    }
    if (!urlDaFerramentaSchema.safeParse(url).success) {
      setErro(t("Informe o endereço completo do servidor, começando com https:// e sem usuário e senha."));
      return null;
    }
    const cabecalho = outroCabecalho ? nomeDoCabecalho.trim() : CABECALHO_PADRAO_DA_CREDENCIAL;
    if (outroCabecalho) {
      const recusa = motivoDaRecusaDoCabecalho(cabecalho);
      if (recusa) {
        setErro(t(FRASE_DO_CABECALHO_RECUSADO[recusa]));
        return null;
      }
    }
    return { cabecalho };
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const ok = validar();
    if (!ok) return;
    setSalvando(true);
    try {
      if (!editando) {
        const res = await apiClient.post<{ data: ServidorCadastrado & { conexao: Conexao } }>(
          "/api/v1/ai/mcp-servers",
          {
            nome: nome.trim(),
            url: url.trim(),
            ...(credencial.trim() ? { credencial: credencial.trim() } : {}),
            cabecalho: ok.cabecalho,
          },
          // O cadastro já testa a conexão: o prazo do navegador precisa ser maior que o do servidor.
          { timeoutMs: 45_000, idempotencyKey: chaveDeIdempotencia },
        );
        const { conexao, ...servidor } = res.data;
        setCadastrado({ servidor, conexao });
        await onSalvo();
        return;
      }
      const patch: Record<string, unknown> = {};
      if (nome.trim() !== editando.name) patch.nome = nome.trim();
      if (url.trim() !== editando.url) patch.url = url.trim();
      if (ok.cabecalho.toLowerCase() !== editando.auth_header.toLowerCase()) patch.cabecalho = ok.cabecalho;
      if (removerCredencial) patch.credencial = null;
      else if (credencial.trim()) patch.credencial = credencial.trim();
      if (Object.keys(patch).length === 0) {
        onFechar();
        return;
      }
      await apiClient.patch(`/api/v1/ai/mcp-servers/${editando.id}`, patch);
      toast.success(t("Servidor salvo."));
      await onSalvo();
      onFechar();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  // ── Depois do cadastro: o resultado do teste, na hora ───────────────────────
  if (cadastrado) {
    const { servidor, conexao } = cadastrado;
    return (
      <div className="space-y-4" data-testid="servidor-cadastrado">
        <p className="text-sm font-medium">{servidor.name}</p>
        {conexao.ok ? (
          <p
            role="status"
            data-testid="cadastro-conectou"
            className="rounded-md border border-success/40 bg-success-bg p-3 text-sm text-success-fg"
          >
            {t("Conectou.")} {conexao.ferramentas_oferecidas}{" "}
            {conexao.ferramentas_oferecidas === 1 ? t("ferramenta oferecida pelo servidor.") : t("ferramentas oferecidas pelo servidor.")}
          </p>
        ) : (
          <div
            role="alert"
            data-testid="cadastro-nao-conectou"
            className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p className="font-medium">{t("O servidor foi salvo, mas a conexão não deu certo.")}</p>
            <p>{conexao.message}</p>
            <p className="text-xs">{t("Use «Editar» para corrigir o endereço ou a credencial e «Testar conexão» para tentar de novo.")}</p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFechar} data-testid="concluir-cadastro">
            {t("Concluir")}
          </Button>
          {conexao.ok ? (
            <Button type="button" onClick={() => onEscolherFerramentas(servidor)} data-testid="ir-escolher-ferramentas">
              {t("Escolher ferramentas")}
            </Button>
          ) : null}
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="srv-nome">{t("Nome do servidor")}</Label>
        <Input
          id="srv-nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={LIMITES_DO_SERVIDOR.nome.max}
          placeholder={t("Ex.: ERP da loja")}
          data-testid="servidor-nome"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="srv-url">{t("Endereço do servidor")}</Label>
        <Input
          id="srv-url"
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={LIMITES_DO_SERVIDOR.url.max}
          placeholder="https://"
          data-testid="servidor-url"
        />
        <p className="text-xs text-muted-foreground">
          {t("Precisa começar com https:// e ser um endereço público. Endereços da rede interna, privada ou local são recusados por segurança.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="srv-credencial">{t("Credencial (se o servidor pedir)")}</Label>
        <Input
          id="srv-credencial"
          type="password"
          autoComplete="new-password"
          value={credencial}
          onChange={(e) => setCredencial(e.target.value)}
          disabled={removerCredencial}
          maxLength={LIMITES_DO_SERVIDOR.credencial.max}
          placeholder={editando?.has_credential ? `${t("Guardada")} (…${editando.credential_last4}) — ${t("preencha só para trocar")}` : ""}
          data-testid="servidor-credencial"
        />
        <p className="text-xs text-muted-foreground">
          {t("É guardada cifrada e nunca é mostrada de novo — nem para você. Se perder, cadastre outra.")}
        </p>
        {editando?.has_credential ? (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={removerCredencial}
              onChange={(e) => setRemoverCredencial(e.target.checked)}
              className="h-4 w-4 rounded-md border-border accent-primary"
              data-testid="remover-credencial"
            />
            {t("Remover a credencial guardada")}
          </label>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("Como a credencial é enviada")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="srv-cabecalho"
            checked={!outroCabecalho}
            onChange={() => setOutroCabecalho(false)}
            className="mt-1 accent-primary"
          />
          <span>
            <strong>Authorization: Bearer</strong> — {t("o padrão da maioria dos servidores.")}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="srv-cabecalho"
            checked={outroCabecalho}
            onChange={() => setOutroCabecalho(true)}
            className="mt-1 accent-primary"
            data-testid="outro-cabecalho"
          />
          <span>
            <strong>{t("Outro cabeçalho")}</strong> — {t("o valor vai como está, sem «Bearer».")}
          </span>
        </label>
        {outroCabecalho ? (
          <Input
            aria-label={t("Nome do cabeçalho")}
            value={nomeDoCabecalho}
            onChange={(e) => setNomeDoCabecalho(e.target.value)}
            maxLength={LIMITES_DO_SERVIDOR.cabecalho.max}
            placeholder="X-API-Key"
            className="ml-6 w-64"
            data-testid="nome-do-cabecalho"
          />
        ) : null}
      </fieldset>

      {erro ? (
        <p role="alert" data-testid="erro-do-servidor" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={salvando} data-testid="salvar-servidor">
          {salvando ? (editando ? t("Salvando…") : t("Conectando…")) : editando ? t("Salvar") : t("Cadastrar e testar")}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── Escolher as ferramentas ─────────────────────────────────────────────────

interface EscolherProps {
  servidor: ServidorCadastrado | null;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}

type Descoberta =
  | { ok: true; server: { name: string | null; version: string | null }; list_incomplete: boolean; tools: FerramentaDescoberta[] }
  | { ok: false; reason: string; message: string; http_status: number | null };

export function EscolherFerramentasDialog({ servidor, onFechar, onSalvo }: EscolherProps) {
  const t = useT();
  return (
    <Dialog open={servidor !== null} onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="escolher-ferramentas">
        <DialogHeader>
          <DialogTitle>{t("Escolher ferramentas")}</DialogTitle>
          <DialogDescription>
            {t(
              "Marque as ferramentas que o agente pode usar. Cada uma começa como «Altera dados» e pede a sua aprovação — a anotação do servidor sobre ser só de leitura é uma dica, não vale como garantia.",
            )}
          </DialogDescription>
        </DialogHeader>
        {servidor ? <Descobrir key={servidor.id} servidor={servidor} onFechar={onFechar} onSalvo={onSalvo} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Descobrir({ servidor, onFechar, onSalvo }: { servidor: ServidorCadastrado; onFechar: () => void; onSalvo: () => void | Promise<void> }) {
  const t = useT();
  const consulta = useQuery({
    queryKey: ["ai", "mcp-servers", servidor.id, "tools"],
    queryFn: async () =>
      (await apiClient.get<{ data: Descoberta }>(`/api/v1/ai/mcp-servers/${servidor.id}/tools`, { timeoutMs: 45_000 })).data,
    // Sempre ao vivo: a lista é do servidor, não do cache.
    gcTime: 0,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (consulta.isLoading) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="descobrindo">
        {t("Conectando ao servidor e lendo as ferramentas…")}
      </p>
    );
  }
  if (consulta.isError || !consulta.data) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive" data-testid="descoberta-erro">
          {t("Não foi possível ler as ferramentas do servidor.")}
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFechar}>
            {t("Fechar")}
          </Button>
          <Button type="button" onClick={() => void consulta.refetch()}>
            {t("Tentar de novo")}
          </Button>
        </DialogFooter>
      </div>
    );
  }
  if (!consulta.data.ok) {
    return (
      <div className="space-y-3">
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" data-testid="descoberta-falhou">
          {consulta.data.message}
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onFechar}>
            {t("Fechar")}
          </Button>
          <Button type="button" onClick={() => void consulta.refetch()}>
            {t("Tentar de novo")}
          </Button>
        </DialogFooter>
      </div>
    );
  }
  return <Escolha servidor={servidor} descoberta={consulta.data} onFechar={onFechar} onSalvo={onSalvo} />;
}

interface EstadoDaFerramenta {
  escolhida: boolean;
  efeito: EfeitoDaFerramenta;
  /** `null` = o padrão do efeito (altera pede, consulta não). */
  pedirAprovacao: boolean | null;
  quandoUsar: string;
}

function Escolha({
  servidor,
  descoberta,
  onFechar,
  onSalvo,
}: {
  servidor: ServidorCadastrado;
  descoberta: Extract<Descoberta, { ok: true }>;
  onFechar: () => void;
  onSalvo: () => void | Promise<void>;
}) {
  const t = useT();
  const [estado, setEstado] = useState<Record<string, EstadoDaFerramenta>>(() =>
    Object.fromEntries(
      descoberta.tools.map((f) => [
        f.ferramenta,
        { escolhida: f.escolhida, efeito: f.efeito, pedirAprovacao: f.pedir_aprovacao, quandoUsar: f.quando_usar },
      ]),
    ),
  );
  const [filtro, setFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const atualizar = (nome: string, mudanca: Partial<EstadoDaFerramenta>) =>
    setEstado((e) => ({ ...e, [nome]: { ...e[nome]!, ...mudanca } }));

  const visiveis = descoberta.tools.filter((f) => {
    const q = filtro.trim().toLowerCase();
    return q === "" || f.ferramenta.toLowerCase().includes(q) || (f.titulo ?? "").toLowerCase().includes(q) || f.descricao.toLowerCase().includes(q);
  });
  const escolhidas = descoberta.tools.filter((f) => estado[f.ferramenta]?.escolhida);

  async function salvar() {
    setSalvando(true);
    try {
      await apiClient.put(
        `/api/v1/ai/mcp-servers/${servidor.id}/tools`,
        {
          ferramentas: escolhidas.map((f) => {
            const e = estado[f.ferramenta]!;
            return {
              ferramenta: f.ferramenta,
              efeito: e.efeito,
              ...(e.pedirAprovacao !== null ? { pedir_aprovacao: e.pedirAprovacao } : {}),
              ...(e.quandoUsar.trim().length >= LIMITES_DA_FERRAMENTA.quandoUsar.min ? { quando_usar: e.quandoUsar.trim() } : {}),
            };
          }),
        },
        { timeoutMs: 45_000 },
      );
      toast.success(t("Escolha salva."));
      await onSalvo();
      onFechar();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-xs text-muted-foreground" data-testid="resumo-da-descoberta">
        {descoberta.server.name ? `${descoberta.server.name}${descoberta.server.version ? ` ${descoberta.server.version}` : ""} · ` : ""}
        {descoberta.tools.length} {descoberta.tools.length === 1 ? t("ferramenta oferecida") : t("ferramentas oferecidas")}
        {descoberta.list_incomplete ? ` · ${t("a lista é maior do que a mostrada")}` : ""}
      </p>

      {descoberta.tools.length > 8 ? (
        <Input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={t("Buscar ferramenta…")}
          aria-label={t("Buscar ferramenta…")}
          data-testid="filtro-de-ferramentas"
        />
      ) : null}

      {descoberta.tools.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="servidor-sem-ferramentas">
          {t("Este servidor não oferece nenhuma ferramenta.")}
        </p>
      ) : (
        <ul className="space-y-2">
          {visiveis.map((f) => {
            const e = estado[f.ferramenta]!;
            const pede = decidirSePedeAprovacao({ effect: e.efeito, requireApproval: e.pedirAprovacao, modo: "ao_vivo" }).pede;
            const padraoDoEfeito = e.efeito === "altera";
            return (
              <li
                key={f.ferramenta}
                data-testid={`oferecida-${f.ferramenta}`}
                data-marcada={e.escolhida ? "sim" : "nao"}
                className={`space-y-2 rounded-md border p-3 ${f.suportada || f.sumiu_do_servidor ? "border-border/60" : "border-border/40 opacity-70"}`}
              >
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded-md border-border accent-primary"
                    checked={e.escolhida}
                    disabled={!f.suportada && !f.sumiu_do_servidor}
                    onChange={(ev) => atualizar(f.ferramenta, { escolhida: ev.target.checked })}
                    aria-label={f.titulo ?? f.ferramenta}
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{f.titulo ?? f.ferramenta}</span>
                      {f.titulo ? <span className="font-mono text-[11px] text-muted-foreground">{f.ferramenta}</span> : null}
                      {f.dica_somente_leitura === true ? (
                        <Badge variant="outline" className="text-[11px]" data-testid={`dica-${f.ferramenta}`}>
                          {t("O servidor diz: só lê")}
                        </Badge>
                      ) : null}
                      {f.mudou_no_servidor ? (
                        <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg" data-testid={`mudou-${f.ferramenta}`}>
                          {t("Mudou no servidor")}
                        </Badge>
                      ) : null}
                      {f.sumiu_do_servidor ? (
                        <Badge variant="outline" className="border-warning/40 text-[11px] text-warning-fg">
                          {t("O servidor não oferece mais")}
                        </Badge>
                      ) : null}
                    </span>
                    {f.descricao ? <span className="block max-w-[70ch] text-xs text-muted-foreground [overflow-wrap:anywhere]">{f.descricao}</span> : null}
                    {!f.suportada && f.motivo_nao_suportada ? (
                      <span className="block text-xs text-warning-fg" data-testid={`nao-suportada-${f.ferramenta}`}>
                        {t("O agente ainda não consegue usar esta ferramenta:")} {t(FRASE_DA_FERRAMENTA_NAO_SUPORTADA[f.motivo_nao_suportada])}
                      </span>
                    ) : null}
                  </span>
                </label>

                {e.escolhida && f.suportada ? (
                  <div className="space-y-3 border-t border-border/60 pt-3 pl-7">
                    {f.mudou_no_servidor ? (
                      <p className="text-xs text-warning-fg">
                        {t("O servidor mudou a descrição ou os campos desta ferramenta depois da sua escolha. O agente continua com a definição de antes; salve de novo para adotar a nova.")}
                      </p>
                    ) : null}

                    <fieldset className="space-y-1.5">
                      <legend className="text-xs font-medium">{t("O que ela faz no outro sistema")}</legend>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`efeito-${f.ferramenta}`}
                          checked={e.efeito === "altera"}
                          onChange={() => atualizar(f.ferramenta, { efeito: "altera", pedirAprovacao: null })}
                          className="mt-1 accent-primary"
                          data-testid={`efeito-altera-${f.ferramenta}`}
                        />
                        <span>
                          <strong>{t("Altera dados")}</strong> — {t("cria, muda ou apaga algo (o padrão).")}
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="radio"
                          name={`efeito-${f.ferramenta}`}
                          checked={e.efeito === "consulta"}
                          onChange={() => atualizar(f.ferramenta, { efeito: "consulta", pedirAprovacao: null })}
                          className="mt-1 accent-primary"
                          data-testid={`efeito-consulta-${f.ferramenta}`}
                        />
                        <span>
                          <strong>{t("Só consulta")}</strong> — {t("lê uma informação e devolve ao agente. Só marque se você tem certeza.")}
                        </span>
                      </label>
                    </fieldset>

                    <div className="space-y-1">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={pede}
                          onChange={(ev) => {
                            const quer = ev.target.checked;
                            atualizar(f.ferramenta, { pedirAprovacao: quer === padraoDoEfeito ? null : quer });
                          }}
                          className="mt-1 h-4 w-4 rounded-md border-border accent-primary"
                          data-testid={`pede-aprovacao-${f.ferramenta}`}
                        />
                        <span>
                          <strong>{t("Pedir aprovação")}</strong> — {t("o agente só executa depois que uma pessoa aprovar na Central de avisos, uma única vez.")}
                        </span>
                      </label>
                      {!pede && e.efeito === "altera" ? (
                        <p role="alert" className="pl-6 text-xs text-warning-fg">
                          {t("Sem aprovação, o agente executa esta ação sozinho assim que decidir usá-la. Se o servidor não responder, a ação não é repetida — para nunca ser feita em dobro.")}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`quando-${f.ferramenta}`} className="text-xs">
                        {t("Quando o agente deve usar")}
                      </Label>
                      <Textarea
                        id={`quando-${f.ferramenta}`}
                        rows={2}
                        maxLength={LIMITES_DA_FERRAMENTA.quandoUsar.max}
                        value={e.quandoUsar}
                        onChange={(ev) => atualizar(f.ferramenta, { quandoUsar: ev.target.value })}
                        data-testid={`quando-usar-${f.ferramenta}`}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("Este texto vem do servidor e é o que o agente lê para decidir. Revise: edite o que não for verdade ou for estranho.")}
                      </p>
                    </div>

                    {f.campos.length > 0 ? (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          {f.campos.length} {f.campos.length === 1 ? t("campo que o agente preenche") : t("campos que o agente preenche")}
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {f.campos.map((c) => (
                            <li key={c.nome} className="[overflow-wrap:anywhere]">
                              <span className="font-mono">{c.nome}</span> ({t(ROTULO_DO_TIPO[c.tipo])}
                              {c.obrigatorio ? `, ${t("obrigatório")}` : ""}) — {c.descricao}
                            </li>
                          ))}
                        </ul>
                        {f.campos_ignorados.length > 0 ? (
                          <p className="mt-1 text-muted-foreground">
                            {t("Ficaram de fora, por serem listas ou objetos (opcionais):")} {f.campos_ignorados.join(", ")}
                          </p>
                        ) : null}
                      </details>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t("Esta ferramenta não tem campos: o agente chama sem dados.")}</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Cancelar")}
        </Button>
        <Button type="button" disabled={salvando} onClick={() => void salvar()} data-testid="salvar-escolha">
          {salvando
            ? t("Salvando…")
            : `${t("Salvar escolha")} (${escolhidas.length})`}
        </Button>
      </DialogFooter>
    </div>
  );
}
