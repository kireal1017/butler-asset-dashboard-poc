import express from 'express';
import { HttpError } from './errors.js';
import { searchComplexes } from './services/complexes.js';
import { createAsset, deleteAsset, getAssetRow, lookupUnit, startInitialCollection } from './services/assets.js';
import { assetDetail, assetSeries, listAssets, refreshOnOpen } from './services/valuation.js';
import { deletePurchase, purchaseCandidates, savePurchase } from './services/purchase.js';
import { assetComparisons, collectComparisons } from './services/comparisons.js';

const EXTERNAL_CODES = new Set(['QUOTA', 'KEY_NOT_REGISTERED', 'EXTERNAL']);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

export function createApp(ctx) {
  const { db, api, collector } = ctx;
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, devFault: api.devFault ?? null, asOf: ctx.asOf() });
  });

  app.get('/api/complexes', (req, res) => {
    res.json({ items: searchComplexes(db, String(req.query.query ?? '')) });
  });

  app.get('/api/units/lookup', wrap(async (req, res) => {
    res.json(await lookupUnit(ctx, { kaptCode: req.query.kaptCode, dong: req.query.dong, ho: req.query.ho }));
  }));

  app.get('/api/collect/progress', (req, res) => {
    res.json({ progress: collector.progress(String(req.query.job ?? '')) });
  });

  app.post('/api/assets', wrap(async (req, res) => {
    res.status(201).json({ asset: await createAsset(ctx, req.body ?? {}) });
  }));

  // refresh=1: 앱을 열 때 한 번 (PRD 7.8 재수집). 진행 상황 폴링은 refresh 없이 상태만 읽는다.
  app.get('/api/assets', (req, res) => {
    if (req.query.refresh === '1') refreshOnOpen(ctx);
    res.json(listAssets(ctx));
  });

  app.get('/api/assets/:id', (req, res) => {
    res.json(assetDetail(ctx, Number(req.params.id)));
  });

  app.get('/api/assets/:id/series', wrap(async (req, res) => {
    const range = String(req.query.range ?? '1y');
    res.json(await assetSeries(ctx, Number(req.params.id), range, { collect: req.query.collect !== '0' }));
  }));

  app.get('/api/assets/:id/progress', (req, res) => {
    const id = Number(req.params.id);
    if (!getAssetRow(db, id)) throw new HttpError(404, 'NO_ASSET', '자산을 찾을 수 없습니다.');
    const series = req.query.range ? collector.progress(`series:${id}:${req.query.range}`) : null;
    res.json({ progress: series ?? collector.progress(`asset:${id}`) });
  });

  // 개선 v2 비교 근거: GET은 읽기만, 빠진 달 수집은 POST만 시작한다
  app.get('/api/assets/:id/comparisons', (req, res) => {
    res.json(assetComparisons(ctx, Number(req.params.id)));
  });

  app.post('/api/assets/:id/comparisons/collect', (req, res) => {
    collectComparisons(ctx, Number(req.params.id));
    res.status(202).json({ ok: true });
  });

  app.post('/api/assets/:id/purchase/candidates', wrap(async (req, res) => {
    res.json(await purchaseCandidates(ctx, Number(req.params.id), String(req.body?.acquisitionYm ?? '')));
  }));

  app.put('/api/assets/:id/purchase', wrap(async (req, res) => {
    await savePurchase(ctx, Number(req.params.id), req.body ?? {});
    res.json(assetDetail(ctx, Number(req.params.id)));
  }));

  app.delete('/api/assets/:id/purchase', (req, res) => {
    deletePurchase(ctx, Number(req.params.id));
    res.status(204).end();
  });

  // 수집 실패 후 "다시 시도"
  app.post('/api/assets/:id/collect', (req, res) => {
    const id = Number(req.params.id);
    if (!getAssetRow(db, id)) throw new HttpError(404, 'NO_ASSET', '자산을 찾을 수 없습니다.');
    startInitialCollection(ctx, id);
    res.status(202).json({ ok: true });
  });

  app.delete('/api/assets/:id', (req, res) => {
    deleteAsset(db, Number(req.params.id));
    res.status(204).end();
  });

  // 오류 응답: 원인과 다음 행동을 한 문장으로 (PRD 13장)
  app.use((err, req, res, next) => {
    // 앱이 정의한 오류만 메시지를 그대로 보여 준다. 그 밖의 오류(SQLite 등)는 code가 있어도 내부 오류로 감춘다.
    const known = err.status || EXTERNAL_CODES.has(err.code);
    const status = err.status ?? (err.code === 'QUOTA' ? 429 : known ? 502 : 500);
    if (status >= 500) console.error('[api]', err.message);
    const message = known ? err.message : '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    res.status(status).json({ error: { code: known ? err.code : 'INTERNAL', message, reason: err.reason } });
  });

  return app;
}
