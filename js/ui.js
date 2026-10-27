/* 通用 UI 小工具：扑克牌渲染、随机数、DOM 辅助 */
(function (root) {
  'use strict';
  var GD = root.GD;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }

  /* 单张牌 */
  function card(c, level, o) {
    o = o || {};
    var cls = ['card'];
    var joker = c.s === 'X';
    var red = joker ? c.r === 16 : (c.s === 'H' || c.s === 'D');
    if (joker) cls.push('joker');
    if (red) cls.push('red');
    if (GD.isWild(c, level)) cls.push('wild');
    if (o.size) cls.push('size-' + o.size);
    if (o.dim) cls.push('dim');
    if (o.clickable) cls.push('clickable');
    if (o.cls) cls.push(o.cls);

    var face;
    if (joker) {
      face = '<span class="joker-text">' + (c.r === 16 ? '大王' : '小王') + '</span>';
    } else {
      face = '<span class="corner"><b>' + GD.RANK_TEXT[c.r] + '</b><i>' + GD.SUIT_TEXT[c.s] + '</i></span>' +
        '<span class="big">' + GD.SUIT_TEXT[c.s] + '</span>';
    }
    var badge = GD.isWild(c, level) ? '<span class="badge">配</span>' : '';
    var cardName = joker ? (c.r === 16 ? '大王' : '小王') : GD.SUIT_TEXT[c.s] + GD.RANK_TEXT[c.r];
    var a11y = o.clickable
      ? ' role="button" tabindex="0" aria-label="' + cardName + (GD.isWild(c, level) ? '，逢人配' : '') + '" aria-pressed="' + (o.cls && o.cls.indexOf('is-picked') >= 0 ? 'true' : 'false') + '"'
      : ' role="img" aria-label="' + cardName + (GD.isWild(c, level) ? '，逢人配' : '') + '"';
    return '<div class="' + cls.join(' ') + '"' + a11y + (o.attrs ? ' ' + o.attrs : '') + '>' + face + badge + '</div>';
  }

  /* 一排牌 */
  function row(cards, level, o) {
    o = o || {};
    var cls = ['card-row'];
    if (o.tight) cls.push('tight');
    if (o.overlap) cls.push('overlap');
    return '<div class="' + cls.join(' ') + '">' + cards.map(function (c) {
      return card(c, level, o);
    }).join('') + '</div>';
  }

  /* 牌力小组件：显示一张代表性牌 + 文字 */
  function rung(cardSpec, label, note) {
    return '<div class="rung">' +
      card(cardSpec.c, cardSpec.level, { size: 'sm' }) +
      '<span>' + label + '</span>' +
      (note ? '<em>' + note + '</em>' : '') +
      '</div>';
  }

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  root.UI = {
    card: card,
    row: row,
    rung: rung,
    seeded: mulberry32,
    esc: esc,
    $: $,
    $$: $$
  };
})(window);
