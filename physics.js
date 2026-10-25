'use strict';

/*
 * 캐롬 당구 물리 엔진 (결정론적)
 *  - 좌표계: x 오른쪽, y 위쪽, z 하늘 방향 (수학 좌표계). 렌더링에서만 y를 뒤집는다.
 *  - 단위: m, kg, s
 *  - 같은 입력(각도/당점/세기)은 항상 같은 결과를 만든다. (난수 없음)
 */

const PHYS = {
  R: 0.03275,        // 공 반지름 (지름 65.5mm 캐롬구)
  m: 0.210,          // 공 질량
  g: 9.81,
  muSlide: 0.20,     // 미끄럼 마찰 (라사-공)
  muRoll: 0.018,     // 구름 마찰
  muSpin: 0.022,     // 제자리 회전(횡회전) 감쇠
  eBall: 0.95,       // 공-공 반발계수
  muBall: 0.06,      // 공-공 마찰 (던지기/throw)
  eCushion: 0.80,    // 쿠션 반발계수
  muCushion: 0.20,   // 쿠션 마찰 (회전 → 입사각 변화)
  vStop: 0.012,      // 정지 판정 속도
  vGraze: 0.030,     // 이 속도 미만의 쿠션 접촉은 '기대어 구름'으로 처리
  maxTip: 0.55,      // 미스큐 한계 (반지름 비율)
  minSpeed: 0.40,    // 세기 0%
  maxSpeed: 6.00     // 세기 100%
};

// 테이블 유효 경기면 치수
const TABLES = {
  medium: { key: 'medium', name: '중대 254 x 127', w: 2.540, h: 1.270 },
  large:  { key: 'large',  name: '대대 284 x 142', w: 2.845, h: 1.4225 }
};

function Ball(id, color, label) {
  this.id = id;
  this.color = color;
  this.label = label;
  this.x = 0; this.y = 0;
  this.vx = 0; this.vy = 0;
  this.wx = 0; this.wy = 0; this.wz = 0;
}

Ball.prototype.place = function (x, y) {
  this.x = x; this.y = y;
  this.vx = this.vy = 0;
  this.wx = this.wy = this.wz = 0;
  return this;
};

Ball.prototype.speed = function () {
  return Math.hypot(this.vx, this.vy);
};

Ball.prototype.copy = function () {
  const b = new Ball(this.id, this.color, this.label);
  b.x = this.x; b.y = this.y;
  b.vx = this.vx; b.vy = this.vy;
  b.wx = this.wx; b.wy = this.wy; b.wz = this.wz;
  return b;
};

/* ---------------------------------------------------------------- 시뮬레이터 */

function Sim(tableW, tableH, balls) {
  this.w = tableW;
  this.h = tableH;
  this.balls = balls;
  this.t = 0;
  this.events = [];
}

Sim.prototype.copy = function () {
  const s = new Sim(this.w, this.h, this.balls.map(b => b.copy()));
  s.t = this.t;
  return s;
};

Sim.prototype.isMoving = function () {
  for (const b of this.balls) {
    if (b.vx !== 0 || b.vy !== 0) return true;
  }
  return false;
};

/** 큐로 공을 때린다. angle: 라디안, power: 0~1, tipH/tipV: 당점(반지름 비율) */
Sim.prototype.strike = function (ball, angle, power, tipH, tipV) {
  const R = PHYS.R;
  const speed = PHYS.minSpeed + power * (PHYS.maxSpeed - PHYS.minSpeed);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const px = -dy, py = dx;              // 진행방향 기준 왼쪽

  ball.vx = speed * dx;
  ball.vy = speed * dy;

  // 상/하 당점 → 전진/후진 회전 (tipV = 0.4 이면 자연 구름)
  const roll = 2.5 * speed * tipV / R;
  ball.wx = roll * px;
  ball.wy = roll * py;

  // 좌/우 당점 → 횡회전 (tipH > 0 : 우측 당점 = 우회전)
  ball.wz = 2.5 * speed * tipH / R;
};

