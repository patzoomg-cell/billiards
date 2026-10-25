'use strict';

/* 당구 연습 / 대국 - UI / 입력 / 애니메이션 */

const App = {
  screen: 'practice',          // 'practice' | 'game'
  table: TABLES.medium,
  modeKey: 'three',
  drillIdx: 0,
  balls: [],
  angle: 0,
  power: 0.5,
  tipH: 0,
  tipV: 0,
  rot: window.innerHeight > window.innerWidth ? 1 : 0,
  moveMode: false,
  showTrace: true,
  preview: false,
  speed: 1,
  anim: null,
  lastShot: null,
  lastResult: null,
  lastCueId: 0,
  previewPath: null,
  stats: { tries: 0, points: 0 },
  game: {
    active: false,
    levelKey: 'mid',
    target: 10,
    scores: { me: 0, robot: 0 },
    turn: 'me',
    inning: 1,
    thinking: false,
    runMe: 0, runBot: 0, bestMe: 0, bestBot: 0
  },
  view: null,
  drag: null
};

const el = (id) => document.getElementById(id);
let canvas, ctx, tipCanvas, tipCtx;

/** 지금 칠 수구 번호 */
function cueId() {
  return (App.screen === 'game' && App.game.turn === 'robot') ? CUE_Y : CUE_W;
}

/** 사용자가 테이블을 조작할 수 있는 상태인가 */
function userCanAct() {
  if (App.anim && App.anim.playing) return false;
  if (App.screen === 'game' && (App.game.thinking || App.game.turn === 'robot')) return false;
  return true;
}

/* ------------------------------------------------------------------ 초기화 */

function init() {
  canvas = el('table');
  ctx = canvas.getContext('2d');
  tipCanvas = el('tip');
  tipCtx = tipCanvas.getContext('2d');

  el('tabPractice').addEventListener('click', () => setScreen('practice'));
  el('tabGame').addEventListener('click', () => setScreen('game'));

  el('mode').addEventListener('change', (e) => {
    App.modeKey = e.target.value;
    App.drillIdx = 0;
    buildDrillOptions();
    if (App.screen === 'game') newGame(); else resetLayout();
  });
  el('tableSize').addEventListener('change', (e) => {
    App.table = TABLES[e.target.value];
    if (App.screen === 'game') newGame(); else resetLayout();
    resize();
  });
  el('drill').addEventListener('change', (e) => {
    App.drillIdx = parseInt(e.target.value, 10);
    resetLayout();
  });

  el('aiLevel').addEventListener('change', (e) => {
    App.game.levelKey = e.target.value;
    el('aiDesc').textContent = AI_LEVELS[App.game.levelKey].desc;
    updateScore();
  });
  el('target').addEventListener('change', (e) => {
    App.game.target = parseInt(e.target.value, 10);
  });
  el('btnNewGame').addEventListener('click', newGame);

  el('btnRotate').addEventListener('click', () => { App.rot ^= 1; resize(); });
  el('btnReset').addEventListener('click', resetLayout);
  el('btnShot').addEventListener('click', playerShot);
  el('btnReplay').addEventListener('click', replay);
  el('btnSameShot').addEventListener('click', repeatSameShot);

  toggleBtn('btnMove', () => App.moveMode, (v) => { App.moveMode = v; });
  toggleBtn('btnTrace', () => App.showTrace, (v) => { App.showTrace = v; });
  toggleBtn('btnPreview', () => App.preview, (v) => {
    App.preview = v;
    App.previewPath = null;
  });

  el('power').addEventListener('input', (e) => {
    App.power = parseInt(e.target.value, 10) / 100;
    el('powerVal').textContent = e.target.value + '%';
    App.previewPath = null;
  });
  el('speed').addEventListener('change', (e) => { App.speed = parseFloat(e.target.value); });
  el('angleMinus').addEventListener('click', () => nudgeAngle(-0.25));
  el('anglePlus').addEventListener('click', () => nudgeAngle(0.25));
  el('angleMinus2').addEventListener('click', () => nudgeAngle(-2));
  el('anglePlus2').addEventListener('click', () => nudgeAngle(2));
  el('btnCenterTip').addEventListener('click', () => { App.tipH = 0; App.tipV = 0; onTipChange(); });

  bindTableInput();
  bindTipInput();
  buildDrillOptions();
  el('aiDesc').textContent = AI_LEVELS[App.game.levelKey].desc;
  resetLayout();

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(loop);
}

