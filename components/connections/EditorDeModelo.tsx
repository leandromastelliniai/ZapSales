"use client";
/**
 * O EDITOR DE MODELO DA API OFICIAL (issues #6 e #7).
 *
 * Três tipos de modelo:
 *
 * - **Padrão** — cabeçalho de mídia opcional (imagem, vídeo ou documento),
 *   corpo com variáveis numeradas (`{{1}}`) ou com nome (`{{nome}}`), exemplo
 *   de cada variável, rodapé e botões de resposta rápida, link, copiar código e
 *   flow.
 * - **Carrossel** — a mensagem e de 2 a 10 cards, cada um com mídia, corpo e
 *   botões. Todos os cards com a mesma mídia e os mesmos botões: o card novo já
 *   nasce com os botões do anterior.
 * - **Oferta por tempo limitado** — só marketing: texto da oferta, prazo
 *   opcional, cupom e link.
 *
 * O preview fica ao lado, do jeito que o cliente vai ver, e o envio vai para
 * aprovação. A tela NÃO decide o que é um modelo válido: ela chama
 * `novoModeloSchema`, o mesmo schema que a rota aplica, e `previewDoModelo`, a
 * mesma função que o teste mede. Regra reescrita aqui seria regra que diverge do
 * servidor.
 */
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitTemplate } from "@/hooks/channels/useTemplates";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";
import {
  MIDIAS_DO_CABECALHO,
  novoModeloSchema,
  variaveisDoTexto,
  type BotaoDoModelo,
  type CabecalhoDoModelo,
  type CardDoModelo,
  type FormatoDeMidia,
  type MotivoDeRecusa,
  type NovoModelo,
  type TipoDeModelo,
} from "@/lib/channels/meta/novo-modelo";

import { CampoDeMidia } from "./CampoDeMidia";
import { EditorDeBotoes } from "./EditorDeBotoes";
import { PreviewDoModeloView } from "./PreviewDoModeloView";

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
  midia_obrigatoria: "Escolha o arquivo do cabeçalho.",
  midia_de_outro_formato: "O arquivo não é do formato escolhido. Envie outro.",
  flow_id_invalido: "O ID do flow é só números (veja no WhatsApp Manager › Flows).",
  flow_demais: "No máximo 1 botão de flow.",
  tela_do_flow_obrigatoria: "Diga a tela do flow em que o botão abre.",
  nao_se_aplica_ao_tipo: "Este campo não existe neste tipo de modelo.",
  cards_de_2_a_10: "O carrossel precisa ter de 2 a 10 cards.",
  cards_com_a_mesma_midia:
    "Todos os cards precisam ter a mesma mídia (todos imagem ou todos vídeo).",
  cards_com_os_mesmos_botoes:
    "Todos os cards precisam ter os mesmos botões, do mesmo tipo e na mesma ordem.",
  card_midia_imagem_ou_video: "O card aceita imagem ou vídeo.",
  card_sem_botao: "Cada card precisa de pelo menos 1 botão.",
  botao_fora_do_card: "O card aceita até 2 botões, de resposta rápida ou link.",
  oferta_so_marketing: "Oferta por tempo limitado só existe na categoria Marketing.",
  oferta_obrigatoria: "Escreva o texto da oferta.",
  oferta_midia_imagem_ou_video: "A oferta aceita imagem ou vídeo no cabeçalho.",
  corpo_da_oferta_longo: "Na oferta, o texto da mensagem tem até 600 caracteres.",
  oferta_precisa_de_link: "A oferta precisa de exatamente 1 botão de link.",
  oferta_com_prazo_pede_codigo: "Oferta com prazo precisa do botão de copiar código.",
  oferta_so_codigo_e_link: "A oferta aceita só 1 botão de copiar código e 1 de link.",
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

/**
 * Os campos cuja mídia a rota recusou por não estar mais guardada (422
 * `midia_indisponivel`, issue #30) — vazio para qualquer outra recusa.
 */
