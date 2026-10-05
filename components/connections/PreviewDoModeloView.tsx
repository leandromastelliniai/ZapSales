"use client";
/**
 * O PREVIEW DO MODELO — o balão do WhatsApp com o que o cliente vai ver
 * (issues #6 e #7).
 *
 * Não decide nada: desenha `previewDoModelo` (`lib/channels/meta/novo-modelo.ts`),
 * a mesma função que o teste mede. A mídia do cabeçalho aparece pelo link
 * assinado que o upload devolveu (`links`, pelo caminho da cópia no storage);
 * sem link, um quadro do formato no lugar — o operador vê onde a mídia entra.
 */
import {
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  List,
  Play,
  Reply,
  Tag,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { useT } from "@/hooks/i18n/useT";
import {
  previewDoModelo,
  type NovoModelo,
  type PreviewDoBotao,
  type PreviewDoCabecalho,
} from "@/lib/channels/meta/novo-modelo";

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

const ICONE_DO_BOTAO = {
  QUICK_REPLY: Reply,
  URL: ExternalLink,
  COPY_CODE: Copy,
  FLOW: ClipboardList,
  VER_TODAS: List,
} as const;

/** Rótulos que o WhatsApp escreve sozinho, no idioma do aparelho. */
const ROTULOS_DO_APLICATIVO = new Set(["Copiar código", "Ver todas as opções"]);

function Botoes({
  botoes,
  testId = "preview-botao",
}: {
  botoes: PreviewDoBotao[];
  testId?: string;
}) {
  const t = useT();
  if (botoes.length === 0) return null;
  const visiveis: Array<{ tipo: keyof typeof ICONE_DO_BOTAO; texto: string }> =
    botoes.length > BOTOES_A_VISTA
      ? [...botoes.slice(0, 2), { tipo: "VER_TODAS", texto: "Ver todas as opções" }]
      : botoes;
  return (
    <div className="flex flex-col border-t">
      {visiveis.map((b, i) => {
        const Icone = ICONE_DO_BOTAO[b.tipo];
        return (
          <span
            key={i}
            className="flex items-center justify-center gap-1.5 border-b px-3 py-2 text-sm font-medium text-primary last:border-b-0"
            data-testid={testId}
          >
            <Icone className="size-3.5" aria-hidden />
            {ROTULOS_DO_APLICATIVO.has(b.texto) ? t(b.texto) : b.texto}
          </span>
        );
      })}
    </div>
  );
}

/** A mídia do cabeçalho: a imagem de verdade quando há link, ou o quadro do formato. */
function Midia({
  cabecalho,
  links,
  compacta = false,
}: {
  cabecalho: PreviewDoCabecalho;
  links: Record<string, string>;
  compacta?: boolean;
}) {
  const t = useT();
  const link = cabecalho.path ? links[cabecalho.path] : undefined;
  const altura = compacta ? "h-28" : "h-36";

  if (cabecalho.formato === "DOCUMENT") {
    return (
      <div
        className="m-1 flex items-center gap-2 rounded-md bg-muted px-3 py-3 text-sm"
        data-testid="preview-midia"
        data-formato="DOCUMENT"
      >
        <FileText className="size-6 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{cabecalho.nome ?? t("Documento")}</span>
      </div>
    );
  }
  if (cabecalho.formato === "IMAGE" && link) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- link assinado do storage, curto e fora do domínio do app
      <img
        src={link}
        alt={cabecalho.nome ?? ""}
        className={`m-1 ${altura} w-[calc(100%-0.5rem)] rounded-md object-cover`}
        data-testid="preview-midia"
        data-formato="IMAGE"
      />
    );
  }
  if (cabecalho.formato === "VIDEO" && link) {
    return (
      <video
        src={link}
        muted
        playsInline
        preload="metadata"
        className={`m-1 ${altura} w-[calc(100%-0.5rem)] rounded-md bg-black object-cover`}
        data-testid="preview-midia"
        data-formato="VIDEO"
      />
    );
  }
  const Icone = cabecalho.formato === "VIDEO" ? Play : ImageIcon;
  return (
    <div
      className={`m-1 flex ${altura} flex-col items-center justify-center gap-1 rounded-md bg-muted text-xs text-muted-foreground`}
      data-testid="preview-midia"
      data-formato={cabecalho.formato}
    >
      <Icone className="size-6" aria-hidden />
      {cabecalho.formato === "VIDEO" ? t("Vídeo do cabeçalho") : t("Imagem do cabeçalho")}
    </div>
  );
}

function Corpo({ texto, testId = "preview-corpo" }: { texto: string; testId?: string }) {
  const t = useT();
  return (
    <p
      className="px-3 pt-2 text-sm leading-relaxed break-words whitespace-pre-wrap"
      data-testid={testId}
    >
      {texto ? (
        formatado(texto).map((parte, i) => <Fragment key={i}>{parte}</Fragment>)
      ) : (
        <span className="text-muted-foreground">{t("O texto da mensagem aparece aqui.")}</span>
      )}
    </p>
  );
}

const Hora = () => (
  <p className="px-3 pt-1 pb-2 text-right text-[10px] text-muted-foreground">12:00</p>
);

export function PreviewDoModeloView({
  modelo,
  links = {},
}: {
  modelo: NovoModelo;
  /** Link assinado de cada mídia já enviada, pelo caminho da cópia no storage. */
  links?: Record<string, string>;
}) {
  const t = useT();
  const p = previewDoModelo(modelo);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted p-3" data-testid="preview-do-modelo">
      <div className="rounded-lg bg-background shadow-sm">
        {p.cabecalho ? <Midia cabecalho={p.cabecalho} links={links} /> : null}
        {p.oferta ? (
          <div
            className="mx-1 mt-1 flex items-start gap-2 rounded-md bg-muted px-3 py-2"
            data-testid="preview-oferta"
          >
            <Tag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold">
                {p.oferta.texto || t("Texto da oferta")}
              </span>
              {p.oferta.temPrazo ? (
                <span
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  data-testid="preview-oferta-prazo"
                >
                  <Clock className="size-3" aria-hidden />{" "}
                  {t("Termina na data informada em cada envio")}
                </span>
              ) : null}
              {p.oferta.codigo ? (
                <span className="text-xs text-muted-foreground" data-testid="preview-oferta-codigo">
                  {t("Código")} {p.oferta.codigo}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <Corpo texto={p.corpo} />
        {p.rodape ? (
          <p className="px-3 pt-1 text-xs text-muted-foreground" data-testid="preview-rodape">
            {p.rodape}
          </p>
        ) : null}
        <Hora />
        <Botoes botoes={p.botoes} />
      </div>

      {p.cards.length > 0 ? (
        // O carrossel rola na horizontal, como no aplicativo: um card e meio à vista.
        <div
          className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
          data-testid="preview-carrossel"
        >
          {p.cards.map((c, i) => (
            <div
              key={i}
              className="w-[78%] shrink-0 snap-start rounded-lg bg-background shadow-sm"
              data-testid="preview-card"
            >
              <Midia cabecalho={c.cabecalho} links={links} compacta />
              <Corpo texto={c.corpo} testId="preview-card-corpo" />
              <div className="pb-1" />
              <Botoes botoes={c.botoes} testId="preview-card-botao" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
