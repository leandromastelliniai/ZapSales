"use client";

/**
 * "Resposta em áudio" no editor do agente (issue #91).
 *
 * A opção é do AGENTE (dado da versão: rascunho, diff, histórico, desfazer), mas
 * só vale quando a ORGANIZAÇÃO ligou o recurso e gravou uma chave de voz em
 * Provedores. Por isso a tela faz duas coisas além do interruptor:
 *
 *   1. diz, em português, POR QUE o recurso não está disponível agora (e leva a
 *      Provedores) — uma instalação nova, sem chave de voz nenhuma, abre esta
 *      tela e lê o motivo em vez de um campo que parece quebrado;
 *   2. com a ElevenLabs, deixa o agente escolher a voz (e o modelo) na lista que
 *      a chave do próprio cliente devolve.
 *
 * O interruptor grava mesmo com o recurso indisponível: o dono prepara o agente
 * e liga a organização depois. Nada sai em áudio enquanto uma das duas pontas
 * estiver desligada — quem decide isso é o motor, não esta tela.
 *
 * Em número conectado por QR code a tela avisa do risco de banimento. A
 * pergunta ("este número pode ser banido?") é de CAPACIDADE do canal
 * (`riscoDeBanimento`), nunca do nome do provedor.
 */
import * as React from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";

export interface ValorDaRespostaEmAudio {
  enabled: boolean;
  voiceId: string | null;
  modelId: string | null;
}

interface EstadoDaOrganizacao {
  config: { provedor: "openai_compativel" | "elevenlabs"; voz: string | null; modelo: string | null; limite_de_caracteres: number };
  disponivel: boolean;
  por_que_indisponivel: "desligado" | "sem_aceite" | "sem_chave" | null;
}

interface Voz {
  id: string;
  nome: string;
  categoria: string | null;
  descricao: string | null;
}

type VozesCarregadas =
  | { estado: "carregando" }
  | { estado: "ok"; vozes: Voz[] }
  | { estado: "erro"; mensagem: string };

/** O valor do Select quando nada foi escolhido — o Radix não aceita `""`. */
const PADRAO = "__padrao_da_organizacao__";

/** Os modelos de voz da ElevenLabs oferecidos ao agente (o id é o do provedor). */
const ROTULO_DO_MODELO = {
  eleven_multilingual_v2: "Multilíngue v2 (melhor qualidade)",
  eleven_turbo_v2_5: "Turbo v2.5 (mais rápido)",
  eleven_flash_v2_5: "Flash v2.5 (o mais rápido)",
} as const;
const IDS_DOS_MODELOS = Object.keys(ROTULO_DO_MODELO) as Array<keyof typeof ROTULO_DO_MODELO>;

async function lerJson(res: Response): Promise<{ data?: unknown } | null> {
  try {
    return (await res.json()) as { data?: unknown };
  } catch {
    return null;
  }
}

interface Props {
  value: ValorDaRespostaEmAudio;
  onChange: (valor: ValorDaRespostaEmAudio) => void;
  disabled?: boolean;
  /** O número deste agente pode ser banido (conexão por QR code)? */
  riscoDeBanimento: boolean;
}

