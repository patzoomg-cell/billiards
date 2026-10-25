'use strict';

/*
 * 가상 인물(로봇) - 결정론적 탐색형 AI
 *  - 스트로크 자체에는 오차가 없다. 항상 계산한 대로 정확히 친다.
 *  - 실력 차이는 '얼마나 촘촘하게/넓게 탐색하는가' 로만 만든다.
 *    초급은 중앙 당점·굵은 각도 간격만 보므로 쉬운 배치만 성공한다.
 */

/*
 * 타법(세기/당점) 조합은 '쉬운 것부터' 순서대로 둔다.
 * 각 레벨은 앞에서 몇 개까지 쓸 수 있는지(strokes)와 조준 각도 간격(angleStep),
 * 그리고 총 시뮬레이션 횟수(budget)로만 구분된다.
 */
const STROKES = [
  { power: 0.60, tipH: 0.00, tipV: 0.35 },   // 자연 밀어치기
  { power: 0.40, tipH: 0.00, tipV: 0.35 },
  { power: 0.80, tipH: 0.00, tipV: 0.35 },
  { power: 0.60, tipH: 0.35, tipV: 0.35 },   // 우회전
  { power: 0.60, tipH: -0.35, tipV: 0.35 },  // 좌회전
  { power: 0.85, tipH: 0.40, tipV: 0.20 },
  { power: 0.85, tipH: -0.40, tipV: 0.20 },
  { power: 0.45, tipH: 0.00, tipV: -0.30 },  // 끌어치기
  { power: 0.70, tipH: 0.25, tipV: -0.30 },
  { power: 0.70, tipH: -0.25, tipV: -0.30 },
  { power: 0.95, tipH: 0.00, tipV: 0.35 },   // 대회전
  { power: 0.50, tipH: 0.45, tipV: 0.10 },
  { power: 0.50, tipH: -0.45, tipV: 0.10 }
];

const AI_LEVELS = {
  easy: {
    key: 'easy', name: '초급',
    angleStep: 3.5, strokes: 3, budget: 320,
    maxPreCushions: 0,     // 빈쿠션(공보다 쿠션을 먼저)은 못 친다
    maxRoute: 4,           // 길고 복잡한 경로는 보지 못한다
    desc: '중앙 당점 밀어치기만. 적구를 직접 맞히는 쉬운 길만 봅니다.'
  },
  mid: {
    key: 'mid', name: '중급',
    angleStep: 3, strokes: 5, budget: 500,
    maxPreCushions: 1,
    maxRoute: 5,
    desc: '좌우 회전과 1쿠션 걸어치기까지 사용합니다.'
  },
  hard: {
    key: 'hard', name: '고급',
    angleStep: 1.5, strokes: 10, budget: 1100,
    maxPreCushions: 3,
    maxRoute: 99,
    desc: '끌어치기·빈쿠션·대회전까지 모두 사용합니다.'
  }
};

/** 수구 경로의 복잡도 (첫 접촉 전 쿠션 수, 두 번째 접촉까지의 쿠션 수) */
function routeInfo(events, cueId) {
  let cushions = 0, contacts = 0;
  let pre = -1, atSecond = 0;
  for (const e of events) {
    if (e.type === 'cushion') {
      if (e.ball === cueId) cushions++;
      continue;
    }
    if (e.ball !== cueId && e.other !== cueId) continue;
    contacts++;
    if (contacts === 1) pre = cushions;
    if (contacts === 2) atSecond = cushions;
  }
  return { preCushions: pre < 0 ? 99 : pre, cushionsBeforeSecond: atSecond, total: cushions };
}

/**
 * 탐색할 샷 후보 목록.
 * 타법 하나로 전체 각도를 먼저 훑고, 다음 타법으로 넘어간다(각도 우선).
 * 각도는 다른 공을 향하는 방향부터 살핀다.
 */
