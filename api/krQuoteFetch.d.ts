export function fetchKrQuote(
  code: string,
  options: { extended: boolean },
): Promise<{ price: number; fetchedAt: string; source: string }>;
