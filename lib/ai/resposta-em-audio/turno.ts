/**
 * A resposta em áudio, vista de DENTRO de um turno do agente.
 *
 * O motor cria um `AudioDoTurno` por turno (ou `null`, quando o agente não pediu
 * áudio — o caso de todo agente que já existia, que não paga nem uma consulta)
 * e o chama em UM lugar: dentro do envio, quando a cadeia de conferências já
 * aprovou o texto. A chamada decide, gera e devolve `audio` ou `texto`:
 *
 *   { formato: 'audio', storagePath, mime }  → o motor envia a nota de voz
 *   { formato: 'texto', motivo }             → o motor envia o texto de sempre
 *
 * NUNCA lança e NUNCA devolve "nada": todo desfecho tem um formato de entrega, e
 * o pior caso possível é o texto, que é como o agente respondia antes. O motivo
 * do texto vai para o log do turno — é como o dono entende por que o agente que
 * ele ligou para falar não falou naquela conversa.
 */
import { suportaNotaDeVoz } from "@/lib/channels/capabilities";

import {
  MODELO_PADRAO_ELEVENLABS,
  MODELO_PADRAO_OPENAI,
  lerConfigDeAudio,
  type ConfigDeAudio,
} from "./config";
import { decidirRespostaEmAudio, type MotivoDeTexto } from "./decisao";
import { gerarNotaDeVozDaResposta } from "./entrega";
import { paraNotaDeVoz, type NotaDeVoz } from "./nota-de-voz";
import { criarProvedorDeVoz } from "./provedores";
import type { FetchDeVoz } from "./provedores/http";
import type { AudioSintetizado, MotivoDeFalhaDeVoz, ProvedorDeVozId } from "./tipos";
import type { UsoDaVoz } from "./uso";

export interface EntradaDoAudioDoTurno {
  organizationId: string;
  conversationId: string;
  contactId: string | null;
  jobId: string | null;
  agentId: string | null;
  /** O que a versão publicada do agente pediu. */
  agente: { ativado: boolean; voz: string | null; modelo: string | null };
  /** A última mensagem do cliente (a que este turno responde) foi um áudio? */
  clienteMandouAudio: boolean;
}

export interface DependenciasDoAudioDoTurno {
  /** `organizations.settings` da organização do turno. Pode lançar: vira "texto". */
  lerSettings: () => Promise<unknown>;
  /** O provedor do canal da conversa (`loadChannelProvider`). */
  provedorDoCanal: () => Promise<string | null>;
  chaveConfigurada: (provedor: ProvedorDeVozId) => Promise<boolean>;
  lerChave: (provedor: ProvedorDeVozId) => Promise<string | null>;
  guardar: (caminho: string, nota: NotaDeVoz) => Promise<void>;
  registrarUso: (uso: UsoDaVoz) => Promise<void>;
  converter?: (audio: AudioSintetizado) => Promise<NotaDeVoz>;
  /** Só para teste: um `fetch` no lugar da rede. */
  fetch?: FetchDeVoz;
  /** Só para teste: o servidor de mentira da ElevenLabs. */
  enderecoDaElevenLabs?: string;
  agora?: () => number;
  /** Chamado com o motivo toda vez que a resposta sai em texto. */
  aoCairEmTexto?: (motivo: MotivoDeTexto | MotivoDeFalhaDeVoz | "armazenamento_falhou") => void;
}

export type EntregaDoAudio =
  | { formato: "audio"; storagePath: string; mime: string; caracteres: number }
  | { formato: "texto"; motivo: MotivoDeTexto | MotivoDeFalhaDeVoz | "armazenamento_falhou" };

export interface AudioDoTurno {
  /**
   * Gera a nota de voz do texto aprovado. `seq` é a posição da mensagem no turno:
   * distingue o arquivo de cada resposta.
   */
  entregar(texto: string, seq: number): Promise<EntregaDoAudio>;
  /**
   * A MESMA decisão, sem chamar o provedor nem gravar nada — para a prévia do
   * agente (o Testar), que não pode gastar a voz do cliente nem tocar o Storage.
   * Devolve só o formato em que a resposta SAIRIA.
   */
  simular(texto: string): Promise<{ formato: "audio" } | { formato: "texto"; motivo: MotivoDeTexto }>;
}

function modeloEmVigor(config: ConfigDeAudio, doAgente: string | null): string {
  return (
    doAgente ??
    config.modelo ??
    (config.provedor === "elevenlabs" ? MODELO_PADRAO_ELEVENLABS : MODELO_PADRAO_OPENAI)
  );
}

