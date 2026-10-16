import { describe, expect, it } from 'vitest';

import { corpoDoEnvio, type SendMessageInput } from './send-message';

const base: SendMessageInput = {
  tenantId: 'org-1',
  leadId: 'lead-1',
  jobId: 'job-1',
  seq: 1,
  conversationId: 'conv-1',
  body: 'Claro, posso ajudar.',
};

describe('corpoDoEnvio — o tipo que o handler de mensagens recebe', () => {
  it('texto: sem mídia', () => {
    const c = corpoDoEnvio(base, 'ik-1');
    expect(c).toMatchObject({ conversation_id: 'conv-1', type: 'text', body: 'Claro, posso ajudar.' });
    expect(c).not.toHaveProperty('media_storage_path');
  });

  it('mídia sem `kind` continua sendo IMAGEM — a foto do catálogo não muda', () => {
    const c = corpoDoEnvio(
      { ...base, media: { storagePath: 'org-1/conv-1/catalogo-a.jpg', mime: 'image/jpeg' } },
      'ik-1',
    );
    expect(c).toMatchObject({
      type: 'image',
      media_storage_path: 'org-1/conv-1/catalogo-a.jpg',
      media_mime: 'image/jpeg',
      body: 'Claro, posso ajudar.',
    });
  });

  it('a nota de voz da resposta em áudio vai como ÁUDIO, com o texto da resposta como corpo', () => {
    const c = corpoDoEnvio(
      {
        ...base,
        media: { storagePath: 'org-1/conv-1/resposta-em-audio-job-1-1.ogg', mime: 'audio/ogg;codecs=opus', kind: 'audio' },
      },
      'ik-1',
    );
    expect(c).toMatchObject({
      type: 'audio',
      media_storage_path: 'org-1/conv-1/resposta-em-audio-job-1-1.ogg',
      media_mime: 'audio/ogg;codecs=opus',
      // O texto fica na mensagem: a conversa nunca perde o que foi dito.
      body: 'Claro, posso ajudar.',
      metadata: { idempotency_key: 'ik-1' },
    });
  });

  it('a chave de idempotência acompanha qualquer forma de envio', () => {
    for (const media of [undefined, { storagePath: 'p', mime: 'audio/ogg', kind: 'audio' as const }]) {
      expect(corpoDoEnvio({ ...base, ...(media ? { media } : {}) }, 'ik-9').metadata).toEqual({
        idempotency_key: 'ik-9',
      });
    }
  });
});
