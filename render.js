'use strict';

/*
 * 테이블/공/조준선 렌더링
 *  - 테이블 좌표(m) ↔ 화면 좌표(px) 변환을 담당한다.
 *  - rot=0: 가로 배치, rot=1: 세로 배치(휴대폰에서 공이 커진다)
 */

const RAIL_M = 0.085;      // 레일 폭 (시각용)
const CUSHION_M = 0.022;   // 쿠션 면 두께 (시각용)

const COLORS = {
  cloth: '#1d7a5e',
  clothDark: '#19684f',
  cushion: '#17604a',
  rail: '#6b4526',
  railDark: '#53341c',
  diamond: '#f0e6cf',
  white: '#f7f4e9',
  yellow: '#f3bf2c',
  red: '#cf3a2b'
};

function layout(cw, ch, tw, th, rot) {
  const extW = (rot ? th : tw) + 2 * RAIL_M;
  const extH = (rot ? tw : th) + 2 * RAIL_M;
  const s = Math.min(cw / extW, ch / extH);
  const ox = (cw - extW * s) / 2 + RAIL_M * s;
  const oy = (ch - extH * s) / 2 + RAIL_M * s;
  return { s: s, ox: ox, oy: oy, rot: rot, w: tw, h: th };
}

function toScreen(v, x, y) {
  if (v.rot) return [v.ox + y * v.s, v.oy + (v.w - x) * v.s];
  return [v.ox + x * v.s, v.oy + (v.h - y) * v.s];
}

function toTable(v, sx, sy) {
  if (v.rot) return [v.w - (sy - v.oy) / v.s, (sx - v.ox) / v.s];
  return [(sx - v.ox) / v.s, v.h - (sy - v.oy) / v.s];
}

function drawTable(ctx, v) {
  const s = v.s;
  const [x0, y0] = toScreen(v, 0, v.h);           // 테이블 내부 좌상단
  const pw = (v.rot ? v.h : v.w) * s;
  const ph = (v.rot ? v.w : v.h) * s;
  const left = v.rot ? toScreen(v, v.w, 0)[0] : x0;
  const top = v.rot ? toScreen(v, v.w, 0)[1] : y0;
  const r = RAIL_M * s;

  // 레일
  ctx.fillStyle = COLORS.rail;
  roundRect(ctx, left - r, top - r, pw + 2 * r, ph + 2 * r, r * 0.45);
  ctx.fill();
  ctx.strokeStyle = COLORS.railDark;
  ctx.lineWidth = Math.max(1, s * 0.004);
  ctx.stroke();

  // 쿠션 면
  const c = CUSHION_M * s;
  ctx.fillStyle = COLORS.cushion;
  ctx.fillRect(left - c, top - c, pw + 2 * c, ph + 2 * c);

  // 라사
  const g = ctx.createLinearGradient(left, top, left + pw, top + ph);
  g.addColorStop(0, COLORS.cloth);
  g.addColorStop(1, COLORS.clothDark);
  ctx.fillStyle = g;
  ctx.fillRect(left, top, pw, ph);

  drawDiamonds(ctx, v);
}

