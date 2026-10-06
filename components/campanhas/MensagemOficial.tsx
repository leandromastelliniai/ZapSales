"use client";
/**
 * A MENSAGEM de uma campanha pela API Oficial (issue #8): escolher o modelo
 * aprovado e dizer de onde vem cada variável dele.
 *
 * O texto é da Meta — foi aprovado assim e não se edita aqui. O que o operador
 * decide é a FONTE de cada `{{…}}`: um campo do contato (nome, primeiro nome,
 * telefone, e-mail), um campo personalizado ou um texto fixo. Quem não tiver o
 * dado fica de fora da campanha, com o motivo na lista — a mesma régua do
 * texto livre.
 *
 * Controlado de propósito: quem busca os modelos e guarda o estado é a tela
 * (`app/app/campaigns/new/_client.tsx`); aqui só se desenha e se avisa a mudança.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import type { ModeloParaCampanha, VariavelDoModelo } from "@/lib/campanhas/modelos-da-campanha";
import type { FonteDaVariavel, MapaDeVariaveis } from "@/lib/campanhas/variaveis-do-modelo";

const MIDIA = new Set(["image", "video", "document"]);

/** As opções do seletor de fonte. O valor é a fonte serializada; o texto, o que o leigo lê. */
const OPCOES: Array<{ valor: string; rotulo: string }> = [
  { valor: "contato:primeiro_nome", rotulo: "Primeiro nome do contato" },
  { valor: "contato:nome", rotulo: "Nome completo do contato" },
  { valor: "contato:telefone", rotulo: "Telefone do contato" },
  { valor: "contato:email", rotulo: "E-mail do contato" },
  { valor: "campo_personalizado", rotulo: "Campo personalizado do contato" },
  { valor: "fixo", rotulo: "Texto fixo, igual para todos" },
];

/** O que o preview mostra no lugar da variável — o leitor vê de onde o valor virá. */
const EXEMPLO: Record<string, string> = {
  "contato:primeiro_nome": "[primeiro nome]",
  "contato:nome": "[nome completo]",
  "contato:telefone": "[telefone]",
  "contato:email": "[e-mail]",
};

function valorDaFonte(f: FonteDaVariavel | undefined): string {
  if (!f) return "";
  if (f.tipo === "contato") return `contato:${f.campo}`;
  return f.tipo;
}

function fonteDoValor(
  valor: string,
  anterior: FonteDaVariavel | undefined,
): FonteDaVariavel | null {
  if (valor === "") return null;
  if (valor === "fixo")
    return { tipo: "fixo", valor: anterior?.tipo === "fixo" ? anterior.valor : "" };
  if (valor === "campo_personalizado") {
    return {
      tipo: "campo_personalizado",
      chave: anterior?.tipo === "campo_personalizado" ? anterior.chave : "",
    };
  }
  const campo = valor.replace(/^contato:/, "") as Extract<
    FonteDaVariavel,
    { tipo: "contato" }
  >["campo"];
  return { tipo: "contato", campo };
}

/**
 * Toda variável tem fonte utilizável? É o que libera salvar. `slotAutomatico` é
 * a variável que o SISTEMA preenche — o link wa.me do modo dois números (issue
 * #9) — e não pede fonte ao operador.
 */
export function mapaCompleto(
  modelo: ModeloParaCampanha | undefined,
  mapa: MapaDeVariaveis,
  slotAutomatico: string | null = null,
): boolean {
  if (!modelo) return false;
  return modelo.variaveis.every((v) => {
    if (v.chave === slotAutomatico) return true;
    const f = mapa[v.chave];
    if (!f) return false;
    if (f.tipo === "fixo") return f.valor.trim() !== "";
    if (f.tipo === "campo_personalizado") return f.chave.trim() !== "";
    return true;
  });
}

/** O mapa só com as variáveis DESTE modelo — trocar de modelo não arrasta fonte velha. */
export function mapaDoModelo(
  modelo: ModeloParaCampanha | undefined,
  mapa: MapaDeVariaveis,
): MapaDeVariaveis {
  if (!modelo) return {};
  const chaves = new Set(modelo.variaveis.map((v) => v.chave));
  return Object.fromEntries(Object.entries(mapa).filter(([k]) => chaves.has(k)));
}

function exemploDe(
  v: VariavelDoModelo,
  f: FonteDaVariavel | undefined,
  t: (s: string) => string,
): string {
  if (!f) return v.rotulo;
  if (f.tipo === "fixo") return f.valor.trim() || v.rotulo;
  if (f.tipo === "campo_personalizado") return f.chave.trim() ? `[${f.chave.trim()}]` : v.rotulo;
  return t(EXEMPLO[valorDaFonte(f)] ?? v.rotulo);
}

