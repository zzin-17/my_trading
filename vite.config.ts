import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fetchKrQuote } from './api/krQuoteFetch.js';

export default defineConfig({
  /** 같은 Wi‑Fi의 아이폰 등에서 http://<맥 IP>:5173 접속 가능 */
  server: {
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase';
          }
          if (id.includes('node_modules/recharts')) {
            return 'vendor-recharts';
          }
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'krx-kind-dev-api',
      configureServer(server) {
        server.middlewares.use('/api/kr-quote', async (req, res) => {
          try {
            const reqUrl = (req as { url?: string }).url ?? '/';
            const u = new URL(reqUrl, 'http://vite.local');
            const code = u.searchParams
              .get('code')
              ?.trim()
              .replace(/\s/g, '')
              .toUpperCase();
            const extended =
              u.searchParams.get('extended') === '1' ||
              u.searchParams.get('extended') === 'true';
            if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(
                JSON.stringify({
                  message: '6자리 한국 종목코드(예: 005930, 00680K)가 필요합니다.',
                }),
              );
              return;
            }
            const result = await fetchKrQuote(code, { extended });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(result));
          } catch (e) {
            const msg = e instanceof Error ? e.message : '';
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (msg === 'parse_fail' || msg === 'mobile_parse_fail') {
              res.statusCode = 422;
              res.end(JSON.stringify({ message: '시세 파싱 실패' }));
              return;
            }
            res.statusCode = 502;
            res.end(JSON.stringify({ message: '시세 조회 실패' }));
          }
        });

        server.middlewares.use('/api/krx-kind', async (_req, res) => {
          try {
            const upstream =
              'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13';
            const r = await fetch(upstream, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'text/html,application/xhtml+xml',
              },
            });
            if (!r.ok) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ message: `Upstream error: ${r.status}` }));
              return;
            }
            const body = await r.arrayBuffer();
            const html = new TextDecoder('euc-kr').decode(body);
            const stockItems = parseKrxCorpList(html);
            const mergeListedFundsModule = (await import(
              './api/mergeListedFunds.js'
            )) as unknown as {
              fetchNaverEtfEtnRows: () => Promise<
                { ticker: string; name: string; sector: string; board: string }[]
              >;
              fetchNaverPreferredStockRows: (
                stockItems: { ticker: string; name: string; sector: string; board: string }[],
              ) => Promise<{ ticker: string; name: string; sector: string; board: string }[]>;
              mergeStockAndFunds: (
                stockItems: { ticker: string; name: string; sector: string; board: string }[],
                fundItems: { ticker: string; name: string; sector: string; board: string }[],
                preferredItems?: { ticker: string; name: string; sector: string; board: string }[],
              ) => { ticker: string; name: string; sector: string; board: string }[];
            };
            const {
              fetchNaverEtfEtnRows,
              fetchNaverPreferredStockRows,
              mergeStockAndFunds,
            } = mergeListedFundsModule;
            const [fundItems, preferredItems] = await Promise.all([
              fetchNaverEtfEtnRows(),
              fetchNaverPreferredStockRows(stockItems),
            ]);
            const items = mergeStockAndFunds(stockItems, fundItems, preferredItems);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ items }));
          } catch {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ message: 'Failed to fetch KRX listing' }));
          }
        });
      },
    },
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

/** KRX KIND 상장목록: 1열 회사명, 2열 시장, 3열 종목코드, 4열 업종(표준산업분류 문구) */
function parseKrxCorpList(html: string): {
  ticker: string;
  name: string;
  sector: string;
  board: string;
}[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const items: {
    ticker: string;
    name: string;
    sector: string;
    board: string;
  }[] = [];
  for (const row of rows) {
    const tds = row.match(/<td[\s\S]*?<\/td>/gi) ?? [];
    if (tds.length < 4) continue;
    const name = stripTags(tds[0] ?? '').replace(/\s+/g, ' ').trim();
    const marketRaw = stripTags(tds[1] ?? '').replace(/\s+/g, ' ').trim();
    const ticker = stripTags(tds[2] ?? '')
      .replace(/\s/g, '')
      .toUpperCase();
    const sectorRaw = stripTags(tds[3] ?? '').replace(/\s+/g, ' ').trim();
    const sector = sectorRaw || '기타';
    const board = normalizeKrxBoard(marketRaw);
    if (!name || !/^[A-Z0-9]{6}$/.test(ticker)) continue;
    items.push({ ticker, name, sector, board });
  }
  return items;
}

function normalizeKrxBoard(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/코스닥|KOSDAQ/i.test(s)) return '코스닥';
  if (/^유가|유가증권|코스피|KOSPI/i.test(s)) return '코스피';
  if (/코넥스|KONEX/i.test(s)) return '코넥스';
  return s;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
