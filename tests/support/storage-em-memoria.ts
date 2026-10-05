/**
 * O STORAGE EM MEMÓRIA — a fronteira de teste do bucket (issue #7).
 *
 * `pgComoSupabase` fala com o Postgres de verdade, mas o Storage do Supabase é
 * outro serviço (API HTTP sobre `storage.objects`), que o Postgres efêmero dos
 * invariantes não tem. Este dublê guarda os bytes de cada `upload` e assina
 * links falsos, com a forma do cliente `supabase.storage.from(bucket)` que as
 * rotas usam. O que ele prova é o que CHEGOU ao bucket: caminho, bytes e tipo.
 *
 * Como o Storage real, recusa sobrescrever sem `upsert` — a rota que gera
 * caminho novo a cada envio não pode depender de sobrescrita.
 */
export interface ObjetoGuardado {
  bucket: string;
  path: string;
  bytes: Uint8Array;
  contentType: string | undefined;
}

export interface StorageEmMemoria {
  objetos: Map<string, ObjetoGuardado>;
  /** Faz o próximo `upload` falhar com esta mensagem. */
  falharProximoUpload(mensagem: string): void;
  from(bucket: string): {
    upload(
      path: string,
      corpo: Uint8Array | ArrayBuffer | Blob,
      opcoes?: { contentType?: string; upsert?: boolean },
    ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
    createSignedUrl(
      path: string,
      segundos: number,
    ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    createSignedUrls(
      paths: string[],
      segundos: number,
    ): Promise<{
      data: Array<{ path: string | null; signedUrl: string | null; error: string | null }>;
      error: null;
    }>;
  };
}

const assinar = (bucket: string, path: string, segundos: number) =>
  `https://storage.teste.local/${bucket}/${path}?token=assinado&expira=${segundos}`;

export function storageEmMemoria(): StorageEmMemoria {
  const objetos = new Map<string, ObjetoGuardado>();
  let falhaProgramada: string | null = null;

  return {
    objetos,
    falharProximoUpload: (mensagem) => {
      falhaProgramada = mensagem;
    },
    from: (bucket) => ({
      async upload(path, corpo, opcoes) {
        if (falhaProgramada) {
          const message = falhaProgramada;
          falhaProgramada = null;
          return { data: null, error: { message } };
        }
        const chave = `${bucket}/${path}`;
        if (objetos.has(chave) && !opcoes?.upsert) {
          return { data: null, error: { message: "The resource already exists" } };
        }
        const bytes =
          corpo instanceof Uint8Array
            ? new Uint8Array(corpo)
            : corpo instanceof ArrayBuffer
              ? new Uint8Array(corpo)
              : new Uint8Array(await corpo.arrayBuffer());
        objetos.set(chave, { bucket, path, bytes, contentType: opcoes?.contentType });
        return { data: { path }, error: null };
      },
      async createSignedUrl(path, segundos) {
        if (!objetos.has(`${bucket}/${path}`))
          return { data: null, error: { message: "Object not found" } };
        return { data: { signedUrl: assinar(bucket, path, segundos) }, error: null };
      },
      // Como a API real: um item por caminho, com erro no item que não existe.
      async createSignedUrls(paths, segundos) {
        return {
          data: paths.map((path) =>
            objetos.has(`${bucket}/${path}`)
              ? { path, signedUrl: assinar(bucket, path, segundos), error: null }
              : {
                  path,
                  signedUrl: null,
                  error: "Either the object does not exist or you do not have access to it",
                },
          ),
          error: null,
        };
      },
    }),
  };
}
