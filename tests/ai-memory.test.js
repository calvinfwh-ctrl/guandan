/* 记牌与推断测试
   运行：node tests/ai-memory.test.js */
const GD = require('../js/engine.js');
const G = require('../js/game.js');
const assert = require('assert');

const C = (s, r, d) => GD.makeCard(s, r, d || 0);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

function fakeDeal(myHand, level) {
  /* 另外三家用占位数组（只关心张数，内容不参与记牌计算） */
  const filler = () => new Array(27).fill(null);
  const d = {
    level: level || 2,
    hands: [myHand, filler(), filler(), filler()],
    discarded: [],
    trick: { combo: null, owner: -1, passes: 0 },
    table: [null, null, null, null],
    finished: [],
    discardedCount: 0,
    phase: 'play'
  };
  return { deal: d };
}

console.log('\n[记牌守恒]');
test('未知牌 = 108 - 我的手牌 - 已出的牌', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const mem = G.memoryOf(m, 0);
  assert.strictEqual(mem.unknownCount, 81, '开局另外三家应共 81 张');
  const total = Object.keys(mem.cnt).reduce((a, r) => a + mem.cnt[r], 0) + mem.jok[15] + mem.jok[16] + mem.wilds;
  assert.strictEqual(total, 81, '按点数统计的未知牌总数也应为 81');
});

test('别家打出一手，未知牌就少相应的张数', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const before = G.memoryOf(m, 0).unknownCount;
  m.deal.turn = 1;
  const mv = G.aiTurn(m, 1, 1);
  assert.strictEqual(mv.action, 'play');
  const res = G.play(m, 1, mv.cards);
  assert.strictEqual(res.ok, true, res.err);
  const after = G.memoryOf(m, 0).unknownCount;
  assert.strictEqual(after, before - mv.cards.length);
});

test('我自己手里的牌不会被算进“未知”', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const mem = G.memoryOf(m, 0);
  const myKeys = new Set(m.deal.hands[0].map(GD.cardKey));
  const disc = new Set(m.deal.discarded.map(GD.cardKey));
  const unknownCards = GD.createDeck().filter((c) => !myKeys.has(GD.cardKey(c)) && !disc.has(GD.cardKey(c)));
  assert.strictEqual(unknownCards.length, mem.unknownCount);
  assert.strictEqual(mem.unknownCount, 81);
});

console.log('\n[威胁推断]');
test('手里握着大王，单张大王外面压不住', () => {
  const big = C('X', 16), small = C('X', 16, 1);
  const m = fakeDeal([big, small, C('S', 3)], 2);
  const mem = G.memoryOf(m, 0);
  const combo = GD.identify([big], 2);
  assert.strictEqual(G.threatOf(combo, mem, 2), 0, '大王不该有威胁');
});

test('单张 A 外面还有 4 张级牌 → 有威胁', () => {
  const m = fakeDeal([C('S', 14), C('S', 3)], 2);
  const mem = G.memoryOf(m, 0);
  const combo = GD.identify([C('S', 14)], 2);
  const t = G.threatOf(combo, mem, 2);
  assert.ok(t > 0, 'A 应该被级牌/王压得住，实际威胁=' + t);
});

test('逢人配不能当王：单张级牌不会因为逢人配产生“更高”的威胁', () => {
  const m = fakeDeal([C('H', 5), C('S', 3)], 5); /* ♥5 是逢人配 */
  const mem = G.memoryOf(m, 0);
  const levelCard = GD.identify([C('S', 5)], 5); /* 单张级牌 order=15 */
  const t = G.threatOf(levelCard, mem, 5);
  /* 只剩小王、大王能压；逢人配不能被当成王 */
  assert.strictEqual(t, mem.share * (mem.jok[15] + mem.jok[16]));
});

test('牌越大威胁越小（单调性）', () => {
  const m = fakeDeal([C('S', 14), C('S', 4), C('S', 9)], 7);
  const mem = G.memoryOf(m, 0);
  const t4 = G.threatOf(GD.identify([C('S', 4)], 7), mem, 7);
  const t9 = G.threatOf(GD.identify([C('S', 9)], 7), mem, 7);
  const tA = G.threatOf(GD.identify([C('S', 14)], 7), mem, 7);
  assert.ok(t4 > t9 && t9 > tA, `应递减，实际 ${t4} / ${t9} / ${tA}`);
});