function drawDiamonds(ctx, v) {
  const s = v.s;
  const d = Math.max(2.2, s * 0.012);
  ctx.fillStyle = COLORS.diamond;
  const pts = [];
  for (let i = 1; i < 8; i++) {           // 장쿠션 8등분
    pts.push([v.w * i / 8, -RAIL_M / 2]);
    pts.push([v.w * i / 8, v.h + RAIL_M / 2]);
  }
  for (let i = 1; i < 4; i++) {           // 단쿠션 4등분
    pts.push([-RAIL_M / 2, v.h * i / 4]);
    pts.push([v.w + RAIL_M / 2, v.h * i / 4]);
  }
  for (const p of pts) {
    const [sx, sy] = toScreen(v, p[0], p[1]);
    ctx.beginPath();
    ctx.moveTo(sx, sy - d);
    ctx.lineTo(sx + d, sy);
    ctx.lineTo(sx, sy + d);
    ctx.lineTo(sx - d, sy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBall(ctx, v, x, y, color, highlight) {
  const [sx, sy] = toScreen(v, x, y);
  const r = PHYS.R * v.s;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(sx + r * 0.18, sy + r * 0.22, r * 0.98, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  const g = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.38, r * 0.1, sx, sy, r);
  g.addColorStop(0, shade(color, 1.35));
  g.addColorStop(0.65, color);
  g.addColorStop(1, shade(color, 0.62));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();

  if (highlight) {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = Math.max(1.2, r * 0.13);
    ctx.beginPath();
    ctx.arc(sx, sy, r + ctx.lineWidth, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** 수구에 당점 위치를 작은 점으로 표시 */
function drawTipMark(ctx, v, ball, angle, tipH, tipV) {
  const r = PHYS.R * v.s;
  // 당점은 진행방향 기준: 위(+V)는 전진회전, 오른쪽(+H)은 우회전
  const px = -Math.sin(angle), py = Math.cos(angle);      // 왼쪽
  let ox = -px * tipH, oy = -py * tipH;                   // 오른쪽 성분
  ox += Math.cos(angle) * tipV; oy += Math.sin(angle) * tipV;
  // 화면 좌표계로 투영 (회전 포함)
  const [ex, ey] = toScreen(v, ball.x + ox * PHYS.R, ball.y + oy * PHYS.R);
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.beginPath();
  ctx.arc(ex, ey, Math.max(1.5, r * 0.22), 0, Math.PI * 2);
  ctx.fill();
}

function drawPath(ctx, v, pts, color, width, dashed) {
  if (!pts || pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (dashed) ctx.setLineDash([v.s * 0.025, v.s * 0.02]);
  ctx.beginPath();
  let [sx, sy] = toScreen(v, pts[0][0], pts[0][1]);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < pts.length; i++) {
    const p = toScreen(v, pts[i][0], pts[i][1]);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.stroke();
  ctx.restore();
}

/** 조준선 + 가상공(ghost ball) */
function drawAim(ctx, v, ball, angle, balls) {
  const s = v.s;
  const hit = firstContact(ball, angle, balls, v.w, v.h);
  const [sx, sy] = toScreen(v, ball.x, ball.y);
  const [ex, ey] = toScreen(v, hit.x, hit.y);

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = Math.max(1, s * 0.006);
  ctx.setLineDash([s * 0.03, s * 0.022]);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);

  if (hit.ball) {    // 가상공 표시
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, s * 0.004);
    ctx.beginPath();
    ctx.arc(ex, ey, PHYS.R * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 조준 방향에서 처음 닿는 공(또는 쿠션) 위치 */
function firstContact(ball, angle, balls, w, h) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const R = PHYS.R;
  let best = Infinity, hitBall = null;

  for (const b of balls) {
    if (b === ball) continue;
    const ex = b.x - ball.x, ey = b.y - ball.y;
    const proj = ex * dx + ey * dy;
    if (proj <= 0) continue;
    const perp2 = ex * ex + ey * ey - proj * proj;
    const rr = (2 * R) * (2 * R);
    if (perp2 > rr) continue;
    const t = proj - Math.sqrt(rr - perp2);
    if (t > 0 && t < best) { best = t; hitBall = b; }
  }

  // 쿠션까지의 거리
  let tw = Infinity;
  if (dx > 1e-9) tw = Math.min(tw, (w - R - ball.x) / dx);
  if (dx < -1e-9) tw = Math.min(tw, (R - ball.x) / dx);
  if (dy > 1e-9) tw = Math.min(tw, (h - R - ball.y) / dy);
  if (dy < -1e-9) tw = Math.min(tw, (R - ball.y) / dy);

  const t = Math.min(best, Math.max(0, tw));
  return { x: ball.x + dx * t, y: ball.y + dy * t, ball: best <= tw ? hitBall : null, dist: t };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (x) => Math.max(0, Math.min(255, Math.round(x)));
  const r = cl(((n >> 16) & 255) * f);
  const g = cl(((n >> 8) & 255) * f);
  const b = cl((n & 255) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