Sim.prototype.step = function (dt) {
  const R = PHYS.R, g = PHYS.g;
  const balls = this.balls;

  for (const b of balls) {
    if (b.vx === 0 && b.vy === 0 && b.wz === 0) continue;

    // 라사와 접촉하는 점의 상대 속도 (미끄럼 여부 판정)
    const ux = b.vx - R * b.wy;
    const uy = b.vy + R * b.wx;
    const us = Math.hypot(ux, uy);

    // 미끄럼 구간에서 슬립은 3.5*mu*g 의 비율로 줄어든다.
    // 한 스텝에 소멸할 양이면 구름 상태로 정확히 스냅시킨다.
    // (스냅하지 않으면 미세 슬립이 남아 구름 마찰이 영구히 적용되지 않는다)
    if (us > 3.5 * PHYS.muSlide * g * dt) {
      const nx = ux / us, ny = uy / us;
      const a = PHYS.muSlide * g;
      b.vx -= a * nx * dt;
      b.vy -= a * ny * dt;
      const k = 2.5 * PHYS.muSlide * g / R;   // 5*mu*g/(2R)
      b.wx += k * (-ny) * dt;
      b.wy += k * (nx) * dt;
    } else {
      // 구름 구간
      b.wy = b.vx / R;
      b.wx = -b.vy / R;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1e-9) {
        const dec = Math.min(PHYS.muRoll * g * dt, sp);
        b.vx -= dec * b.vx / sp;
        b.vy -= dec * b.vy / sp;
        b.wy = b.vx / R;
        b.wx = -b.vy / R;
      }
    }

    // 횡회전 감쇠
    if (b.wz !== 0) {
      const dwz = 2.5 * PHYS.muSpin * g / R * dt;
      b.wz = Math.abs(b.wz) <= dwz ? 0 : b.wz - Math.sign(b.wz) * dwz;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // 정지 처리
    if (Math.hypot(b.vx, b.vy) < PHYS.vStop &&
        Math.hypot(b.vx - R * b.wy, b.vy + R * b.wx) < PHYS.vStop) {
      b.vx = b.vy = 0;
      b.wx = b.wy = 0;
    }
  }

  for (const b of balls) this._cushions(b);

  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      this._ballCollision(balls[i], balls[j]);
    }
  }

  this.t += dt;
};

Sim.prototype._cushions = function (b) {
  const R = PHYS.R;
  if (b.x < R)          this._cushionHit(b, 1, 0, '좌', R, b.y);
  if (b.x > this.w - R) this._cushionHit(b, -1, 0, '우', this.w - R, b.y);
  if (b.y < R)          this._cushionHit(b, 0, 1, '하', b.x, R);
  if (b.y > this.h - R) this._cushionHit(b, 0, -1, '상', b.x, this.h - R);
};

/** n = 테이블 내부를 향하는 단위 법선 */
Sim.prototype._cushionHit = function (b, nx, ny, side, cx, cy) {
  b.x = cx; b.y = cy;                       // 침투 보정

  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return;                      // 이미 빠져나가는 중

  // 쿠션에 기대어 굴러가는 상태: 충돌로 처리하지 않고 법선 성분만 제거한다.
  // (그렇지 않으면 미세 충돌이 매 스텝 반복되며 회전이 속도를 계속 주입한다)
  if (-vn < PHYS.vGraze) {
    b.vx -= vn * nx;
    b.vy -= vn * ny;
    return;
  }

  const tx = -ny, ty = nx;
  const dvn = (1 + PHYS.eCushion) * (-vn);  // 법선 방향 속도 변화량

  // 쿠션 접촉점의 접선 슬립 = v·t - R*wz
  const vt = (b.vx * tx + b.vy * ty) - PHYS.R * b.wz;
  const cap = PHYS.muCushion * dvn;
  let jt = -(2 / 7) * vt;                   // 슬립을 0으로 만드는 충격량/질량
  if (jt > cap) jt = cap;
  if (jt < -cap) jt = -cap;

  b.vx += jt * tx;
  b.vy += jt * ty;
  b.wz += -2.5 * jt / PHYS.R;

  b.vx += dvn * nx;
  b.vy += dvn * ny;

  this.events.push({ t: this.t, type: 'cushion', ball: b.id, side: side });
};