function candidateShots(level, balls, cueId) {
  const cue = balls[cueId];
  const prefer = [];
  for (const b of balls) {
    if (b.id === cueId) continue;
    prefer.push(Math.atan2(b.y - cue.y, b.x - cue.x) * 180 / Math.PI);
  }

  const angles = [];
  const seen = {};
  const push = (deg) => {
    const d = ((deg % 360) + 360) % 360;
    const k = Math.round(d / level.angleStep) % Math.round(360 / level.angleStep);
    if (seen[k]) return;
    seen[k] = 1;
    angles.push(k * level.angleStep);
  };
  for (const p of prefer) {
    for (let d = 0; d <= 45; d += level.angleStep) { push(p + d); push(p - d); }
  }
  for (let d = 0; d < 360; d += level.angleStep) push(d);

  const shots = [];
  for (let si = 0; si < level.strokes && si < STROKES.length; si++) {
    const st = STROKES[si];
    for (const a of angles) {
      shots.push({ angle: a * Math.PI / 180, power: st.power, tipH: st.tipH, tipV: st.tipV });
    }
  }
  return shots;
}

/** 탐색은 거친 간격으로 빠르게, 채택 직전에만 실제 간격으로 재검증한다 */
const AI_DT = 1 / 600;

/** 한 후보를 평가한다. 득점이면 point=1 */
function evaluateShot(modeKey, table, balls, cueId, shot, dt) {
  const sim = new Sim(table.w, table.h, balls.map(b => b.copy()));
  sim.strike(sim.balls[cueId], shot.angle, shot.power, shot.tipH, shot.tipV);

  // 결과가 확정되면 조기 종료 (수구가 필요한 공을 모두 접촉)
  const stop = (s) => {
    let n = 0;
    for (const e of s.events) {
      if (e.type !== 'hit') continue;
      if (e.ball === cueId || e.other === cueId) n++;
    }
    return modeKey === 'three' ? n >= 2 : n >= 3;
  };

  const events = simulateFast(sim, 9, stop, dt);
  const r = judge(modeKey, events, cueId);
  r.route = routeInfo(events, cueId);
  return r;
}

/** 이 레벨의 로봇이 '보고 칠 수 있는' 길인가 */
function acceptable(level, r) {
  return r.point &&
    r.route.preCushions <= level.maxPreCushions &&
    r.route.cushionsBeforeSecond <= level.maxRoute;
}

/**
 * 로봇의 샷을 비동기로 탐색한다 (UI 가 멈추지 않도록 조각내어 실행).
 * @param onDone  function(shot, info)
 */
function aiPlan(modeKey, table, balls, cueId, level, onDone, onProgress) {
  const shots = candidateShots(level, balls, cueId);
  const limit = Math.min(shots.length, level.budget);
  let i = 0;
  let best = null;

  // 한 조각에서 60ms 정도만 계산하고 양보한다 (화면이 멈추지 않을 만큼)
  const chunk = () => {
    const t0 = Date.now();
    while (i < limit) {
      const r = evaluateShot(modeKey, table, balls, cueId, shots[i], AI_DT);
      if (acceptable(level, r)) {
        // 실제 재생과 같은 간격으로 재확인 (거친 간격의 오차로 빗나가는 경우 제외)
        const v = evaluateShot(modeKey, table, balls, cueId, shots[i], SIM_DT);
        if (v.point) { best = shots[i]; i++; break; }
      }
      i++;
      if (Date.now() - t0 > 60) break;
    }
    if (best || i >= limit) {
      onDone(best || fallbackShot(balls, cueId), { searched: i, found: !!best });
      return;
    }
    if (onProgress) onProgress(i / limit);
    setTimeout(chunk, 0);
  };
  setTimeout(chunk, 0);
}

/** 해답을 못 찾으면 가장 가까운 공을 향해 약하게 친다 */
function fallbackShot(balls, cueId) {
  const cue = balls[cueId];
  let target = null, bd = Infinity;
  for (const b of balls) {
    if (b.id === cueId) continue;
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (d < bd) { bd = d; target = b; }
  }
  return {
    angle: Math.atan2(target.y - cue.y, target.x - cue.x),
    power: 0.45, tipH: 0, tipV: 0.2
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AI_LEVELS, candidateShots, evaluateShot, aiPlan };
}
