import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'krx-kind-dev-api',
      configureServer(server) {
        server.middlewares.use('/api/kr-quote', async (req, res) => {
          try {
            const reqUrl = (req as { url?: string }).url ?? '/';
            const u = new URL(reqUrl, 'http://vite.local');
            const code = u.searchParams.get('code');
            if (!code || !/^\d{6}$/.test(code)) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(
                JSON.stringify({ message: '6자리 숫자 종목코드가 필요합니다.' }),
              );
              return;
            }
            const upstream = `https://finance.naver.com/item/main.naver?code=${code}`;
            const r = await fetch(upstream, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                Accept: 'text/html,application/xhtml+xml',
              },
            });
            if (!r.ok) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ message: `Upstream ${r.status}` }));
              return;
            }
            const html = await r.text();
            const price = parseNaverMainPrice(html);
            if (price === null) {
              res.statusCode = 422;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ message: '시세 파싱 실패' }));
              return;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                price,
                fetchedAt: new Date().toISOString(),
                source: 'naver_finance_delayed',
              }),
            );
          } catch {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
            const { fetchNaverEtfEtnRows, mergeStockAndFunds } = await import(
              './api/mergeListedFunds.js'
            );
            const fundItems = await fetchNaverEtfEtnRows();
            const items = mergeStockAndFunds(stockItems, fundItems);
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

function parseNaverMainPrice(html: string): number | null {
  let m = html.match(/오늘의시세\s*([\d,]+)\s*포인트/);
  if (!m) {
    const krx = html.match(/id="rate_info_krx"[\s\S]*?<\/table>/);
    if (krx) m = krx[0].match(/오늘의시세\s*([\d,]+)\s*포인트/);
  }
  if (!m) {
    const block = html.match(/<p class="no_today"[\s\S]*?<\/p>/);
    if (block) m = block[0].match(/<span class="blind">([\d,]+)<\/span>/);
  }
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
