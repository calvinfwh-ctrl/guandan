/* AI 强度对照实验（配对设计）
   同一副牌打两遍：一遍"新逻辑"坐 0/2 队，一遍坐 1/3 队，
   这样先手优势、牌力强弱都被抵消，只留下策略差异。
   用法：node tests/ai-strength.js [配对数] [模式]
   模式：none(基线) | follow(跟牌记牌) | hold(憋牌) | fh(两者) | all */
const GD = require('../js/engine.js');
const G = require('../js/game.js');

const N = parseInt(process.argv[2] || '120', 10);
const MODE = process.argv[3] || 'all';

const MODES = {
  none: { legacy: true },
  follow: { leadThreat: false, followThreat: true, holdBack: false },
  hold: { leadThreat: false, followThreat: false, holdBack: true },
  fh: { leadThreat: false, followThreat: true, holdBack: true },
  nolead: { leadThreat: false, followThreat: false, holdBack: true },
  all: {}
};

function snapshot() {
  const m = G.startMatch({ maxDeals: 1 });
  G.newDeal(m);
  return { level: m.deal.level, hands: m.deal.hands.map((h) => h.slice()) };
}

function playSnapshot(snap, smartTeam) {
  const m = G.startMatch({ maxDeals: 1 });
  m.deal = {
    level: snap.level,
    hands: snap.hands.map((h) => h.slice()),
    turn: 0,
    trick: { combo: null, owner: -1, passes: 0 },
    table: [null, null, null, null],
    finished: [],
    discarded: [],
    phase: 'play',
    result: null,
    tribute: null,
    events: []
  };
  let guard = 0;
  while (m.deal.phase === 'play' && guard++ < 8000) {
    const d = m.deal;
    const idx = d.turn;
    const smart = G.teamOf(idx) === smartTeam;
    const mv = G.aiTurn(m, idx, 1, smart ? MODES[MODE] : { legacy: true });
    const r = mv.action === 'play' ? G.play(m, idx, mv.cards) : G.pass(m, idx);
    if (!r.ok) throw new Error('AI 非法动作: ' + r.err);
  }
  return m.deal.result;
}

/* 名次分：头游4 二游3 三游2 末游1，一队两名队员相加，满 10 分 */
function teamScore(result, team) {
  let sc = 0;
  result.finished.forEach((p, i) => { if (G.teamOf(p) === team) sc += 4 - i; });
  return sc;
}

let smartWin = 0, legacyWin = 0, smartInc = 0, legacyInc = 0;
let smartDouble = 0, legacyDouble = 0;
const pairDiffs = [];
const t0 = Date.now();

for (let i = 0; i < N; i++) {
  const snap = snapshot();
  let d1 = 0, d2 = 0;
  for (const smartTeam of [0, 1]) {
    const r = playSnapshot(snap, smartTeam);
    const smartSc = teamScore(r, smartTeam);
    const legacySc = 10 - smartSc;
    const d = smartSc - legacySc;          /* 本局新逻辑比旧逻辑多拿多少名次分 */
    if (smartTeam === 0) d1 = d; else d2 = d;
    if (r.winnerTeam === smartTeam) {
      smartWin++; smartInc += r.inc; if (r.partnerPos === 2) smartDouble++;
    } else {
      legacyWin++; legacyInc += r.inc; if (r.partnerPos === 2) legacyDouble++;
    }
  }
  pairDiffs.push((d1 + d2) / 2);
}

const meanD = pairDiffs.reduce((a, b) => a + b, 0) / pairDiffs.length;
const varD = pairDiffs.reduce((a, b) => a + (b - meanD) * (b - meanD), 0) / Math.max(1, pairDiffs.length - 1);
const se = Math.sqrt(varD / pairDiffs.length);

const total = smartWin + legacyWin;
const ms = Date.now() - t0;
const pct = (x) => (x / total * 100).toFixed(1) + '%';
console.log('模式 ' + MODE + '：' + N + ' 副牌 × 2 = ' + total + ' 局，' + (ms / 1000).toFixed(1) + 's\n');
console.log('  记牌版：胜 ' + smartWin + ' (' + pct(smartWin) + ')  平均升 ' + (smartInc / Math.max(1, smartWin)).toFixed(2) + '  双上 ' + smartDouble);
console.log('  旧  版：胜 ' + legacyWin + ' (' + pct(legacyWin) + ')  平均升 ' + (legacyInc / Math.max(1, legacyWin)).toFixed(2) + '  双上 ' + legacyDouble);
const diff = (smartWin - legacyWin) / total * 100;
console.log('\n  胜率差：' + (diff > 0 ? '+' : '') + diff.toFixed(1) + ' 个百分点');
console.log('  名次分差：' + (meanD > 0 ? '+' : '') + meanD.toFixed(3) + ' 分/局 ± ' + (2 * se).toFixed(3) +
  (Math.abs(meanD) > 2 * se ? '  ← 显著' : '  ← 与 0 无显著差异'));
