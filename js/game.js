/* ============================================================================
 * 掼蛋对局引擎（四人实战）：发牌 / 出牌 / 接风 / 进贡还贡 / 升级过A / AI / 教练提示
 * 浏览器：全局 GDGame　Node：require('./game.js')
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.GDGame = factory(root.GD);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GD) {
  'use strict';

  var SEAT_NAME = ['你', '下家', '队友', '上家'];

  function teamOf(i) { return i % 2; }
  function partnerOf(i) { return (i + 2) % 4; }
  function isFinished(deal, i) { return deal.finished.indexOf(i) >= 0; }
  function activeCount(deal) { return 4 - deal.finished.length; }
  function nextActiveFrom(deal, i) {
    for (var k = 1; k <= 4; k++) {
      var j = (i + k) % 4;
      if (!isFinished(deal, j)) return j;
    }
    return -1;
  }

  /* ------------------------------------------------------------------ 建局 */

  function startMatch(opts) {
    opts = opts || {};
    return {
      levels: [2, 2],
      dealerTeam: 0,
      dealNo: 0,
      maxDeals: opts.maxDeals || 24,
      deal: null,
      over: false,
      winnerTeam: null,
      history: []
    };
  }

  function newDeal(match) {
    var level = match.levels[match.dealerTeam];
    var deck = GD.shuffle(GD.createDeck());
    var hands = [
      GD.sortHand(deck.slice(0, 27), level),
      GD.sortHand(deck.slice(27, 54), level),
      GD.sortHand(deck.slice(54, 81), level),
      GD.sortHand(deck.slice(81, 108), level)
    ];
    var deal = {
      level: level,
      hands: hands,
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
    deal.turn = 0; /* 首副由你领出；后续由进贡结果决定 */

    if (match.history.length) applyTribute(match, deal);
    match.deal = deal;
    return deal;
  }

  /* -------------------------------------------------------------- 进贡还贡 */

  function highestTribute(hand, level) {
    var best = null;
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (GD.isWild(c, level)) continue;
      if (!best || GD.orderValue(c, level) > GD.orderValue(best, level)) best = c;
    }
    return best;
  }

  function lowestReturn(hand, level, exclude) {
    var best = null, fallback = null;
    for (var i = 0; i < hand.length; i++) {
      var c = hand[i];
      if (c === exclude) continue;
      if (GD.isWild(c, level)) continue;
      if (!fallback || GD.orderValue(c, level) < GD.orderValue(fallback, level)) fallback = c;
      if (GD.orderValue(c, level) > 10) continue;
      if (!best || GD.orderValue(c, level) < GD.orderValue(best, level)) best = c;
    }
    return best || fallback;
  }

  function moveCard(from, card, to) {
    var i = from.indexOf(card);
    if (i < 0) return false;
    from.splice(i, 1);
    to.push(card);
    return true;
  }

  function applyTribute(match, deal) {
    var prev = match.history[match.history.length - 1];
    var fin = prev.finished;
    var winnerTeam = teamOf(fin[0]);
    var doubleDown = teamOf(fin[1]) === winnerTeam;
    var head = fin[0], second = fin[1];
    var tributors = doubleDown ? [fin[2], fin[3]] : [fin[3]];

    var resist = tributors.some(function (p) {
      return deal.hands[p].filter(function (c) { return c.s === 'X' && c.r === 16; }).length >= 2;
    });

    var rec = {
      doubleDown: doubleDown,
      resisted: resist,
      head: head,
      second: second,
      items: []
    };

    if (resist) {
      deal.tribute = rec;
      deal.turn = head;
      deal.events.push({ type: 'tribute', text: '抗贡：' + tributors.map(function (p) { return SEAT_NAME[p]; }).join('、') + ' 抓到两张大王，免进贡，由 ' + SEAT_NAME[head] + ' 先出。' });
      return;
    }

    var gifts = tributors.map(function (p) {
      var card = highestTribute(deal.hands[p], deal.level);
      return { from: p, card: card };
    });

    if (doubleDown) {
      gifts.sort(function (a, b) {
        return GD.orderValue(b.card, deal.level) - GD.orderValue(a.card, deal.level);
      });
      /* 官方《竞技掼蛋竞赛规则(试行)2023》：双下进贡相同牌点时，
         「按顺时针方向进贡，对应还牌（贡左还右）……由进贡给头游者首圈领出」。
         即：同点时头游下家（逆时针方向紧挨头游的下家）为「进贡给头游者」，由其先出。
         座位为逆时针 0→1→2→3→0，头游下家 = (head+1)%4。
         把同点且座位为头游下家的 gift 排到首位（保持其他排序不变）。 */
      if (gifts.length === 2 &&
          GD.orderValue(gifts[0].card, deal.level) === GD.orderValue(gifts[1].card, deal.level)) {
        var nextOfHead = (head + 1) % 4;
        if (gifts[1].from === nextOfHead && gifts[0].from !== nextOfHead) {
          var tmp = gifts[0]; gifts[0] = gifts[1]; gifts[1] = tmp;
        }
      }
    }

    var receivers = doubleDown ? [head, second] : [head];
    var leadPlayer = gifts[0].from;

    gifts.forEach(function (g, i) {
      var to = receivers[i];
      moveCard(deal.hands[g.from], g.card, deal.hands[to]);
      var back = lowestReturn(deal.hands[to], deal.level, g.card);
      if (back) moveCard(deal.hands[to], back, deal.hands[g.from]);
      rec.items.push({ from: g.from, to: to, card: g.card, back: back });
    });

    deal.tribute = rec;
    deal.turn = leadPlayer;
    deal.hands = deal.hands.map(function (h) { return GD.sortHand(h, deal.level); });
    rec.items.forEach(function (it) {
      deal.events.push({
        type: 'tribute',
        text: SEAT_NAME[it.from] + ' 向 ' + SEAT_NAME[it.to] + ' 进贡 ' + GD.cardName(it.card) +
          (it.back ? '，回还 ' + GD.cardName(it.back) : '') + '。'
      });
    });
    if (leadPlayer !== head) {
      deal.events.push({ type: 'tribute', text: '进贡完成，由 ' + SEAT_NAME[leadPlayer] + ' 先出。' });
    }
  }

  /* -------------------------------------------------------------- 出牌动作 */

  function play(match, idx, cards) {
    var deal = match.deal;
    if (!deal || deal.phase !== 'play') return { ok: false, err: '本副已经结束' };
    if (deal.turn !== idx) return { ok: false, err: '还没轮到这一家出牌' };
    if (!cards || !cards.length) return { ok: false, err: '请先选牌' };

    var hand = deal.hands[idx];
    for (var i = 0; i < cards.length; i++) {
      if (hand.indexOf(cards[i]) < 0) return { ok: false, err: '选择的牌不在手里' };
    }
    var combo = GD.identify(cards, deal.level);
    if (!combo) return { ok: false, err: '这不是合法牌型' };
    if (deal.trick.combo && !GD.canBeat(combo, deal.trick.combo)) {
      return { ok: false, err: '压不过当前这手牌（' + GD.comboLabel(deal.trick.combo, deal.level) + '）' };
    }

    deal.hands[idx] = hand.filter(function (c) { return cards.indexOf(c) < 0; });
    deal.discarded = deal.discarded.concat(cards);
    deal.trick.combo = combo;
    deal.trick.owner = idx;
    deal.trick.passes = 0;
    deal.table[idx] = combo;
    deal.events.push({ type: 'play', player: idx, combo: combo });

    if (deal.hands[idx].length === 0) deal.finished.push(idx);

    step(match);
    if (deal.phase === 'play') deal.turn = nextActiveFrom(deal, idx);
    return { ok: true };
  }

  function pass(match, idx) {
    var deal = match.deal;
    if (!deal || deal.phase !== 'play') return { ok: false, err: '本副已经结束' };
    if (deal.turn !== idx) return { ok: false, err: '还没轮到这一家' };
    if (!deal.trick.combo) return { ok: false, err: '你是这一圈的领出方，必须出牌' };

    deal.trick.passes++;
    deal.table[idx] = 'pass';
    deal.events.push({ type: 'pass', player: idx });

    var owner = deal.trick.owner;
    var others = isFinished(deal, owner) ? activeCount(deal) : activeCount(deal) - 1;
    if (deal.trick.passes >= others) {
      var leader = leadAfterTrick(deal);
      deal.trick = { combo: null, owner: -1, passes: 0 };
      deal.table = [null, null, null, null];
      deal.turn = leader;
      if (leader === (owner + 2) % 4 && isFinished(deal, owner)) {
        deal.events.push({ type: 'jiefeng', text: SEAT_NAME[leader] + ' 接风，获得下一圈领出权。' });
      }
    } else {
      deal.turn = nextActiveFrom(deal, idx);
    }
    step(match);
    return { ok: true };
  }

  function step(match) {
    var deal = match.deal;
    if (deal.finished.length >= 3) endDeal(match);
  }

  function leadAfterTrick(deal) {
    var owner = deal.trick.owner;
    if (!isFinished(deal, owner)) return owner;
    var p = partnerOf(owner);
    if (!isFinished(deal, p)) return p;
    return nextActiveFrom(deal, owner);
  }

  /* ------------------------------------------------------------ 结算升级 */

  function endDeal(match) {
    var deal = match.deal;
    for (var i = 0; i < 4; i++) if (!isFinished(deal, i)) deal.finished.push(i);
    deal.phase = 'over';

    var fin = deal.finished;
    var winnerTeam = teamOf(fin[0]);
    var partnerPos = fin.indexOf(partnerOf(fin[0])) + 1; /* 1..4 */
    var inc = partnerPos === 2 ? 3 : partnerPos === 3 ? 2 : 1;
    var atA = match.levels[winnerTeam] === 14;
    var passedA = atA && inc >= 2;

    deal.result = {
      level: deal.level,
      finished: fin.slice(),
      winnerTeam: winnerTeam,
      partnerPos: partnerPos,
      inc: inc,
      atA: atA,
      passedA: passedA,
      levelsBefore: match.levels.slice()
    };

    match.history.push({
      dealNo: match.dealNo,
      level: deal.level,
      finished: fin.slice(),
      winnerTeam: winnerTeam,
      inc: inc,
      passedA: passedA,
      events: deal.events
    });

    if (passedA) {
      match.over = true;
      match.winnerTeam = winnerTeam;
      return;
    }

    match.levels[winnerTeam] = Math.min(14, match.levels[winnerTeam] + inc);
    match.dealerTeam = winnerTeam;
    match.dealNo++;
    deal.result.levelsAfter = match.levels.slice();
    if (match.dealNo >= match.maxDeals) {
      match.over = true;
      match.winnerTeam = -1;
    }
  }

  /* -------------------------------------------------- 可出的牌（同型 + 炸弹） */

  function poolsOf(hand, level) {
    var byRank = {}, wilds = [], jokers = { 15: [], 16: [] };
    for (var r = 2; r <= 14; r++) byRank[r] = [];
    hand.forEach(function (c) {
      if (GD.isWild(c, level)) wilds.push(c);
      else if (c.s === 'X') jokers[c.r].push(c);
      else byRank[c.r].push(c);
    });
    return { byRank: byRank, wilds: wilds, jokers: jokers, level: level };
  }

  function needOf(seq, mult) {
    var n = {};
    for (var i = 0; i < seq.length; i++) n[seq[i]] = (n[seq[i]] || 0) + mult;
    return n;
  }

  function canMake(pools, need) {
    var deficit = 0;
    for (var k in need) {
      var have = (pools.byRank[k] || []).length;
      if (have < need[k]) deficit += need[k] - have;
    }
    return deficit <= pools.wilds.length;
  }

  function build(pools, need, jneed, suit) {
    var cards = [], deficit = 0;
    for (var k in need) {
      var arr = pools.byRank[k] || [];
      if (suit) arr = arr.filter(function (c) { return c.s === suit; });
      var want = need[k];
      var take = Math.min(want, arr.length);
      for (var i = 0; i < take; i++) cards.push(arr[i]);
      deficit += want - take;
    }
    if (jneed) {
      for (var jk in jneed) {
        if (pools.jokers[jk].length < jneed[jk]) return null;
        for (var j = 0; j < jneed[jk]; j++) cards.push(pools.jokers[jk][j]);
      }
    }
    if (deficit > pools.wilds.length) return null;
    for (var w = 0; w < deficit; w++) cards.push(pools.wilds[w]);
    return cards;
  }

  /** 构造候选牌型。
   * 注意：出牌时按规则"多种配法取最大牌型"解释，所以这里必须用 identify 校验：
   * 如果这组牌的最强解释不是我们想要的牌型（例如想当顺子出、实际是同花顺），
   * 就不能作为候选 —— 否则 AI 会"以为自己在压牌，实际牌型变了"。
   */
  function makeCombo(cards, level, type, rank, suit) {
    if (!cards || !cards.length) return null;
    var c = GD.identify(cards, level);
    if (!c) return null;
    if (c.type !== type) return null;
    if (c.size !== cards.length) return null;
    if (rank != null && c.rank !== rank) return null;
    if (suit && c.suit !== suit) return null;
    return c;
  }

  /** 手上所有能压过 cur 的牌型（含炸弹家族） */
  function beats(hand, level, cur) {
    var pools = poolsOf(hand, level);
    var out = [];
    var seen = {};
    function add(c) {
      if (!c) return;
      if (!GD.canBeat(c, cur)) return;
      var key = c.type + '|' + c.size + '|' + c.rank + '|' + (c.suit || '') + '|' + c.cards.map(GD.cardKey).sort().join(',');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(c);
    }

    var t = cur.type;

    if (t === 'single') {
      hand.forEach(function (c) {
        add(GD.identify([c], level));
      });
    } else if (t === 'pair') {
      for (var r = 2; r <= 14; r++) {
        var need = {}; need[r] = 2;
        if (!canMake(pools, need)) continue;
        add(makeCombo(build(pools, need), level, 'pair', GD.rankOrder(r, level)));
      }
      [15, 16].forEach(function (jr) {
        if (pools.jokers[jr].length >= 2) {
          var cc = makeCombo(pools.jokers[jr].slice(0, 2), level, 'pair', jr === 16 ? 17 : 16);
          add(cc);
        }
      });
    } else if (t === 'triple') {
      for (var r3 = 2; r3 <= 14; r3++) {
        var n3 = {}; n3[r3] = 3;
        if (!canMake(pools, n3)) continue;
        add(makeCombo(build(pools, n3), level, 'triple', GD.rankOrder(r3, level)));
      }
    } else if (t === 'fullhouse') {
      for (var tr = 2; tr <= 14; tr++) {
        for (var pr = 2; pr <= 14; pr++) {
          if (pr === tr) continue;
          var nf = {}; nf[tr] = 3; nf[pr] = 2;
          if (!canMake(pools, nf)) continue;
          add(makeCombo(build(pools, nf), level, 'fullhouse', GD.rankOrder(tr, level)));
        }
        [15, 16].forEach(function (jr) {
          var nj = {}; nj[tr] = 3;
          var jn = {}; jn[jr] = 2;
          if (!canMake(pools, nj)) return;
          var b = build(pools, nj, jn);
          add(makeCombo(b, level, 'fullhouse', GD.rankOrder(tr, level)));
        });
      }
    } else if (t === 'tube') {
      GD.SEQ_TUBE.forEach(function (seq) {
        var n = needOf(seq, 2);
        if (!canMake(pools, n)) return;
        add(makeCombo(build(pools, n), level, 'tube', seq[seq.length - 1]));
      });
    } else if (t === 'plate') {
      GD.SEQ_PLATE.forEach(function (seq) {
        var n = needOf(seq, 3);
        if (!canMake(pools, n)) return;
        add(makeCombo(build(pools, n), level, 'plate', seq[seq.length - 1]));
      });
    } else if (t === 'straight') {
      GD.SEQ_STRAIGHT.forEach(function (seq) {
        var n = needOf(seq, 1);
        if (!canMake(pools, n)) return;
        add(makeCombo(build(pools, n), level, 'straight', seq[seq.length - 1]));
      });
    } else if (t === 'flush') {
      GD.SEQ_STRAIGHT.forEach(function (seq) {
        var n = needOf(seq, 1);
        if (!canMake(pools, n)) return;
        GD.SUITS.forEach(function (suit) {
          add(makeCombo(build(pools, n, null, suit), level, 'flush', seq[seq.length - 1], suit));
        });
      });
    }

    /* 炸弹家族：任何非炸弹牌型都能被炸弹压 */
    if (cur.type !== 'jokerbomb') {
      for (var br = 2; br <= 14; br++) {
        for (var size = 4; size <= 8; size++) {
          if (pools.byRank[br].length + pools.wilds.length < size) break;
          var nb = {}; nb[br] = size;
          add(makeCombo(build(pools, nb), level, 'bomb', GD.rankOrder(br, level)));
        }
      }
      if (pools.jokers[15].length >= 2 && pools.jokers[16].length >= 2) {
        add(makeCombo(pools.jokers[15].slice(0, 2).concat(pools.jokers[16].slice(0, 2)), level, 'jokerbomb', 100));
      }
      /* 同花顺也算炸弹，可用于压普通牌型 / 小炸弹 */
      GD.SEQ_STRAIGHT.forEach(function (seq) {
        var n = needOf(seq, 1);
        if (!canMake(pools, n)) return;
        GD.SUITS.forEach(function (suit) {
          add(makeCombo(build(pools, n, null, suit), level, 'flush', seq[seq.length - 1], suit));
        });
      });
    }

    out.sort(function (a, b) {
      var ab = GD.bombFamily(a) ? 1 : 0, bb = GD.bombFamily(b) ? 1 : 0;
      if (ab !== bb) return ab - bb;
      if (ab) return a.strength - b.strength;
      return a.rank - b.rank;
    });
    return out;
  }

  /* ------------------------------------------------------------ 记牌与推断 */

  /**
   * 记牌模型。
   * 已知：自己的手牌 + 场上已经打出的每一张牌。
   * 未知：另外三家还没出现的牌 —— 只知道每家剩几张，不知道具体是什么。
   *
   * 所以这里不做"猜某人手里有什么"（信息上做不到），而是回答这类问题：
   *   · 外面还有几张比这张大的牌？
   *   · 外面还有没有比这手牌更大的牌型？
   *   · 外面还可能存在几个炸弹？
   */
  function buildMemory(deal, idx, level) {
    var seen = Object.create(null);
    var hand = deal.hands[idx];
    var i;
    for (i = 0; i < hand.length; i++) seen[GD.cardKey(hand[i])] = 1;
    for (i = 0; i < deal.discarded.length; i++) seen[GD.cardKey(deal.discarded[i])] = 1;

    var cnt = {}, wilds = 0, jok = { 15: 0, 16: 0 };
    for (var r = 2; r <= 14; r++) cnt[r] = 0;
    GD.createDeck().forEach(function (c) {
      if (seen[GD.cardKey(c)]) return;
      if (c.s === 'X') { jok[c.r]++; return; }
      if (GD.isWild(c, level)) { wilds++; return; }
      cnt[c.r]++;
    });

    var oppHands = 0;
    for (i = 0; i < 4; i++) {
      if (i !== idx && teamOf(i) !== teamOf(idx) && !isFinished(deal, i)) oppHands += deal.hands[i].length;
    }
    var pIdx = partnerOf(idx);
    var partnerHand = isFinished(deal, pIdx) ? 0 : deal.hands[pIdx].length;
    var denom = oppHands + partnerHand;

    /* 未知牌里有两家是对手、一家是队友，按人头折算"这牌可能落在我对手手里"的比例 */
    return {
      level: level,
      cnt: cnt,
      wilds: wilds,
      jok: jok,
      unknownCount: oppHands + partnerHand,
      oppHands: oppHands,
      partnerHand: partnerHand,
      share: denom ? oppHands / denom : 0
    };
  }

  function rankValue(r, level) { return r === level ? 15 : r; }

  /** 外面还有多少"机会"能压过这手牌（已按对手占比折算，粗略值） */
  function threatOf(combo, mem, level) {
    if (!combo || !mem) return 0;
    var t = combo.type, wild = mem.wilds, cnt = mem.cnt, sum = 0, r;
    if (t === 'jokerbomb') return 0;

    if (t === 'single') {
      for (r = 2; r <= 14; r++) if (rankValue(r, level) > combo.rank) sum += cnt[r];
      if (combo.rank < 16) sum += mem.jok[15];
      if (combo.rank < 17) sum += mem.jok[16];
      /* 逢人配不能变王，最高只能变级牌，所以只有压不过级牌时才算威胁 */
      if (combo.rank < 15) sum += wild;
    } else if (t === 'pair') {
      for (r = 2; r <= 14; r++) if (rankValue(r, level) > combo.rank && cnt[r] + wild >= 2) sum++;
      if (combo.rank < 16 && mem.jok[15] >= 2) sum++;
      if (combo.rank < 17 && mem.jok[16] >= 2) sum++;
    } else if (t === 'triple' || t === 'fullhouse') {
      for (r = 2; r <= 14; r++) if (rankValue(r, level) > combo.rank && cnt[r] + wild >= 3) sum++;
    } else if (t === 'straight' || t === 'tube' || t === 'plate') {
      var mult = t === 'tube' ? 2 : t === 'plate' ? 3 : 1;
      var seqs = t === 'tube' ? GD.SEQ_TUBE : t === 'plate' ? GD.SEQ_PLATE : GD.SEQ_STRAIGHT;
      seqs.forEach(function (seq) {
        if (seq[seq.length - 1] <= combo.rank) return;
        var deficit = 0;
        for (var k = 0; k < seq.length; k++) {
          var have = cnt[seq[k]] || 0;
          if (have < mult) deficit += mult - have;
        }
        if (deficit <= wild) sum++;
      });
    } else if (t === 'flush') {
      /* 推断不了花色，按"更高的顺子还有没有可能"打折估计 */
      GD.SEQ_STRAIGHT.forEach(function (seq) {
        if (seq[seq.length - 1] <= combo.rank) return;
        var deficit = 0;
        for (var k = 0; k < seq.length; k++) {
          if ((cnt[seq[k]] || 0) < 1) deficit++;
        }
        if (deficit <= wild) sum += 0.25;
      });
    } else if (t === 'bomb') {
      for (r = 2; r <= 14; r++) {
        var maxSize = Math.min(8, cnt[r] + wild);
        if (maxSize < 4) continue;
        if (maxSize > combo.size) sum++;
        else if (maxSize === combo.size && rankValue(r, level) > combo.rank) sum++;
      }
      if (mem.jok[15] >= 2 && mem.jok[16] >= 2) sum++;
    }
    return sum * mem.share;
  }

  function minOpponentCards(deal, idx) {
    var best = Infinity;
    for (var i = 0; i < 4; i++) {
      if (i === idx || teamOf(i) === teamOf(idx) || isFinished(deal, i)) continue;
      if (deal.hands[i].length < best) best = deal.hands[i].length;
    }
    return best === Infinity ? 0 : best;
  }

  /* ---------------------------------------------------------------- AI 决策 */

  function planMap(plan) {
    var map = {};
    if (!plan) return map;
    plan.hands.forEach(function (h, i) {
      h.cards.forEach(function (c) { map[GD.cardKey(c)] = i; });
    });
    return map;
  }

  function scoredCandidates(cands, hand, level, plan, mem) {
    var map = planMap(plan);
    return cands.map(function (c) {
      var used = {};
      c.cards.forEach(function (card) { used[GD.cardKey(card)] = 1; });
      var broken = 0;
      c.cards.forEach(function (card) {
        if (GD.isWild(card, level)) { broken += 10; return; }
        var gi = map[GD.cardKey(card)];
        if (gi === undefined) { broken += 3; return; }
        var g = plan.hands[gi];
        var whole = g.cards.every(function (x) { return used[GD.cardKey(x)]; });
        if (!whole) broken += g.cards.length * 2;
      });
      /* 记牌推断：同样代价下，优先出"外面更压不住"的那手，把牌权留住 */
      var threat = mem ? threatOf(c, mem, level) : 0;
      return {
        combo: c,
        broken: broken,
        threat: threat,
        score: broken * 100 + threat * 8 + (c.rank || 0) + (GD.bombFamily(c) ? 8000 : 0)
      };
    }).sort(function (a, b) { return a.score - b.score; });
  }

  var LEAD_PRIORITY = { plate: 0, tube: 0, straight: 0, fullhouse: 1, triple: 2, pair: 3, single: 4, bomb: 9, flush: 9, jokerbomb: 9 };

  function leadChoice(deal, idx, mem) {
    var hand = deal.hands[idx];
    var level = deal.level;

    var whole = GD.identify(hand, level);
    if (whole) return hand.slice(); /* 一把走完 */

    var plan = GD.decomposeHand(hand, level, 20);
    var groups = plan.hands.filter(function (h) { return h.type !== 'raw'; });
    if (!groups.length) return hand.slice(0, 1);

    var nonBombs = groups.filter(function (g) { return !GD.bombFamily(g); });
    var pool = nonBombs.length ? nonBombs : groups;

    /* 对手只剩 1 张时，尽量别领单张送他 */
    var dangerSingle = [0, 1, 2, 3].some(function (i) {
      return teamOf(i) !== teamOf(idx) && !isFinished(deal, i) && deal.hands[i].length === 1;
    });

    /* 领出原则：先出整手牌，再出零散牌；同类里先出小的。
       记牌只用来处理一种特殊情况 —— 对手只剩 1 张时，别出一张他能接走的单张。
       （实验结论：按"外面压不住"来领出反而更差，会提前烧掉控制牌，已回退） */
    pool.sort(function (a, b) {
      var pa = LEAD_PRIORITY[a.type] == null ? 5 : LEAD_PRIORITY[a.type];
      var pb = LEAD_PRIORITY[b.type] == null ? 5 : LEAD_PRIORITY[b.type];
      if (pa !== pb) return pa - pb;
      return (a.rank || 0) - (b.rank || 0);
    });
    if (dangerSingle) {
      var nonSingle = pool.filter(function (g) { return g.type !== 'single'; });
      if (nonSingle.length) pool = nonSingle;
      else if (mem) {
        /* 只能出单张：挑一张外面绝对压不住的，别送人头 */
        var safe = pool.filter(function (g) { return threatOf(g, mem, level) < 0.5; });
        if (safe.length) pool = safe;
      }
    }
    return pool[0].cards.slice();
  }

  function shouldBomb(deal, idx, diff, cur, mem, bombCand) {
    var played = deal.discarded.length;
    var opp = [0, 1, 2, 3].filter(function (i) {
      return teamOf(i) !== teamOf(idx) && !isFinished(deal, i);
    });
    var minOpp = opp.length ? Math.min.apply(null, opp.map(function (i) { return deal.hands[i].length; })) : 0;

    if (minOpp <= 3) return true;                     /* 对手马上要走完，必须拦 */
    if (cur.type === 'bomb' || cur.type === 'jokerbomb') return true; /* 已经是炸弹对轰 */
    if (deal.hands[idx].length <= 6) return true;     /* 自己也快走完，抢牌权冲刺 */
    if (diff <= 0) return false;                      /* 新手不乱炸 */
    if (played < 45) return false;                    /* 前期炸普通牌型是纯亏 */

    /* 记牌：外面可能还有更大的炸弹 / 天王炸 → 别急着把炸弹交出去 */
    if (bombCand && mem && threatOf(bombCand, mem, deal.level) > 0.5 && minOpp > 6) {
      return false;
    }
    if (cur.cards.length >= 5) return true;           /* 中后期，对手甩大牌型 */
    if (cur.rank >= 14) return true;                  /* 中后期，对手点数已经很高 */
    return diff >= 2 && played > 70;                  /* 高手在残局更敢炸 */
  }

  function followChoice(deal, idx, diff, mem, pol) {
    pol = pol || {};
    var useThreat = pol.followThreat === true;   /* 默认关闭：实测“挑更强的牌去压”反而更差 */
    var useHoldBack = pol.holdBack !== false;
    var hand = deal.hands[idx];
    var level = deal.level;
    var cur = deal.trick.combo;

    var cands = beats(hand, level, cur);
    if (!cands.length) return { action: 'pass' };

    var finisher = null;
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].cards.length === hand.length) { finisher = cands[i]; break; }
    }
    if (finisher) return { action: 'play', cards: finisher.cards.slice() };

    var owner = deal.trick.owner;
    /* 队友（哪怕已经走完）占着这圈最大牌，就不要去压 —— 让对手先表态，
       都不压就轮到我接风，等于白捡一个领出权 */
    var partnerWinning = owner === partnerOf(idx);

    if (partnerWinning) {
      /* 新手偶尔手痒；普通/高手一律让牌 */
      if (diff <= 0 && Math.random() < 0.25) {
        var cheap0 = cands.filter(function (c) { return !GD.bombFamily(c); });
        if (cheap0.length) return { action: 'play', cards: cheap0[0].cards.slice() };
      }
      return { action: 'pass' };
    }

    var nonBomb = cands.filter(function (c) { return !GD.bombFamily(c); });
    if (nonBomb.length) {
      if (diff <= 0 && Math.random() < 0.15) {
        return { action: 'play', cards: nonBomb[0].cards.slice() };
      }
      var plan = GD.decomposeHand(hand, level, 18);
      var best = scoredCandidates(nonBomb, hand, level, plan, useThreat ? mem : null)[0];

      /* 憋牌：为压一手小牌要拆掉已经成型的牌型（尤其实在动逢人配），
         而对手还早得很 —— 不如过，把结构留住 */
      if (useHoldBack && mem && diff >= 1 && best.broken >= 10 && hand.length > 10) {
        var cheapTrick = (cur.type !== 'bomb' && cur.type !== 'jokerbomb') &&
          cur.rank <= 10 && cur.cards.length <= 5;
        if (cheapTrick && minOpponentCards(deal, idx) > 8) return { action: 'pass' };
      }
      return { action: 'play', cards: best.combo.cards.slice() };
    }

    if (shouldBomb(deal, idx, diff, cur, mem, cands[0])) {
      return { action: 'play', cards: cands[0].cards.slice() };
    }
    return { action: 'pass' };
  }

  function aiTurn(match, idx, diff, opts) {
    var deal = match.deal;
    if (deal.phase !== 'play' || deal.turn !== idx) return { action: 'pass' };
    var o = (opts && typeof opts === 'object') ? opts : { legacy: !!opts };
    var mem = o.legacy ? null : buildMemory(deal, idx, deal.level);
    if (!deal.trick.combo) {
      return { action: 'play', cards: leadChoice(deal, idx, o.leadThreat === false ? null : mem) };
    }
    return followChoice(deal, idx, diff == null ? 1 : diff, mem, o);
  }

  /* ---------------------------------------------------------------- 教练提示 */

  function altsText(cands, deal, limit) {
    return cands.slice(0, limit || 3).map(function (c) {
      return GD.comboLabel(c, deal.level);
    });
  }

  function threatNote(combo, mem, level) {
    if (!combo || !mem) return '';
    var t = threatOf(combo, mem, level);
    if (t < 0.5) {
      return '<br><b>记牌</b>：外面已经没有能压过它的牌了（相关大牌都在你手上或已经出过），这手能直接<b>拿住牌权</b>。';
    }
    if (t < 1.6) {
      return '<br><b>记牌</b>：外面大约还有 <b>' + Math.max(1, Math.round(t)) + '</b> 手能压过它，不算稳。';
    }
    return '<br><b>记牌</b>：外面还有约 <b>' + Math.round(t) + '</b> 手能压过它，更偏"试探"。';
  }

  function hint(match, idx) {
    var deal = match.deal;
    var level = deal.level;
    var hand = deal.hands[idx];
    var cur = deal.trick.combo;

    if (deal.turn !== idx) return null;
    var mem = buildMemory(deal, idx, level);

    /* 领出 */
    if (!cur) {
      var whole = GD.identify(hand, level);
      var cards = leadChoice(deal, idx, mem);
      var combo = GD.identify(cards, level);
      var leadPlan = GD.decomposeHand(hand, level, 16);
      var nonBombs = leadPlan.hands.filter(function (h) { return h.type !== 'raw' && !GD.bombFamily(h); });
      return {
        action: 'play',
        cards: cards,
        combo: combo,
        reason: whole
          ? '你手上的牌<b>一把就能走完</b>，直接出，本副头游就是你的。'
          : '这圈由你<b>领出</b>。优先出最整的一手（顺子 / 钢板 / 三连对），把单张和大牌留到后面 —— 单张每出一张，就等于把牌权送出去一次。' +
            (nonBombs.length === 1 ? '现在只剩一种整手牌，出完就要靠单张了，更要先抢这一手。' : '') +
            threatNote(combo, mem, level),
        alts: altsText(nonBombs.sort(function (a, b) {
          return (LEAD_PRIORITY[a.type] || 5) - (LEAD_PRIORITY[b.type] || 5);
        }), deal)
      };
    }

    var cands = beats(hand, level, cur);
    var owner = deal.trick.owner;
    var partnerWinning = owner === partnerOf(idx);
    var ownerName = SEAT_NAME[owner];

    /* 能一把走完 */
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].cards.length === hand.length) {
        return {
          action: 'play',
          cards: cands[i].cards.slice(),
          combo: cands[i],
          reason: '这一手出完你就<b>走完</b>了，别犹豫，直接出。',
          alts: altsText(cands, deal)
        };
      }
    }

    if (partnerWinning) {
      var partnerFinished = isFinished(deal, owner);
      return {
        action: 'pass',
        cards: [],
        reason: '这一圈最大的是<b>队友</b>（' + ownerName + '）的牌。' +
          (partnerFinished
            ? '队友<b>已经走完</b>，这一圈结束牌权会按接风规则传给队友的下家。若你这一手能<b>直接走完</b>，或想抢下牌权自己领出，可以压；否则就"过"。'
            : '<b>不要压队友</b> —— 压上去等于抢走队友的牌权，还白耗一手好牌。除非你这一手能直接走完，否则就"过"。'),
        alts: altsText(cands, deal)
      };
    }

    if (!cands.length) {
      return {
        action: 'pass',
        cards: [],
        reason: '你手上没有能压过 <b>' + GD.comboLabel(cur, level) + '</b> 的牌，安心过，把牌留着。',
        alts: []
      };
    }

    var nonBomb = cands.filter(function (c) { return !GD.bombFamily(c); });
    if (nonBomb.length) {
      var plan = GD.decomposeHand(hand, level, 16);
      var ranked = scoredCandidates(nonBomb, hand, level, plan, mem);
      var best = ranked[0];
      return {
        action: 'play',
        cards: best.combo.cards.slice(),
        combo: best.combo,
        reason: '这一圈是对手（' + ownerName + '）的牌，要压。选<b>代价最小</b>的那一手：' +
          GD.comboLabel(best.combo, level) + ' —— 刚刚压过，又尽量不拆自己已经成型的牌，炸弹一张不动。' +
          threatNote(best.combo, mem, level),
        alts: altsText(ranked.map(function (x) { return x.combo; }), deal)
      };
    }

    var oppLeft = [0, 1, 2, 3].filter(function (i) {
      return teamOf(i) !== teamOf(idx) && !isFinished(deal, i);
    }).map(function (i) { return deal.hands[i].length; });
    var minOpp = oppLeft.length ? Math.min.apply(null, oppLeft) : 0;
    var boom = shouldBomb(deal, idx, 1, cur, mem, cands[0]);
    return {
      action: boom ? 'play' : 'pass',
      cards: boom ? cands[0].cards.slice() : [],
      combo: boom ? cands[0] : null,
      reason: boom
        ? '同牌型已经压不住了，只剩炸弹。对手手上最少还有 <b>' + minOpp + ' 张</b>，这个时机值得炸。'
        : '同牌型压不住，只剩炸弹可用。但对手至少还有 <b>' + minOpp + ' 张</b>，现在炸性价比不高 —— 建议先过，把炸弹留到关键手。',
      alts: altsText(cands, deal)
    };
  }

  /* ------------------------------------------------------------------ 导出 */

  /** 二项分布尾概率：u 张未知牌里，某个具体玩家拿到 ≥k 张的概率 */
  function binomAtLeast(u, k, p) {
    if (u < k) return 0;
    var s = 0, c = 1;
    for (var i = 0; i <= u; i++) {
      if (i >= k) s += c * Math.pow(p, i) * Math.pow(1 - p, u - i);
      c = c * (u - i) / (i + 1);
    }
    return s;
  }

  /** 供界面使用的记牌视图：外面还剩哪些牌、还可能存在几个炸弹 */
  function memoryOf(match, idx) {
    var deal = match.deal;
    var mem = buildMemory(deal, idx, deal.level);

    /* 炸弹不能只看"外面还有 4 张"：这 4 张得落在同一个人手里。
       按每张未知牌 1/3 概率落到某个具体玩家，估"三家中有炸"的概率。 */
    var pBomb = {}, bombExpect = 0;
    for (var b = 2; b <= 14; b++) {
      var u = mem.cnt[b];
      var p1 = binomAtLeast(u, 4, 1 / 3);
      var pAny = 1 - Math.pow(1 - p1, 3);
      pBomb[b] = pAny;
      bombExpect += pAny;
    }

    var list = [];
    list.push({ kind: 'big', label: '大王', count: mem.jok[16] });
    list.push({ kind: 'small', label: '小王', count: mem.jok[15] });
    list.push({ kind: 'wild', label: '逢人配', count: mem.wilds });
    for (var r = 14; r >= 2; r--) {
      list.push({
        kind: 'rank', rank: r, label: GD.RANK_TEXT[r] + (r === deal.level ? '级' : ''),
        count: mem.cnt[r], isLevel: r === deal.level, pBomb: pBomb[r]
      });
    }

    var top = [];
    for (var t = 2; t <= 14; t++) if (pBomb[t] > 0.3) top.push(t);
    top.sort(function (x, y) { return pBomb[y] - pBomb[x]; });

    mem.list = list;
    mem.pBomb = pBomb;
    mem.bombExpect = bombExpect;
    mem.topBombRanks = top.slice(0, 3);
    return mem;
  }

  return {
    SEAT_NAME: SEAT_NAME,
    teamOf: teamOf,
    partnerOf: partnerOf,
    isFinished: isFinished,
    startMatch: startMatch,
    newDeal: newDeal,
    play: play,
    pass: pass,
    beats: beats,
    aiTurn: aiTurn,
    hint: hint,
    leadChoice: leadChoice,
    followChoice: followChoice,
    memoryOf: memoryOf,
    threatOf: threatOf
  };
});
