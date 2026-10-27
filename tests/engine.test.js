/* 规则引擎单元测试：node tests/engine.test.js */
const GD = require('../js/engine.js');
const assert = require('assert');

function C(s, r, d) { return GD.makeCard(s, r, d || 0); }
const T = (type, cards, level) => {
  const c = GD.identify(cards, level);
  assert.ok(c, `期望能识别为 ${type}，实际无法识别`);
  assert.strictEqual(c.type, type, `期望 ${type}，实际 ${c.type}`);
  return c;
};

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

console.log('\n[牌力 / 单张]');
test('级牌 15 > A 14，小王 16，大王 17', () => {
  assert.strictEqual(GD.orderValue(C('S', 2), 2), 15);
  assert.strictEqual(GD.orderValue(C('S', 14), 2), 14);
  assert.strictEqual(GD.orderValue(C('X', 15), 2), 16);
  assert.strictEqual(GD.orderValue(C('X', 16), 2), 17);
  assert.strictEqual(GD.orderValue(C('S', 9), 2), 9);
});
test('A 能压 K，单张不能跨牌型比较', () => {
  const a = GD.identify([C('S', 14)], 2);
  const k = GD.identify([C('S', 13)], 2);
  assert.strictEqual(GD.canBeat(a, k), true);
  assert.strictEqual(GD.canBeat(k, a), false);
});
test('逢人配单独出只算级牌', () => {
  const c = T('single', [C('H', 5)], 5);
  assert.strictEqual(c.rank, 15);
});

console.log('\n[对子 / 三同张 / 三带二]');
test('普通对子', () => T('pair', [C('S', 7), C('D', 7)], 2));
test('逢人配补对子', () => {
  const c = T('pair', [C('H', 5), C('S', 9)], 5);
  assert.strictEqual(c.nat, 9);
});
test('两张逢人配 = 一对级牌', () => {
  const c = T('pair', [C('H', 5), C('H', 5, 1)], 5);
  assert.strictEqual(c.rank, 15);
});
test('逢人配不能和王配对', () => {
  assert.strictEqual(GD.identify([C('H', 5), C('X', 16)], 5), null);
});
test('一对大王 / 一对小王', () => {
  assert.strictEqual(T('pair', [C('X', 16), C('X', 16, 1)], 2).rank, 17);
  assert.strictEqual(T('pair', [C('X', 15), C('X', 15, 1)], 2).rank, 16);
});
test('三同张', () => T('triple', [C('S', 8), C('H', 8), C('D', 8)], 2));
test('逢人配补三同张', () => T('triple', [C('H', 5), C('S', 8), C('D', 8)], 5));
test('三带二只比三张', () => {
  const a = T('fullhouse', [C('S', 5), C('H', 5), C('D', 5), C('S', 2), C('D', 2)], 9);
  const b = T('fullhouse', [C('S', 4), C('H', 4), C('D', 4), C('S', 14), C('D', 14)], 9);
  assert.strictEqual(GD.canBeat(a, b), true);
  assert.strictEqual(GD.canBeat(b, a), false);
});
test('三带二可以带一对王', () => {
  const c = T('fullhouse', [C('S', 5), C('H', 5), C('D', 5), C('X', 15), C('X', 15, 1)], 9);
  assert.strictEqual(c.tripleRank, 5);
});