function toggleBtn(id, get, set) {
  const b = el(id);
  const sync = () => b.classList.toggle('on', get());
  b.addEventListener('click', () => { set(!get()); sync(); });
  sync();
}

function buildDrillOptions() {
  const sel = el('drill');
  sel.innerHTML = '';
  DRILLS[App.modeKey].forEach((d, i) => {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = '[' + d.level + '] ' + d.name;
    sel.appendChild(o);
  });
  sel.value = App.drillIdx;
}

function currentDrill() {
  return DRILLS[App.modeKey][App.drillIdx];
}

/* --------------------------------------------------------------- 화면 전환 */

function setScreen(name) {
  if (App.screen === name) return;
  App.screen = name;
  const game = name === 'game';
  el('tabPractice').classList.toggle('on', !game);
  el('tabGame').classList.toggle('on', game);
  el('practicePanel').hidden = game;
  el('gamePanel').hidden = !game;
  el('scoreboard').hidden = !game;
  el('btnSameShot').disabled = game;
  el('btnMove').disabled = game;
  if (game) {
    if (App.moveMode) { App.moveMode = false; el('btnMove').classList.remove('on'); }
    newGame();
  } else {
    App.game.active = false;
    App.game.thinking = false;
    resetLayout();
  }
}

function resetLayout() {
  App.balls = buildBalls(App.modeKey, App.table, currentDrill());
  App.anim = null;
  App.lastResult = null;
  App.previewPath = null;
  App.angle = aimTowardNearest();
  el('drill').value = App.drillIdx;
  el('tipText').textContent = currentDrill().tip;
  el('rule').textContent = MODES[App.modeKey].rule;
  setMessage('배치 완료. 테이블을 드래그해 조준하고 샷 버튼을 누르세요.');
  updateInfo();
}

function aimTowardNearest() {
  const cue = App.balls[cueId()];
  let t = null, bd = Infinity;
  for (const b of App.balls) {
    if (b.id === cue.id) continue;
    const d = Math.hypot(b.x - cue.x, b.y - cue.y);
    if (d < bd) { bd = d; t = b; }
  }
  return Math.atan2(t.y - cue.y, t.x - cue.x);
}

/* ------------------------------------------------------------------- 대국 */

function newGame() {
  const g = App.game;
  g.active = true;
  g.thinking = false;
  g.scores.me = 0; g.scores.robot = 0;
  g.runMe = 0; g.runBot = 0; g.bestMe = 0; g.bestBot = 0;
  g.turn = 'me';
  g.inning = 1;
  App.balls = buildOpening(App.modeKey, App.table);
  App.anim = null;
  App.lastResult = null;
  App.previewPath = null;
  App.angle = aimTowardNearest();
  el('rule').textContent = MODES[App.modeKey].rule;
  el('tipText').textContent = '득점하면 계속 공격합니다. ' + g.target + '점 선취 시 승리.';
  setMessage('새 게임 시작. 내 차례입니다.');
  updateScore();
  updateInfo();
}

function updateScore() {
  const g = App.game;
  el('scoreMe').textContent = g.scores.me;
  el('scoreBot').textContent = g.scores.robot;
  el('botName').textContent = '로봇(' + AI_LEVELS[g.levelKey].name + ')';
  el('inningText').textContent = g.inning + '이닝 / ' + g.target + '점';
  el('turnText').textContent = !g.active ? '게임 종료'
    : g.turn === 'me' ? '내 차례' : '로봇 차례';
  const sb = el('scoreboard');
  sb.classList.toggle('myTurn', g.active && g.turn === 'me');
  sb.classList.toggle('botTurn', g.active && g.turn === 'robot');
}