export function RespostaEmAudioDoAgente({ value, onChange, disabled, riscoDeBanimento }: Props) {
  const t = useT();
  const [org, setOrg] = React.useState<EstadoDaOrganizacao | null | "erro" | "sem_acesso">(null);
  const [vozes, setVozes] = React.useState<VozesCarregadas>({ estado: "carregando" });

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      const res = await fetch("/api/v1/ai/audio").catch(() => null);
      const corpo = res && res.ok ? await lerJson(res) : null;
      if (!vivo) return;
      // Quem só lê o agente (visualizador) não vê a configuração da organização: não é falha.
      if (res?.status === 403) return setOrg("sem_acesso");
      const dados = corpo?.data as EstadoDaOrganizacao | undefined;
      setOrg(dados?.config ? dados : "erro");
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const orgLida = org !== null && org !== "erro" && org !== "sem_acesso" ? org : null;
  const provedor = orgLida ? orgLida.config.provedor : null;
  const podeEscolherVoz = provedor === "elevenlabs" && orgLida !== null && orgLida.disponivel;

  React.useEffect(() => {
    if (!podeEscolherVoz) return;
    let vivo = true;
    setVozes({ estado: "carregando" });
    void (async () => {
      const res = await fetch("/api/v1/ai/audio/vozes?provedor=elevenlabs").catch(() => null);
      const corpo = res && res.ok ? await lerJson(res) : null;
      if (!vivo) return;
      const d = corpo?.data as { ok?: boolean; vozes?: Voz[]; mensagem?: string } | undefined;
      if (d?.ok && Array.isArray(d.vozes)) setVozes({ estado: "ok", vozes: d.vozes });
      else setVozes({ estado: "erro", mensagem: d?.mensagem ?? t("Não consegui carregar as vozes agora.") });
    })();
    return () => {
      vivo = false;
    };
  }, [podeEscolherVoz, t]);

  const porQue: Record<"desligado" | "sem_aceite" | "sem_chave", string> = {
    desligado: t(
      "A resposta em áudio está desligada na organização. Ela só passa a valer depois que um administrador a liga, com a chave de voz da empresa, em Provedores.",
    ),
    sem_aceite: t("A resposta em áudio ainda não foi aceita por um administrador. Termine a configuração em Provedores."),
    sem_chave: t("Falta gravar a chave do provedor de voz. Termine a configuração em Provedores."),
  };

  return (
    <Card className="space-y-3 p-4" data-testid="resposta-em-audio-do-agente">
      <h3 className="text-sm font-medium">{t("Resposta em áudio")}</h3>
      <div className="flex items-center gap-2">
        <Switch
          id="audio_reply_enabled"
          checked={value.enabled}
          onCheckedChange={(v) => onChange({ ...value, enabled: v })}
          disabled={disabled}
          data-testid="audio-reply-enabled"
        />
        <Label htmlFor="audio_reply_enabled">{t("Responder em áudio quando o cliente mandar áudio")}</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "A resposta é escrita normalmente, passa por todas as conferências antes do envio e só então vira nota de voz. O texto fica sempre gravado na conversa. Se a voz falhar, a resposta sai em texto.",
        )}
      </p>

      {org === "sem_acesso" ? null : org === "erro" ? (
        <p className="text-xs text-muted-foreground" data-testid="audio-reply-estado">
          {t("Não consegui consultar o provedor de voz da organização agora.")}
        </p>
      ) : org === null ? null : org.disponivel ? (
        <p className="text-xs text-muted-foreground" data-testid="audio-reply-estado">
          {t("Provedor de voz:")}{" "}
          <strong>{org.config.provedor === "elevenlabs" ? "ElevenLabs" : t("Compatível com a OpenAI")}</strong>.{" "}
          {`${t("Respostas com mais de")} ${org.config.limite_de_caracteres} ${t("caracteres saem como texto.")}`}
        </p>
      ) : (
        <div
          className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          data-testid="audio-reply-indisponivel"
        >
          <p>{porQue[org.por_que_indisponivel ?? "desligado"]}</p>
          <Link href="/app/ai/providers" className="mt-1 inline-block font-medium underline">
            {t("Abrir Provedores")}
          </Link>
        </div>
      )}

      {value.enabled && podeEscolherVoz ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="audio_reply_voice">{t("Voz do agente")}</Label>
            {vozes.estado === "carregando" ? (
              <p className="text-xs text-muted-foreground">{t("Carregando as vozes da sua conta…")}</p>
            ) : vozes.estado === "erro" ? (
              <p className="text-xs text-destructive" data-testid="audio-reply-vozes-erro">
                {vozes.mensagem}
              </p>
            ) : (
              <Select
                value={value.voiceId ?? PADRAO}
                onValueChange={(v) => onChange({ ...value, voiceId: v === PADRAO ? null : v })}
                disabled={disabled}
              >
                <SelectTrigger id="audio_reply_voice" data-testid="audio-reply-voz">
                  <SelectValue placeholder={t("Escolha uma voz")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PADRAO}>{t("Escolha uma voz")}</SelectItem>
                  {value.voiceId && !vozes.vozes.some((v) => v.id === value.voiceId) ? (
                    <SelectItem value={value.voiceId}>{t("Voz que não está mais na sua conta")}</SelectItem>
                  ) : null}
                  {vozes.vozes.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.descricao ? `${v.nome} — ${v.descricao}` : v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {value.voiceId === null && vozes.estado === "ok" ? (
              <p className="text-xs text-muted-foreground">
                {t("Sem voz escolhida, este agente responde em texto.")}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="audio_reply_model">{t("Modelo de voz")}</Label>
            <Select
              value={value.modelId ?? PADRAO}
              onValueChange={(v) => onChange({ ...value, modelId: v === PADRAO ? null : v })}
              disabled={disabled}
            >
              <SelectTrigger id="audio_reply_model" data-testid="audio-reply-modelo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PADRAO}>{t("Padrão da organização")}</SelectItem>
                {IDS_DOS_MODELOS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(ROTULO_DO_MODELO[id])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {value.enabled && provedor === "openai_compativel" && orgLida !== null && orgLida.disponivel ? (
        <p className="text-xs text-muted-foreground">
          {t("A voz e o modelo são os da organização, definidos em Provedores.")}
        </p>
      ) : null}

      {value.enabled && riscoDeBanimento ? (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-warning-bg p-3 text-xs"
          data-testid="audio-reply-risco-de-banimento"
        >
          {t(
            "Atenção: o número deste agente é conectado por QR code, e o WhatsApp pode banir números com atividade automática fora do padrão. Notas de voz automáticas aumentam esse risco. Para áudio, a API Oficial é o caminho mais seguro.",
          )}
        </div>
      ) : null}
    </Card>
  );
}
