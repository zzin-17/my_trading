/**
 * Hosting 리라이트(/api/*) 대상 — 루트 `api/`를 배포 직전에 복사해 둔다(npm run predeploy:functions).
 */
import { onRequest } from 'firebase-functions/v2/https';
import krQuoteHandler from './api/kr-quote.js';
import krxKindHandler from './api/krx-kind.js';

const opts = {
  region: 'asia-northeast3',
  cors: true,
  invoker: 'public',
};

export const krQuote = onRequest(opts, (req, res) => krQuoteHandler(req, res));
export const krxKind = onRequest(opts, (req, res) => krxKindHandler(req, res));