function gameAfterShot() {
  const g = App.game;
  const r = App.lastResult;
  const mine = App.lastCueId === CUE_W;
  let text = (mine ? '나: ' : '로봇: ') + r.text;

  if (r.point) {
    if (mine) {
      g.scores.me++; g.runMe++;
      if (g.runMe > g.bestMe) g.bestMe = g.runMe;
    } else {
      g.scores.robot++; g.runBot++;
      if (g.runBot > g.bestBot) g.bestBot = g.runBot;
    }
  } else {
    if (mine) g.runMe = 0; else g.runBot = 0;
    g.turn = mine ? 'robot' : 'me';
    if (!mine) g.inning++;
  }

  if (g.scores.me >= g.target || g.scores.robot >= g.target) {
    g.active = false;
    g.thinking = false;
    text = g.scores.me >= g.target
      ? '승리! ' + g.scores.me + ' : ' + g.scores.robot + ' (' + g.inning + '이닝)'
      : '패배. ' + g.scores.me + ' : ' + g.scores.robot + ' (' + g.inning + '이닝)';
    setMessage(text, g.scores.me >= g.target ? 'ok' : 'no');
    updateScore();
    updateInfo();
    return;
  }

  setMessage(text, r.point ? 'ok' : 'no');
  updateScore();
  if (g.turn === 'me') App.angle = aimTowardNearest();
  updateInfo();
  if (g.turn === 'robot') setTimeout(robotTurn, 450);
}

function robotTurn() {
  const g = App.game;
  if (!g.active || g.turn !== 'robot') return;
  g.thinking = true;
  setMessage('로봇이 생각 중...');
  el('statsLine').textContent = '탐색 0%';
  const level = AI_LEVELS[g.levelKey];
  aiPlan(App.modeKey, App.table, App.balls, CUE_Y, level,
    (shot, info) => {
      g.thinking = false;
      el('statsLine').textContent = '로봇 탐색 ' + info.searched + '회 · ' +
        (info.found ? '해답 발견' : '해답 없음(안전구)');
      executeShot(CUE_Y, shot);
    },
    (p) => { el('statsLine').textContent = '탐색 ' + Math.round(p * 100) + '%'; });
}

/* --------------------------------------------------------------------- 샷 */

function playerShot() {
  if (!userCanAct()) return;
  if (App.screen === 'game' && !App.game.active) return;
  executeShot(CUE_W, {
    angle: App.angle, power: App.power, tipH: App.tipH, tipV: App.tipV
  });
}

function executeShot(cue, shot) {
  if (App.anim && App.anim.playing) return;
  const start = App.balls.map(b => b.copy());
  const sim = new Sim(App.table.w, App.table.h, App.balls.map(b => b.copy()));
  sim.strike(sim.balls[cue], shot.angle, shot.power, shot.tipH, shot.tipV);
  const res = simulateShot(sim);

  App.lastShot = {
    start: start, cue: cue,
    angle: shot.angle, power: shot.power, tipH: shot.tipH, tipV: shot.tipV
  };
  App.lastCueId = cue;
  App.lastResult = judge(App.modeKey, res.events, cue);

  if (cue === CUE_Y) {
    // 로봇의 샷은 화면에도 그대로 반영한다
    App.angle = shot.angle;
    App.power = shot.power;
    App.tipH = shot.tipH;
    App.tipV = shot.tipV;
    syncShotControls();
  }

  if (App.screen === 'practice') {
    App.stats.tries++;
    if (App.lastResult.point) App.stats.points++;
  }

  App.anim = {
    frames: res.frames, traces: res.traces, final: sim.balls,
    idx: 0, playing: true, t0: performance.now()
  };
  setMessage('진행 중...');
  updateInfo();
}

function syncShotControls() {
  el('power').value = Math.round(App.power * 100);
  el('powerVal').textContent = Math.round(App.power * 100) + '%';
  drawTipWidget();
}

function replay() {
  if (!App.anim) return;
  App.balls = App.lastShot.start.map(b => b.copy());
  App.anim.idx = 0;
  App.anim.playing = true;
  App.anim.t0 = performance.now();
}

function repeatSameShot() {
  if (!App.lastShot || App.screen !== 'practice') return;
  if (App.anim && App.anim.playing) return;
  App.balls = App.lastShot.start.map(b => b.copy());
  App.angle = App.lastShot.angle;
  App.power = App.lastShot.power;
  App.tipH = App.lastShot.tipH;
  App.tipV = App.lastShot.tipV;
  syncShotControls();
  App.anim = null;
  executeShot(App.lastShot.cue, App.lastShot);
}

