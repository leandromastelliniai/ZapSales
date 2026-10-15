"use client";
/**
 * O EDITOR DE MODELO DA API OFICIAL (issues #6 e #7, e o editor completo).
 *
 * O desenho é o de uma página de modelo de mensagem, em três colunas:
 *
 * - **à esquerda**, o que vale para o modelo inteiro: nome, categoria (Marketing
 *   ou Utilidade), tipo, formato das variáveis e os **idiomas** — cada idioma é
 *   uma versão do mesmo modelo, com a própria mensagem, e "Novo idioma" parte de
 *   uma cópia da versão aberta para ser traduzida;
 * - **no meio**, a mensagem do idioma aberto: cabeçalho (texto, imagem, vídeo ou
 *   arquivo), o texto com as **variáveis destacadas**, o exemplo de cada uma,
 *   rodapé e botões (resposta rápida, link, ligar, copiar código e flow);
 * - **à direita**, o preview do jeito que o cliente vê.
 *
 * Três tipos de modelo:
 *
 * - **Padrão** — cabeçalho opcional, corpo com variáveis, rodapé e botões.
 * - **Carrossel** — a mensagem e de 2 a 10 cards, cada um com mídia, corpo e
 *   botões. Todos os cards com a mesma mídia e os mesmos botões: o card novo já
 *   nasce com os botões do anterior.
 * - **Oferta por tempo limitado** — só marketing: texto da oferta, prazo
 *   opcional, cupom e link.
 *
 * As variáveis são o esqueleto do modelo: o operador escreve a mensagem uma vez,
 * com `{{nome}}`, `{{produto}}`…, e cada valor entra no momento do envio (a
 * campanha liga cada variável a um dado do contato). Por padrão elas têm NOME —
 * é o que a pessoa lê na campanha —, e o formato numerado (`{{1}}`) continua
 * disponível.
 *
 * Cada idioma vai à Meta como um modelo com o MESMO nome e o idioma dele (é assim
 * que a Meta guarda traduções). A tela NÃO decide o que é um modelo válido: ela
 * chama `novoModeloSchema`, o mesmo schema que a rota aplica, e `previewDoModelo`,
 * a mesma função que o teste mede. Regra reescrita aqui seria regra que diverge
 * do servidor.
 */
import {
  FileText,
  Image as ImageIcon,
  Plus,
  Trash2,
  Type as TextoIcon,
  Video as VideoIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitTemplate } from "@/hooks/channels/useTemplates";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";
import {
  IDIOMAS_DO_MODELO,
  MIDIAS_DO_CABECALHO,
  novoModeloSchema,
  variaveisDoTexto,
  type BotaoDoModelo,
  type CabecalhoDoModelo,
  type CardDoModelo,
  type FormatoDeMidia,
  type IdiomaDoModelo,
  type MotivoDeRecusa,
  type NovoModelo,
  type TipoDeModelo,
} from "@/lib/channels/meta/novo-modelo";

import { CampoDeMensagem } from "./CampoDeMensagem";
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
  cabecalho_com_variavel_demais: "O título aceita no máximo 1 variável.",
  ligar_demais: "No máximo 1 botão de ligar.",
  telefone_do_botao_invalido: "Use o número com o código do país, ex.: +5511999998888.",
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
  // Com NOME por padrão: a pessoa escreve `{{nome}}` e é isso que lê na campanha.
  parameter_format: "NAMED",
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

/** O nome de cada idioma, na ordem em que a lista os oferece. */
const ROTULO_DO_IDIOMA: Record<IdiomaDoModelo, string> = {
  pt_BR: "Português (Brasil)",
  pt_PT: "Português (Portugal)",
  en_US: "Inglês (EUA)",
  en_GB: "Inglês (Reino Unido)",
  es: "Espanhol",
  es_AR: "Espanhol (Argentina)",
  es_ES: "Espanhol (Espanha)",
  es_MX: "Espanhol (México)",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano",
};

/** As variáveis que mais se usa: um toque insere na mensagem. */
const SUGESTOES_DE_VARIAVEL = ["nome", "primeiro_nome", "empresa", "produto", "valor", "data"] as const;