console.log('\n[AI 是否偷看别家手牌]');
test('记牌只读“自己的手牌 + 已出的牌 + 别家剩余张数”', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'game.js'), 'utf8');
  const start = src.indexOf('function buildMemory');
  const end = src.indexOf('function minOpponentCards');
  const block = src.slice(start, end);
  /* 出现 deal.hands[...] 的行，要么是"我自己的手牌(idx)"，要么只取 .length */
  const bad = block.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.indexOf('deal.hands[') >= 0)
    .filter((l) => !/\.length/.test(l) && !/deal\.hands\[idx\]/.test(l));
  assert.deepStrictEqual(bad, [], '不该读取别人手牌内容：' + bad.join(' | '));
});

console.log('\n[记牌真的改变了出牌]');
test('记牌不改变“先出小的”领出原则（实测“挑最难压的”会亏）', () => {
  const hand = [C('S', 13), C('H', 13), C('S', 4), C('H', 4), C('S', 5), C('S', 6)];
  const m = fakeDeal(hand, 2);
  const mem = G.memoryOf(m, 0);
  const label = (cs) => GD.comboLabel(GD.identify(cs, 2), 2);
  assert.strictEqual(label(G.leadChoice(m.deal, 0, null)), '对子 4');
  assert.strictEqual(label(G.leadChoice(m.deal, 0, mem)), '对子 4', '记牌不应改变基本领出顺序');
});

test('对手只剩 1 张时，领单张会挑外面压不住的那张', () => {
  const big = C('X', 16), three = C('S', 3);
  const m = fakeDeal([big, three], 2);
  m.deal.hands[1] = [C('S', 9)]; /* 对手只剩 1 张 */
  const mem = G.memoryOf(m, 0);
  const pick = G.leadChoice(m.deal, 0, mem);
  assert.strictEqual(GD.comboLabel(GD.identify(pick, 2), 2), '单张 大王');
});

test('外面已经没牌能压时，AI 判定为“绝对控牌”', () => {
  /* 只留两张大王在我手里，其余全算已出（构造：把整副牌都塞进 discarded 不合逻辑，
     用 fakeDeal + 手动清空未知的方法不方便，这里退一步验证 threat=0 的判定 */
  const m = fakeDeal([C('X', 16), C('X', 16, 1)], 2);
  const mem = G.memoryOf(m, 0);
  mem.cnt = {}; for (let r = 2; r <= 14; r++) mem.cnt[r] = 0;
  mem.jok = { 15: 0, 16: 0 }; mem.wilds = 0;
  const combo = GD.identify([C('X', 16)], 2);
  assert.strictEqual(G.threatOf(combo, mem, 2), 0);
});

console.log('\n[回归：AI 依然合法]');
test('AI 自对弈 3 副：全程合法、牌数守恒', () => {
  const m = G.startMatch({ maxDeals: 3 });
  G.newDeal(m);
  let guard = 0;
  while (!m.over && guard++ < 20000) {
    const d = m.deal;
    if (d.phase === 'over') {
      const remain = d.hands.reduce((a, h) => a + h.length, 0);
      assert.strictEqual(remain + d.discarded.length, 108, '牌数不守恒');
      G.newDeal(m);
      continue;
    }
    const idx = d.turn;
    const mv = G.aiTurn(m, idx, 1);
    let r;
    if (mv.action === 'play') {
      const id = GD.identify(mv.cards, d.level);
      assert.ok(id, 'AI 出了非法牌型');
      if (d.trick.combo) assert.ok(GD.canBeat(id, d.trick.combo), 'AI 出的牌压不过');
      r = G.play(m, idx, mv.cards);
    } else {
      r = G.pass(m, idx);
    }
    assert.strictEqual(r.ok, true, 'AI 动作被拒: ' + r.err);
  }
});

test('legacy 模式（不记牌）仍可用，用于对照实验', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const mv = G.aiTurn(m, 0, 1, true);
  assert.ok(mv.action === 'play' || mv.action === 'pass');
});

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项\n`);
if (fail) process.exitCode = 1;
