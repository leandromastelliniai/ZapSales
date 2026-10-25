"use client";
/**
 * O perfil guiado do agente (issue #89): o formulário que substitui "saber
 * escrever prompt" como porta de entrada. Persona, tom em três níveis, objetivo,
 * boas-vindas e idioma — e, no fim, a visão de COMO esses campos e as instruções
 * livres se combinam no que o agente recebe.
 *
 * Controlado: o estado mora no `AgentForm` (um form, um save, um rascunho). A
 * visão de "como o agente recebe" usa `comporInstrucoes`, a MESMA função que o
 * motor aplica ao carregar a versão publicada — a prévia não pode divergir do
 * turno.
 */
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import {
  IDIOMAS_DO_AGENTE,
  LIMITES_DO_PERFIL,
  LIMITES_DOS_TEMAS,
  TONS_DO_AGENTE,
  comporInstrucoes,
  perfilPreenchido,
  type IdiomaDoAgente,
  type PerfilDoAgente,
  type TomDoAgente,
} from "@/lib/ai/agents/perfil";
import { REGISTRO_DE_IDIOMAS } from "@/lib/i18n/registro";

import { ExemplosDoCampo } from "./guia/ExemplosDoCampo";

/** O perfil como o formulário o segura: texto vazio é "não preenchido". */
export interface PerfilDoFormulario {
  persona: string;
  tom: TomDoAgente | "";
  objetivo: string;
  boasVindas: string;
  idioma: IdiomaDoAgente | "";
  /** Restringir temas (#92). */
  restringirTemas: boolean;
  /** Um assunto por linha: é o que o dono digita; o contrato é uma lista. */
  temasPermitidos: string;
  respostaForaDoTema: string;
}

/** Do formulário para o contrato (`""` → `null`). Um ponto só. */
export function perfilDoContrato(f: PerfilDoFormulario): PerfilDoAgente {
  const texto = (v: string) => (v.trim() === "" ? null : v.trim());
  return {
    persona: texto(f.persona),
    tom: f.tom === "" ? null : f.tom,
    objetivo: texto(f.objetivo),
    boasVindas: texto(f.boasVindas),
    idioma: f.idioma === "" ? null : f.idioma,
    restringirTemas: f.restringirTemas,
    temasPermitidos: assuntosDoTexto(f.temasPermitidos),
    respostaForaDoTema: texto(f.respostaForaDoTema),
  };
}

/** Do campo de texto (um assunto por linha) para a lista do contrato. */
export function assuntosDoTexto(bruto: string): string[] {
  return bruto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha !== "");
}

const NOME_DO_IDIOMA = Object.fromEntries(
  REGISTRO_DE_IDIOMAS.map((i) => [i.codigo, i.nomeNativo]),
) as Record<string, string>;

interface Props {
  value: PerfilDoFormulario;
  onChange: (parte: Partial<PerfilDoFormulario>) => void;
  /** O prompt livre atual, para a visão de como as duas partes se combinam. */
  instrucoesLivres: string;
  disabled?: boolean;
  /** A seção do editor já dá título e introdução; aqui eles sairiam repetidos. */
  semTitulo?: boolean;
  /** Mensagem de erro por campo do perfil (já traduzida). */
  erros?: Partial<Record<keyof PerfilDoFormulario, string>>;
  /**
   * Ligado, cada campo de texto (quem é, objetivo, boas-vindas) oferece "Ver exemplos" no
   * idioma dado. Sem isto, a tela é a de sempre: o editor liga; outros usos não precisam.
   */
  idiomaDosExemplos?: IdiomaDoAgente;
}