console.log('\n[顺子 / 同花顺 / 三连对 / 钢板]');
test('A2345 是最小顺子，10JQKA 最大', () => {
  const low = T('straight', [C('S', 14), C('H', 2), C('D', 3), C('C', 4), C('S', 5)], 7);
  const high = T('straight', [C('S', 10), C('H', 11), C('D', 12), C('C', 13), C('S', 14)], 7);
  assert.strictEqual(low.rank, 5);
  assert.strictEqual(high.rank, 14);
  assert.strictEqual(GD.canBeat(high, low), true);
});
test('顺子必须恰好 5 张', () => {
  assert.strictEqual(GD.identify([C('S', 2), C('S', 3), C('S', 4), C('S', 5)], 9), null);
  assert.strictEqual(GD.identify([C('S', 2), C('S', 3), C('S', 4), C('S', 5), C('S', 6), C('S', 7)], 9), null);
});
test('级牌按原始点数参与顺子（打5，34567 合法）', () => {
  const c = T('straight', [C('S', 3), C('H', 4), C('S', 5), C('S', 6), C('S', 7)], 5);
  assert.strictEqual(c.rank, 7);
});
test('同花顺：同花且连续', () => {
  const c = T('flush', [C('C', 7), C('C', 8), C('C', 9), C('C', 10), C('C', 11)], 2);
  assert.strictEqual(c.suit, 'C');
  assert.strictEqual(c.rank, 11);
});
test('同花顺优先于普通顺子（默认取最大牌型）', () => {
  const cards = [C('C', 7), C('C', 8), C('C', 9), C('C', 10), C('C', 11)];
  assert.strictEqual(GD.identify(cards, 2).type, 'flush');
  assert.strictEqual(GD.analyze(cards, 2).length, 2);
});
test('逢人配凑同花顺（官方示例：♣7♣8+♥5+♣10♣J）', () => {
  const c = T('flush', [C('C', 7), C('C', 8), C('H', 5), C('C', 10), C('C', 11)], 5);
  assert.deepStrictEqual(c.seq, [7, 8, 9, 10, 11]);
  assert.strictEqual(c.suit, 'C');
  const w = GD.wildAssignments(c, 5);
  assert.strictEqual(w.length, 1);
  assert.strictEqual(w[0].as, '♣9');
});
test('三连对 334455', () => {
  const c = T('tube', [C('S', 3), C('D', 3), C('S', 4), C('D', 4), C('S', 5), C('D', 5)], 9);
  assert.strictEqual(c.rank, 5);
});
test('三连对可以 A23 起头', () => {
  T('tube', [C('S', 14), C('D', 14), C('S', 2), C('D', 2), C('S', 3), C('D', 3)], 9);
});
test('钢板 333444', () => {
  const c = T('plate', [C('S', 3), C('H', 3), C('D', 3), C('S', 4), C('H', 4), C('D', 4)], 9);
  assert.strictEqual(c.rank, 4);
});
test('逢人配补钢板', () => {
  T('plate', [C('S', 3), C('H', 3), C('H', 9), C('S', 4), C('H', 4), C('D', 4)], 9);
});

console.log('\n[炸弹家族]');
test('4炸 / 5炸 / 6炸 识别', () => {
  const b4 = T('bomb', [C('S', 9), C('H', 9), C('D', 9), C('C', 9)], 2);
  assert.strictEqual(b4.size, 4);
  const b5 = T('bomb', [C('S', 9), C('H', 9), C('D', 9), C('C', 9), C('S', 9, 1)], 2);
  assert.strictEqual(b5.size, 5);
  const b6 = T('bomb', [C('S', 9), C('H', 9), C('D', 9), C('C', 9), C('S', 9, 1), C('H', 9, 1)], 2);
  assert.strictEqual(b6.size, 6);
});
test('逢人配补炸弹', () => {
  const c = T('bomb', [C('S', 9), C('H', 9), C('D', 9), C('H', 5)], 5);
  assert.strictEqual(c.size, 4);
  assert.strictEqual(c.nat, 9);
});
test('炸弹顺序：4炸 < 5炸 < 同花顺 < 6炸 < 7炸 < 四大天王', () => {
  const b4 = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2)], 14);
  const b5 = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 2, 1)], 14);
  const f = GD.identify([C('C', 2), C('C', 3), C('C', 4), C('C', 5), C('C', 6)], 14);
  const b6 = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 2, 1), C('H', 2, 1)], 14);
  const b7 = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 2, 1), C('H', 2, 1), C('D', 2, 1)], 14);
  const jb = GD.identify([C('X', 15), C('X', 15, 1), C('X', 16), C('X', 16, 1)], 14);
  const order = [b4, b5, f, b6, b7, jb];
  for (let i = 0; i < order.length - 1; i++) {
    assert.strictEqual(GD.canBeat(order[i + 1], order[i]), true, `第 ${i} 级应压过第 ${i - 1} 级`);
    assert.strictEqual(GD.canBeat(order[i], order[i + 1]), false, `第 ${i} 级不应压过第 ${i + 1} 级`);
  }
});
test('炸弹可压普通牌型，普通牌型不可压炸弹', () => {
  const bomb = GD.identify([C('S', 3), C('H', 3), C('D', 3), C('C', 3)], 9);
  const st = GD.identify([C('S', 4), C('H', 5), C('D', 6), C('C', 7), C('S', 8)], 9);
  assert.strictEqual(GD.canBeat(bomb, st), true);
  assert.strictEqual(GD.canBeat(st, bomb), false);
});
test('同为炸弹张数优先，张数相同比点数', () => {
  const b5_3 = GD.identify([C('S', 3), C('H', 3), C('D', 3), C('C', 3), C('S', 3, 1)], 9);
  const b5_A = GD.identify([C('S', 14), C('H', 14), C('D', 14), C('C', 14), C('S', 14, 1)], 9);
  const b6_2 = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2), C('S', 2, 1), C('H', 2, 1)], 9);
  assert.strictEqual(GD.canBeat(b5_A, b5_3), true);
  assert.strictEqual(GD.canBeat(b6_2, b5_A), true, '6 张炸弹应压过 5 张炸弹');
});
test('级牌炸弹是同级最大', () => {
  const lvlBomb = GD.identify([C('S', 2), C('H', 2), C('D', 2), C('C', 2)], 2);
  const aceBomb = GD.identify([C('S', 14), C('H', 14), C('D', 14), C('C', 14)], 2);
  assert.strictEqual(GD.canBeat(lvlBomb, aceBomb), true);
});

