import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { VOICE_MIME, paraNotaDeVoz } from "./nota-de-voz";
import { ErroDeVoz } from "./tipos";

describe("paraNotaDeVoz", () => {
  it("pede ao ffmpeg ogg/opus mono de voz — o formato que os dois canais aceitam como nota de voz", async () => {
    let args: string[] = [];
    let entradaLida = "";
    const nota = await paraNotaDeVoz(
      { bytes: Buffer.from("mp3-de-mentira"), mime: "audio/mpeg" },
      {
        run: async (a, cwd) => {
          args = a;
          entradaLida = await readFile(join(cwd, "in.audio"), "utf8");
          await writeFile(join(cwd, "out.ogg"), Buffer.from("ogg-de-mentira"));
        },
      },
    );
    expect(nota.mime).toBe(VOICE_MIME);
    expect(nota.mime).toBe("audio/ogg;codecs=opus");
    expect(nota.buffer.toString()).toBe("ogg-de-mentira");
    expect(entradaLida).toBe("mp3-de-mentira");
    // codifica de verdade (não é `-c:a copy`: a entrada é mp3, não opus)
    expect(args).toEqual(expect.arrayContaining(["-c:a", "libopus", "-ac", "1", "-ar", "48000", "-f", "ogg"]));
    expect(args).not.toContain("copy");
    expect(args).toContain("-vn");
  });

  it("ffmpeg que falha LANÇA conversao_falhou (um mp3 de volta seria uma nota de voz quebrada)", async () => {
    await expect(
      paraNotaDeVoz(
        { bytes: Buffer.from("x"), mime: "audio/mpeg" },
        {
          run: async () => {
            throw new Error("ffmpeg_spawn_failed: ENOENT");
          },
        },
      ),
    ).rejects.toMatchObject({ motivo: "conversao_falhou" });
  });

  it("saída vazia também é falha", async () => {
    await expect(
      paraNotaDeVoz(
        { bytes: Buffer.from("x"), mime: "audio/mpeg" },
        { run: async (_a, cwd) => writeFile(join(cwd, "out.ogg"), Buffer.alloc(0)) },
      ),
    ).rejects.toBeInstanceOf(ErroDeVoz);
  });

  it("entrada vazia ou gigante nem chega ao ffmpeg", async () => {
    let chamou = false;
    const run = async () => {
      chamou = true;
    };
    await expect(paraNotaDeVoz({ bytes: Buffer.alloc(0), mime: "audio/mpeg" }, { run })).rejects.toMatchObject({
      motivo: "conversao_falhou",
    });
    await expect(
      paraNotaDeVoz({ bytes: Buffer.alloc(11 * 1024 * 1024), mime: "audio/mpeg" }, { run }),
    ).rejects.toMatchObject({ motivo: "conversao_falhou" });
    expect(chamou).toBe(false);
  });
});
