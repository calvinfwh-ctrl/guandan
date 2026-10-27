/* ============================================================================
 * 掼蛋教学 · 规则引擎
 * ----------------------------------------------------------------------------
 * 浏览器：<script src="js/engine.js"> 后使用全局 GD
 * Node ：const GD = require('./js/engine.js')
 *
 * 规则口径（《掼蛋娱乐规则》中文版 / 主流打法）：
 *  · 牌力（Level Order）2<3<…<K<A<级牌<小王<大王；A 在顺子/连对/钢板中可当 1
 *  · 级牌可按原始点数参与 顺子 / 同花顺 / 三连对 / 钢板
 *  · 红桃级牌 = 逢人配，可当除大小王外任意一张牌；作单张时只算级牌；
 *    多种配法时默认取最大牌型
 *  · 炸弹家族：4炸 < 5炸 < 同花顺 < 6炸 < 7炸 … < 四大天王
 *  · 三带二只比较三同张的点数
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* ---------------------------------------------------------------- 基础常量 */

  var SUITS = ['S', 'H', 'D', 'C'];
  var SUIT_TEXT = { S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663', X: '' };
  var SUIT_NAME = { S: '黑桃', H: '红心', D: '方块', C: '梅花' };
  var RANK_TEXT = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '小', 16: '大'
  };
  var NORMAL_RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  var TYPE_NAME = {
    single: '单张',
    pair: '对子',
    triple: '三同张',
    fullhouse: '三带二',
    tube: '三连对',
    plate: '钢板',
    straight: '顺子',
    flush: '同花顺',
    bomb: '炸弹',
    jokerbomb: '四大天王'
  };

  var TYPE_HINT = {
    single: '任意一张牌，比点数。',
    pair: '两张点数相同。大小王可以成对（一对小王 / 一对大王）。',
    triple: '三张点数相同，也叫"三不带"。',
    fullhouse: '三同张 + 一对，只比较三张那部分的点数大小。',
    tube: '三对连续的对子，如 334455，共 6 张。',
    plate: '两组连续的三同张，如 333444，共 6 张。',
    straight: '恰好 5 张连续单牌，A 可当 1（A2345 最小，10JQKA 最大）。',
    flush: '花色相同的 5 张顺子，属于炸弹家族。',
    bomb: '4 张及以上点数相同，张数越多越大。',
    jokerbomb: '两张小王 + 两张大王，最大的炸弹。'
  };

  /* 顺子：10 种（A 可当 1）。数组即自然点数序列。 */
  var SEQ_STRAIGHT = [
    [14, 2, 3, 4, 5], [2, 3, 4, 5, 6], [3, 4, 5, 6, 7], [4, 5, 6, 7, 8],
    [5, 6, 7, 8, 9], [6, 7, 8, 9, 10], [7, 8, 9, 10, 11], [8, 9, 10, 11, 12],
    [9, 10, 11, 12, 13], [10, 11, 12, 13, 14]
  ];
  /* 三连对：12 种 */
  var SEQ_TUBE = [
    [14, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 7], [6, 7, 8],
    [7, 8, 9], [8, 9, 10], [9, 10, 11], [10, 11, 12], [11, 12, 13], [12, 13, 14]
  ];
  /* 钢板：13 种 */
  var SEQ_PLATE = [
    [14, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8],
    [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]
  ];

  /* ---------------------------------------------------------------- 牌对象 */

  function makeCard(s, r, d) { return { s: s, r: r, d: d || 0 }; }
  function cardKey(c) { return c.s + c.r + '#' + c.d; }
  function isJoker(c) { return c.s === 'X'; }
  function isWild(c, level) { return c.s === 'H' && c.r === level; }

  function createDeck() {
    var deck = [];
    for (var k = 0; k < 2; k++) {
      for (var si = 0; si < SUITS.length; si++) {
        for (var r = 2; r <= 14; r++) deck.push(makeCard(SUITS[si], r, k));
      }
      deck.push(makeCard('X', 16, k)); // 大王
      deck.push(makeCard('X', 15, k)); // 小王
    }
    return deck;
  }

  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /* 牌力：2..14 为自然点数，级牌 15，小王 16，大王 17 */
  function orderValue(c, level) {
    if (c.s === 'X') return c.r === 16 ? 17 : 16;
    if (c.r === level) return 15;
    return c.r;
  }
  function rankOrder(r, level) { return r === level ? 15 : r; }

  function rankText(r, level) {
    var t = RANK_TEXT[r] || String(r);
    return (level && r === level) ? t + '(级牌)' : t;
  }
  function cardText(c) {
    if (c.s === 'X') return c.r === 16 ? '大王' : '小王';
    return SUIT_TEXT[c.s] + RANK_TEXT[c.r];
  }
  function cardName(c) {
    if (c.s === 'X') return c.r === 16 ? '大王' : '小王';
    return SUIT_NAME[c.s] + RANK_TEXT[c.r];
  }

  function sortHand(hand, level) {
    return hand.slice().sort(function (a, b) {
      var d = orderValue(b, level) - orderValue(a, level);
      if (d) return d;
      var sd = SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
      if (sd) return sd;
      if (a.s === 'X' && b.s === 'X') return b.r - a.r;
      return a.d - b.d;
    });
  }

  /* ------------------------------------------------------- 牌型强度与比较 */

  function bombFamily(c) {
    return c.type === 'bomb' || c.type === 'flush' || c.type === 'jokerbomb';
  }

  /* 炸弹家族的统一强度（数值越大越强）
   * 4炸 1000+  5炸 2000+  同花顺 3000+  6炸 5000+  7炸 6000+ … 四大天王 99999 */
  function strengthOf(c) {
    if (c.type === 'jokerbomb') return 99999;
    if (c.type === 'flush') return 3000 + (c.top || 0);
    if (c.type === 'bomb') {
      if (c.size === 4) return 1000 + c.rank;
      if (c.size === 5) return 2000 + c.rank;
      return (c.size - 1) * 1000 + c.rank;
    }
    return 0;
  }

  /* 是否可以压过 current（current 为 null 表示领出） */
  function canBeat(cand, cur) {
    if (!cur) return true;
    var cb = bombFamily(cand), ub = bombFamily(cur);
    if (cb && ub) return cand.strength > cur.strength;
    if (cb) return true;
    if (ub) return false;
    return cand.type === cur.type && cand.rank > cur.rank;
  }

  /* ------------------------------------------------------------ 牌型识别 */

  function seqTop(seq) { return seq[seq.length - 1]; }

  /**
   * 解析一组牌所有可能的牌型解释。
   * @returns {Array} combo 列表（可能为空 = 这不是合法牌型）
   */
  function analyze(cards, level) {
    level = level || 2;
    var n = cards.length, out = [];
    if (n === 0) return out;

    var wilds = [], plain = [], jokers = [];
    for (var i = 0; i < n; i++) {
      var c = cards[i];
      if (isWild(c, level)) wilds.push(c);
      else if (isJoker(c)) jokers.push(c);
      else plain.push(c);
    }
    var W = wilds.length;
    var pc = {}, jc = {};
    plain.forEach(function (c) { pc[c.r] = (pc[c.r] || 0) + 1; });
    jokers.forEach(function (c) { jc[c.r] = (jc[c.r] || 0) + 1; });

    /* 模板匹配：need = {自然点数: 张数}，jneed = {15|16: 张数}
     * 王不能被逢人配替代，所以必须精确匹配；其余缺口由逢人配补齐。 */
    function fit(need, jneed) {
      var k, jt = 0, jn = 0;
      for (k in jc) jt += jc[k];
      if (jneed) for (k in jneed) jn += jneed[k];
      if (jt !== jn) return false;
      if (jneed) for (k in jneed) if ((jc[k] || 0) !== jneed[k]) return false;
      for (k in jc) if (!(jneed && (k in jneed))) return false;

      var gaps = 0, total = 0;
      for (k in need) {
        var have = pc[k] || 0;
        if (have > need[k]) return false;
        gaps += need[k] - have;
        total += need[k];
      }
      for (k in pc) if (!(k in need)) return false;
      return gaps === W && total + jn === n;
    }

    function add(type, extra) {
      var combo = { type: type, cards: cards.slice(), size: n, name: TYPE_NAME[type] };
      for (var k in extra) combo[k] = extra[k];
      combo.strength = strengthOf(combo);
      out.push(combo);
      return combo;
    }

    function needOf(seq, mult) {
      var need = {};
      for (var i = 0; i < seq.length; i++) need[seq[i]] = (need[seq[i]] || 0) + mult;
      return need;
    }

    /* --- 单张 --- */
    if (n === 1) {
      add('single', { rank: orderValue(cards[0], level), nat: cards[0].r });
    }

    /* --- 对子 --- */
    if (n === 2) {
      if (W === 2) {
        add('pair', { rank: 15, nat: level, note: '两张逢人配当一对级牌' });
      } else {
        NORMAL_RANKS.forEach(function (r) {
          if (fit(needOf([r], 2))) add('pair', { rank: rankOrder(r, level), nat: r });
        });
        if (jc[15] === 2) add('pair', { rank: 16, nat: 15 });
        if (jc[16] === 2) add('pair', { rank: 17, nat: 16 });
      }
    }

    /* --- 三同张 --- */
    if (n === 3) {
      NORMAL_RANKS.forEach(function (r) {
        if (fit(needOf([r], 3))) add('triple', { rank: rankOrder(r, level), nat: r });
      });
    }

    /* --- 三带二 --- */
    if (n === 5) {
      NORMAL_RANKS.forEach(function (t) {
        NORMAL_RANKS.forEach(function (p) {
          if (p === t) return;
          var need = needOf([t, p], 1);
          need[t] = 3; need[p] = 2;
          if (fit(need)) add('fullhouse', {
            rank: rankOrder(t, level), nat: t, tripleRank: t, pairRank: p
          });
        });
        [15, 16].forEach(function (pj) {
          var need = needOf([t], 1); need[t] = 3;
          var jn = {}; jn[pj] = 2;
          if (fit(need, jn)) add('fullhouse', {
            rank: rankOrder(t, level), nat: t, tripleRank: t, pairRank: pj
          });
        });
      });
    }

    /* --- 顺子 / 同花顺 / 三连对 / 钢板 --- */
    function trySeq(seqs, mult, type, needSuit) {
      seqs.forEach(function (seq) {
        var need = needOf(seq, mult);
        if (!fit(need)) return;
        var extra = { rank: seqTop(seq), top: seqTop(seq), seq: seq.slice() };
        if (needSuit) {
          var suits = {};
          plain.forEach(function (c) { suits[c.s] = 1; });
          var sk = Object.keys(suits);
          if (sk.length !== 1) return;
          extra.suit = sk[0];
        }
        add(type, extra);
      });
    }
    if (n === 5) {
      trySeq(SEQ_STRAIGHT, 1, 'straight', false);
      trySeq(SEQ_STRAIGHT, 1, 'flush', true);
    }
    if (n === 6) {
      trySeq(SEQ_TUBE, 2, 'tube', false);
      trySeq(SEQ_PLATE, 3, 'plate', false);
    }

    /* --- 炸弹 / 四大天王 --- */
    if (n >= 4) {
      NORMAL_RANKS.forEach(function (r) {
        if (fit(needOf([r], n))) add('bomb', { rank: rankOrder(r, level), nat: r });
      });
      if (n === 4 && jc[15] === 2 && jc[16] === 2) {
        add('jokerbomb', { rank: 100, nat: 0 });
      }
    }

    return out;
  }

  function comboSortValue(c) {
    return bombFamily(c) ? 1000000 + c.strength : c.rank;
  }

  /** 默认解释：规则要求"多种配法时取最大牌型" */
  function identify(cards, level) {
    var all = analyze(cards, level);
    if (!all.length) return null;
    var best = all[0];
    for (var i = 1; i < all.length; i++) {
      if (comboSortValue(all[i]) > comboSortValue(best)) best = all[i];
    }
    return best;
  }

  /** 去重后的解释列表（用于"能组成哪些牌型"展示），按强度降序 */
  function interpretations(cards, level) {
    var all = analyze(cards, level), seen = {}, out = [];
    all.forEach(function (c) {
      var key = c.type + ':' + (c.rank || 0) + ':' + c.size + ':' + (c.suit || '') + ':' + (c.seq ? c.seq.join(',') : '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(c);
    });
    out.sort(function (a, b) { return comboSortValue(b) - comboSortValue(a); });
    return out;
  }

  /* ------------------------------------------------------- 牌型文字说明 */

  function seqText(seq, level) {
    return seq.map(function (r) { return RANK_TEXT[r]; }).join('\u00b7');
  }

  function sideRankText(r, level) {
    if (r === 15) return '小王';
    if (r === 16) return '大王';
    return rankText(r, level);
  }

  function comboLabel(c, level) {
    switch (c.type) {
      case 'single': return '单张 ' + cardText(c.cards[0]);
      case 'pair': return '对子 ' + rankText(c.nat, level);
      case 'triple': return '三同张 ' + rankText(c.nat, level);
      case 'fullhouse': return '三带二 ' + rankText(c.tripleRank, level) + ' 带 ' + sideRankText(c.pairRank, level);
      case 'tube': return '三连对 ' + seqText(c.seq, level);
      case 'plate': return '钢板 ' + seqText(c.seq, level);
      case 'straight': return '顺子 ' + seqText(c.seq, level);
      case 'flush': return '同花顺 ' + SUIT_TEXT[c.suit] + ' ' + seqText(c.seq, level);
      case 'bomb': return c.size + ' 张炸弹 ' + rankText(c.nat, level);
      case 'jokerbomb': return '四大天王';
      default: return '未识别';
    }
  }

  /** 点数文本（王用中文） */
  function pointText(r) {
    if (r === 15) return '小王';
    if (r === 16) return '大王';
    return RANK_TEXT[r] || String(r);
  }

  /** 逢人配被当成了什么牌 */
  function wildAssignments(combo, level) {
    var wilds = combo.cards.filter(function (c) { return isWild(c, level); });
    if (!wilds.length) return [];

    var plainCount = {};
    combo.cards.forEach(function (c) {
      if (!isWild(c, level)) plainCount[c.r] = (plainCount[c.r] || 0) + 1;
    });

    var need = {}, mult = 1;
    if (combo.type === 'flush' || combo.type === 'straight') mult = 1;
    else if (combo.type === 'tube') mult = 2;
    else if (combo.type === 'plate') mult = 3;

    if (combo.seq) {
      combo.seq.forEach(function (r) { need[r] = (need[r] || 0) + mult; });
    } else if (combo.type === 'fullhouse') {
      need[combo.tripleRank] = 3;
      need[combo.pairRank] = (need[combo.pairRank] || 0) + 2;
    } else if (combo.type === 'pair') {
      need[combo.nat] = 2;
    } else if (combo.type === 'triple') {
      need[combo.nat] = 3;
    } else if (combo.type === 'bomb') {
      need[combo.nat] = combo.size;
    } else {
      return wilds.map(function (w) { return { card: w, as: pointText(level) }; });
    }

    var res = [], wi = 0;
    Object.keys(need).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      var have = plainCount[r] || 0;
      for (var i = have; i < need[r] && wi < wilds.length; i++) {
        res.push({
          card: wilds[wi++],
          as: (combo.type === 'flush' ? SUIT_TEXT[combo.suit] + RANK_TEXT[r] : pointText(r))
        });
      }
    });
    return res;
  }

  /* ------------------------------------------------------------ 教学示例 */

  /** 从整副牌里抽出一组指定牌型的牌（用于出题） */
  function sample(type, level, rnd) {
    rnd = rnd || Math.random;
    var deck = createDeck();
    function take(filter, count) {
      var pool = deck.filter(filter);
      shuffle(pool, rnd);
      var out = pool.slice(0, count);
      out.forEach(function (c) { deck.splice(deck.indexOf(c), 1); });
      return out;
    }
    function randRank(exclude) {
      var rs = NORMAL_RANKS.filter(function (r) { return !exclude || exclude.indexOf(r) < 0; });
      return rs[Math.floor(rnd() * rs.length)];
    }
    var cards = [];
    /* 教学示例一律用"干净牌"：不带逢人配，避免示例本身产生歧义牌型 */
    function plain(c) { return c.s !== 'X' && !isWild(c, level); }
    function plainOf(r) { return function (c) { return plain(c) && c.r === r; }; }

    switch (type) {
      case 'single': {
        if (rnd() < 0.35) {
          cards = take(function (c) { return c.s === 'X' || c.r === 14 || (c.r === level && !isWild(c, level)); }, 1);
        } else {
          var pool = deck.slice();
          shuffle(pool, rnd);
          cards = [pool[0]];
        }
        break;
      }
      case 'pair': {
        cards = take(plainOf(randRank()), 2);
        break;
      }
      case 'triple': {
        cards = take(plainOf(randRank()), 3);
        break;
      }
      case 'fullhouse': {
        var r1 = randRank(), r2 = randRank([r1]);
        cards = take(plainOf(r1), 3).concat(take(plainOf(r2), 2));
        break;
      }
      case 'tube': {
        var s1 = SEQ_TUBE[Math.floor(rnd() * SEQ_TUBE.length)];
        s1.forEach(function (r) { cards = cards.concat(take(plainOf(r), 2)); });
        break;
      }
      case 'plate': {
        var s2 = SEQ_PLATE[Math.floor(rnd() * SEQ_PLATE.length)];
        s2.forEach(function (r) { cards = cards.concat(take(plainOf(r), 3)); });
        break;
      }
      case 'straight': {
        var s3 = SEQ_STRAIGHT[Math.floor(rnd() * SEQ_STRAIGHT.length)];
        /* 故意错开花色，避免"顺子示例"变成同花顺 */
        var mix = ['S', 'D', 'C', 'S', 'D'];
        s3.forEach(function (r, i) {
          cards = cards.concat(take(function (c) { return plain(c) && c.s === mix[i] && c.r === r; }, 1));
        });
        break;
      }
      case 'flush': {
        var s4 = SEQ_STRAIGHT[Math.floor(rnd() * SEQ_STRAIGHT.length)];
        /* 若这一串里含级牌，就别用红心，否则抽到的红心级牌是逢人配 */
        var suitPool = s4.indexOf(level) >= 0 ? ['S', 'D', 'C'] : ['S', 'H', 'D', 'C'];
        var suit = suitPool[Math.floor(rnd() * suitPool.length)];
        s4.forEach(function (r) {
          cards = cards.concat(take(function (c) { return c.s === suit && c.r === r; }, 1));
        });
        break;
      }
      case 'bomb': {
        cards = take(plainOf(randRank()), 4);
        break;
      }
      case 'jokerbomb': {
        cards = take(function (c) { return c.s === 'X' && c.r === 16; }, 2)
          .concat(take(function (c) { return c.s === 'X' && c.r === 15; }, 2));
        break;
      }
      default: cards = [];
    }
    return cards;
  }

  /* ------------------------------------------------------------ 拆牌启发式 */

  function pickSeq(seq, mult, pool, wilds) {
    var picks = [], needWild = 0;
    for (var i = 0; i < seq.length; i++) {
      var r = seq[i], arr = pool[r];
      var got = Math.min(mult, arr.length);
      for (var k = 0; k < got; k++) picks.push(arr[k]);
      needWild += mult - got;
    }
    if (needWild > wilds.length) return null;
    for (var w = 0; w < needWild; w++) picks.push(wilds[w]);
    return picks;
  }

  function buildDecomposition(hand, level) {
    var pool = {}, wilds = [], jokers = [];
    for (var r = 2; r <= 14; r++) pool[r] = [];
    hand.forEach(function (c) {
      if (isWild(c, level)) wilds.push(c);
      else if (isJoker(c)) jokers.push(c);
      else pool[c.r].push(c);
    });

    var hands = [];
    function consume(cards) {
      cards.forEach(function (c) {
        if (isWild(c, level)) {
          var i = wilds.indexOf(c); if (i >= 0) wilds.splice(i, 1);
        } else if (isJoker(c)) {
          var k = jokers.indexOf(c); if (k >= 0) jokers.splice(k, 1);
        } else {
          var arr = pool[c.r], j = arr.indexOf(c); if (j >= 0) arr.splice(j, 1);
        }
      });
    }
    function commit(cards) {
      if (!cards.length) return;
      var b = identify(cards, level);
      if (b) hands.push(b);
      else hands.push({ type: 'raw', name: '未成牌型', cards: cards.slice(), size: cards.length, rank: 0, strength: 0 });
      consume(cards);
    }

    /* 1) 炸弹（4 张以上同点，优先保留） */
    for (var rb = 2; rb <= 14; rb++) {
      if (pool[rb].length >= 4) commit(pool[rb].slice());
    }

    /* 2) 钢板 / 三连对 / 顺子 —— 顺序随机，多次尝试取最优 */
    var kinds = ['plate', 'tube', 'straight'];
    shuffle(kinds);
    kinds.forEach(function (kind) {
      var seqs = kind === 'plate' ? SEQ_PLATE : kind === 'tube' ? SEQ_TUBE : SEQ_STRAIGHT;
      var mult = kind === 'plate' ? 3 : kind === 'tube' ? 2 : 1;
      for (var guard = 0; guard < 12; guard++) {
        var cands = [];
        for (var i = 0; i < seqs.length; i++) {
          var picks = pickSeq(seqs[i], mult, pool, wilds);
          if (picks) cands.push(picks);
        }
        if (!cands.length) break;
        commit(cands[Math.floor(Math.random() * cands.length)]);
      }
    });

    /* 3) 三带二 */
    for (var guard2 = 0; guard2 < 10; guard2++) {
      var tR = -1, pR = -1;
      for (var rr = 2; rr <= 14; rr++) {
        if (pool[rr].length >= 3) { tR = rr; if (pool[rr].length === 3) break; }
      }
      if (tR < 0) break;
      for (var rp = 2; rp <= 14; rp++) {
        if (rp !== tR && pool[rp].length >= 2) { pR = rp; if (pool[rp].length === 2) break; }
      }
      if (pR < 0) break;
      commit(pool[tR].slice(0, 3).concat(pool[pR].slice(0, 2)));
    }

    /* 4) 三同张 */
    for (var r3 = 2; r3 <= 14; r3++) {
      if (pool[r3].length >= 3) commit(pool[r3].slice(0, 3));
    }

    /* 5) 王：同种成对 */
    var jSmall = jokers.filter(function (c) { return c.r === 15; });
    var jBig = jokers.filter(function (c) { return c.r === 16; });
    if (jSmall.length >= 2) commit(jSmall.slice(0, 2));
    if (jBig.length >= 2) commit(jBig.slice(0, 2));

    /* 6) 对子 */
    for (var r4 = 2; r4 <= 14; r4++) {
      if (pool[r4].length >= 2) commit(pool[r4].slice(0, 2));
    }

    /* 7) 剩下的全部单张 */
    for (var r5 = 2; r5 <= 14; r5++) {
      while (pool[r5].length) commit([pool[r5][0]]);
    }
    while (jokers.length) commit([jokers[0]]);
    while (wilds.length) commit([wilds[0]]);

    var flat = [];
    hands.forEach(function (h) { flat = flat.concat(h.cards); });
    return {
      level: level,
      hands: hands,
      count: hands.length,
      cards: flat,
      bombs: hands.filter(function (h) { return bombFamily(h); }).length,
      singles: hands.filter(function (h) { return h.type === 'single'; }).length,
      wilds: hand.filter(function (c) { return isWild(c, level); }).length
    };
  }

  function decompositionScore(d) {
    return d.count * 100 + d.singles * 15 - d.bombs * 40;
  }

  /** 27 张手牌的参考拆法（启发式，多次随机取较优） */
  function decomposeHand(hand, level, attempts) {
    attempts = attempts || 60;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < attempts; i++) {
      var d = buildDecomposition(hand, level);
      var s = decompositionScore(d);
      if (s < bestScore) { bestScore = s; best = d; }
    }
    best.score = bestScore;
    best.hands.sort(function (a, b) {
      var oa = TYPE_ORDER.indexOf(a.type), ob = TYPE_ORDER.indexOf(b.type);
      if (oa !== ob) return oa - ob;
      return (b.rank || 0) - (a.rank || 0);
    });
    return best;
  }

  var TYPE_ORDER = ['bomb', 'jokerbomb', 'flush', 'plate', 'tube', 'straight', 'fullhouse', 'triple', 'pair', 'single', 'raw'];

  /* ------------------------------------------------------------------ 导出 */

  return {
    VERSION: VERSION,
    SUITS: SUITS, SUIT_TEXT: SUIT_TEXT, SUIT_NAME: SUIT_NAME,
    RANK_TEXT: RANK_TEXT, NORMAL_RANKS: NORMAL_RANKS,
    TYPE_NAME: TYPE_NAME, TYPE_HINT: TYPE_HINT, TYPE_ORDER: TYPE_ORDER,
    SEQ_STRAIGHT: SEQ_STRAIGHT, SEQ_TUBE: SEQ_TUBE, SEQ_PLATE: SEQ_PLATE,

    makeCard: makeCard, createDeck: createDeck, shuffle: shuffle,
    cardKey: cardKey, isJoker: isJoker, isWild: isWild,
    orderValue: orderValue, rankOrder: rankOrder,
    rankText: rankText, cardText: cardText, cardName: cardName,
    sortHand: sortHand,

    analyze: analyze, identify: identify, interpretations: interpretations,
    canBeat: canBeat, bombFamily: bombFamily, strengthOf: strengthOf,
    comboLabel: comboLabel, seqText: seqText, wildAssignments: wildAssignments,

    sample: sample,
    decomposeHand: decomposeHand
  };
});
