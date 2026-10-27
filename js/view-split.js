/* 视图 04 · 拆牌教练 */
(function (root) {
  'use strict';
  var GD = root.GD, UI = root.UI;

  var S = { level: 2, hand: null, decomp: null };

  function catOf(type) {
    if (type === 'bomb' || type === 'flush' || type === 'jokerbomb') return ['cat-bomb', '炸弹'];
    if (type === 'plate' || type === 'tube' || type === 'straight') return ['cat-seq', '整手大牌'];
    if (type === 'fullhouse' || type === 'triple') return ['cat-mid', '中等牌'];
    return ['cat-low', '零散牌'];
  }

  function deal(level) {
    var deck = GD.shuffle(GD.createDeck(), Math.random);
    S.hand = deck.slice(0, 27);
    S.decomp = GD.decomposeHand(S.hand, level, 80);
  }

  function coachNotes(d, level) {
    var notes = [];
    var jokers = S.hand.filter(function (c) { return GD.isJoker(c); }).length;
    var bigJokers = S.hand.filter(function (c) { return c.s === 'X' && c.r === 16; }).length;

    if (d.count <= 7) {
      notes.push(['✓', '只有 <b>' + d.count + ' 手</b>，牌型很整。这种牌要主动抢牌权，别缩在后面等队友。']);
    } else if (d.count >= 10) {
      notes.push(['!', '要拆成 <b>' + d.count + ' 手</b>，偏多。出牌顺序比牌力更重要：先放顺子、钢板这种"一张牌管好几张"的，单张留到最后再说。']);
    } else {
      notes.push(['·', '拆成 <b>' + d.count + ' 手</b>，属于正常水平。思路：先把零散对子和单张处理掉，把整手牌流到最后。']);
    }

    if (d.bombs) {
      notes.push(['炸', '手里有 <b>' + d.bombs + ' 个炸弹</b>。炸弹是翻盘资本，前期别拿去炸小牌，尽量留给对手的顺子、钢板或者冲刺阶段。']);
    }

    if (d.singles >= 5) {
      notes.push(['↓', '单张有 <b>' + d.singles + ' 张</b>，偏多。出一张单张就等于把牌权送人一次，能并进对子/顺子就别留。']);
    }

    if (d.wilds) {
      notes.push(['配', '有 <b>' + d.wilds + ' 张逢人配（♥' + GD.RANK_TEXT[level] + '）</b>。它最强的地方是<b>补成炸弹</b>或者<b>补齐关键顺子</b>，千万不要顺手当单张打掉。']);
    }

    if (jokers) {
      notes.push(['王', '有 <b>' + jokers + ' 张王牌</b>。小王、大王是控牌权的最强手段，可以留一张在最后收尾；' +
        (bigJokers >= 2 ? '两张大王还能在下一局开局时<b>抗贡</b>。' : '单张大王也是很好的单张终结者。')]);
    }

    notes.push(['→', '领出时优先打<b>最小的、最不灵活的那手牌</b>，把大牌和炸弹留在手上当"保险"。']);
    return notes;
  }

  function paint(el) {
    var level = S.level;
    var d = S.decomp;
    var hand = GD.sortHand(S.hand, level);

    var groups = d.hands.map(function (h) {
      var cat = catOf(h.type);
      return '<div class="group ' + cat[0] + '">' +
        '<div class="g-label"><b>' + (h.type === 'raw' ? '未成牌型' : GD.TYPE_NAME[h.type]) + '</b>' + cat[1] + '</div>' +
        UI.row(h.cards, level, { size: 'xs', tight: true }) +
        '</div>';
    }).join('');

    var notes = coachNotes(d, level).map(function (n) {
      return '<div class="note"><span class="ic">' + n[0] + '</span><div>' + n[1] + '</div></div>';
    }).join('');

    el.innerHTML =
      '<section class="panel">' +
      '<div class="sec-head"><h2>拆牌教练</h2><p>同样的 27 张牌，拆法不同，输赢不同</p>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm primary" data-act="deal">发一手新牌</button>' +
      '</div>' +

      '<p class="hint-line" style="margin:0 0 8px">你的手牌（' + hand.length + ' 张，已按牌力从大到小排好；金框是逢人配）</p>' +
      '<div class="hand-zone">' + UI.row(hand, level, { size: 'sm' }) + '</div>' +

      '<div class="split-stats">' +
      '<div class="big-stat"><span class="bs-num">' + d.count + '<small>手</small></span><span class="bs-label">需要出几次</span></div>' +
      '<div class="big-stat"><span class="bs-num">' + d.singles + '<small>张</small></span><span class="bs-label">单张（最容易送牌权）</span></div>' +
      '<div class="big-stat"><span class="bs-num">' + d.bombs + '<small>个</small></span><span class="bs-label">炸弹</span></div>' +
      '<div class="big-stat"><span class="bs-num">' + d.wilds + '<small>张</small></span><span class="bs-label">逢人配</span></div>' +
      '</div>' +

      '<div class="divider"></div>' +
      '<div class="sec-head"><h2 style="font-size:14.5px">参考拆法</h2><p>一种合理的分法，不是唯一答案</p></div>' +
      '<div class="group-grid">' + groups + '</div>' +

      '<div class="divider"></div>' +
      '<div class="sec-head"><h2 style="font-size:14.5px">教练点评</h2><p>为什么这样拆</p></div>' +
      '<div class="coach-notes">' + notes + '</div>' +
      '</section>';
  }

  root.ViewSplit = {
    mount: function (el) {
      el.addEventListener('click', function (ev) {
        var act = ev.target.closest('[data-act]');
        if (act && act.getAttribute('data-act') === 'deal') {
          deal(S.level);
          paint(el);
        }
      });
    },
    render: function (el, level) {
      var changed = S.level !== level;
      S.level = level;
      if (!S.hand) deal(level);
      else if (changed) S.decomp = GD.decomposeHand(S.hand, level, 80);
      paint(el);
    }
  };
})(window);
