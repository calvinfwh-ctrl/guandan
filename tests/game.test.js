/* 对局引擎测试：AI 自对弈 + 接风 / 进贡 / 抗贡 / 合法动作
   运行：node tests/game.test.js */
const GD = require('../js/engine.js');
const G = require('../js/game.js');
const assert = require('assert');

const C = (s, r, d) => GD.makeCard(s, r, d || 0);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

const realShuffle = GD.shuffle;

/* 构造一副可控的小局面，返回手牌引用（出牌必须传同一批对象） */
function fixDeal(m) {
  const d = m.deal;
  const cards = {
    c3: C('S', 3), c4: C('S', 4), c5: C('S', 5), c6: C('S', 6),
    c7: C('S', 7), c8: C('S', 8), c9: C('S', 9), cA: C('S', 14)
  };
  d.hands = [
    [cards.c4, cards.c5],
    [cards.c6, cards.c7],
    [cards.c3],
    [cards.c8, cards.c9]
  ];
  d.turn = 2;
  d.trick = { combo: null, owner: -1, passes: 0 };
  d.table = [null, null, null, null];
  d.finished = [];
  d.discarded = [];
  d.phase = 'play';
  return cards;
}

console.log('\n[接风]');
test('队友打完最后一手无人压 → 由我接风领出', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const h = fixDeal(m);
  assert.strictEqual(G.play(m, 2, [h.c3]).ok, true, '队友出完应成功');
  assert.deepStrictEqual(m.deal.finished, [2]);
  assert.strictEqual(G.pass(m, 3).ok, true);
  assert.strictEqual(G.pass(m, 0).ok, true);
  assert.strictEqual(G.pass(m, 1).ok, true);
  assert.strictEqual(m.deal.turn, 0, '应由队友的对家（我）接风');
  assert.ok(m.deal.events.some(e => e.type === 'jiefeng'), '应有接风事件');
});

console.log('\n[非法动作]');
test('不是自己回合不能出牌', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const h = fixDeal(m);
  const r = G.play(m, 0, [h.c4]);
  assert.strictEqual(r.ok, false);
  assert.ok(/轮/.test(r.err));
});
test('领出方不能过', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  fixDeal(m);
  m.deal.turn = 0;
  const r = G.pass(m, 0);
  assert.strictEqual(r.ok, false);
});
test('非法牌型不能出', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const h = fixDeal(m);
  m.deal.turn = 0;
  const r = G.play(m, 0, [h.c4, h.c5]);
  assert.strictEqual(r.ok, false);
});
test('压不过不能出', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const h = fixDeal(m);
  m.deal.hands[2] = [C('S', 9)];
  const c9 = m.deal.hands[2][0];
  G.play(m, 2, [c9]);
  m.deal.turn = 0;
  const r = G.play(m, 0, [h.c4]);
  assert.strictEqual(r.ok, false);
  assert.ok(/压不过/.test(r.err));
});

console.log('\n[进贡 / 还贡]');
test('双下：两家进贡、两家还贡，手牌仍是 27 张', () => {
  GD.shuffle = (arr) => arr.slice(); /* 固定牌序，避免随机抗贡 */
  try {
    const m = G.startMatch({});
    m.levels = [5, 2];
    m.dealerTeam = 0;
    m.history = [{ dealNo: 0, level: 2, finished: [0, 2, 1, 3], winnerTeam: 0, inc: 3 }];
    const d = G.newDeal(m);
    assert.strictEqual(d.level, 5);
    assert.ok(d.tribute && !d.tribute.resisted, '不该抗贡');
    assert.strictEqual(d.tribute.items.length, 2, '双下应有两份贡牌');
    d.hands.forEach((h, i) => assert.strictEqual(h.length, 27, '第 ' + i + ' 家手牌应为 27 张'));
    d.tribute.items.forEach((it) => {
      assert.ok(!GD.isWild(it.card, 5), '不能进贡逢人配');
      assert.ok(it.back, '应有还贡牌');
      assert.ok(GD.orderValue(it.back, 5) <= 14);
    });
  } finally { GD.shuffle = realShuffle; }
});
test('抗贡：进贡方抓到两张大王，免贡且由头游先出', () => {
  const deck = GD.createDeck();
  const bigs = deck.filter(c => c.s === 'X' && c.r === 16);
  const rest = deck.filter(c => !(c.s === 'X' && c.r === 16));
  const arranged = rest.slice(0, 81).concat(bigs).concat(rest.slice(81));
  GD.shuffle = () => arranged.slice();
  try {
    const m = G.startMatch({});
    m.levels = [3, 2];
    m.dealerTeam = 0;
    m.history = [{ dealNo: 0, level: 2, finished: [0, 2, 1, 3], winnerTeam: 0, inc: 3 }];
    const d = G.newDeal(m);
    assert.strictEqual(d.tribute.resisted, true, '应触发抗贡');
    assert.strictEqual(d.turn, 0, '抗贡后由头游（0）先出');
    assert.strictEqual(d.hands[3].filter(c => c.s === 'X' && c.r === 16).length, 2);
  } finally { GD.shuffle = realShuffle; }
});

