import type { PersistedPortfolioV1 } from './persistence';
import { coercePersistedPortfolio } from './persistence';

export const PORTFOLIO_EXPORT_VERSION = 1;

export const TRADEROS_EXPORT_FORMAT = 'traderos-portfolio-export' as const;

export interface PortfolioExportFileV1 {
  format: typeof TRADEROS_EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  portfolio: PersistedPortfolioV1;
}

export function buildExportFile(
  portfolio: PersistedPortfolioV1,
): PortfolioExportFileV1 {
  return {
    format: TRADEROS_EXPORT_FORMAT,
    version: PORTFOLIO_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    portfolio,
  };
}

/**보내기 JSON 또는 예전 로컬 저장 원본(객체) */
export function parsePortfolioImportJson(text: string): PersistedPortfolioV1 | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  if (o.format === TRADEROS_EXPORT_FORMAT && o.portfolio !== undefined) {
    return coercePersistedPortfolio(o.portfolio);
  }
  return coercePersistedPortfolio(parsed);
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}
