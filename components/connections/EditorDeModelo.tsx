"use client";
/**
 * O EDITOR BÁSICO DE MODELO DA API OFICIAL (issue #6).
 *
 * Corpo com variáveis numeradas (`{{1}}`) ou com nome (`{{nome}}`), exemplo de
 * cada variável, rodapé e botões de resposta rápida, link e copiar código — com
 * o preview ao lado, do jeito que o cliente vai ver, e o envio para aprovação.
 *
 * A tela NÃO decide o que é um modelo válido: ela chama `novoModeloSchema`, o
 * mesmo schema que a rota aplica, e `previewDoModelo`, a mesma função que o
 * teste mede. Regra reescrita aqui seria regra que diverge do servidor.
 *
 * Cabeçalho de mídia, carrossel, oferta e flow ficam para o editor avançado
 * (issue #7).
 */
import { Copy, ExternalLink, List, Plus, Reply, Trash2 } from "lucide-react";
import { Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitTemplate } from "@/hooks/channels/useTemplates";
import { useT } from "@/hooks/i18n/useT";
import {
  novoModeloSchema,
  previewDoModelo,
  variaveisDoTexto,
  type BotaoDoModelo,
  type MotivoDeRecusa,
  type NovoModelo,
} from "@/lib/channels/meta/novo-modelo";

/** O código de cada recusa conhecida, na frase que o operador lê. */
const FRASE_DO_MOTIVO: Record<MotivoDeRecusa, string> = {
  exemplo_obrigatorio: "Preencha um exemplo: a Meta exige exemplo de cada variável.",
  variaveis_fora_de_sequencia: "As variáveis numeradas precisam seguir a sequência 1, 2, 3…",
  variavel_posicional_esperada: "No formato numerado, as variáveis são {{1}}, {{2}}…",
  variavel_nomeada_invalida:
    "Nome de variável: letras minúsculas, números e _, começando por letra.",
  variavel_na_ponta: "A Meta não aceita variável no começo nem no fim do texto.",
  rodape_sem_variavel: "O rodapé não aceita variável.",
  url_https: "O link precisa começar com https://",
  variavel_de_url_no_fim: "A variável do link só pode ser {{1}}, no fim do endereço.",
  respostas_rapidas_juntas:
    "Deixe as respostas rápidas juntas, antes ou depois dos botões de link e de código.",
  botoes_de_url_demais: "No máximo 2 botões de link.",
  copiar_codigo_demais: "No máximo 1 botão de copiar código.",
  nome_invalido: "Use só letras minúsculas, números e _ (ex.: oferta_de_outubro).",
  idioma_invalido: "Escolha um idioma.",
};

interface Problema {
  campo: string;
  frase: string;
}

/** As recusas de um campo, logo abaixo dele. */
function Erros({ lista }: { lista: Problema[] }) {
  const t = useT();
  if (lista.length === 0) return null;
  return (
    <span className="mt-1 flex flex-col text-xs text-destructive" role="status">
      {lista.map((p, i) => (
        <span key={i}>{t(p.frase)}</span>
      ))}
    </span>
  );
}

/** As recusas do schema, já em frase. Recusa de formato genérica vira frase pelo tipo. */
function problemasDoEstado(estado: NovoModelo): Problema[] {
  const r = novoModeloSchema.safeParse(estado);
  if (r.success) return [];
  return r.error.issues.map((i) => {
    const campo = i.path.join(".");
    const conhecida = (FRASE_DO_MOTIVO as Record<string, string | undefined>)[i.message];
    if (conhecida) return { campo, frase: conhecida };
    if (i.code === "too_small") return { campo, frase: "Campo obrigatório." };
    if (i.code === "too_big") return { campo, frase: "Texto longo demais para este campo." };
    return { campo, frase: "Valor inválido." };
  });
}

const VAZIO: NovoModelo = {
  name: "",
  language: "pt_BR",
  category: "MARKETING",
  parameter_format: "POSITIONAL",
  body: "",
  examples: {},
  footer: null,
  buttons: [],
};

const SELECT = "mt-1 w-full rounded-md border bg-background p-2 text-sm";

