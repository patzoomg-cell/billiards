'use strict';

/*
 * 종목 규칙 / 연습 배치
 *  - 배치 좌표는 '포인트(다이아) 단위'로 정의한다.
 *    x: 0~8 (장쿠션 8등분), y: 0~4 (단쿠션 4등분) → 테이블 크기가 달라도 그대로 쓸 수 있다.
 *  - 공 번호: 0 = 수구, 1 = 상대공(노란공), 2/3 = 빨간공
 */

const CUE = 0, OPP = 1, RED1 = 2, RED2 = 3;
const CUE_W = CUE;   // 플레이어 수구 (흰공)
const CUE_Y = OPP;   // 상대(로봇) 수구 (노란공)

const MODES = {
  three: {
    key: 'three',
    name: '3구 (쓰리쿠션)',
    balls: [
      { id: CUE, color: COLORS.white, label: '수구' },
      { id: OPP, color: COLORS.yellow, label: '상대공' },
      { id: RED1, color: COLORS.red, label: '적구' }
    ],
    rule: '수구가 쿠션 3회 이상을 거친 뒤 나머지 두 공을 모두 맞히면 득점'
  },
  four: {
    key: 'four',
    name: '4구',
    balls: [
      { id: CUE, color: COLORS.white, label: '수구' },
      { id: OPP, color: COLORS.yellow, label: '상대공' },
      { id: RED1, color: COLORS.red, label: '적구1' },
      { id: RED2, color: COLORS.red, label: '적구2' }
    ],
    rule: '빨간공 2개를 모두 맞히면 득점. 상대공(노란공)을 맞히면 무득점'
  }
};

const LEVELS = ['초급', '중급', '고급'];

/* 배치: pos 는 공 번호 순서대로 [x다이아, y다이아] */
const DRILLS = {
  three: [
    { level: '초급', name: '제각돌리기 기본', pos: [[1.0, 0.5], [2.2, 2.6], [7.0, 3.4]],
      tip: '1쿠션(장) → 단 → 장 순서로 돌려 적구를 맞힙니다. 우회전 1~2팁.' },
    { level: '초급', name: '앞돌리기 기본', pos: [[2.0, 1.0], [1.2, 3.0], [6.5, 1.0]],
      tip: '상대공을 얇게 맞춘 뒤 단-장-장으로 돌립니다.' },
    { level: '초급', name: '빈쿠션 1쿠션', pos: [[1.0, 1.0], [4.0, 3.6], [7.0, 2.0]],
      tip: '공을 거치지 않고 쿠션부터 때려 3쿠션을 만듭니다.' },
    { level: '중급', name: '뒤돌리기', pos: [[6.5, 1.2], [7.2, 2.8], [1.5, 3.0]],
      tip: '상대공을 두껍게 맞춰 되돌려 보냅니다. 세기 60% 전후.' },
    { level: '중급', name: '옆돌리기', pos: [[4.0, 0.6], [4.6, 2.2], [1.0, 3.4]],
      tip: '장쿠션 먼저 보내는 옆돌리기. 당점 좌우 2팁까지 실험해 보세요.' },
    { level: '중급', name: '리버스(역회전)', pos: [[2.0, 2.0], [6.0, 3.2], [7.4, 0.6]],
      tip: '진행 반대쪽 회전을 주어 각을 짧게 만듭니다.' },
    { level: '고급', name: '더블 쿠션', pos: [[1.2, 2.0], [1.6, 3.4], [6.0, 3.6]],
      tip: '같은 장쿠션을 두 번 쓰는 형태. 강한 역회전이 필요합니다.' },
    { level: '고급', name: '빈쿠션 길게', pos: [[0.8, 0.6], [7.2, 3.4], [4.0, 2.0]],
      tip: '장-단-장 빈쿠션. 세기와 당점이 모두 정확해야 합니다.' },
    { level: '고급', name: '대회전', pos: [[1.0, 1.0], [4.5, 2.0], [7.6, 1.0]],
      tip: '테이블을 한 바퀴 크게 돌립니다. 세기 85% 이상.' }
  ],
  four: [
    { level: '초급', name: '일직선 두께', pos: [[1.0, 2.0], [7.0, 2.0], [3.0, 2.0], [4.2, 2.0]],
      tip: '정면 두께 감각 익히기. 중앙 당점으로 시작하세요.' },
    { level: '초급', name: '두께 1/2 연습', pos: [[2.0, 1.0], [7.0, 3.5], [4.0, 2.0], [5.5, 2.8]],
      tip: '첫 적구를 절반 두께로 맞춰 두 번째 적구로 보냅니다.' },
    { level: '초급', name: '모아치기 기본', pos: [[2.0, 2.0], [6.5, 0.5], [3.2, 2.6], [3.6, 1.4]],
      tip: '두 적구를 모아두고 얇게 처리하는 기본형.' },
    { level: '중급', name: '끌어치기', pos: [[4.0, 1.0], [1.0, 3.5], [5.5, 1.0], [6.8, 2.6]],
      tip: '하단 당점(끌어치기)으로 수구를 되돌립니다.' },
    { level: '중급', name: '밀어치기', pos: [[1.5, 1.5], [7.5, 3.5], [3.0, 2.4], [5.0, 3.2]],
      tip: '상단 당점으로 수구를 전진시켜 두 번째 적구까지 보냅니다.' },
    { level: '고급', name: '1쿠션 걸어치기', pos: [[1.0, 0.6], [4.0, 3.6], [2.0, 3.4], [6.0, 1.2]],
      tip: '쿠션을 먼저 맞혀 적구를 공략합니다.' },
    { level: '고급', name: '대회전 모아치기', pos: [[1.0, 1.0], [4.5, 2.0], [7.2, 3.4], [7.6, 1.2]],
      tip: '강한 세기로 돌려 코너에 모읍니다.' }
  ]
};

