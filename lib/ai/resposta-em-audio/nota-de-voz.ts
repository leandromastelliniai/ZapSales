/**
 * O áudio do provedor de voz → NOTA DE VOZ do WhatsApp (ogg/opus).
 *
 * Os dois canais aceitam só `audio/ogg;codecs=opus` como nota de voz: o oficial
 * recusa mp3 com a bolha de voz (a Meta NÃO converte) e o canal por QR code
 * converte por conta própria, mas com risco. Converter aqui, uma vez, entrega o
 * mesmo arquivo válido para os dois. É a conversão de mídia que o produto já
 * tem (`lib/messaging/media/voice-transcode.ts`, o mesmo `ffmpeg` da imagem) —
 * a diferença é que ali o codec já é opus e só o container troca (`-c:a copy`),
 * e aqui o provedor entrega mp3 e é preciso codificar de verdade.
 *
 * `voip`, 32 kbps, mono, 48 kHz: voz falada, arquivo pequeno (a URL assinada é
 * baixada pelo canal em segundos) e o mesmo perfil que o aplicativo grava.
 *
 * Diferente de `transcodificarNotaDeVoz`, falhar AQUI lança: aquele devolve o
 * original intacto porque um áudio talvez aceito é melhor que nenhum envio;
 * aqui o original (mp3) é um arquivo que o canal recusa, e quem chama precisa
 * saber para cair em texto em vez de mandar uma nota de voz quebrada.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { VOICE_MIME, runFfmpeg } from "@/lib/messaging/media/voice-transcode";

import { ErroDeVoz } from "./tipos";

export { VOICE_MIME };

/** O teto do arquivo que entra no ffmpeg. Maior que isso nem é voz de WhatsApp. */
const MAX_BYTES_DE_ENTRADA = 10 * 1024 * 1024;

export interface NotaDeVoz {
  buffer: Buffer;
  mime: string;
}

export async function paraNotaDeVoz(
  audio: { bytes: Buffer; mime: string },
  deps: { run?: (args: string[], cwd: string) => Promise<void> } = {},
): Promise<NotaDeVoz> {
  if (audio.bytes.length === 0 || audio.bytes.length > MAX_BYTES_DE_ENTRADA) {
    throw new ErroDeVoz("conversao_falhou", { detalhe: `entrada de ${audio.bytes.length} bytes` });
  }
  const executar = deps.run ?? runFfmpeg;
  const dir = await mkdtemp(join(tmpdir(), "resposta-em-audio-"));
  try {
    const entrada = join(dir, "in.audio");
    const saida = join(dir, "out.ogg");
    await writeFile(entrada, audio.bytes);
    await executar(
      ["-i", entrada, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-application", "voip", "-f", "ogg", saida],
      dir,
    );
    const buffer = await readFile(saida);
    if (buffer.length === 0) throw new ErroDeVoz("conversao_falhou", { detalhe: "saída vazia" });
    return { buffer, mime: VOICE_MIME };
  } catch (err) {
    if (err instanceof ErroDeVoz) throw err;
    throw new ErroDeVoz("conversao_falhou", {
      detalhe: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