/** O balão do WhatsApp, com o que o cliente vai ler. */
/**
 * A formatação que o WhatsApp aplica ao texto: `*negrito*`, `_itálico_` e
 * `~riscado~`, numa linha só e sem espaço colado no marcador — a mesma regra do
 * aplicativo, que deixa "2 * 3" como está.
 */
const MARCA_DO_WHATSAPP = /([*_~])(?=\S)([^*_~\n]*?\S)\1/g;

function formatado(texto: string): ReactNode[] {
  const out: ReactNode[] = [];
  let desde = 0;
  for (const m of texto.matchAll(MARCA_DO_WHATSAPP)) {
    if (m.index > desde) out.push(texto.slice(desde, m.index));
    const conteudo = m[2];
    out.push(
      m[1] === "*" ? (
        <strong key={m.index}>{conteudo}</strong>
      ) : m[1] === "_" ? (
        <em key={m.index}>{conteudo}</em>
      ) : (
        <s key={m.index}>{conteudo}</s>
      ),
    );
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) out.push(texto.slice(desde));
  return out;
}

/** Acima disto o WhatsApp mostra dois botões e esconde o resto atrás de "Ver todas as opções". */
const BOTOES_A_VISTA = 3;

function PreviewDoModeloView({ modelo }: { modelo: NovoModelo }) {
  const t = useT();
  const p = previewDoModelo(modelo);
  const icone = { QUICK_REPLY: Reply, URL: ExternalLink, COPY_CODE: Copy } as const;
  const botoes =
    p.botoes.length > BOTOES_A_VISTA
      ? [...p.botoes.slice(0, 2), { tipo: "VER_TODAS" as const, texto: "Ver todas as opções" }]
      : p.botoes;
  return (
    <div className="rounded-lg bg-muted p-3" data-testid="preview-do-modelo">
      <div className="rounded-lg bg-background shadow-sm">
        <p
          className="px-3 pt-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
          data-testid="preview-corpo"
        >
          {p.corpo ? (
            formatado(p.corpo).map((parte, i) => <Fragment key={i}>{parte}</Fragment>)
          ) : (
            <span className="text-muted-foreground">{t("O texto da mensagem aparece aqui.")}</span>
          )}
        </p>
        {p.rodape ? (
          <p className="px-3 pt-1 text-xs text-muted-foreground" data-testid="preview-rodape">
            {p.rodape}
          </p>
        ) : null}
        <p className="px-3 pt-1 pb-2 text-right text-[10px] text-muted-foreground">12:00</p>
        {p.botoes.length > 0 ? (
          <div className="flex flex-col border-t">
            {botoes.map((b, i) => {
              const Icone = b.tipo === "VER_TODAS" ? List : icone[b.tipo];
              return (
                <span
                  key={i}
                  className="flex items-center justify-center gap-1.5 border-b px-3 py-2 text-sm font-medium text-primary last:border-b-0"
                  data-testid="preview-botao"
                >
                  <Icone className="size-3.5" aria-hidden />
                  {b.tipo === "COPY_CODE" || b.tipo === "VER_TODAS" ? t(b.texto) : b.texto}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function botaoNovo(tipo: BotaoDoModelo["type"]): BotaoDoModelo {
  if (tipo === "QUICK_REPLY") return { type: "QUICK_REPLY", text: "" };
  if (tipo === "URL") return { type: "URL", text: "", url: "https://" };
  return { type: "COPY_CODE", example: "" };
}

export function EditorDeModelo({ onFechar }: { onFechar: () => void }) {
  const t = useT();
  const submeter = useSubmitTemplate();
  const [modelo, setModelo] = useState<NovoModelo>(VAZIO);
  const [tentou, setTentou] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const variaveis = useMemo(() => variaveisDoTexto(modelo.body), [modelo.body]);
  const problemas = useMemo(() => problemasDoEstado(modelo), [modelo]);
  const doCampo = (prefixo: string) =>
    tentou ? problemas.filter((p) => p.campo === prefixo || p.campo.startsWith(`${prefixo}.`)) : [];

  const mudar = (parcial: Partial<NovoModelo>) => setModelo((m) => ({ ...m, ...parcial }));
  const mudarBotao = (i: number, parcial: Partial<BotaoDoModelo>) =>
    setModelo((m) => ({
      ...m,
      buttons: m.buttons.map((b, j) => (j === i ? ({ ...b, ...parcial } as BotaoDoModelo) : b)),
    }));

  /**
   * Entra onde está o cursor. Colada sempre no fim, a variável caía na regra da
   * Meta que o próprio editor cobra (variável na ponta do texto).
   */
  function adicionarVariavel() {
    const proxima =
      modelo.parameter_format === "POSITIONAL"
        ? String(variaveis.filter((v) => /^\d+$/.test(v)).length + 1)
        : `variavel_${variaveis.length + 1}`;
    const campo = corpoRef.current;
    const texto = modelo.body;
    // O textarea guarda a seleção mesmo depois de o clique ir para o botão.
    const posicao = campo ? campo.selectionStart : texto.length;
    const antes = texto.slice(0, posicao);
    const depois = texto.slice(posicao);
    const separador = antes && !/\s$/.test(antes) && posicao === texto.length ? " " : "";
    mudar({ body: `${antes}${separador}{{${proxima}}}${depois}` });
  }

  async function enviar() {
    setTentou(true);
    if (problemas.length > 0) return;
    const r = await submeter.mutateAsync(modelo);
    toast.success(
      `${t("Modelo enviado para aprovação da Meta.")} ${t("Situação:")} ${r.data.status}`,
    );
    onFechar();
  }

  return (
    <Card className="p-4" data-testid="editor-de-modelo">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium">{t("Novo modelo")}</h2>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          {t("Cancelar")}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <label className="text-sm">
            {t("Nome do modelo")}
            <Input
              className="mt-1"
              value={modelo.name}
              placeholder="oferta_de_outubro"
              // A Meta só aceita minúsculas, números e _: o campo já escreve assim.
              onChange={(e) =>
                mudar({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, "_") })
              }
              data-testid="modelo-nome"
            />
            <Erros lista={doCampo("name")} />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              {t("Idioma")}
              <select
                className={SELECT}
                value={modelo.language}
                onChange={(e) => mudar({ language: e.target.value })}
                data-testid="modelo-idioma"
              >
                <option value="pt_BR">{t("Português (Brasil)")}</option>
                <option value="en_US">{t("Inglês (EUA)")}</option>
                <option value="es">{t("Espanhol")}</option>
              </select>
            </label>
            <label className="text-sm">
              {t("Categoria")}
              <select
                className={SELECT}
                value={modelo.category}
                onChange={(e) => mudar({ category: e.target.value as NovoModelo["category"] })}
                data-testid="modelo-categoria"
              >
                <option value="MARKETING">{t("Marketing")}</option>
                <option value="UTILITY">{t("Utilidade")}</option>
              </select>
            </label>
            <label className="text-sm">
              {t("Variáveis")}
              <select
                className={SELECT}
                value={modelo.parameter_format}
                onChange={(e) =>
                  mudar({ parameter_format: e.target.value as NovoModelo["parameter_format"] })
                }
                data-testid="modelo-formato"
              >
                <option value="POSITIONAL">{t("Numeradas")}</option>
                <option value="NAMED">{t("Com nome")}</option>
              </select>
            </label>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t(
              "A Meta cobra cada envio pela categoria e pode mudá-la na revisão — se mudar, você é avisado na Central.",
            )}
          </p>

          <label className="text-sm">
            {t("Texto da mensagem")}
            <Textarea
              className="mt-1 min-h-28"
              value={modelo.body}
              onChange={(e) => mudar({ body: e.target.value })}
              ref={corpoRef}
              data-testid="modelo-corpo"
            />
            <Erros lista={doCampo("body")} />
          </label>
          <div className="-mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={adicionarVariavel}
              data-testid="btn-variavel"
            >
              <Plus className="size-3.5" aria-hidden /> {t("Adicionar variável")}
            </Button>
          </div>

          {variaveis.length > 0 ? (
            <fieldset className="flex flex-col gap-2 rounded-md border p-3">
              <legend className="px-1 text-xs tracking-wide text-muted-foreground uppercase">
                {t("Exemplos para a revisão da Meta")}
              </legend>
              {variaveis.map((v) => (
                <label key={v} className="text-sm">
                  <span className="font-mono text-xs">{`{{${v}}}`}</span>
                  <Input
                    className="mt-1"
                    value={modelo.examples[v] ?? ""}
                    onChange={(e) =>
                      mudar({ examples: { ...modelo.examples, [v]: e.target.value } })
                    }
                    data-testid={`modelo-exemplo-${v}`}
                  />
                  <Erros lista={doCampo(`examples.${v}`)} />
                </label>
              ))}
            </fieldset>
          ) : null}

          <label className="text-sm">
            {t("Rodapé (opcional)")}
            <Input
              className="mt-1"
              value={modelo.footer ?? ""}
              onChange={(e) => mudar({ footer: e.target.value || null })}
              data-testid="modelo-rodape"
            />
            <Erros lista={doCampo("footer")} />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm">{t("Botões (opcional)")}</span>
            {modelo.buttons.map((b, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border p-3"
                data-testid="modelo-botao"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    {b.type === "QUICK_REPLY"
                      ? t("Resposta rápida")
                      : b.type === "URL"
                        ? t("Link")
                        : t("Copiar código")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t("Remover botão")}
                    onClick={() => mudar({ buttons: modelo.buttons.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>
                {b.type !== "COPY_CODE" ? (
                  <Input
                    aria-label={t("Texto do botão")}
                    placeholder={t("Texto do botão")}
                    value={b.text}
                    onChange={(e) => mudarBotao(i, { text: e.target.value })}
                    data-testid="botao-texto"
                  />
                ) : null}
                {b.type === "URL" ? (
                  <>
                    <Input
                      aria-label={t("Endereço do link")}
                      value={b.url}
                      onChange={(e) => mudarBotao(i, { url: e.target.value })}
                      data-testid="botao-url"
                    />
                    {/\{\{/.test(b.url) ? (
                      <Input
                        aria-label={t("Exemplo do final do link")}
                        placeholder={t("Exemplo do final do link")}
                        value={b.example ?? ""}
                        onChange={(e) => mudarBotao(i, { example: e.target.value })}
                        data-testid="botao-url-exemplo"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {t("Para um link diferente por cliente, termine o endereço com {{1}}.")}
                      </span>
                    )}
                  </>
                ) : null}
                {b.type === "COPY_CODE" ? (
                  <Input
                    aria-label={t("Código de exemplo")}
                    placeholder={t("Código de exemplo")}
                    value={b.example}
                    onChange={(e) => mudarBotao(i, { example: e.target.value })}
                    data-testid="botao-codigo"
                  />
                ) : null}
                <Erros lista={doCampo(`buttons.${i}`)} />
              </div>
            ))}
            <Erros lista={doCampo("buttons").filter((p) => p.campo === "buttons")} />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mudar({ buttons: [...modelo.buttons, botaoNovo("QUICK_REPLY")] })}
                data-testid="btn-add-resposta"
              >
                <Reply className="size-3.5" aria-hidden /> {t("Resposta rápida")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mudar({ buttons: [...modelo.buttons, botaoNovo("URL")] })}
                data-testid="btn-add-link"
              >
                <ExternalLink className="size-3.5" aria-hidden /> {t("Link")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => mudar({ buttons: [...modelo.buttons, botaoNovo("COPY_CODE")] })}
                data-testid="btn-add-codigo"
              >
                <Copy className="size-3.5" aria-hidden /> {t("Copiar código")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("Como o cliente vê")}
          </span>
          <PreviewDoModeloView modelo={modelo} />
          {tentou && problemas.length > 0 ? (
            <p
              className="text-sm text-destructive"
              role="status"
              data-testid="modelo-tem-problemas"
            >
              {t("Corrija os campos marcados antes de enviar.")}
            </p>
          ) : null}
          <Button onClick={enviar} disabled={submeter.isPending} data-testid="btn-enviar-modelo">
            {submeter.isPending ? t("Enviando…") : t("Enviar para aprovação")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t(
              "A Meta revisa o modelo, em geral em minutos. A situação se atualiza sozinha quando ela responder, sem precisar sincronizar.",
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
