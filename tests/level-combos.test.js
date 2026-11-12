/* 级牌组合回归（v2 修复 B）：升级换级后，级牌必须仍能与其他牌配合
   覆盖：所有级数 2..A 的 级牌对子/三同张/三带二/顺子/三连对/钢板/逢人配补位/双逢人配对子
   以及 真实升级流程（双上 2→5）后新一副的级牌组合出牌。
   运行：node tests/level-combos.test.js */
const GD = require('../js/engine.js');
const G = require('../js/game.js');
const assert = require('assert');

const C = (s, r, d) => GD.makeCard(s, r, d || 0);
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

function nonHeart(s, r) { return s === 'H' ? 'S' : s; }

for (let L = 2; L <= 14; L++) {
  test('级数' + L + '：级牌对子（非红心）rank=15 可压对A', () => {
    const id = GD.identify([C('S', L), C('D', L)], L);
    assert.ok(id && id.type === 'pair', '应为对子，实际 ' + (id && id.type));
    assert.strictEqual(id.rank, 15);
    const below = L === 14 ? 13 : 14; /* 打A时没有天然A可比，用K */
    const pairBelow = GD.identify([C('S', below), C('D', below)], L);
    assert.ok(GD.canBeat(id, pairBelow), '级牌对应压过更小的对子');
  });

  test('级数' + L + '：级牌三带二', () => {
    const other = L === 5 ? 9 : 5;
    const id = GD.identify([C('S', L), C('D', L), C('C', L), C('H', other), C('D', other)], L);
    assert.ok(id && id.type === 'fullhouse', '应为三带二，实际 ' + (id && id.type));
    assert.strictEqual(id.rank, 15);
  });

  if (L >= 4 && L <= 12) {
    test('级数' + L + '：级牌按自然点数参与顺子', () => {
      const seq = [L - 2, L - 1, L, L + 1, L + 2];
      const cards = seq.map((r, i) => C(r === L ? 'S' : ['S', 'H', 'D', 'C', 'S'][i], r));
      const id = GD.identify(cards, L);
      assert.ok(id && id.type === 'straight', '应为顺子，实际 ' + (id && id.type));
    });
    test('级数' + L + '：逢人配(红桃级牌)补级牌位成顺子', () => {
      const seq = [L - 2, L - 1, L, L + 1, L + 2];
      const cards = seq.map((r, i) => r === L ? C('H', L) : C(['S', 'D', 'C', 'S', 'D'][i], r));
      const id = GD.identify(cards, L);
      assert.ok(id && id.type === 'straight', '应为顺子，实际 ' + (id && id.type));
    });
  }

  if (L >= 3 && L <= 13) {
    test('级数' + L + '：级牌参与三连对', () => {
      const seq = [L - 1, L, L + 1];
      const cards = [];
      seq.forEach(r => { cards.push(C(r === L ? 'S' : 'H', r), C(r === L ? 'D' : 'S', r)); });
      const id = GD.identify(cards, L);
      assert.ok(id && id.type === 'tube', '应为三连对，实际 ' + (id && id.type));
    });
  }

  if (L <= 13) {
    test('级数' + L + '：级牌参与钢板', () => {
      const cards = [];
      [L, L + 1].forEach(r => ['S', 'D', 'C'].forEach(s => cards.push(C(nonHeart(s, r), r))));
      const id = GD.identify(cards, L);
      assert.ok(id && id.type === 'plate', '应为钢板，实际 ' + (id && id.type));
    });
  }

  test('级数' + L + '：双逢人配可当一对级牌', () => {
    const id = GD.identify([C('H', L), C('H', L, 1)], L);
    assert.ok(id && id.type === 'pair' && id.rank === 15, '应为级牌对，实际 ' + JSON.stringify(id && { t: id.type, r: id.rank }));
  });

  test('级数' + L + '：牌力序 级牌介于 A 与小王之间', () => {
    const below = L === 14 ? 13 : 14; /* 打A时A即级牌，用K作下界 */
    assert.ok(GD.orderValue(C('S', L), L) > GD.orderValue(C('S', below), L), '级牌应大于其下界牌');
    assert.ok(GD.orderValue(C('S', L), L) < GD.orderValue(C('X', 15), L), '级牌应小于小王');
    assert.strictEqual(GD.orderValue(C('S', L), L), 15);
  });

  test('级数' + L + '：逢人配不能变王', () => {
    const id = GD.identify([C('H', L), C('X', 16)], L);
    assert.strictEqual(id, null, '红桃级牌+大王不应成对');
  });
}

console.log('\n[真实升级流程]');
test('双上升3级 2→5 后，新一副级牌组合可正常出牌', () => {
  const m = G.startMatch({});
  G.newDeal(m);
  const d = m.deal;
  const c3 = C('S', 3), c4 = C('S', 4), c5 = C('S', 5), c6 = C('S', 6);
  d.hands = [[c3], [C('X', 15), C('X', 16)], [c4], [c5, c6]];
  d.turn = 0; d.trick = { combo: null, owner: -1, passes: 0 };
  d.finished = []; d.discarded = []; d.phase = 'play';

  G.play(m, 0, [c3]);
  G.pass(m, 1); G.pass(m, 2); G.pass(m, 3);
  G.play(m, 2, [c4]);
  G.pass(m, 3); G.pass(m, 1);
  G.play(m, 3, [c5]);
  G.pass(m, 1);
  G.play(m, 3, [c6]);

  assert.strictEqual(d.result.inc, 3, '双上应升3级');
  assert.deepStrictEqual(d.result.levelsAfter, [5, 2]);

  G.newDeal(m);
  assert.strictEqual(m.deal.level, 5, '新一副应打5');

  /* 新级牌参与顺子 + 三带二，模拟 UI selCombo 与 G.play 双路径 */
  const straight = [C('S', 3), C('H', 4), C('D', 5), C('C', 6), C('S', 7)];
  const id = GD.identify(straight, m.deal.level);
  assert.ok(id && id.type === 'straight', '新级牌顺子应合法');
  m.deal.hands[0] = straight.slice();
  m.deal.turn = 0;
  m.deal.trick = { combo: null, owner: -1, passes: 0 };
  const r = G.play(m, 0, straight.slice());
  assert.ok(r.ok, 'G.play 应接受新级牌顺子: ' + (r.err || ''));

  const fh = [C('S', 5), C('D', 5), C('C', 5), C('H', 3), C('D', 3)];
  const id2 = GD.identify(fh, 5);
  assert.ok(id2 && id2.type === 'fullhouse' && id2.rank === 15, '新级牌三带二应合法且rank=15');
});

test('对手升级后（deal级=对方级数），级牌口径同样正确', () => {
  const m = G.startMatch({});
  m.levels = [2, 9];
  m.dealerTeam = 1;
  G.newDeal(m);
  assert.strictEqual(m.deal.level, 9, '新一副应按头游方级数打');
  const id = GD.identify([C('S', 9), C('D', 9), C('C', 9)], 9);
  assert.ok(id && id.type === 'triple' && id.rank === 15);
});

console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
