import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ATRASO_DA_ABERTURA_MS, depoisDaAbertura, useDepoisDaAbertura } from "./depois-da-abertura";

describe("depois da abertura", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("não roda na hora e roda uma vez depois do atraso", () => {
    const fn = vi.fn();
    depoisDaAbertura(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(ATRASO_DA_ABERTURA_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ATRASO_DA_ABERTURA_MS * 3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("cancelar antes do atraso impede a chamada (a tela saiu antes)", () => {
    const fn = vi.fn();
    const cancelar = depoisDaAbertura(fn);
    cancelar();
    vi.advanceTimersByTime(ATRASO_DA_ABERTURA_MS * 2);
    expect(fn).not.toHaveBeenCalled();
  });

  it("o hook começa falso e vira verdadeiro depois do atraso", () => {
    const { result } = renderHook(() => useDepoisDaAbertura());
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(ATRASO_DA_ABERTURA_MS);
    });
    expect(result.current).toBe(true);
  });
});
