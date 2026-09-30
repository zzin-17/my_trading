import { describe, expect, it } from 'vitest';
import { krPnLTextClass, pnlTextClass, pnlToneClass } from './pnlTone';

describe('pnlTone', () => {
  it('한국 관례는 플러스 빨강, 마이너스 파랑', () => {
    expect(krPnLTextClass(1)).toBe('text-red-400');
    expect(krPnLTextClass(-1)).toBe('text-blue-400');
    expect(krPnLTextClass(0)).toBe('text-textMain');
  });

  it('일반 관례는 플러스 초록, 마이너스 빨강', () => {
    expect(pnlTextClass(1, false)).toBe('text-positive');
    expect(pnlTextClass(-1, false)).toBe('text-negative');
  });

  it('tone pos/neg도 한국 관례를 따른다', () => {
    expect(pnlToneClass('pos', true)).toBe('text-red-400');
    expect(pnlToneClass('neg', true)).toBe('text-blue-400');
    expect(pnlToneClass('pos', false)).toBe('text-positive');
  });
});
