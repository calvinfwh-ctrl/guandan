/* AI 拟人化（v2 修复 D）：同一局面多次决策必须有多样性，且全部合法
   方法：固定若干局面（种子化发牌），对每个局面用不同随机种子采样 300 次 aiTurn，
   统计动作分布。修复前部分局面 100% 单一动作（topShare=1，完全可预测）。
   运行：node tests/ai-human.test.js */
const GD = require('../js/engine.js');
const G = require('../js/game.js');
const assert = require('assert');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

/* 固定局面构造：kind = lead（领出）/ follow（跟单张）/ followPair（跟对子） */
function makeState(kind, seed) {
  const deck = GD.shuffle(GD.createDeck(), mulberry32(seed));
  const hands = [deck.slice(0, 27), deck.slice(27, 54), deck.slice(54, 81), deck.slice(81, 108)];
  const m = G.startMatch({ maxDeals: 1, seed: 1 });
  m.deal = {
    level: 2, hands, turn: 0,
    trick: { combo: null, owner: -1, passes: 0 },
    table: [null, null, null, null], finished: [], discarded: [],
    phase: 'play', result: null, tribute: null, events: []
  };
  if (kind === 'lead') { m.deal.turn = 1; return m; }
  if (kind === 'follow') {
    /* 轮到 0 才能真实领出，出完自然轮到 1 */
    const c = m.deal.hands[0].find(x => x.s !== 'X' && x.r === 8) || m.deal.hands[0].find(x => x.s !== 'X');
    const r = G.play(m, 0, [c]);
    if (!r.ok) return null;
    return m;
  }
  if (kind === 'followPair') {
    const cs = m.deal.hands[0].filter(x => x.s !== 'X' && x.r === 6).slice(0, 2);
    if (cs.length < 2) return null;
    const r = G.play(m, 0, cs);
    if (!r.ok) return null;
    return m;
  }
  return null;
}

const SAMPLES = 300;
const KINDS = ['lead', 'follow', 'followPair'];
const SEEDS = [11, 22, 33];

function distOf(kind, seed) {
  const dist = {};
  let valid = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const m = makeState(kind, seed);
    if (!m) return null;
    const mv = G.aiTurn(m, m.deal.turn, 1, { rnd: mulberry32(777 + i) });
    const key = mv.action + '|' + (mv.cards || []).map(GD.cardKey).sort().join(',');
    dist[key] = (dist[key] || 0) + 1;
    valid++;
  }
  const counts = Object.values(dist);
  const top = Math.max(...counts) / valid;
  return { kind, seed, valid, distinct: counts.length, topShare: top };
}

console.log('[AI 决策多样性：固定局面 × ' + SAMPLES + ' 次采样]');
const rows = [];
let followVarN = 0, followTotal = 0;
KINDS.forEach(kind => {
  SEEDS.forEach(seed => {
    if (kind === 'lead') {
      test(kind + ' seed=' + seed + '：领出 topShare<0.95 且至少 2 种动作', () => {
        const r = distOf(kind, seed);
        assert.ok(r, '局面构造失败');
        rows.push(r);
        console.log('       distinct=' + r.distinct + ' topShare=' + r.topShare.toFixed(3));
        assert.ok(r.distinct >= 2, '领出至少应出现 2 种不同动作（当前 ' + r.distinct + ' 种）—— AI 完全可预测');
        assert.ok(r.topShare < 0.95, '最大单一动作占比应 <95%（当前 ' + (r.topShare * 100).toFixed(1) + '%）');
      });
    } else {
      /* 跟牌允许"结构被迫单一"：若唯一不拆牌型的应法只有一个，理性玩家也会固定出它。
         度量目标：跟牌局面多数仍有真实可选空间（9 个跟牌局面至少 5 个 ≥2 种动作）。 */
      followTotal++;
      const r = distOf(kind, seed);
      if (r && r.distinct >= 2) followVarN++;
      console.log('  ' + (r && r.distinct >= 2 ? 'ok  ' : 'note') + ' ' + kind + ' seed=' + seed + '：distinct=' + (r ? r.distinct : '-') + ' topShare=' + (r ? r.topShare.toFixed(3) : '-'));
      if (r) rows.push(r);
    }
  });
});

test('跟牌局面：至少 ' + Math.ceil(followTotal * 0.55) + '/' + followTotal + ' 个存在 ≥2 种动作', () => {
  console.log('       有可选空间的跟牌局面: ' + followVarN + '/' + followTotal);
  assert.ok(followVarN >= Math.ceil(followTotal * 0.55), '跟牌多样性不足: ' + followVarN + '/' + followTotal);
});

test('总体平均 topShare < 0.6（整体不可预测）', () => {
  const avg = rows.reduce((s, r) => s + r.topShare, 0) / rows.length;
  console.log('       平均 topShare=' + avg.toFixed(3));
  assert.ok(avg < 0.6, '平均 topShare 应 <0.6，实际 ' + avg.toFixed(3));
});

test('所有采样动作在对应局面全部合法（可被 G.play/pass 接受）', () => {
  /* 用同一局面重放每个出现过的动作 */
  for (const kind of KINDS) {
    for (const seed of SEEDS) {
      for (let i = 0; i < 24; i++) {
        const m = makeState(kind, seed);
        if (!m) continue;
        const mv = G.aiTurn(m, m.deal.turn, 1, { rnd: mulberry32(9000 + i) });
        const r = mv.action === 'play' ? G.play(m, m.deal.turn, mv.cards) : G.pass(m, m.deal.turn);
        assert.ok(r.ok, kind + '/' + seed + '/' + i + ' 非法动作: ' + r.err);
      }
    }
  }
});

test('steady 模式（教学/基准）：同局面同种子决策可复现', () => {
  const a = makeState('follow', 11);
  const b = makeState('follow', 11);
  const mv1 = G.aiTurn(a, a.deal.turn, 1, { rnd: mulberry32(42), steady: true });
  const mv2 = G.aiTurn(b, b.deal.turn, 1, { rnd: mulberry32(42), steady: true });
  const k1 = mv1.action + '|' + (mv1.cards || []).map(GD.cardKey).sort().join(',');
  const k2 = mv2.action + '|' + (mv2.cards || []).map(GD.cardKey).sort().join(',');
  assert.strictEqual(k1, k2, 'steady 模式同种子应产生相同决策');
});

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