function camposDeMidiaIndisponivel(err: unknown): Set<string> {
  if (!(err instanceof ApiError) || err.status !== 422) return new Set();
  const problemas = (err.details as { problemas?: unknown } | undefined)?.problemas;
  if (!Array.isArray(problemas)) return new Set();
  return new Set(
    problemas
      .filter((p): p is { campo: string; motivo: string } =>
        Boolean(p && typeof p === "object" && "campo" in p && "motivo" in p),
      )
      .filter((p) => p.motivo === "midia_indisponivel")
      .map((p) => p.campo),
  );
}

const VAZIO: NovoModelo = {
  kind: "STANDARD",
  name: "",
  language: "pt_BR",
  category: "MARKETING",
  parameter_format: "POSITIONAL",
  header: null,
  offer: null,
  body: "",
  examples: {},
  footer: null,
  buttons: [],
  cards: [],
};

const SELECT = "mt-1 w-full rounded-md border bg-background p-2 text-sm";

const TIPOS: Array<{ valor: TipoDeModelo; rotulo: string; dica: string }> = [
  { valor: "STANDARD", rotulo: "Padrão", dica: "Texto, mídia opcional e botões." },
  { valor: "CAROUSEL", rotulo: "Carrossel", dica: "De 2 a 10 cards com mídia e botões." },
  {
    valor: "LIMITED_TIME_OFFER",
    rotulo: "Oferta por tempo limitado",
    dica: "Cupom e contagem regressiva. Só marketing.",
  },
];

const ROTULO_DO_FORMATO: Record<FormatoDeMidia, string> = {
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  DOCUMENT: "Documento",
};

/** Os botões que cada lugar aceita. */
const BOTOES_DO_PADRAO = ["QUICK_REPLY", "URL", "COPY_CODE", "FLOW"] as const;
const BOTOES_DA_OFERTA = ["COPY_CODE", "URL"] as const;
const BOTOES_DO_CARD = ["QUICK_REPLY", "URL"] as const;

/** Troca o formato do cabeçalho; o arquivo só fica se for do formato novo. */
function comFormato(c: CabecalhoDoModelo, format: FormatoDeMidia): CabecalhoDoModelo {
  const serve = c.media && MIDIAS_DO_CABECALHO[c.media.mime_type].formato === format;
  return { format, media: serve ? c.media : null };
}

function cardNovo(anterior: CardDoModelo | undefined): CardDoModelo {
  return {
    // A Meta exige a mesma mídia e os mesmos botões em todos os cards: o card
    // novo já nasce assim, e o operador só troca o arquivo, o texto e os links.
    header: { format: anterior?.header.format ?? "IMAGE", media: null },
    body: "",
    examples: {},
    buttons: anterior
      ? anterior.buttons.map((b) => ({ ...b }))
      : [{ type: "QUICK_REPLY", text: "" }],
  };
}

/**
 * Trocar de tipo limpa o que não existe no tipo novo — o que sobrasse viraria
 * recusa num campo que a tela nem mostra mais.
 */
function paraOTipo(m: NovoModelo, kind: TipoDeModelo): NovoModelo {
  if (kind === "CAROUSEL") {
    const primeiro = cardNovo(undefined);
    return {
      ...m,
      kind,
      header: null,
      offer: null,
      footer: null,
      buttons: [],
      cards: m.cards.length > 0 ? m.cards : [primeiro, cardNovo(primeiro)],
    };
  }
  if (kind === "LIMITED_TIME_OFFER") {
    const botoes: BotaoDoModelo[] = m.buttons.filter(
      (b) => b.type === "COPY_CODE" || b.type === "URL",
    );
    if (!botoes.some((b) => b.type === "COPY_CODE"))
      botoes.unshift({ type: "COPY_CODE", example: "" });
    if (!botoes.some((b) => b.type === "URL"))
      botoes.push({ type: "URL", text: "", url: "https://" });
    return {
      ...m,
      kind,
      category: "MARKETING",
      header: m.header?.format === "DOCUMENT" ? null : m.header,
      offer: m.offer ?? { text: "", has_expiration: true },
      footer: null,
      buttons: botoes,
      cards: [],
    };
  }
  return { ...m, kind, offer: null, cards: [] };
}

