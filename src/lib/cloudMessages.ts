/**
 * Firebase·fetch 계열 오류를 사용자에게 보여줄 짧은 한국어 문구로 정리합니다.
 */
export function humanizeCloudError(e: unknown): string {
  const msg =
    e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const code =
    e &&
    typeof e === 'object' &&
    'code' in e &&
    typeof (e as { code: unknown }).code === 'string'
      ? (e as { code: string }).code
      : '';

  switch (code) {
    case 'unavailable':
    case 'deadline-exceeded':
    case 'aborted':
      return '서버 응답이 없거나 지연되었습니다. Wi‑Fi·데이터 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'auth/network-request-failed':
      return '네트워크 오류로 로그인에 실패했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
    case 'permission-denied':
      return 'Firestore 접근이 거부되었습니다. 보안 규칙과 프로젝트 설정을 확인해 주세요.';
    case 'unauthenticated':
      return '인증이 만료되었을 수 있습니다. 다시 로그인해 주세요.';
    case 'resource-exhausted':
      return '할당량 초과 등으로 저장할 수 없습니다. Firebase 콘솔을 확인하거나 잠시 후 다시 시도해 주세요.';
    default:
      break;
  }

  if (/network|offline|failed to fetch|load failed|네트워크/i.test(msg)) {
    return '네트워크 오류입니다. 연결을 확인한 뒤 다시 시도해 주세요.';
  }

  if (e instanceof Error && msg.trim()) return msg.trim();
  return '클라우드 작업에 실패했습니다.';
}