function diamondToMeters(table, d) {
  const R = PHYS.R;
  const x = Math.min(table.w - R, Math.max(R, table.w * d[0] / 8));
  const y = Math.min(table.h - R, Math.max(R, table.h * d[1] / 4));
  return [x, y];
}

/** 모드/배치로부터 공 배열을 만든다 */
function buildBalls(modeKey, table, drill) {
  const mode = MODES[modeKey];
  return mode.balls.map((spec, i) => {
    const b = new Ball(spec.id, spec.color, spec.label);
    const d = drill ? drill.pos[i] : [1 + i, 2];
    const p = diamondToMeters(table, d);
    return b.place(p[0], p[1]);
  });
}

/**
 * 샷 결과 판정
 * @param cueId 이번에 친 수구 번호 (대국에서 상대는 1번 공을 수구로 쓴다)
 * @returns {{point:number, foul:boolean, cushions:number, contacts:number[], text:string}}
 */
function judge(modeKey, events, cueId) {
  const CUE = cueId === undefined ? 0 : cueId;
  const contacts = [];
  let cushions = 0;
  let cushionsBeforeSecond = 0;

  for (const e of events) {
    if (e.type === 'cushion') {
      if (e.ball === CUE) cushions++;
      continue;
    }
    if (e.ball !== CUE && e.other !== CUE) continue;      // 적구끼리 충돌은 무시
    const other = e.ball === CUE ? e.other : e.ball;
    if (contacts.indexOf(other) === -1) {
      contacts.push(other);
      if (contacts.length === 2) cushionsBeforeSecond = cushions;
    }
  }

  if (modeKey === 'three') {
    const both = contacts.length >= 2;
    const ok = both && cushionsBeforeSecond >= 3;
    return {
      point: ok ? 1 : 0,
      foul: false,
      cushions: cushions,
      contacts: contacts,
      text: !both
        ? '두 번째 공을 맞히지 못했습니다 (접촉 ' + contacts.length + '개, 쿠션 ' + cushions + '회)'
        : ok
          ? '득점! 쿠션 ' + cushionsBeforeSecond + '회 후 두 번째 공 적중'
          : '쿠션이 부족합니다 (두 번째 공 적중 전 쿠션 ' + cushionsBeforeSecond + '회)'
    };
  }

  // 4구: 상대의 수구(흰/노랑 중 내 수구가 아닌 것)를 맞히면 무득점
  const oppBall = CUE === CUE_W ? CUE_Y : CUE_W;
  const hitOpp = contacts.indexOf(oppBall) !== -1;
  const reds = contacts.filter(c => c === RED1 || c === RED2).length;
  const ok = reds === 2 && !hitOpp;
  return {
    point: ok ? 1 : 0,
    foul: hitOpp,
    cushions: cushions,
    contacts: contacts,
    text: hitOpp
      ? '상대공을 맞혔습니다 (무득점)'
      : ok
        ? '득점! 빨간공 2개 모두 적중'
        : '빨간공 ' + reds + '개 적중 (2개를 맞혀야 득점)'
  };
}

/* ------------------------------------------------------------ 대국(초구) 배치 */

const OPENINGS = {
  three: [[6.0, 1.0], [6.0, 3.0], [2.0, 2.0]],
  four: [[6.0, 1.0], [6.0, 3.0], [2.0, 1.0], [2.0, 3.0]]
};

function buildOpening(modeKey, table) {
  const mode = MODES[modeKey];
  const pos = OPENINGS[modeKey];
  return mode.balls.map((spec, i) => {
    const b = new Ball(spec.id, spec.color, spec.label);
    const p = diamondToMeters(table, pos[i]);
    return b.place(p[0], p[1]);
  });
}
