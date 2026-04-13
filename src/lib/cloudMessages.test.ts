import { describe, expect, it } from 'vitest';
import { humanizeCloudError } from './cloudMessages';

describe('humanizeCloudError', () => {
  it('Firebase permission-denied는 한국어 안내', () => {
    const e = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    });
    expect(humanizeCloudError(e)).toContain('보안 규칙');
  });

  it('unavailable은 연결 안내', () => {
    const e = Object.assign(new Error(''), { code: 'unavailable' });
    expect(humanizeCloudError(e)).toContain('연결');
  });

  it('일반 Error 메시지는 그대로 사용', () => {
    expect(humanizeCloudError(new Error('커스텀'))).toBe('커스텀');
  });

  it('알 수 없는 값은 기본 문구', () => {
    expect(humanizeCloudError(null)).toBe('클라우드 작업에 실패했습니다.');
  });
});
