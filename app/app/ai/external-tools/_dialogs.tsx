"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
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
import { copyToClipboard } from "@/lib/clipboard";
import { urlDaFerramentaSchema } from "@/lib/ai/ferramentas-externas/esquema";
import type { FerramentaExterna } from "@/lib/ai/ferramentas-externas/repositorio";
import { decidirSePedeAprovacao } from "@/lib/ai/ferramentas-externas/aprovacao";
import {
  LIMITES_DA_FERRAMENTA,
  ROTULO_DO_TIPO,
  TIPOS_DE_PARAMETRO,
  VALIDADE_DO_PEDIDO_HORAS,
  type EfeitoDaFerramenta,
  type ParametroDaFerramenta,
  type TipoDeParametro,
} from "@/lib/ai/ferramentas-externas/tipos";
import { randomId } from "@/lib/random-id";

/** Mesmo visual do `Input`, para o `<select>` nativo (o repo usa o nativo onde a lista é curta). */
const CLASSE_DO_SELECT =
  "h-11 w-full rounded-md border border-border bg-transparent px-3 text-sm lg:h-9 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent";

// ─── Cadastro e edição ───────────────────────────────────────────────────────

interface FormularioProps {
  aberto: boolean;
  editando: FerramentaExterna | null;
  onFechar: () => void;
  /** `chave` só vem na criação (a chave nasce ali e aparece uma vez). */
  onSalvo: (resultado: { nome: string; chave: string | null }) => void | Promise<void>;
}