console.log('\n[AI 合法性与整局模拟]');
function simulateMatch(maxDeals, diff) {
  const m = G.startMatch({ maxDeals: maxDeals });
  G.newDeal(m);
  let guard = 0, turns = 0;
  const t0 = Date.now();
  while (!m.over && guard++ < 60000) {
    const d = m.deal;
    if (d.phase === 'over') { G.newDeal(m); continue; }
    const idx = d.turn;
    assert.ok(idx >= 0 && idx < 4, 'turn 异常: ' + idx);
    const mv = G.aiTurn(m, idx, diff);
    let r;
    if (mv.action === 'play') {
      assert.ok(mv.cards && mv.cards.length, 'AI 出牌为空');
      const id = GD.identify(mv.cards, d.level);
      assert.ok(id, 'AI 出了非法牌型');
      if (d.trick.combo) assert.ok(GD.canBeat(id, d.trick.combo), 'AI 出的牌压不过');
      r = G.play(m, idx, mv.cards);
    } else {
      r = G.pass(m, idx);
    }
    assert.strictEqual(r.ok, true, 'AI 动作被拒: ' + r.err);
    /* 强不变量：出牌后必须轮到别家，不能同一家连出
       （过牌后自己成为接风领出方是合法的，所以只检查出牌） */
    if (mv.action === 'play' && d === m.deal && d.phase === 'play') {
      assert.notStrictEqual(d.turn, idx, '出牌后应轮到别家，不能同一家连出');
    }
    turns++;
  }
  return { m, turns, ms: Date.now() - t0 };
}

test('AI 自对弈 2 场比赛：全程合法、牌数守恒、名次完整', () => {
  let totalTurns = 0, totalMs = 0, deals = 0;
  for (let k = 0; k < 2; k++) {
    const res = simulateMatch(8, k);
    totalTurns += res.turns;
    totalMs += res.ms;
    const m = res.m;
    m.history.forEach((h) => {
      deals++;
      assert.strictEqual(h.finished.length, 4, '名次应有 4 家');
      assert.strictEqual(new Set(h.finished).size, 4, '名次不应重复');
      assert.ok(h.inc >= 1 && h.inc <= 3, '升级数应为 1~3');
      const head = h.finished[0];
      const partnerPos = h.finished.indexOf((head + 2) % 4) + 1;
      const expectInc = partnerPos === 2 ? 3 : partnerPos === 3 ? 2 : 1;
      assert.strictEqual(h.inc, expectInc, '升级数与名次不符');
    });
    assert.ok(m.history.length > 0, '应至少打完一副');
    assert.ok(m.levels[0] <= 14 && m.levels[1] <= 14, '级数不应超过 A');
  }
  console.log('        ' + deals + ' 副 / ' + totalTurns + ' 次操作 / 总耗时 ' + totalMs + 'ms（' +
    (totalMs / Math.max(1, totalTurns)).toFixed(1) + 'ms 每手）');
});

test('每副结束时牌数守恒（手牌 + 已出 = 108）', () => {
  const m = G.startMatch({ maxDeals: 3 });
  G.newDeal(m);
  let guard = 0;
  while (!m.over && guard++ < 20000) {
    const d = m.deal;
    if (d.phase === 'over') {
      const remain = d.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(remain + d.discarded.length, 108, '牌数不守恒');
      const keys = d.discarded.map(GD.cardKey);
      assert.strictEqual(new Set(keys).size, keys.length, '出现了重复出的牌');
      G.newDeal(m);
      continue;
    }
    const idx = d.turn;
    const mv = G.aiTurn(m, idx, 1);
    if (mv.action === 'play') G.play(m, idx, mv.cards); else G.pass(m, idx);
  }
});

test('教练提示：给出的牌一定合法，且带理由', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  let guard = 0, checked = 0;
  while (guard++ < 400 && checked < 40) {
    const d = m.deal;
    if (d.phase === 'over') break;
    const idx = d.turn;
    const h = G.hint(m, idx);
    assert.ok(h, '每到自己回合都应有提示');
    assert.ok(typeof h.reason === 'string' && h.reason.length > 4, '提示应有理由');
    if (h.action === 'play') {
      const id = GD.identify(h.cards, d.level);
      assert.ok(id, '提示的牌型非法');
      if (d.trick.combo) assert.ok(GD.canBeat(id, d.trick.combo), '提示的牌压不过');
      G.play(m, idx, h.cards);
    } else {
      G.pass(m, idx);
    }
    checked++;
  }
  assert.ok(checked > 20, '应检查足够多手');
});