function finishShot() {
  const a = App.anim;
  a.playing = false;
  App.balls = a.final.map(b => b.copy());
  const r = App.lastResult;
  if (App.screen === 'game' && App.game.active) {
    gameAfterShot();
    return;
  }
  setMessage(r.text, r.point ? 'ok' : 'no');
  updateInfo();
}

/* --------------------------------------------------------------- 입력 처리 */

function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function bindTableInput() {
  canvas.addEventListener('pointerdown', (e) => {
    if (!userCanAct()) return;
    canvas.setPointerCapture(e.pointerId);
    const [sx, sy] = pointerPos(e);
    const [tx, ty] = toTable(App.view, sx, sy);

    if (App.moveMode) {
      let best = -1, bd = PHYS.R * 2.2;
      App.balls.forEach((b, i) => {
        const d = Math.hypot(b.x - tx, b.y - ty);
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) App.drag = { kind: 'ball', idx: best };
      return;
    }
    App.drag = { kind: 'aim' };
    setAimTo(tx, ty);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!App.drag) return;
    const [sx, sy] = pointerPos(e);
    const [tx, ty] = toTable(App.view, sx, sy);
    if (App.drag.kind === 'aim') setAimTo(tx, ty);
    else {
      const i = App.drag.idx;
      if (isValidPlacement(App.balls, App.table.w, App.table.h, i, tx, ty)) {
        App.balls[i].place(tx, ty);
        App.previewPath = null;
      }
    }
  });

  const end = () => { App.drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function setAimTo(tx, ty) {
  const cue = App.balls[cueId()];
  const dx = tx - cue.x, dy = ty - cue.y;
  if (Math.hypot(dx, dy) < PHYS.R * 0.4) return;
  App.angle = Math.atan2(dy, dx);
  App.previewPath = null;
  updateInfo();
}

function nudgeAngle(deg) {
  if (!userCanAct()) return;
  App.angle += deg * Math.PI / 180;
  App.previewPath = null;
  updateInfo();
}

function bindTipInput() {
  const handle = (e) => {
    const r = tipCanvas.getBoundingClientRect();
    const cx = r.width / 2, cy = r.height / 2;
    const rad = r.width / 2 - 8;
    let dx = (e.clientX - r.left - cx) / rad;
    let dy = -(e.clientY - r.top - cy) / rad;
    const m = Math.hypot(dx, dy);
    if (m > PHYS.maxTip) { dx = dx / m * PHYS.maxTip; dy = dy / m * PHYS.maxTip; }
    App.tipH = dx; App.tipV = dy;
    onTipChange();
  };
  tipCanvas.addEventListener('pointerdown', (e) => {
    if (!userCanAct()) return;
    tipCanvas.setPointerCapture(e.pointerId);
    App.tipDrag = true;
    handle(e);
  });
  tipCanvas.addEventListener('pointermove', (e) => { if (App.tipDrag) handle(e); });
  tipCanvas.addEventListener('pointerup', () => { App.tipDrag = false; });
  tipCanvas.addEventListener('pointercancel', () => { App.tipDrag = false; });
}

function onTipChange() {
  App.previewPath = null;
  drawTipWidget();
  updateInfo();
}

/* ------------------------------------------------------------------- 출력 */

function setMessage(text, cls) {
  const m = el('msg');
  m.textContent = text;
  m.className = cls || '';
}

function updateInfo() {
  const deg = ((App.angle * 180 / Math.PI) % 360 + 360) % 360;
  el('angleVal').textContent = deg.toFixed(1) + '°';
  const h = App.tipH, v = App.tipV;
  const hs = Math.abs(h) < 0.03 ? '중앙' : (h > 0 ? '우' : '좌') + (Math.abs(h) / 0.18).toFixed(1) + '팁';
  const vs = Math.abs(v) < 0.03 ? '중앙' : (v > 0 ? '상' : '하') + (Math.abs(v) / 0.18).toFixed(1) + '팁';
  el('tipVal').textContent = hs + ' / ' + vs;

  if (App.screen === 'practice') {
    const st = App.stats;
    el('statsLine').textContent = '시도 ' + st.tries + ' · 득점 ' + st.points +
      (st.tries ? ' · ' + Math.round(st.points / st.tries * 100) + '%' : '');
  } else if (!App.game.thinking) {
    const g = App.game;
    el('statsLine').textContent = '하이런 나 ' + g.bestMe + ' · 로봇 ' + g.bestBot;
  }
}

function drawTipWidget() {
  const g = tipCtx;
  const size = parseFloat(tipCanvas.style.width) || 118;
  const cx = size / 2, cy = size / 2, rad = size / 2 - 8;
  g.clearRect(0, 0, size, size);

  const grd = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.38, rad * 0.1, cx, cy, rad);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.7, '#efe9d8');
  grd.addColorStop(1, '#b9b2a1');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();

  g.strokeStyle = 'rgba(0,0,0,0.18)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy);
  g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad); g.stroke();
  g.beginPath(); g.arc(cx, cy, rad * PHYS.maxTip, 0, Math.PI * 2);
  g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);

  g.fillStyle = '#1b1b1b';
  g.beginPath();
  g.arc(cx + App.tipH * rad, cy - App.tipV * rad, 7, 0, Math.PI * 2);
  g.fill();
}

