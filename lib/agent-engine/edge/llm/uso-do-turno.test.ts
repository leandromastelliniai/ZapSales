import { describe, expect, it } from 'vitest';

import { medirUsoDoTurno, somarUsoDoTurno } from './uso-do-turno';

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('medirUsoDoTurno — o gasto de TODAS as chamadas ao modelo de um turno', () => {
  it('soma as chamadas feitas dentro da medição, inclusive as de funções chamadas por ela', async () => {
    const auxiliar = async () => {
      await pausa(1);
      somarUsoDoTurno({ tokensIn: 100, tokensOut: 10, costCents: 0.25 });
    };
    const { uso, resultado } = await medirUsoDoTurno(async () => {
      somarUsoDoTurno({ tokensIn: 1000, tokensOut: 200, costCents: 1 });
      await auxiliar();
      return 'ok';
    });
    expect(resultado).toBe('ok');
    expect(uso).toEqual({ tokensIn: 1100, tokensOut: 210, costCents: 1.25 });
  });

  it('duas medições ao mesmo tempo não se misturam (dois testes em paralelo na mesma instância)', async () => {
    const [a, b] = await Promise.all([
      medirUsoDoTurno(async () => {
        await pausa(5);
        somarUsoDoTurno({ tokensIn: 1, tokensOut: 1, costCents: 1 });
      }),
      medirUsoDoTurno(async () => {
        somarUsoDoTurno({ tokensIn: 7, tokensOut: 7, costCents: 7 });
        await pausa(10);
      }),
    ]);
    expect(a.uso.costCents).toBe(1);
    expect(b.uso.costCents).toBe(7);
  });

  it('fora de uma medição somar não faz nada (o turno real não paga por isto)', () => {
    expect(() => somarUsoDoTurno({ tokensIn: 1, tokensOut: 1, costCents: 1 })).not.toThrow();
  });

  it('chamada sem custo conhecido (modelo sem preço) conta os tokens e não inventa custo', async () => {
    const { uso } = await medirUsoDoTurno(async () => {
      somarUsoDoTurno({ tokensIn: 10, tokensOut: 5, costCents: null });
    });
    expect(uso).toEqual({ tokensIn: 10, tokensOut: 5, costCents: 0 });
  });
});
