/* 视图 03 · 逢人配实验室 */
(function (root) {
  'use strict';
  var GD = root.GD, UI = root.UI;

  var S = { level: 2, sel: [] };

  function sameCount(s, r) {
    return S.sel.filter(function (c) { return c.s === s && c.r === r; }).length;
  }

  function add(s, r) {
    if (sameCount(s, r) >= 2) return;
    if (S.sel.length >= 12) return;
    S.sel.push(GD.makeCard(s, r, sameCount(s, r)));
  }

  function removeAt(i) {
    if (i >= 0 && i < S.sel.length) S.sel.splice(i, 1);
  }

  function deckHTML(level) {
    var html = '<div class="deck-picker">';
    for (var r = 2; r <= 14; r++) {
      var isLevel = r === level;
      html += '<div class="deck-row">' +
        '<div class="deck-rank' + (isLevel ? ' is-level' : '') + '">' + GD.RANK_TEXT[r] + '</div>';
      GD.SUITS.forEach(function (s) {
        var wild = s === 'H' && isLevel;
        var red = s === 'H' || s === 'D';
        html += '<button class="suit-btn' + (red ? ' red' : '') + (wild ? ' wild' : '') +
          '" data-suit="' + s + '" data-rank="' + r + '" title="' +
          GD.SUIT_NAME[s] + GD.RANK_TEXT[r] + (wild ? '（逢人配）' : '') + '">' +
          GD.SUIT_TEXT[s] + '</button>';
      });
      html += '<div></div></div>';
    }
    html += '<div class="deck-row">' +
      '<div class="deck-rank">王</div>' +
      '<button class="joker-btn" data-suit="X" data-rank="15" style="grid-column:span 2">小王</button>' +
      '<button class="joker-btn" data-suit="X" data-rank="16" style="grid-column:span 2">大王</button>' +
      '<div></div></div>';
    html += '</div>';
    return html;
  }

  function resultsHTML(level) {
    if (!S.sel.length) {
      return '<div class="empty-state">从左边点牌放进托盘，这里会实时告诉你<br>' +
        '这手牌能组成哪些牌型、逢人配被当成了什么。</div>';
    }
    var ints = GD.interpretations(S.sel, level);
    if (!ints.length) {
      return '<div class="empty-state">这 ' + S.sel.length + ' 张牌<b style="color:#f0a79f">凑不出任何合法牌型</b>。<br>' +
        '掼蛋里合法牌型只有：单张 / 对子 / 三同张 / 三带二 / 三连对 / 钢板 / 顺子 / 同花顺 / 炸弹 / 四大天王。<br>' +
        '可以试试加一张 ♥' + GD.RANK_TEXT[level] + '（逢人配）来补牌。</div>';
    }

    var wildCount = S.sel.filter(function (c) { return GD.isWild(c, level); }).length;
    var shown = ints.slice(0, 8);
    var head = '<p class="hint-line" style="margin:0 0 10px">共 <b style="color:var(--gold-2)">' +
      ints.length + '</b> 种解释' + (wildCount ? '，已按"默认取最大牌型"排序' : '') +
      (ints.length > shown.length ? '（只展示前 8 种）' : '') + '。</p>';

    return head + '<div class="result-list">' + shown.map(function (c, i) {
      var w = GD.wildAssignments(c, level);
      var isBomb = GD.bombFamily(c);
      return '<div class="result-item' + (i === 0 ? ' best' : '') + '">' +
        '<div class="ri-main">' +
        '<div class="ri-name">' + GD.comboLabel(c, level) +
        (i === 0 ? '<span class="tag gold">最强</span>' : '') +
        (isBomb ? '<span class="tag bomb">炸弹家族</span>' : '<span class="tag">普通牌型</span>') +
        '</div>' +
        '<div class="ri-sub">' + (w.length
          ? '逢人配：' + w.map(function (x) { return GD.cardText(x.card) + ' → <b style="color:var(--gold-2)">' + x.as + '</b>'; }).join('、')
          : '没有用到逢人配') +
        '</div></div>' +
        '<div>' + UI.row(c.cards, level, { size: 'xs', tight: true }) + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function paint(el) {
    var level = S.level;
    var selHTML = S.sel.length
      ? S.sel.map(function (c, i) {
        return UI.card(c, level, { size: 'sm', clickable: true, attrs: 'data-idx="' + i + '" title="点击移出"' });
      }).join('')
      : '<div class="tray-empty">↑ 这里是你的托盘，点左边的牌加进来</div>';

    el.innerHTML =
      '<section class="panel">' +
      '<div class="sec-head"><h2>逢人配实验室</h2><p>亲手摆一摆，比看十遍规则有用</p>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" data-act="demo">来个示例</button>' +
      '<button class="btn btn-sm ghost" data-act="clear">清空</button>' +
      '</div>' +
      '<div class="lab">' +
      '<div>' +
      '<p class="hint-line" style="margin:0 0 10px">点牌面加入托盘（每种牌最多两张，因为有两副牌）。' +
      '打 <b style="color:var(--gold-2)">' + GD.RANK_TEXT[level] + '</b> 时，' +
      '<b style="color:var(--gold-2)">♥' + GD.RANK_TEXT[level] + '</b> 就是逢人配。</p>' +
      deckHTML(level) +
      '</div>' +
      '<div>' +
      '<p class="hint-line" style="margin:0 0 8px">我的托盘（点击移出）</p>' +
      '<div class="tray">' + selHTML + '</div>' +
      '<div style="margin-top:16px">' + resultsHTML(level) + '</div>' +
      '</div>' +
      '</div>' +
      '</section>';
  }

  function demo() {
    S.sel = [];
    var level = S.level;
    var suits = ['C', 'C', 'C', 'C'];
    [7, 8, 10, 11].forEach(function (r, i) {
      S.sel.push(GD.makeCard(suits[i], r, 0));
    });
    S.sel.push(GD.makeCard('H', level, 0));
  }

  root.ViewLab = {
    mount: function (el) {
      el.addEventListener('click', function (ev) {
        var suitBtn = ev.target.closest('[data-suit]');
        if (suitBtn) {
          add(suitBtn.getAttribute('data-suit'), parseInt(suitBtn.getAttribute('data-rank'), 10));
          paint(el);
          return;
        }
        var trayCard = ev.target.closest('[data-idx]');
        if (trayCard) {
          removeAt(parseInt(trayCard.getAttribute('data-idx'), 10));
          paint(el);
          return;
        }
        var act = ev.target.closest('[data-act]');
        if (act) {
          var a = act.getAttribute('data-act');
          if (a === 'clear') { S.sel = []; paint(el); }
          if (a === 'demo') { demo(); paint(el); }
        }
      });
    },
    render: function (el, level) {
      S.level = level;
      paint(el);
    }
  };
})(window);