/** Os botões que cada lugar aceita. */
const BOTOES_DO_PADRAO = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE", "FLOW"] as const;
const BOTOES_DA_OFERTA = ["COPY_CODE", "URL"] as const;
const BOTOES_DO_CARD = ["QUICK_REPLY", "URL"] as const;

/** Os quatro lugares do cabeçalho, com o ícone e o rótulo de cada um. */
const ICONE_DO_CABECALHO = {
  TEXT: TextoIcon,
  IMAGE: ImageIcon,
  VIDEO: VideoIcon,
  DOCUMENT: FileText,
} as const;

const ROTULO_DO_CABECALHO = {
  TEXT: "Texto",
  IMAGE: "Imagem",
  VIDEO: "Vídeo",
  DOCUMENT: "Arquivo",
} as const;

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
    const serve = m.header && m.header.format !== "DOCUMENT" && m.header.format !== "TEXT";
    return {
      ...m,
      kind,
      category: "MARKETING",
      header: serve ? m.header : null,
      offer: m.offer ?? { text: "", has_expiration: true },
      footer: null,
      buttons: botoes,
      cards: [],
    };
  }
  return { ...m, kind, offer: null, cards: [] };
}

/**
 * O nome de variável que a Meta aceita (`[a-z][a-z0-9_]*`) a partir do que a
 * pessoa digitou: sem acento, minúsculo, espaço vira `_`, e começa por letra.
 */
export function nomeDeVariavel(bruto: string): string {
  const limpo = bruto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  if (!limpo) return "";
  return /^[a-z]/.test(limpo) ? limpo : `v_${limpo}`;
}

/** Põe `{{nome}}` onde está o cursor do campo, ou no fim (com um espaço) se o campo não tem foco. */
function comVariavelNoCursor(
  texto: string,
  campo: HTMLTextAreaElement | HTMLInputElement | null,
  variavel: string,
): string {
  // O campo guarda a seleção mesmo depois de o clique ir para o botão.
  const posicao = campo ? (campo.selectionStart ?? texto.length) : texto.length;
  const antes = texto.slice(0, posicao);
  const depois = texto.slice(posicao);
  const separador = antes && !/\s$/.test(antes) && posicao === texto.length ? " " : "";
  return `${antes}${separador}{{${variavel}}}${depois}`;
}