export function EditorDeModelo({ onFechar }: { onFechar: () => void }) {
  const t = useT();
  const submeter = useSubmitTemplate();
  const [modelo, setModelo] = useState<NovoModelo>(VAZIO);
  /** Link assinado do preview de cada mídia enviada, pelo caminho da cópia. */
  const [links, setLinks] = useState<Record<string, string>>({});
  const [tentou, setTentou] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  const variaveis = useMemo(() => variaveisDoTexto(modelo.body), [modelo.body]);
  const problemas = useMemo(() => problemasDoEstado(modelo), [modelo]);
  const doCampo = (prefixo: string) =>
    tentou ? problemas.filter((p) => p.campo === prefixo || p.campo.startsWith(`${prefixo}.`)) : [];
  const exato = (campo: string) => (tentou ? problemas.filter((p) => p.campo === campo) : []);
  /**
   * As recusas para o editor de botões: `buttons.<i>` leva tudo do botão; o
   * grupo (`buttons`) só o que é do conjunto, sem repetir as de cada botão.
   */
  const errosDosBotoes = (base: string) => (campo: string) => (
    <Erros lista={/\.\d+$/.test(campo) ? doCampo(`${base}${campo}`) : exato(`${base}${campo}`)} />
  );

  const mudar = (parcial: Partial<NovoModelo>) => setModelo((m) => ({ ...m, ...parcial }));
  const mudarCard = (i: number, parcial: Partial<CardDoModelo>) =>
    setModelo((m) => ({
      ...m,
      cards: m.cards.map((c, j) => (j === i ? { ...c, ...parcial } : c)),
    }));
  const guardarLink = (path: string, link: string) => setLinks((l) => ({ ...l, [path]: link }));

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
    let r: Awaited<ReturnType<typeof submeter.mutateAsync>>;
    try {
      r = await submeter.mutateAsync(modelo);
    } catch (err) {
      // O aviso da recusa já saiu pelo `onError` do hook. Aqui só o arquivo
      // que saiu do armazenamento (issue #30): o caminho velho deixa o estado,
      // e o campo volta a pedir o arquivo em vez de repetir a mesma recusa.
      esquecerMidiasIndisponiveis(err);
      return;
    }
    toast.success(
      `${t("Modelo enviado para aprovação da Meta.")} ${t("Situação:")} ${r.data.status}`,
    );
    onFechar();
  }

  function esquecerMidiasIndisponiveis(err: unknown) {
    const campos = camposDeMidiaIndisponivel(err);
    if (campos.size === 0) return;
    setModelo((m) => ({
      ...m,
      header: m.header && campos.has("header.media") ? { ...m.header, media: null } : m.header,
      cards: m.cards.map((c, i) =>
        campos.has(`cards.${i}.header.media`) ? { ...c, header: { ...c.header, media: null } } : c,
      ),
    }));
  }

  const carrossel = modelo.kind === "CAROUSEL";
  const oferta = modelo.kind === "LIMITED_TIME_OFFER";
  const formatosDoCabecalho: FormatoDeMidia[] = oferta
    ? ["IMAGE", "VIDEO"]
    : ["IMAGE", "VIDEO", "DOCUMENT"];

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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm">{t("Tipo de modelo")}</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {TIPOS.map((tipo) => (
                <label
                  key={tipo.valor}
                  className={`flex cursor-pointer flex-col gap-0.5 rounded-md border p-2 text-sm ${
                    modelo.kind === tipo.valor ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium">
                    <input
                      type="radio"
                      name="tipo-de-modelo"
                      value={tipo.valor}
                      checked={modelo.kind === tipo.valor}
                      onChange={() => setModelo((m) => paraOTipo(m, tipo.valor))}
                      data-testid={`modelo-tipo-${tipo.valor}`}
                    />
                    {t(tipo.rotulo)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(tipo.dica)}</span>
                </label>
              ))}
            </div>
          </fieldset>

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
                {oferta ? null : <option value="UTILITY">{t("Utilidade")}</option>}
              </select>
              <Erros lista={doCampo("category")} />
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

          {!carrossel ? (
            <div className="flex flex-col gap-2 text-sm">
              <span>{t("Cabeçalho de mídia (opcional)")}</span>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {([null, ...formatosDoCabecalho] as const).map((f) => (
                  <label key={f ?? "nenhum"} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="formato-do-cabecalho"
                      checked={(modelo.header?.format ?? null) === f}
                      onChange={() =>
                        mudar({
                          header: f
                            ? comFormato(modelo.header ?? { format: f, media: null }, f)
                            : null,
                        })
                      }
                      data-testid={`modelo-cabecalho-${f ?? "nenhum"}`}
                    />
                    {f ? t(ROTULO_DO_FORMATO[f]) : t("Nenhum")}
                  </label>
                ))}
              </div>
              {modelo.header ? (
                <CampoDeMidia
                  cabecalho={modelo.header}
                  onMudar={(header) => mudar({ header })}
                  onLink={guardarLink}
                  testId="modelo-cabecalho-midia"
                />
              ) : null}
              <Erros lista={doCampo("header")} />
            </div>
          ) : null}

          {oferta && modelo.offer ? (
            <fieldset className="flex flex-col gap-2 rounded-md border p-3">
              <legend className="px-1 text-xs tracking-wide text-muted-foreground uppercase">
                {t("Oferta")}
              </legend>
              <label className="text-sm">
                {t("Texto da oferta (até 16 caracteres)")}
                <Input
                  className="mt-1"
                  value={modelo.offer.text}
                  maxLength={16}
                  placeholder={t("Só hoje!")}
                  onChange={(e) => mudar({ offer: { ...modelo.offer!, text: e.target.value } })}
                  data-testid="modelo-oferta-texto"
                />
                <Erros lista={doCampo("offer")} />
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={modelo.offer.has_expiration}
                  onChange={(e) =>
                    mudar({ offer: { ...modelo.offer!, has_expiration: e.target.checked } })
                  }
                  data-testid="modelo-oferta-prazo"
                />
                <span>
                  {t("Mostrar o prazo da oferta (contagem regressiva)")}
                  <span className="block text-xs text-muted-foreground">
                    {t(
                      "O fim da oferta é informado em cada envio. Com prazo, o botão de copiar código é obrigatório.",
                    )}
                  </span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <label className="text-sm">
            {carrossel ? t("Texto da mensagem (acima dos cards)") : t("Texto da mensagem")}
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
            <Exemplos
              variaveis={variaveis}
              exemplos={modelo.examples}
              onMudar={(examples) => mudar({ examples })}
              erros={(v) => <Erros lista={doCampo(`examples.${v}`)} />}
              testId="modelo-exemplo"
            />
          ) : null}

          {!carrossel && !oferta ? (
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
          ) : null}

          {!carrossel ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm">{oferta ? t("Botões") : t("Botões (opcional)")}</span>
              <EditorDeBotoes
                botoes={modelo.buttons}
                tipos={oferta ? BOTOES_DA_OFERTA : BOTOES_DO_PADRAO}
                onMudar={(buttons) => mudar({ buttons })}
                erros={errosDosBotoes("")}
              />
            </div>
          ) : (
            <EditorDeCards
              modelo={modelo}
              mudarCard={mudarCard}
              onMudarCards={(cards) => mudar({ cards })}
              onLink={guardarLink}
              doCampo={doCampo}
              errosDosBotoes={errosDosBotoes}
            />
          )}
        </div>

        <div className="flex flex-col gap-3 md:sticky md:top-4 md:self-start">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("Como o cliente vê")}
          </span>
          <PreviewDoModeloView modelo={modelo} links={links} />
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

/** Os exemplos das variáveis de um texto — do corpo do modelo ou de um card. */
function Exemplos({
  variaveis,
  exemplos,
  onMudar,
  erros,
  testId,
}: {
  variaveis: string[];
  exemplos: Record<string, string>;
  onMudar: (exemplos: Record<string, string>) => void;
  erros: (variavel: string) => ReactNode;
  testId: string;
}) {
  const t = useT();
  return (
    <fieldset className="flex flex-col gap-2 rounded-md border p-3">
      <legend className="px-1 text-xs tracking-wide text-muted-foreground uppercase">
        {t("Exemplos para a revisão da Meta")}
      </legend>
      {variaveis.map((v) => (
        <label key={v} className="text-sm">
          <span className="font-mono text-xs">{`{{${v}}}`}</span>
          <Input
            className="mt-1"
            value={exemplos[v] ?? ""}
            onChange={(e) => onMudar({ ...exemplos, [v]: e.target.value })}
            data-testid={`${testId}-${v}`}
          />
          {erros(v)}
        </label>
      ))}
    </fieldset>
  );
}

const MAXIMO_DE_CARDS = 10;

/** Os cards do carrossel: a mídia comum a todos, e cada card com arquivo, texto e botões. */
function EditorDeCards({
  modelo,
  mudarCard,
  onMudarCards,
  onLink,
  doCampo,
  errosDosBotoes,
}: {
  modelo: NovoModelo;
  mudarCard: (i: number, parcial: Partial<CardDoModelo>) => void;
  onMudarCards: (cards: CardDoModelo[]) => void;
  onLink: (path: string, link: string) => void;
  doCampo: (prefixo: string) => Problema[];
  errosDosBotoes: (base: string) => (campo: string) => ReactNode;
}) {
  const t = useT();
  const formato = modelo.cards[0]?.header.format ?? "IMAGE";
  const deFora = doCampo("cards").filter((p) => p.campo === "cards");

  return (
    <div className="flex flex-col gap-3" data-testid="editor-de-cards">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{t("Mídia dos cards")}</span>
        {(["IMAGE", "VIDEO"] as const).map((f) => (
          <label key={f} className="flex items-center gap-1.5">
            <input
              type="radio"
              name="formato-dos-cards"
              checked={formato === f}
              onChange={() =>
                onMudarCards(modelo.cards.map((c) => ({ ...c, header: comFormato(c.header, f) })))
              }
              data-testid={`cards-formato-${f}`}
            />
            {t(ROTULO_DO_FORMATO[f])}
          </label>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {t(
          "A Meta exige a mesma mídia e os mesmos botões em todos os cards; o texto e os links mudam.",
        )}
      </p>

      {modelo.cards.map((card, i) => {
        const prefixo = `cards.${i}`;
        const variaveis = variaveisDoTexto(card.body);
        return (
          <fieldset
            key={i}
            className="flex flex-col gap-3 rounded-md border p-3"
            data-testid="modelo-card"
          >
            <legend className="flex items-center gap-2 px-1 text-xs tracking-wide text-muted-foreground uppercase">
              {t("Card")} {i + 1}
              {modelo.cards.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("Remover card")}
                  onClick={() => onMudarCards(modelo.cards.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              ) : null}
            </legend>
            <div>
              <CampoDeMidia
                cabecalho={card.header}
                onMudar={(header) => mudarCard(i, { header })}
                onLink={onLink}
                testId={`card-${i}-midia`}
              />
              <Erros lista={doCampo(`${prefixo}.header`)} />
            </div>
            <label className="text-sm">
              {t("Texto do card (até 160 caracteres)")}
              <Textarea
                className="mt-1 min-h-16"
                value={card.body}
                maxLength={160}
                onChange={(e) => mudarCard(i, { body: e.target.value })}
                data-testid={`card-${i}-corpo`}
              />
              <Erros lista={doCampo(`${prefixo}.body`)} />
            </label>
            {variaveis.length > 0 ? (
              <Exemplos
                variaveis={variaveis}
                exemplos={card.examples}
                onMudar={(examples) => mudarCard(i, { examples })}
                erros={(v) => <Erros lista={doCampo(`${prefixo}.examples.${v}`)} />}
                testId={`card-${i}-exemplo`}
              />
            ) : null}
            <EditorDeBotoes
              botoes={card.buttons}
              tipos={BOTOES_DO_CARD}
              onMudar={(buttons) => mudarCard(i, { buttons })}
              erros={errosDosBotoes(`${prefixo}.`)}
              prefixo={`card-${i}-`}
            />
          </fieldset>
        );
      })}

      <Erros lista={deFora} />
      {modelo.cards.length < MAXIMO_DE_CARDS ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onMudarCards([...modelo.cards, cardNovo(modelo.cards.at(-1))])}
            data-testid="btn-add-card"
          >
            <Plus className="size-3.5" aria-hidden /> {t("Adicionar card")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
