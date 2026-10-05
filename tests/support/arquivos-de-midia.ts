/**
 * Arquivos de mídia mínimos para teste — só os primeiros bytes de cada formato,
 * que é o que `farejarArquivo` (`lib/channels/meta/midia-de-modelo.ts`) olha, e
 * o resto preenchido com um padrão conhecido para o teste comparar o que chegou.
 */
export const ASSINATURAS = {
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  mp4: [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37],
} as const;

export function arquivoDeTeste(cabeca: readonly number[], tamanho = 64): Uint8Array {
  const bytes = new Uint8Array(tamanho);
  bytes.set(cabeca);
  for (let i = cabeca.length; i < tamanho; i++) bytes[i] = i % 251;
  return bytes;
}