export function EditorDeModelo({ onFechar }: { onFechar: () => void }) {
  const t = useT();
  const submeter = useSubmitTemplate();
  // Uma versão do modelo por idioma. O que vale para o modelo inteiro (nome,
  // categoria, tipo, formato das variáveis) é espelhado em todas por `mudarComum`.
  const [idiomas, setIdiomas] = useState<string[]>(["pt_BR"]);
  const [ativo, setAtivo] = useState("pt_BR");
  const [modelos, setModelos] = useState<Record<string, NovoModelo>>({ pt_BR: VAZIO });
  /** Link assinado do preview de cada mídia enviada, pelo caminho da cópia. */
  const [links, setLinks] = useState<Record<string, string>>({});
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const tituloRef = useRef<HTMLInputElement>(null);

  const modelo = modelos[ativo] ?? VAZIO;
  const variaveis = useMemo(() => variaveisDoTexto(modelo.body), [modelo.body]);
  const problemasPorIdioma = useMemo(
    () => Object.fromEntries(idiomas.map((l) => [l, problemasDoEstado(modelos[l] ?? VAZIO)])),
    [idiomas, modelos],
  );
  const problemas = problemasPorIdioma[ativo] ?? [];
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

  /** Muda só o idioma aberto. */
  const mudar = (parcial: Partial<NovoModelo>) =>
    setModelos((todos) => ({ ...todos, [ativo]: { ...(todos[ativo] ?? VAZIO), ...parcial } }));
  /** Muda em todos os idiomas — o que vale para o modelo inteiro. */
  const mudarComum = (
    parcial: Partial<Pick<NovoModelo, "name" | "category" | "parameter_format">>,
  ) =>
    setModelos((todos) =>
      Object.fromEntries(Object.entries(todos).map(([l, m]) => [l, { ...m, ...parcial }])),
    );
  const mudarTipo = (kind: TipoDeModelo) =>
    setModelos((todos) =>
      Object.fromEntries(Object.entries(todos).map(([l, m]) => [l, paraOTipo(m, kind)])),
    );
  const mudarCard = (i: number, parcial: Partial<CardDoModelo>) =>
    mudar({ cards: modelo.cards.map((c, j) => (j === i ? { ...c, ...parcial } : c)) });
  const guardarLink = (path: string, link: string) => setLinks((l) => ({ ...l, [path]: link }));

  function novoIdioma(codigo: string) {
    if (!codigo || idiomas.includes(codigo)) return;
    // Parte de uma cópia da versão aberta, para ser traduzida.
    setModelos((todos) => ({
      ...todos,
      [codigo]: { ...(todos[ativo] ?? VAZIO), language: codigo },
    }));
    setIdiomas((l) => [...l, codigo]);
    setAtivo(codigo);
  }

  function tirarIdioma(codigo: string) {
    if (idiomas.length < 2) return;
    const restantes = idiomas.filter((l) => l !== codigo);
    setIdiomas(restantes);
    setModelos((todos) => Object.fromEntries(Object.entries(todos).filter(([l]) => l !== codigo)));
    if (ativo === codigo) setAtivo(restantes[0]!);
  }

  /**
   * Entra onde está o cursor. Colada sempre no fim, a variável caía na regra da
   * Meta que o próprio editor cobra (variável na ponta do texto). Numerada, é a
   * próxima da sequência; com nome, é a que a pessoa escreveu (ou uma sugestão).
   */
  function adicionarVariavel(nome?: string) {
    const numerada = modelo.parameter_format === "POSITIONAL";
    const proxima = numerada
      ? String(variaveis.filter((v) => /^\d+$/.test(v)).length + 1)
      : nomeDeVariavel(nome ?? nomeNovo) || `variavel_${variaveis.length + 1}`;
    mudar({ body: comVariavelNoCursor(modelo.body, corpoRef.current, proxima) });
    setNomeNovo("");
  }

  /** O título aceita uma variável só: a inserção entra se ainda não houver. */
  function adicionarVariavelAoTitulo() {
    if (modelo.header?.format !== "TEXT") return;
    if (variaveisDoTexto(modelo.header.text).length > 0) return;
    const nome = modelo.parameter_format === "POSITIONAL" ? "1" : "variavel_titulo";
    mudar({
      header: {
        ...modelo.header,
        text: comVariavelNoCursor(modelo.header.text, tituloRef.current, nome),
      },
    });
  }

  function esquecerMidiasIndisponiveis(idioma: string, err: unknown) {
    const campos = camposDeMidiaIndisponivel(err);
    if (campos.size === 0) return;
    setModelos((todos) => {
      const m = todos[idioma];
      if (!m) return todos;
      const header: NovoModelo["header"] =
        m.header && m.header.format !== "TEXT" && campos.has("header.media")
          ? { ...m.header, media: null }
          : m.header;
      return {
        ...todos,
        [idioma]: {
          ...m,
          header,
          cards: m.cards.map((c, i) =>
            campos.has(`cards.${i}.header.media`)
              ? { ...c, header: { ...c.header, media: null } }
              : c,
          ),
        },
      };
    });
  }

  async function enviar() {
    setTentou(true);
    const comProblema = idiomas.find((l) => (problemasPorIdioma[l] ?? []).length > 0);
    if (comProblema) {
      setAtivo(comProblema);
      return;
    }
    setEnviando(true);
    const enviados: string[] = [];
    const falharam: string[] = [];
    let situacao = "";
    for (const l of idiomas) {
      try {
        const r = await submeter.mutateAsync(modelos[l]!);
        situacao = r.data.status;
        enviados.push(l);
      } catch (err) {
        // O aviso da recusa já saiu pelo `onError` do hook. Aqui só o arquivo
        // que saiu do armazenamento (issue #30): o caminho velho deixa o estado,
        // e o campo volta a pedir o arquivo em vez de repetir a mesma recusa.
        esquecerMidiasIndisponiveis(l, err);
        falharam.push(l);
      }
    }
    setEnviando(false);

    if (falharam.length === 0) {
      toast.success(
        idiomas.length === 1
          ? `${t("Modelo enviado para aprovação da Meta.")} ${t("Situação:")} ${situacao}`
          : `${enviados.length} ${t("idiomas do modelo enviados para aprovação da Meta.")}`,
      );
      onFechar();
      return;
    }
    // Falha parcial: o que já foi sai da tela (reenviar daria "já existe"), e
    // ficam os idiomas que ainda precisam de ajuste.
    if (enviados.length > 0) {
      setIdiomas(falharam);
      setModelos((todos) =>
        Object.fromEntries(Object.entries(todos).filter(([l]) => falharam.includes(l))),
      );
      const nome = (l: string) => t(ROTULO_DO_IDIOMA[l as IdiomaDoModelo] ?? l);
      toast.warning(
        `${t("Enviados:")} ${enviados.map(nome).join(", ")}. ${t("Faltam:")} ${falharam.map(nome).join(", ")}.`,
      );
    }
    setAtivo(falharam[0]!);
  }

  const carrossel = modelo.kind === "CAROUSEL";
  const oferta = modelo.kind === "LIMITED_TIME_OFFER";
  const numerada = modelo.parameter_format === "POSITIONAL";
  const idiomasQueFaltam = IDIOMAS_DO_MODELO.filter((l) => !idiomas.includes(l));
  const rotuloDoAtivo = ROTULO_DO_IDIOMA[ativo as IdiomaDoModelo] ?? ativo;
  const titulo = modelo.header;
  const tituloDeTexto = titulo && titulo.format === "TEXT" ? titulo : null;
  const midiaDoCabecalho = titulo && titulo.format !== "TEXT" ? titulo : null;
  const opcoesDeCabecalho: Array<"TEXT" | FormatoDeMidia> = oferta
    ? ["IMAGE", "VIDEO"]
    : ["TEXT", "IMAGE", "VIDEO", "DOCUMENT"];

  function escolherCabecalho(f: "TEXT" | FormatoDeMidia) {
    if (titulo?.format === f) return mudar({ header: null });
    if (f === "TEXT") return mudar({ header: { format: "TEXT", text: "", examples: {} } });
    mudar({ header: comFormato(midiaDoCabecalho ?? { format: f, media: null }, f) });
  }

  return (
    <div data-testid="editor-de-modelo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight" data-testid="titulo-do-modelo">
          {modelo.name || t("Nome do modelo")} • {t(rotuloDoAtivo)}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onFechar}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={enviar}
            disabled={enviando || submeter.isPending}
            data-testid="btn-enviar-modelo"
          >
            {enviando || submeter.isPending ? t("Enviando…") : t("Enviar para aprovação")}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
        {/* ─── O que vale para o modelo inteiro ─── */}
        <Card className="flex flex-col gap-4 self-start p-4">
          <label className="text-sm">
            {t("Nome do modelo")}
            <Input
              className="mt-1"
              value={modelo.name}
              placeholder="oferta_de_outubro"
              // A Meta só aceita minúsculas, números e _: o campo já escreve assim.
              onChange={(e) =>
                mudarComum({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, "_") })
              }
              data-testid="modelo-nome"
            />
            <Erros lista={doCampo("name")} />
          </label>

          <label className="text-sm">
            {t("Categoria do modelo")}
            <select
              className={SELECT}
              value={modelo.category}
              onChange={(e) => mudarComum({ category: e.target.value as NovoModelo["category"] })}
              data-testid="modelo-categoria"
            >
              <option value="MARKETING">{t("Marketing")}</option>
              {oferta ? null : <option value="UTILITY">{t("Utilidade")}</option>}
            </select>
            <Erros lista={doCampo("category")} />
          </label>
          <p className="-mt-2 text-xs text-muted-foreground" data-testid="dica-da-categoria">
            {modelo.category === "UTILITY"
              ? t(
                  "Utilidade é para mensagem ligada a algo que o cliente fez ou pediu (confirmação, lembrete, atualização de pedido). A Meta passa para Marketing o texto que parecer promocional.",
                )
              : t(
                  "A Meta cobra cada envio pela categoria e pode mudá-la na revisão — se mudar, você é avisado na Central.",
                )}
          </p>

          <label className="text-sm">
            {t("Tipo de modelo")}
            <select
              className={SELECT}
              value={modelo.kind}
              onChange={(e) => mudarTipo(e.target.value as TipoDeModelo)}
              data-testid="modelo-tipo"
            >
              {TIPOS.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {t(tipo.rotulo)}
                </option>
              ))}
            </select>
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">
            {t(TIPOS.find((x) => x.valor === modelo.kind)?.dica ?? "")}
          </p>

          <label className="text-sm">
            {t("Variáveis")}
            <select
              className={SELECT}
              value={modelo.parameter_format}
              onChange={(e) =>
                mudarComum({ parameter_format: e.target.value as NovoModelo["parameter_format"] })
              }
              data-testid="modelo-formato"
            >
              <option value="NAMED">{t("Com nome")}</option>
              <option value="POSITIONAL">{t("Numeradas")}</option>
            </select>
          </label>

          <div className="flex flex-col gap-2" data-testid="idiomas-do-modelo">
            <span className="text-sm">{t("Idiomas")}</span>
            <ul className="flex flex-col gap-1">
              {idiomas.map((l) => {
                const comErro = tentou && (problemasPorIdioma[l] ?? []).length > 0;
                return (
                  <li key={l} className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      aria-pressed={l === ativo}
                      onClick={() => setAtivo(l)}
                      className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${
                        l === ativo ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                      }`}
                      data-testid={`idioma-${l}`}
                    >
                      {t(ROTULO_DO_IDIOMA[l as IdiomaDoModelo] ?? l)}
                      {comErro ? (
                        <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                          {t("corrigir")}
                        </Badge>
                      ) : null}
                    </button>
                    {idiomas.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t("Tirar este idioma")}
                        onClick={() => tirarIdioma(l)}
                        data-testid={`tirar-idioma-${l}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {idiomasQueFaltam.length > 0 ? (
              <select
                className="w-full rounded-md border bg-background p-2 text-sm text-primary"
                value=""
                aria-label={t("Novo idioma")}
                onChange={(e) => novoIdioma(e.target.value)}
                data-testid="novo-idioma"
              >
                <option value="">+ {t("Novo idioma")}</option>
                {idiomasQueFaltam.map((l) => (
                  <option key={l} value={l}>
                    {t(ROTULO_DO_IDIOMA[l])}
                  </option>
                ))}
              </select>
            ) : null}
            {idiomas.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Cada idioma é uma versão do mesmo modelo, com a própria mensagem — traduza o texto e os exemplos.",
                )}
              </p>
            ) : null}
          </div>
        </Card>

        {/* ─── A mensagem do idioma aberto ─── */}
        <div className="flex min-w-0 flex-col gap-4">
          {!carrossel ? (
            <div className="flex flex-col gap-2 text-sm">
              <span>
                {t("Cabeçalho")} <span className="text-muted-foreground">{t("Opcional")}</span>
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group">
                {opcoesDeCabecalho.map((f) => {
                  const Icone = ICONE_DO_CABECALHO[f];
                  const escolhido = titulo?.format === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={escolhido}
                      onClick={() => escolherCabecalho(f)}
                      className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm ${
                        escolhido ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"
                      }`}
                      data-testid={`modelo-cabecalho-${f}`}
                    >
                      <Icone className="size-5" aria-hidden />
                      {t(ROTULO_DO_CABECALHO[f])}
                    </button>
                  );
                })}
              </div>
              {titulo ? (
                <button
                  type="button"
                  className="self-start text-xs text-muted-foreground underline"
                  onClick={() => mudar({ header: null })}
                  data-testid="modelo-cabecalho-nenhum"
                >
                  {t("Sem cabeçalho")}
                </button>
              ) : null}
              {tituloDeTexto ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      ref={tituloRef}
                      aria-label={t("Título")}
                      placeholder={t("Título (até 60 caracteres)")}
                      maxLength={60}
                      value={tituloDeTexto.text}
                      onChange={(e) =>
                        mudar({ header: { ...tituloDeTexto, text: e.target.value } })
                      }
                      data-testid="modelo-cabecalho-texto"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={adicionarVariavelAoTitulo}
                      disabled={variaveisDoTexto(tituloDeTexto.text).length > 0}
                      data-testid="btn-variavel-titulo"
                    >
                      <Plus className="size-3.5" aria-hidden /> {t("Variável")}
                    </Button>
                  </div>
                  {variaveisDoTexto(tituloDeTexto.text).length > 0 ? (
                    <Exemplos
                      variaveis={variaveisDoTexto(tituloDeTexto.text)}
                      exemplos={tituloDeTexto.examples}
                      onMudar={(examples) => mudar({ header: { ...tituloDeTexto, examples } })}
                      erros={(v) => <Erros lista={doCampo(`header.examples.${v}`)} />}
                      testId="modelo-cabecalho-exemplo"
                    />
                  ) : null}
                </div>
              ) : null}
              {midiaDoCabecalho ? (
                <CampoDeMidia
                  cabecalho={midiaDoCabecalho}
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

          <div className="flex flex-col gap-2 text-sm">
            <span>{carrossel ? t("Texto da mensagem (acima dos cards)") : t("Mensagem")}</span>
            <CampoDeMensagem
              valor={modelo.body}
              onMudar={(body) => mudar({ body })}
              campoRef={corpoRef}
              testId="modelo-corpo"
              rotulo={carrossel ? t("Texto da mensagem (acima dos cards)") : t("Texto da mensagem")}
              maximo={1024}
            />
            <Erros lista={doCampo("body")} />
            <div className="flex flex-wrap items-center gap-2">
              {numerada ? null : (
                <Input
                  className="h-8 w-44"
                  aria-label={t("Nome da variável")}
                  placeholder={t("nome da variável")}
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      adicionarVariavel();
                    }
                  }}
                  data-testid="nome-da-variavel"
                />
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adicionarVariavel()}
                data-testid="btn-variavel"
              >
                <Plus className="size-3.5" aria-hidden /> {t("Adicionar variável")}
              </Button>
              {numerada
                ? null
                : SUGESTOES_DE_VARIAVEL.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="rounded-full border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                      onClick={() => adicionarVariavel(s)}
                      data-testid={`variavel-sugerida-${s}`}
                    >
                      {`{{${s}}}`}
                    </button>
                  ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "As variáveis são preenchidas em cada envio — na campanha você liga cada uma a um dado do contato. Para negrito use *texto*, para itálico _texto_.",
              )}
            </p>
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

        {/* ─── O preview e o recado do envio ─── */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("Como o cliente vê")}
          </span>
          <PreviewDoModeloView modelo={modelo} links={links} />
          {tentou && idiomas.some((l) => (problemasPorIdioma[l] ?? []).length > 0) ? (
            <p
              className="text-sm text-destructive"
              role="status"
              data-testid="modelo-tem-problemas"
            >
              {t("Corrija os campos marcados antes de enviar.")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t(
              "A Meta revisa o modelo, em geral em minutos. A situação se atualiza sozinha quando ela responder, sem precisar sincronizar.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Os exemplos das variáveis de um texto — do corpo do modelo, do título ou de um card. */
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
      <p className="text-xs text-muted-foreground">
        {t("Para cada variável, escreva um exemplo — por exemplo, nome → João.")}
      </p>
      {variaveis.map((v) => (
        <label key={v} className="text-sm">
          <span className="grid grid-cols-[minmax(0,10rem)_auto_minmax(0,1fr)] items-center gap-2">
            <span className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">{`{{${v}}}`}</span>
            <span aria-hidden className="text-muted-foreground">
              →
            </span>
            <Input
              value={exemplos[v] ?? ""}
              onChange={(e) => onMudar({ ...exemplos, [v]: e.target.value })}
              data-testid={`${testId}-${v}`}
            />
          </span>
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