export function criarAudioDoTurno(
  entrada: EntradaDoAudioDoTurno,
  deps: DependenciasDoAudioDoTurno,
): AudioDoTurno | null {
  // O agente não pediu áudio: nada é lido, nada é pago. É o caminho de todo
  // agente existente, e é o que garante "nada muda até alguém ligar".
  if (!entrada.agente.ativado) return null;

  const texto = (motivo: Extract<EntregaDoAudio, { formato: "texto" }>["motivo"]): EntregaDoAudio => {
    deps.aoCairEmTexto?.(motivo);
    return { formato: "texto", motivo };
  };

  let configLida: ConfigDeAudio | null = null;
  const configDaOrganizacao = async (): Promise<ConfigDeAudio> => {
    if (configLida === null) configLida = lerConfigDeAudio(await deps.lerSettings());
    return configLida;
  };

  /** A decisão pura, alimentada pelas leituras. Perguntas baratas primeiro: só quem passa por elas toca a chave. */
  const decidir = async (textoFinal: string) => {
    const config = await configDaOrganizacao();
    const ligada = config.ligado && config.aceite !== null;
    // As leituras seguem a ORDEM da decisão e param onde ela já decidiu: o canal só
    // é perguntado se o cliente mandou áudio, e a chave só se o canal serve.
    const canalAceita =
      ligada && entrada.clienteMandouAudio ? suportaNotaDeVoz(await deps.provedorDoCanal()) : false;
    const chavePresente = canalAceita ? await deps.chaveConfigurada(config.provedor) : false;
    const decisao = decidirRespostaEmAudio({
      config,
      chavePresente,
      agente: { ativado: true, voz: entrada.agente.voz },
      clienteMandouAudio: entrada.clienteMandouAudio,
      canalAceitaNotaDeVoz: canalAceita,
      texto: textoFinal,
    });
    return { config, decisao };
  };

  return {
    async simular(textoFinal) {
      try {
        const { decisao } = await decidir(textoFinal);
        return decisao.vai ? { formato: "audio" } : { formato: "texto", motivo: decisao.motivo };
      } catch {
        return { formato: "texto", motivo: "desligado_na_organizacao" };
      }
    },

    async entregar(textoFinal, seq) {
      try {
        const { config, decisao } = await decidir(textoFinal);
        if (!decisao.vai) return texto(decisao.motivo);

        const chave = await deps.lerChave(config.provedor);
        if (!chave) return texto("sem_chave");

        const modelo = modeloEmVigor(config, entrada.agente.modelo);
        const provedor = criarProvedorDeVoz({
          provedor: config.provedor,
          chave,
          config,
          ...(deps.fetch ? { fetch: deps.fetch } : {}),
          ...(deps.enderecoDaElevenLabs ? { enderecoDaElevenLabs: deps.enderecoDaElevenLabs } : {}),
        });
        const r = await gerarNotaDeVozDaResposta(
          {
            provedor,
            converter: deps.converter ?? ((a) => paraNotaDeVoz(a)),
            guardar: deps.guardar,
            registrarUso: deps.registrarUso,
            agora: deps.agora ?? (() => performance.now()),
          },
          {
            organizationId: entrada.organizationId,
            conversationId: entrada.conversationId,
            contactId: entrada.contactId,
            jobId: entrada.jobId,
            agentId: entrada.agentId,
            seq,
            texto: textoFinal,
            voz: entrada.agente.voz ?? config.voz,
            modelo: entrada.agente.modelo ?? config.modelo,
            provedor: config.provedor,
            modeloEmVigor: modelo,
            endereco: config.endereco,
            custoDeclaradoPorMil: config.custo_por_mil_caracteres_cents,
          },
        );
        if (!r.ok) return texto(r.motivo);
        return { formato: "audio", storagePath: r.storagePath, mime: r.mime, caracteres: r.caracteres };
      } catch {
        // Defesa em profundidade: as peças acima já não lançam. Se alguma lançar
        // um dia, o cliente recebe texto — nunca silêncio.
        return texto("indisponivel");
      }
    },
  };
}

/**
 * A última mensagem DO CLIENTE (a que este turno responde) foi um áudio?
 *
 * Lê o histórico que o turno já carregou — nenhuma consulta a mais. O `type` só
 * vem preenchido em mensagem com mídia (`get-lead-context`), e áudio é sempre
 * mídia. Mensagem de texto depois do áudio muda a resposta: o agente espelha o
 * formato do que o cliente mandou por ÚLTIMO.
 */
export function ultimaMensagemDoClienteFoiAudio(
  mensagens: ReadonlyArray<{ direction: string; type?: string | null }>,
): boolean {
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction === "inbound") return m.type === "audio";
  }
  return false;
}