export function FormularioDaFerramentaDialog(props: FormularioProps) {
  const t = useT();
  return (
    <Dialog open={props.aberto} onOpenChange={(aberto) => (aberto ? null : props.onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{props.editando ? t("Editar ferramenta") : t("Nova ferramenta externa")}</DialogTitle>
          <DialogDescription>
            {t("O agente chama este endereço durante a conversa e usa a resposta como informação.")}
          </DialogDescription>
        </DialogHeader>
        {/* Monta SÓ aberto: o estado do formulário nasce limpo a cada abertura. */}
        {props.aberto ? <Formulario {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface CampoDoFormulario {
  nome: string;
  tipo: TipoDeParametro;
  descricao: string;
  obrigatorio: boolean;
}

function Formulario({ editando, onFechar, onSalvo }: FormularioProps) {
  const t = useT();
  const [nome, setNome] = useState(editando?.name ?? "");
  const [quandoUsar, setQuandoUsar] = useState(editando?.when_to_use ?? "");
  const [url, setUrl] = useState(editando?.url ?? "");
  const [campos, setCampos] = useState<CampoDoFormulario[]>(
    editando?.parameters.map((p) => ({ ...p })) ?? [],
  );
  const [efeito, setEfeito] = useState<EfeitoDaFerramenta>(editando?.effect ?? "consulta");
  // `null` = a pessoa nunca mexeu na chave: vale o padrão do efeito (altera pede aprovação).
  const [pedirAprovacao, setPedirAprovacao] = useState<boolean | null>(editando?.require_approval ?? null);
  const [validade, setValidade] = useState(String(editando?.approval_ttl_hours ?? VALIDADE_DO_PEDIDO_HORAS.padrao));
  const pede = decidirSePedeAprovacao({ effect: efeito, requireApproval: pedirAprovacao, modo: "ao_vivo" }).pede;
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Um clique duplo no "Salvar" reenvia a MESMA chave: o servidor cria uma ferramenta só.
  const chaveDeIdempotencia = useRef(randomId());

  function atualizarCampo(indice: number, mudanca: Partial<CampoDoFormulario>) {
    setCampos((atuais) => atuais.map((c, i) => (i === indice ? { ...c, ...mudanca } : c)));
  }

  /** A primeira coisa errada, em português. O servidor revalida tudo. */
  function conferir(): string | null {
    if (nome.trim().length < LIMITES_DA_FERRAMENTA.nome.min) return t("Dê um nome à ferramenta (ao menos 3 letras).");
    if (quandoUsar.trim().length < LIMITES_DA_FERRAMENTA.quandoUsar.min)
      return t("Explique em uma frase quando o agente deve usar esta ferramenta (ao menos 10 letras).");
    if (!urlDaFerramentaSchema.safeParse(url).success)
      return t("Informe um endereço completo que comece com https:// e sem usuário e senha.");
    const usados = new Set<string>();
    for (const c of campos) {
      if (!/^[a-z][a-z0-9_]*$/.test(c.nome))
        return t("O nome de cada campo usa só letras minúsculas sem acento, números e _ (ex.: codigo_produto).");
      if (usados.has(c.nome)) return t("Dois campos têm o mesmo nome.");
      usados.add(c.nome);
      if (c.descricao.trim().length < LIMITES_DA_FERRAMENTA.descricaoDoParametro.min)
        return t("Descreva cada campo para o agente saber o que preencher.");
    }
    const horas = Number(validade);
    if (pede && (!Number.isInteger(horas) || horas < VALIDADE_DO_PEDIDO_HORAS.min || horas > VALIDADE_DO_PEDIDO_HORAS.max))
      return t("A validade do pedido é de 1 a 168 horas.");
    return null;
  }

  async function salvar() {
    const problema = conferir();
    setErro(problema);
    if (problema) return;
    const corpo = {
      nome: nome.trim(),
      quando_usar: quandoUsar.trim(),
      url: url.trim(),
      parametros: campos.map<ParametroDaFerramenta>((c) => ({ ...c, descricao: c.descricao.trim() })),
      efeito,
      // Só vai a escolha EXPLÍCITA; sem ela o servidor guarda «padrão do efeito».
      ...(pedirAprovacao !== null ? { pedir_aprovacao: pedirAprovacao } : {}),
      ...(pede ? { validade_horas: Number(validade) } : {}),
    };
    setSalvando(true);
    try {
      if (editando) {
        await apiClient.patch(`/api/v1/ai/external-tools/${editando.id}`, corpo);
        toast.success(t("Ferramenta salva."));
        await onSalvo({ nome: corpo.nome, chave: null });
      } else {
        const res = await apiClient.post<{ data: { signing_secret: string | null } }>(
          "/api/v1/ai/external-tools",
          corpo,
          { idempotencyKey: chaveDeIdempotencia.current },
        );
        toast.success(t("Ferramenta cadastrada."));
        await onSalvo({ nome: corpo.nome, chave: res.data.signing_secret });
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form
      className="space-y-4"
      // As mensagens são nossas, em português e com o motivo: a validação nativa do navegador
      // (que fala no idioma dele e só aponta o campo) barraria o envio antes delas.
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void salvar();
      }}
      data-testid="formulario-da-ferramenta"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ft-nome">{t("Nome")}</Label>
        <Input
          id="ft-nome"
          value={nome}
          maxLength={LIMITES_DA_FERRAMENTA.nome.max}
          onChange={(e) => setNome(e.target.value)}
          placeholder={t("Ex.: Consultar estoque")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ft-quando">{t("Quando o agente deve usar")}</Label>
        <Textarea
          id="ft-quando"
          value={quandoUsar}
          maxLength={LIMITES_DA_FERRAMENTA.quandoUsar.max}
          onChange={(e) => setQuandoUsar(e.target.value)}
          rows={3}
          placeholder={t("Ex.: Quando o cliente perguntar se um produto está disponível.")}
        />
        <p className="text-xs text-muted-foreground">
          {t("É assim que o agente decide se chama esta ferramenta — escreva como instrução para uma pessoa.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ft-url">{t("Endereço (https)")}</Label>
        <Input
          id="ft-url"
          type="url"
          inputMode="url"
          value={url}
          maxLength={LIMITES_DA_FERRAMENTA.url.max}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://sistema.example.com/webhook"
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Por segurança, endereços da rede interna ou privada são recusados. Cada chamada leva uma assinatura que o outro sistema pode conferir.",
          )}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("Dados que o agente preenche")}</legend>
        <p className="text-xs text-muted-foreground">
          {t("Cada campo vira um espaço que o agente completa antes de chamar. Sem campos, a chamada vai sem dados.")}
        </p>
        {campos.map((c, i) => (
          <div
            key={i}
            data-testid={`campo-${i}`}
            className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-[1fr_9rem_auto]"
          >
            <div className="space-y-1">
              <Label htmlFor={`ft-c-nome-${i}`} className="text-xs">
                {t("Nome do campo")}
              </Label>
              <Input
                id={`ft-c-nome-${i}`}
                value={c.nome}
                maxLength={LIMITES_DA_FERRAMENTA.nomeDoParametro.max}
                onChange={(e) => atualizarCampo(i, { nome: e.target.value })}
                placeholder="produto"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ft-c-tipo-${i}`} className="text-xs">
                {t("Tipo")}
              </Label>
              <select
                id={`ft-c-tipo-${i}`}
                className={CLASSE_DO_SELECT}
                value={c.tipo}
                onChange={(e) => atualizarCampo(i, { tipo: e.target.value as TipoDeParametro })}
              >
                {TIPOS_DE_PARAMETRO.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {t(ROTULO_DO_TIPO[tipo])}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Remover campo")}
                onClick={() => setCampos((atuais) => atuais.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor={`ft-c-desc-${i}`} className="text-xs">
                {t("O que o agente coloca aqui")}
              </Label>
              <Input
                id={`ft-c-desc-${i}`}
                value={c.descricao}
                maxLength={LIMITES_DA_FERRAMENTA.descricaoDoParametro.max}
                onChange={(e) => atualizarCampo(i, { descricao: e.target.value })}
                placeholder={t("Ex.: Nome ou código do produto que o cliente citou")}
              />
              <label className="mt-1 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded-md border-border accent-primary"
                  checked={c.obrigatorio}
                  onChange={(e) => atualizarCampo(i, { obrigatorio: e.target.checked })}
                />
                {t("Obrigatório (o agente só chama com este campo preenchido)")}
              </label>
            </div>
          </div>
        ))}
        {campos.length < LIMITES_DA_FERRAMENTA.parametros.max ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="adicionar-campo"
            onClick={() =>
              setCampos((atuais) => [...atuais, { nome: "", tipo: "texto", descricao: "", obrigatorio: true }])
            }
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            {t("Adicionar campo")}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("O que a ferramenta faz no outro sistema")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="ft-efeito"
            value="consulta"
            checked={efeito === "consulta"}
            onChange={() => setEfeito("consulta")}
            className="mt-1 accent-primary"
          />
          <span>
            <strong>{t("Só consulta")}</strong> — {t("lê uma informação e devolve ao agente. Não muda nada lá.")}
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="ft-efeito"
            value="altera"
            checked={efeito === "altera"}
            onChange={() => setEfeito("altera")}
            className="mt-1 accent-primary"
          />
          <span>
            <strong>{t("Altera dados")}</strong> — {t("cria, muda ou apaga algo no outro sistema.")}
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-2 rounded-md border border-border/60 p-3" data-testid="aprovacao-da-ferramenta">
        <legend className="px-1 text-sm font-medium">{t("Aprovação antes de executar")}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={pede}
            onChange={(e) => setPedirAprovacao(e.target.checked)}
            className="mt-1 h-4 w-4 rounded-md border-border accent-primary"
            data-testid="pedir-aprovacao"
          />
          <span>
            <strong>{t("Pedir aprovação")}</strong> —{" "}
            {t("o agente só executa depois que uma pessoa aprovar na Central de avisos, uma única vez.")}
          </span>
        </label>
        {pede ? (
          <div className="space-y-1.5 pl-6">
            <Label htmlFor="ft-validade" className="text-xs">
              {t("Se ninguém decidir, o pedido expira em (horas)")}
            </Label>
            <Input
              id="ft-validade"
              type="number"
              inputMode="numeric"
              min={VALIDADE_DO_PEDIDO_HORAS.min}
              max={VALIDADE_DO_PEDIDO_HORAS.max}
              step={1}
              className="w-28"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              data-testid="validade-do-pedido"
            />
            <p className="text-xs text-muted-foreground">
              {t("O pedido aparece na Central de avisos com o que o agente quer fazer e os dados que ele preencheu.")}
            </p>
          </div>
        ) : efeito === "altera" ? (
          <p role="alert" data-testid="aviso-sem-aprovacao" className="pl-6 text-xs text-warning-fg">
            {t(
              "Sem aprovação, o agente executa esta ação sozinho assim que decidir usá-la. Se o outro sistema não responder, a ação não é repetida — para nunca ser feita em dobro.",
            )}
          </p>
        ) : null}
        <p className="pl-6 text-xs text-muted-foreground">
          {t("Com o agente em modo Assistido, toda ferramenta externa espera aprovação, qualquer que seja esta chave.")}
        </p>
      </fieldset>

      {erro ? (
        <p role="alert" data-testid="erro-do-formulario" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Cancelar")}
        </Button>
        <Button type="submit" disabled={salvando} data-testid="salvar-ferramenta">
          {salvando ? t("Salvando…") : editando ? t("Salvar") : t("Cadastrar")}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─── A chave de assinatura, mostrada uma vez ─────────────────────────────────

export function ChaveDaFerramentaDialog({
  dados,
  onFechar,
}: {
  dados: { nome: string; chave: string } | null;
  onFechar: () => void;
}) {
  const t = useT();
  async function copiar() {
    if (!dados) return;
    // `copyToClipboard` cobre o navegador fora de contexto seguro (instalação em http://IP).
    if (await copyToClipboard(dados.chave)) toast.success(t("Chave copiada."));
    else toast.error(t("Não consegui copiar. Selecione a chave e copie à mão."));
  }
  return (
    <Dialog open={dados !== null} onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="sm:max-w-xl" data-testid="chave-da-ferramenta">
        <DialogHeader>
          <DialogTitle>{t("Guarde a chave de assinatura")}</DialogTitle>
          <DialogDescription>
            {t("Por segurança, ela aparece só agora. Quem recebe a chamada usa esta chave para conferir que o pedido veio deste sistema.")}
          </DialogDescription>
        </DialogHeader>
        {dados ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{dados.nome}</p>
            <div className="flex gap-2">
              <Input readOnly value={dados.chave} aria-label={t("Chave de assinatura")} className="font-mono" data-testid="chave-em-claro" />
              <Button type="button" variant="secondary" onClick={() => void copiar()}>
                {t("Copiar")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Cada chamada traz o cabeçalho X-Webhook-Signature (t=carimbo,v1=assinatura), um HMAC-SHA256 de «carimbo.entrega.corpo» feito com esta chave. Se perder a chave, gere outra: a antiga deixa de valer na hora.",
              )}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <Button onClick={onFechar} data-testid="fechar-chave">
            {t("Já guardei")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Testar de verdade ───────────────────────────────────────────────────────

type ResultadoDoTeste =
  | {
      ok: true;
      http_status: number;
      content: string;
      truncated: boolean;
      attempts: number;
      duration_ms: number;
      sent: unknown;
    }
  | {
      ok: false;
      reason: string;
      message: string;
      http_status: number | null;
      attempts: number;
      duration_ms: number;
      sent: unknown;
    };

export function TesteDaFerramentaDialog({
  ferramenta,
  onFechar,
}: {
  ferramenta: FerramentaExterna | null;
  onFechar: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={ferramenta !== null} onOpenChange={(aberto) => (aberto ? null : onFechar())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="teste-da-ferramenta">
        <DialogHeader>
          <DialogTitle>{t("Testar de verdade")}</DialogTitle>
          <DialogDescription>
            {t("Isto faz uma chamada real ao endereço cadastrado, com os dados de exemplo que você escrever. Nada é enviado a nenhum cliente.")}
          </DialogDescription>
        </DialogHeader>
        {ferramenta ? <CorpoDoTeste key={ferramenta.id} ferramenta={ferramenta} onFechar={onFechar} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CorpoDoTeste({ ferramenta, onFechar }: { ferramenta: FerramentaExterna; onFechar: () => void }) {
  const t = useT();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDoTeste | null>(null);

  /** Os dados de exemplo no tipo que o campo declarou; vazio e opcional = não manda. */
  function argumentos(): Record<string, unknown> {
    const saida: Record<string, unknown> = {};
    for (const p of ferramenta.parameters) {
      const bruto = valores[p.nome] ?? "";
      if (p.tipo === "booleano") {
        if (bruto !== "") saida[p.nome] = bruto === "true";
        continue;
      }
      if (bruto.trim() === "") continue;
      saida[p.nome] = p.tipo === "texto" ? bruto : Number(bruto);
    }
    return saida;
  }

  async function executar() {
    setExecutando(true);
    setResultado(null);
    try {
      // Duas tentativas de até 8 s cada: o prazo do navegador precisa ser maior que o do servidor.
      const res = await apiClient.post<{ data: ResultadoDoTeste }>(
        `/api/v1/ai/external-tools/${ferramenta.id}/test`,
        { arguments: argumentos() },
        { timeoutMs: 45_000 },
      );
      setResultado(res.data);
    } catch (err) {
      showApiError(err);
    } finally {
      setExecutando(false);
    }
  }

  return (
    // `min-w-0`: o diálogo é uma grade, e uma resposta longa sem espaço (um JSON, um token) empurrava a
    // largura da coluna para além da borda — o botão "Fechar" saía da tela.
    <div className="min-w-0 space-y-4">
      <p className="text-sm font-medium">{ferramenta.name}</p>

      {ferramenta.effect === "altera" ? (
        <p role="alert" data-testid="aviso-altera-teste" className="rounded-md border border-warning/40 bg-warning-bg p-2 text-xs text-warning-fg">
          {t(
            "Esta ferramenta ALTERA dados no outro sistema. Chamar agora faz a alteração de verdade, com os dados de exemplo — sem pedir aprovação, porque quem clica aqui é você.",
          )}
        </p>
      ) : null}

      {ferramenta.parameters.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Esta ferramenta não tem campos: a chamada vai sem dados.")}</p>
      ) : (
        <div className="space-y-3">
          {ferramenta.parameters.map((p) => (
            <div key={p.nome} className="space-y-1">
              <Label htmlFor={`teste-${p.nome}`}>
                {p.nome} <span className="text-xs text-muted-foreground">({t(ROTULO_DO_TIPO[p.tipo])}{p.obrigatorio ? `, ${t("obrigatório")}` : ""})</span>
              </Label>
              {p.tipo === "booleano" ? (
                <select
                  id={`teste-${p.nome}`}
                  className={CLASSE_DO_SELECT}
                  value={valores[p.nome] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.nome]: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="true">{t("Sim")}</option>
                  <option value="false">{t("Não")}</option>
                </select>
              ) : (
                <Input
                  id={`teste-${p.nome}`}
                  type={p.tipo === "texto" ? "text" : "number"}
                  step={p.tipo === "inteiro" ? 1 : "any"}
                  value={valores[p.nome] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [p.nome]: e.target.value }))}
                />
              )}
              <p className="text-xs text-muted-foreground">{p.descricao}</p>
            </div>
          ))}
        </div>
      )}

      {resultado ? (
        <div
          role="status"
          data-testid="resultado-do-teste"
          data-ok={resultado.ok ? "sim" : "nao"}
          className={`min-w-0 space-y-2 overflow-hidden rounded-md border p-3 text-sm ${
            resultado.ok ? "border-success/40 bg-success-bg text-success-fg" : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {resultado.ok ? (
            <p>
              {t("Funcionou. O outro sistema respondeu")} {resultado.http_status} {t("em")} {resultado.duration_ms} ms.
            </p>
          ) : (
            <p>
              {t("Não funcionou.")} {resultado.message}
              {resultado.http_status ? ` (HTTP ${resultado.http_status})` : ""}
            </p>
          )}
          {resultado.ok ? (
            <div className="space-y-1 text-foreground">
              <p className="text-xs font-medium">
                {t("O que o outro sistema devolveu")}
                {resultado.truncated ? ` (${t("cortado")})` : ""}:
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs [overflow-wrap:anywhere]" data-testid="conteudo-do-teste">
                {resultado.content || t("(resposta vazia)")}
              </pre>
            </div>
          ) : null}
          <details className="text-xs text-foreground">
            <summary className="cursor-pointer text-muted-foreground">{t("O que foi enviado")}</summary>
            <pre className="mt-1 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono [overflow-wrap:anywhere]">
              {JSON.stringify(resultado.sent, null, 2)}
            </pre>
          </details>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onFechar}>
          {t("Fechar")}
        </Button>
        <Button type="button" disabled={executando} onClick={() => void executar()} data-testid="executar-teste">
          {executando ? t("Chamando…") : ferramenta.effect === "altera" ? t("Executar de verdade") : t("Chamar agora")}
        </Button>
      </DialogFooter>
    </div>
  );
}