Sim.prototype._ballCollision = function (b1, b2) {
  const R = PHYS.R;
  let dx = b2.x - b1.x, dy = b2.y - b1.y;
  let d = Math.hypot(dx, dy);
  if (d >= 2 * R) return;

  if (d < 1e-9) { dx = 1; dy = 0; d = 1e-9; }
  const nx = dx / d, ny = dy / d;

  // 겹침 분리
  const ov = (2 * R - d) / 2 + 1e-9;
  b1.x -= nx * ov; b1.y -= ny * ov;
  b2.x += nx * ov; b2.y += ny * ov;

  const vn = (b1.vx - b2.vx) * nx + (b1.vy - b2.vy) * ny;
  if (vn <= 0) return;                      // 접근 중이 아니면 무시

  const tx = -ny, ty = nx;
  const jn = 0.5 * (1 + PHYS.eBall) * vn;   // 각 공에 적용되는 속도 변화량

  // 접촉면 슬립 (던지기 효과)
  const vt = (b1.vx - b2.vx) * tx + (b1.vy - b2.vy) * ty + R * (b1.wz + b2.wz);
  const cap = PHYS.muBall * jn;
  let jt = -vt / 7;
  if (jt > cap) jt = cap;
  if (jt < -cap) jt = -cap;

  b1.vx += jt * tx; b1.vy += jt * ty;
  b2.vx -= jt * tx; b2.vy -= jt * ty;
  b1.wz += 2.5 * jt / R;
  b2.wz += 2.5 * jt / R;

  b1.vx -= jn * nx; b1.vy -= jn * ny;
  b2.vx += jn * nx; b2.vy += jn * ny;

  this.events.push({ t: this.t, type: 'hit', ball: b1.id, other: b2.id });
};

/* -------------------------------------------------- 샷 전체를 미리 계산해 둔다 */

const SIM_DT = 1 / 1200;      // 물리 적분 간격
const FRAME_DT = 1 / 120;     // 기록 간격 (재생용)
const MAX_SHOT_TIME = 25;

/**
 * 샷을 끝까지 시뮬레이션한다.
 * @returns {{frames: Array, events: Array, duration: number, traces: Array}}
 */
function simulateShot(sim) {
  const n = sim.balls.length;
  const frames = [];
  const traces = [];
  for (let i = 0; i < n; i++) traces.push([[sim.balls[i].x, sim.balls[i].y]]);

  const pushFrame = () => {
    const f = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      f[i * 2] = sim.balls[i].x;
      f[i * 2 + 1] = sim.balls[i].y;
    }
    frames.push(f);
  };
  pushFrame();

  const stepsPerFrame = Math.round(FRAME_DT / SIM_DT);
  let elapsed = 0;

  while (sim.isMoving() && elapsed < MAX_SHOT_TIME) {
    for (let s = 0; s < stepsPerFrame; s++) sim.step(SIM_DT);
    elapsed += FRAME_DT;
    pushFrame();
    for (let i = 0; i < n; i++) {
      const tr = traces[i];
      const last = tr[tr.length - 1];
      const b = sim.balls[i];
      if (Math.hypot(b.x - last[0], b.y - last[1]) > 0.004) tr.push([b.x, b.y]);
    }
  }

  for (let i = 0; i < n; i++) {
    const b = sim.balls[i];
    traces[i].push([b.x, b.y]);
  }

  return { frames: frames, events: sim.events, duration: elapsed, traces: traces };
}

/**
 * 기록 없이 빠르게 굴린다 (AI 탐색용).
 * stopFn(sim) 이 true 를 돌려주면 즉시 중단한다.
 */
function simulateFast(sim, maxTime, stopFn, dt) {
  const step = dt || SIM_DT;
  const stepsPerChunk = Math.max(1, Math.round(0.05 / step));
  let elapsed = 0;
  const limit = maxTime || MAX_SHOT_TIME;
  while (sim.isMoving() && elapsed < limit) {
    for (let s = 0; s < stepsPerChunk; s++) sim.step(step);
    elapsed += stepsPerChunk * step;
    if (stopFn && stopFn(sim)) break;
  }
  return sim.events;
}

/** 공이 서로 겹치지 않고 테이블 안에 있는지 */
function isValidPlacement(balls, w, h, movingIdx, x, y) {
  const R = PHYS.R;
  if (x < R || x > w - R || y < R || y > h - R) return false;
  for (let i = 0; i < balls.length; i++) {
    if (i === movingIdx) continue;
    if (Math.hypot(balls[i].x - x, balls[i].y - y) < 2 * R + 0.0005) return false;
  }
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PHYS, TABLES, Ball, Sim, simulateShot, simulateFast, isValidPlacement, SIM_DT, FRAME_DT };
}
