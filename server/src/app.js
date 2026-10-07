import express from 'express';
import { HttpError } from './errors.js';
import { searchComplexes } from './services/complexes.js';
import { lookupUnit } from './services/unitLookup.js';
import { refreshOnOpen } from './services/valuation.js';
import { collectComparisons, subjectComparisons } from './services/comparisons.js';
import {
  createBuilding, createUnit, deleteBuilding, deleteUnit, getBuilding, getUnit, listBuildings, updateBuilding, updateUnit,
} from './services/buildings.js';
import { refreshUnitValue, subjectOf, suggestPurchase, unitRow, unitValue } from './services/unitValue.js';
import { createLease, deleteLease, getLease, listLeases, updateLease } from './services/leases.js';

const EXTERNAL_CODES = new Set(['QUOTA', 'KEY_NOT_REGISTERED', 'EXTERNAL']);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const idOf = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'NOT_FOUND', '찾을 수 없어요.');
  return id;
};

export function createApp(ctx) {
  const { db, api, collector } = ctx;
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, devFault: api.devFault ?? null, asOf: ctx.asOf(), today: ctx.today?.() ?? null });
  });

  // 주소 검색(바텀시트): 기존 단지 검색 그대로
  app.get('/api/complexes', (req, res) => {
    res.json({ items: searchComplexes(db, String(req.query.query ?? '')) });
  });

  app.get('/api/units/lookup', wrap(async (req, res) => {
    res.json(await lookupUnit(ctx, { kaptCode: req.query.kaptCode, dong: req.query.dong, ho: req.query.ho }));
  }));

  app.get('/api/collect/progress', (req, res) => {
    res.json({ progress: collector.progress(String(req.query.job ?? '')) });
  });

  // ---- 건물 (4.2~4.4) ----
  // refresh=1: 전체 메뉴·건물 관리를 열 때 한 번, 최근 12개월 중 30일 지난 달을 다시 받는다.
  app.get('/api/buildings', (req, res) => {
    if (req.query.refresh === '1') refreshOnOpen(ctx);
    res.json(listBuildings(ctx));
  });
  app.post('/api/buildings', wrap(async (req, res) => {
    res.status(201).json({ building: await createBuilding(ctx, req.body ?? {}) });
  }));
  app.get('/api/buildings/:id', (req, res) => res.json(getBuilding(ctx, idOf(req))));
  app.put('/api/buildings/:id', (req, res) => res.json({ building: updateBuilding(ctx, idOf(req), req.body ?? {}) }));
  app.delete('/api/buildings/:id', (req, res) => {
    deleteBuilding(ctx, idOf(req));
    res.status(204).end();
  });

  // ---- 호실 (4.5, 4.6) ----
  app.post('/api/buildings/:id/units', wrap(async (req, res) => {
    res.status(201).json({ unit: await createUnit(ctx, idOf(req), req.body ?? {}) });
  }));
  app.get('/api/units/:id', (req, res) => res.json(getUnit(ctx, idOf(req))));
  app.put('/api/units/:id', (req, res) => res.json(updateUnit(ctx, idOf(req), req.body ?? {})));
  app.delete('/api/units/:id', (req, res) => {
    deleteUnit(ctx, idOf(req));
    res.status(204).end();
  });
  app.get('/api/units/:id/progress', (req, res) => {
    const id = idOf(req);
    unitRow(db, id);
    const job = ['refresh', 'recent', 'floor'].map((k) => collector.progress(`${k}:${id}`)).find((p) => p?.running) ?? null;
    res.json({ progress: job });
  });

  // ---- 자산 분석 매매 시세 (4.8 카드 ③) ----
  app.get('/api/units/:id/value', (req, res) => res.json(unitValue(ctx, idOf(req))));
  app.post('/api/units/:id/value/refresh', (req, res) => res.status(202).json(refreshUnitValue(ctx, idOf(req))));
  // GET은 읽기만, 빠진 달 수집은 POST만
  app.get('/api/units/:id/comparisons', (req, res) => res.json(subjectComparisons(ctx, subjectOf(unitRow(db, idOf(req))))));
  app.post('/api/units/:id/comparisons/collect', (req, res) => {
    collectComparisons(ctx, subjectOf(unitRow(db, idOf(req))));
    res.status(202).json({ ok: true });
  });
  // 매입가 제안: 취득 시점 최대 6개월을 수집할 수 있으므로 POST
  app.post('/api/purchase-suggestion', wrap(async (req, res) => {
    res.json(await suggestPurchase(ctx, req.body ?? {}));
  }));

  // ---- 임대 계약 (4.9, 4.10) ----
  app.get('/api/leases', (req, res) => res.json(listLeases(ctx)));
  app.post('/api/leases', (req, res) => res.status(201).json(createLease(ctx, req.body ?? {})));
  app.get('/api/leases/:id', (req, res) => res.json(getLease(ctx, idOf(req))));
  app.put('/api/leases/:id', (req, res) => res.json(updateLease(ctx, idOf(req), req.body ?? {})));
  app.delete('/api/leases/:id', (req, res) => {
    deleteLease(ctx, idOf(req));
    res.status(204).end();
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: '찾을 수 없어요.' } });
  });

  // 오류 응답: 원인과 다음 행동을 한 문장으로 (PRD 13장)
  app.use((err, req, res, next) => {
    // 앱이 정의한 오류만 메시지를 그대로 보여 준다. 그 밖의 오류(SQLite 등)는 code가 있어도 내부 오류로 감춘다.
    const known = err.status || EXTERNAL_CODES.has(err.code);
    const status = err.status ?? (err.code === 'QUOTA' ? 429 : known ? 502 : 500);
    if (status >= 500) console.error('[api]', err.message);
    const message = known ? err.message : '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
    res.status(status).json({ error: { code: known ? err.code : 'INTERNAL', message, reason: err.reason } });
  });

  return app;
}