export function PerfilGuiado({
  value,
  onChange,
  instrucoesLivres,
  disabled,
  erros,
  semTitulo = false,
  idiomaDosExemplos,
}: Props) {
  const t = useT();

  const rotuloDoTom: Record<TomDoAgente, { nome: string; ajuda: string }> = {
    formal: { nome: t("Formal"), ajuda: t("Correto e cerimonioso, sem gírias") },
    normal: { nome: t("Normal"), ajuda: t("Cordial e direto") },
    descontraido: {
      nome: t("Descontraído"),
      ajuda: t("Leve e próximo, como conversa entre conhecidos"),
    },
  };

  const composicao = comporInstrucoes(instrucoesLivres, perfilDoContrato(value));
  const compoe = perfilPreenchido(perfilDoContrato(value));

  return (
    <div className="space-y-4" data-testid="perfil-guiado">
      {semTitulo ? (
        <p className="text-sm text-muted-foreground">
          {t(
            "Preencha o que quiser — tudo é opcional. O que você escrever aqui é combinado com as instruções livres, e você pode ver o resultado no fim.",
          )}
        </p>
      ) : (
        <div>
          <h3 className="text-sm font-semibold">{t("Como ele se apresenta")}</h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "Preencha o que quiser — tudo é opcional. O que você escrever aqui é combinado com as instruções livres, e você pode ver o resultado no fim.",
            )}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="perfil_persona">{t("Quem ele é")}</Label>
        <Textarea
          id="perfil_persona"
          value={value.persona}
          onChange={(e) => onChange({ persona: e.target.value })}
          disabled={disabled}
          rows={2}
          placeholder={t("Ex.: Marina, recepcionista simpática da Clínica Sorriso")}
          aria-invalid={!!erros?.persona}
        />
        <ContadorETexto
          atual={value.persona.trim().length}
          limite={LIMITES_DO_PERFIL.persona}
          erro={erros?.persona}
        />
        {idiomaDosExemplos ? (
          <ExemplosDoCampo
            campo="persona"
            idioma={idiomaDosExemplos}
            valor={value.persona}
            onAplicar={(texto) => onChange({ persona: texto })}
            disabled={disabled}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <Label id="perfil_tom_rotulo">{t("Tom de voz")}</Label>
        <div
          role="radiogroup"
          aria-labelledby="perfil_tom_rotulo"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {TONS_DO_AGENTE.map((tom) => {
            const marcado = value.tom === tom;
            return (
              <button
                key={tom}
                type="button"
                role="radio"
                aria-checked={marcado}
                data-testid={`perfil-tom-${tom}`}
                disabled={disabled}
                onClick={() => onChange({ tom: marcado ? "" : tom })}
                className={
                  marcado
                    ? "rounded-md border-2 border-foreground px-3 py-2 text-left"
                    : "rounded-md border border-border px-3 py-2 text-left hover:border-foreground/50"
                }
              >
                <span className="block text-sm font-medium">{rotuloDoTom[tom].nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {rotuloDoTom[tom].ajuda}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="perfil_objetivo">{t("O que ele persegue na conversa")}</Label>
        <Textarea
          id="perfil_objetivo"
          value={value.objetivo}
          onChange={(e) => onChange({ objetivo: e.target.value })}
          disabled={disabled}
          rows={2}
          placeholder={t("Ex.: Entender o que a pessoa precisa e marcar uma avaliação gratuita")}
          aria-invalid={!!erros?.objetivo}
        />
        <ContadorETexto
          atual={value.objetivo.trim().length}
          limite={LIMITES_DO_PERFIL.objetivo}
          erro={erros?.objetivo}
        />
        {idiomaDosExemplos ? (
          <ExemplosDoCampo
            campo="objetivo"
            idioma={idiomaDosExemplos}
            valor={value.objetivo}
            onAplicar={(texto) => onChange({ objetivo: texto })}
            disabled={disabled}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="perfil_boas_vindas">{t("Mensagem de boas-vindas")}</Label>
        <Textarea
          id="perfil_boas_vindas"
          value={value.boasVindas}
          onChange={(e) => onChange({ boasVindas: e.target.value })}
          disabled={disabled}
          rows={2}
          placeholder={t("Ex.: Oi! Eu sou a Marina, da Clínica Sorriso. Como posso ajudar?")}
          aria-invalid={!!erros?.boasVindas}
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "O agente abre a conversa com algo nessa linha — pode ajustar o nome do contato, mas não é um texto fixo.",
          )}
        </p>
        <ContadorETexto
          atual={value.boasVindas.trim().length}
          limite={LIMITES_DO_PERFIL.boasVindas}
          erro={erros?.boasVindas}
        />
        {idiomaDosExemplos ? (
          <ExemplosDoCampo
            campo="boasVindas"
            idioma={idiomaDosExemplos}
            valor={value.boasVindas}
            onAplicar={(texto) => onChange({ boasVindas: texto })}
            disabled={disabled}
          />
        ) : null}
      </div>

      <div className="space-y-1">
        <Label htmlFor="perfil_idioma">{t("Idioma das respostas")}</Label>
        <Select
          value={value.idioma === "" ? "nenhum" : value.idioma}
          onValueChange={(v) => onChange({ idioma: v === "nenhum" ? "" : (v as IdiomaDoAgente) })}
          disabled={disabled}
        >
          <SelectTrigger id="perfil_idioma">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">{t("Não definido (segue as instruções)")}</SelectItem>
            {IDIOMAS_DO_AGENTE.map((codigo) => (
              <SelectItem key={codigo} value={codigo}>
                {NOME_DO_IDIOMA[codigo] ?? codigo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 rounded-md border p-3" data-testid="restringir-temas">
        <div className="flex items-center gap-2">
          <Switch
            id="perfil_restringir_temas"
            checked={value.restringirTemas}
            onCheckedChange={(v) => onChange({ restringirTemas: v })}
            disabled={disabled}
          />
          <Label htmlFor="perfil_restringir_temas">{t("Restringir assuntos")}</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Ligado, o agente só conversa sobre os assuntos da lista e responde a mensagem abaixo para o resto. Pedir um atendente e pedir para parar de receber mensagens nunca contam como fora do assunto.",
          )}
        </p>
        <div className="space-y-1">
          <Label htmlFor="perfil_temas">{t("Assuntos permitidos (um por linha)")}</Label>
          <Textarea
            id="perfil_temas"
            value={value.temasPermitidos}
            onChange={(e) => onChange({ temasPermitidos: e.target.value })}
            disabled={disabled}
            rows={4}
            placeholder={t("Ex.: Horários e endereço\nValores de consulta\nComo agendar")}
            aria-invalid={!!erros?.temasPermitidos}
          />
          {value.restringirTemas && assuntosDoTexto(value.temasPermitidos).length === 0 ? (
            <p className="text-xs text-warning-fg" data-testid="restringir-temas-vazio">
              {t("Escreva ao menos um assunto: com a lista vazia, nada é restringido.")}
            </p>
          ) : null}
          <ContadorETexto
            atual={assuntosDoTexto(value.temasPermitidos).length}
            limite={LIMITES_DOS_TEMAS.assuntos}
            erro={erros?.temasPermitidos}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="perfil_resposta_fora">{t("Resposta para o que está fora")}</Label>
          <Textarea
            id="perfil_resposta_fora"
            value={value.respostaForaDoTema}
            onChange={(e) => onChange({ respostaForaDoTema: e.target.value })}
            disabled={disabled}
            rows={2}
            placeholder={t("Ex.: Posso ajudar só com horários e valores. Quer falar com uma pessoa?")}
            aria-invalid={!!erros?.respostaForaDoTema}
          />
          <p className="text-xs text-muted-foreground">
            {t("Em branco, o agente recusa com educação, no tom dele.")}
          </p>
          <ContadorETexto
            atual={value.respostaForaDoTema.trim().length}
            limite={LIMITES_DOS_TEMAS.respostaFora}
            erro={erros?.respostaForaDoTema}
          />
        </div>
      </div>

      <details className="rounded-md border border-dashed p-3" data-testid="perfil-como-recebe">
        <summary className="cursor-pointer text-sm font-medium">
          {t("Ver como o agente recebe isto")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {compoe
            ? t(
                "É isto que o agente lê antes de cada conversa: o perfil acima, depois as instruções livres.",
              )
            : t(
                "Sem perfil preenchido, o agente lê só as instruções livres, exatamente como escritas.",
              )}
        </p>
        {/* <pre>, e não um campo: é leitura, e um segundo textarea com o mesmo texto
            do prompt confundiria quem (ou o que) procura o campo editável. */}
        <pre
          tabIndex={0}
          className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/30 p-2 font-mono text-xs whitespace-pre-wrap"
          aria-label={t("Texto que o agente recebe")}
          data-testid="perfil-composicao"
        >
          {composicao}
        </pre>
      </details>
    </div>
  );
}

function ContadorETexto({ atual, limite, erro }: { atual: number; limite: number; erro?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs text-destructive">{erro ?? ""}</p>
      <span
        className={atual > limite ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
      >
        {atual}/{limite}
      </span>
    </div>
  );
}