interface Props {
  modelos: ModeloParaCampanha[];
  carregando: boolean;
  modeloId: string;
  onModelo: (id: string) => void;
  mapa: MapaDeVariaveis;
  onMapa: (mapa: MapaDeVariaveis) => void;
  /** A variável que o sistema preenche (modo dois números) — sem seletor de fonte. */
  slotAutomatico?: string | null;
}

export function MensagemOficial({
  modelos,
  carregando,
  modeloId,
  onModelo,
  mapa,
  onMapa,
  slotAutomatico = null,
}: Props) {
  const t = useT();
  const modelo = modelos.find((m) => m.id === modeloId);

  function mudar(chave: string, fonte: FonteDaVariavel | null) {
    const novo = { ...mapa };
    if (fonte) novo[chave] = fonte;
    else delete novo[chave];
    onMapa(novo);
  }

  // O preview substitui só as variáveis do CORPO — é o texto que o contato lê.
  const previa = modelo
    ? modelo.variaveis
        .filter((v) => !v.chave.includes(":"))
        .reduce(
          (texto, v) => texto.split(v.rotulo).join(exemploDe(v, mapa[v.chave], t)),
          modelo.texto,
        )
    : "";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "Pela API Oficial a campanha manda um modelo aprovado pela Meta, em lotes, sem o intervalo anti-banimento. A janela de horário e os tetos da campanha continuam valendo.",
        )}
      </p>
      <div className="space-y-2">
        <Label htmlFor="modelo">{t("Modelo aprovado")}</Label>
        <select
          id="modelo"
          className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          value={modeloId}
          onChange={(e) => onModelo(e.target.value)}
          disabled={carregando}
        >
          <option value="">
            {carregando ? t("Carregando modelos…") : t("Escolha um modelo aprovado")}
          </option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.language})
            </option>
          ))}
        </select>
        {!carregando && modelos.length === 0 && (
          <p className="text-sm text-warning-fg">
            {t(
              "Nenhum modelo aprovado na conta deste número. Crie ou sincronize em Conexões › Modelos.",
            )}
          </p>
        )}
      </div>

      {modelo && (
        <>
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("Como a mensagem chega")}</p>
            <p
              className="rounded-md border border-border bg-surface-elevated p-3 text-sm whitespace-pre-wrap"
              data-testid="previa-do-modelo"
            >
              {previa || modelo.name}
            </p>
          </div>

          {modelo.variaveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Este modelo não tem variáveis: todos recebem o mesmo texto.")}
            </p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">{t("De onde vem cada variável")}</legend>
              {modelo.variaveis.map((v) => {
                const fonte = mapa[v.chave];
                const midia = MIDIA.has(v.tipo);
                const id = `fonte-${v.chave}`;
                return (
                  <div key={v.chave} className="space-y-2 rounded-md border border-border p-3">
                    <Label htmlFor={id}>
                      <span className="font-mono">{v.rotulo}</span> — {v.onde}
                      {v.antes || v.depois ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · “…{v.antes} {v.rotulo} {v.depois}…”
                        </span>
                      ) : null}
                    </Label>
                    {v.chave === slotAutomatico ? (
                      <p className="text-sm text-muted-foreground">
                        {t("Preenchido com o número que recebe a conversa (modo dois números).")}
                      </p>
                    ) : midia ? (
                      <Input
                        id={id}
                        value={fonte?.tipo === "fixo" ? fonte.valor : ""}
                        onChange={(e) => mudar(v.chave, { tipo: "fixo", valor: e.target.value })}
                        placeholder={t("Link público do arquivo (https://…)")}
                      />
                    ) : (
                      <>
                        <select
                          id={id}
                          className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                          value={valorDaFonte(fonte)}
                          onChange={(e) => mudar(v.chave, fonteDoValor(e.target.value, fonte))}
                        >
                          <option value="">{t("Escolha de onde vem")}</option>
                          {OPCOES.map((o) => (
                            <option key={o.valor} value={o.valor}>
                              {t(o.rotulo)}
                            </option>
                          ))}
                        </select>
                        {fonte?.tipo === "fixo" && (
                          <Input
                            aria-label={t("Texto fixo")}
                            value={fonte.valor}
                            onChange={(e) =>
                              mudar(v.chave, { tipo: "fixo", valor: e.target.value })
                            }
                            placeholder={t("O mesmo texto para todos")}
                          />
                        )}
                        {fonte?.tipo === "campo_personalizado" && (
                          <Input
                            aria-label={t("Nome do campo personalizado")}
                            value={fonte.chave}
                            onChange={(e) =>
                              mudar(v.chave, { tipo: "campo_personalizado", chave: e.target.value })
                            }
                            placeholder={t("Ex.: plano")}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              <p className="text-sm text-muted-foreground">
                {t(
                  "Quem não tiver o dado que a mensagem usa fica de fora, com o motivo na lista — mensagem com buraco não sai.",
                )}
              </p>
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}