function resize() {
  const wrap = el('tableWrap');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cw = wrap.clientWidth;

  // 테이블 비율에 맞춰 캔버스 높이를 정해 여백을 없앤다
  const extL = App.table.w + 2 * RAIL_M;
  const extS = App.table.h + 2 * RAIL_M;
  const maxH = window.innerHeight * (App.rot ? 0.70 : 0.50);
  const ch = Math.max(180, Math.min(maxH, cw * (App.rot ? extL / extS : extS / extL)));
  wrap.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  App.view = layout(cw, ch, App.table.w, App.table.h, App.rot);

  const td = 118;
  tipCanvas.width = Math.round(td * dpr);
  tipCanvas.height = Math.round(td * dpr);
  tipCanvas.style.width = td + 'px';
  tipCanvas.style.height = td + 'px';
  tipCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawTipWidget();
}

/* --------------------------------------------------------------- 렌더 루프 */

function loop(now) {
  const v = App.view;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTable(ctx, v);

  const a = App.anim;
  let positions = null;

  if (a && a.playing) {
    const t = (now - a.t0) / 1000 * App.speed;
    a.idx = Math.floor(t / FRAME_DT);
    if (a.idx >= a.frames.length - 1) { a.idx = a.frames.length - 1; finishShot(); }
    positions = a.frames[a.idx];
  }

  if (App.showTrace && a) {
    for (let i = 0; i < a.traces.length; i++) {
      const col = i === App.lastCueId ? 'rgba(255,255,255,0.55)' : 'rgba(255,235,120,0.30)';
      drawPath(ctx, v, a.traces[i], col, Math.max(1, v.s * 0.004), false);
    }
  }

  const cue = cueId();

  if (App.preview && !(a && a.playing) && userCanAct()) {
    if (!App.previewPath) App.previewPath = computePreview();
    drawPath(ctx, v, App.previewPath, 'rgba(120,220,255,0.75)', Math.max(1, v.s * 0.005), true);
  }

  const specs = MODES[App.modeKey].balls;
  for (let i = 0; i < specs.length; i++) {
    const x = positions ? positions[i * 2] : App.balls[i].x;
    const y = positions ? positions[i * 2 + 1] : App.balls[i].y;
    drawBall(ctx, v, x, y, specs[i].color, i === cue && !positions);
  }

  if (!positions) {
    drawAim(ctx, v, App.balls[cue], App.angle, App.balls);
    drawTipMark(ctx, v, App.balls[cue], App.angle, App.tipH, App.tipV);
  }

  requestAnimationFrame(loop);
}

function computePreview() {
  const cue = cueId();
  const sim = new Sim(App.table.w, App.table.h, App.balls.map(b => b.copy()));
  sim.strike(sim.balls[cue], App.angle, App.power, App.tipH, App.tipV);
  const res = simulateShot(sim);
  return res.traces[cue];
}

window.addEventListener('DOMContentLoaded', init);