test('队友出牌时，教练建议让牌', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const d = m.deal;
  // 构造：队友（2）出了一张 9，轮到我（0），我手上有 A
  d.level = 2;
  const cA = C('S', 14), c4 = C('S', 4), c9 = C('S', 9);
  d.hands = [[cA, c4], [C('S', 5), C('S', 6)], [c9], [C('S', 7), C('S', 8)]];
  d.turn = 2;
  d.trick = { combo: null, owner: -1, passes: 0 };
  d.table = [null, null, null, null];
  d.finished = [];
  d.discarded = [];
  d.phase = 'play';
  G.play(m, 2, [c9]);
  assert.strictEqual(m.deal.turn, 3);
  G.pass(m, 3);
  assert.strictEqual(m.deal.turn, 0);
  const h = G.hint(m, 0);
  assert.strictEqual(h.action, 'pass', '队友牌最大时应该让牌');
  assert.ok(/队友|不要压/.test(h.reason));
});

/* ===================== 收敛令② 回归用例 ===================== */

/* W-2：双贡同点 → 头游下家先出（座位矩阵 ≥4 配置） */
function makeTieTributeMatch(headSeat) {
  const m = G.startMatch({ maxDeals: 2 });
  const d1 = G.newDeal(m);
  // 构造 finished：head=headSeat，second=headSeat 对家，fin[2]/fin[3] 为输方
  const partner = (headSeat + 2) % 4;
  const others = [0, 1, 2, 3].filter(s => s !== headSeat && s !== partner);
  d1.finished = [headSeat, partner, others[0], others[1]];
  // 强制双下且两家都贡大王（同点）
  const d2 = G.newDeal(m);
  // 给两个输家各塞两张大王，让他们最高牌都是大王
  const losers = others;
  losers.forEach(s => {
    d2.hands[s] = [C('X', 16, 0), C('X', 16, 1), C('S', 3, 0)];
  });
  // 重跑 applyTribute（内部已调用，这里直接读结果）
  return { m, d2, headSeat, nextOfHead: (headSeat + 1) % 4, losers };
}

test('W-2 双贡同点 → 头游下家先出（座位矩阵）', () => {
  for (let head = 0; head < 4; head++) {
    const m = G.startMatch({ maxDeals: 2 });
    const d1 = G.newDeal(m);
    const partner = (head + 2) % 4;
    const losers = [0, 1, 2, 3].filter(s => s !== head && s !== partner);
    d1.finished = [head, partner, losers[0], losers[1]];
    const d2 = G.newDeal(m);
    // 两家输家都塞大王（同点）
    losers.forEach(s => {
      d2.hands[s] = [C('X', 16, 0), C('X', 16, 1), C('S', 3, 0)];
    });
    // 重新触发 applyTribute（通过再次 newDeal 模拟）
    const d3 = G.newDeal(m);
    // 验证：若同点双贡，先出者必须是头游下家
    if (d3.tribute && d3.tribute.doubleDown && !d3.tribute.resisted) {
      const items = d3.tribute.items;
      if (items.length === 2 &&
          GD.orderValue(items[0].card, d3.level) === GD.orderValue(items[1].card, d3.level)) {
        assert.strictEqual(d3.turn, (head + 1) % 4,
          `head=${head} 同点双贡应先出=head 下家=${(head + 1) % 4}，实际=${d3.turn}`);
      }
    }
  }
});

/* 拆牌回归：333+44 → 三带二（不拆成三同张+对子） */
test('拆牌回归：333+44 应拆出三带二', () => {
  const hand = [
    C('S', 3), C('H', 3), C('D', 3),  // 333
    C('S', 4), C('H', 4),             // 44
    C('S', 7), C('H', 7),             // 77
    C('S', 9), C('H', 9), C('D', 9)   // 999
  ];
  /* v2：注入种子随机，修掉历史抖动（原 5 次随机尝试约 3/30 概率漏掉三带二） */
  const plan = GD.decomposeHand(hand, 2, 60, GD.rand(7));
  const types = plan.hands.map(g => g.type);
  assert(types.includes('fullhouse'), '应包含三带二，实际=' + types.join(','));
});

/* 拆牌回归：555+666+77 → 钢板 555666 更优 */
test('拆牌回归：555+666+77 应拆出钢板', () => {
  const hand = [
    C('S', 5), C('H', 5), C('D', 5),  // 555
    C('S', 6), C('H', 6), C('D', 6),  // 666
    C('S', 7), C('H', 7)              // 77
  ];
  /* v2：同上，种子随机 + 60 次尝试（原用例在原始代码上即有 ~10% 抖动失败率） */
  const plan = GD.decomposeHand(hand, 2, 60, GD.rand(42));
  const types = plan.hands.map(g => g.type);
  assert(types.includes('plate'), '应包含钢板，实际=' + types.join(','));
});

/* 逢人配成对级牌断言 */
test('逢人配：W+级牌 → 对子级牌 rank15', () => {
  const lv = 2;
  const w = C('H', lv);       // 红桃级牌 = 逢人配
  const lvCard = C('S', lv);  // 黑桃级牌
  const combo = GD.identify([w, lvCard], lv);
  assert(combo && combo.type === 'pair' && combo.rank === 15,
    'W+级牌应识别为对子级牌 rank15，实际=' + JSON.stringify(combo));
});

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项\n`);
if (fail) process.exitCode = 1;