console.log('\n[非法牌型]');
test('随机 5 张不成牌型', () => {
  const bad = [C('S', 2), C('S', 5), C('D', 8), C('C', 11), C('H', 13)];
  assert.strictEqual(GD.identify(bad, 9), null);
});
test('3 张相同花色但不能成三同张的牌', () => {
  assert.strictEqual(GD.identify([C('S', 2), C('S', 3), C('S', 4)], 9), null);
});

console.log('\n[出题样例 generate]');
['single', 'pair', 'triple', 'fullhouse', 'tube', 'plate', 'straight', 'flush', 'bomb', 'jokerbomb'].forEach((t) => {
  test('sample 生成 ' + t, () => {
    for (let i = 0; i < 30; i++) {
      const cards = GD.sample(t, 5, Math.random);
      assert.strictEqual(cards.length, GD.analyze(cards, 5).length ? cards.length : cards.length);
      const c = GD.identify(cards, 5);
      assert.ok(c, `生成的 ${t} 无法识别: ${cards.map(GD.cardText).join(' ')}`);
      assert.strictEqual(c.type, t, `生成的牌型应为 ${t}，实际 ${c.type}`);
    }
  });
});

console.log('\n[拆牌]');
test('拆牌不丢牌、不重复、覆盖全部 27 张', () => {
  const deck = GD.shuffle(GD.createDeck(), Math.random);
  const hand = deck.slice(0, 27);
  for (const level of [2, 7, 14]) {
    const d = GD.decomposeHand(hand, level, 30);
    const got = [];
    d.hands.forEach((h) => h.cards.forEach((c) => got.push(GD.cardKey(c))));
    assert.strictEqual(got.length, 27, '拆牌后牌数应为 27');
    assert.strictEqual(new Set(got).size, 27, '拆牌后不应出现重复牌');
    const handKeys = new Set(hand.map(GD.cardKey));
    got.forEach((k) => assert.ok(handKeys.has(k), '拆出了手牌以外的牌'));
    assert.ok(d.count >= 5 && d.count <= 27, '手数不合理: ' + d.count);
  }
});
test('拆牌能把炸弹单独保留', () => {
  const hand = [
    C('S', 9), C('H', 9), C('D', 9), C('C', 9),
    C('S', 3), C('D', 5), C('C', 7), C('S', 11), C('H', 13)
  ];
  const d = GD.decomposeHand(hand, 2, 40);
  const bomb = d.hands.find((h) => h.type === 'bomb');
  assert.ok(bomb && bomb.size === 4, '应保留四张 9 的炸弹');
});

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项\n`);
if (fail) process.exitCode = 1;
