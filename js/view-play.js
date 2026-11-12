/* 视图 05 · 实战对局（你 vs 队友 vs 两个 AI 对手） */
(function (root) {
  'use strict';
  var GD = root.GD, UI = root.UI, G = root.GDGame;

  var NAMES = ['你', '下家', '队友', '上家'];
  var DIFF_NAME = ['新手', '普通', '高手'];

  var S = {
    match: null,
    difficulty: 1,
    coach: true,
    showMemory: true,
    selected: [],
    hint: null,
    hintToken: null,
    error: null,
    timer: null,
    gen: 0,
    el: null
  };

  function name(i) { return NAMES[i]; }
  function isMine(i) { return i === 0 || i === 2; }

  /* ------------------------------------------------------------ 状态查询 */

  function myTurn() {
    var d = S.match && S.match.deal;
    return !!(d && d.phase === 'play' && d.turn === 0);
  }

  function selCombo() {
    var d = S.match.deal;
    if (!S.selected.length) return null;
    return GD.identify(S.selected, d.level);
  }

  function hintToken() {
    var d = S.match.deal;
    return d.events.length + ':' + d.turn + ':' + d.trick.combo;
  }

  function ensureHint() {
    if (!S.coach || !myTurn()) { S.hint = null; return; }
    var tok = hintToken();
    if (S.hint && S.hintToken === tok) return;
    var t0 = Date.now();
    S.hint = G.hint(S.match, 0);
    S.hintToken = tok;
    if (S.hint) S.hint.ms = Date.now() - t0;
  }

  /* ---------------------------------------------------------------- 渲染 */

  function headerHTML() {
    var m = S.match, d = m.deal;
    return '<div class="play-head">' +
      '<div class="ph-item"><span>本副打</span><b class="ph-level">' + GD.RANK_TEXT[d.level] + '</b></div>' +
      '<div class="ph-item mine"><span>我方</span><b>' + GD.RANK_TEXT[m.levels[0]] + '</b></div>' +
      '<div class="ph-item them"><span>对方</span><b>' + GD.RANK_TEXT[m.levels[1]] + '</b></div>' +
      '<div class="ph-item"><span>第</span><b>' + (m.dealNo + 1) + '</b><span>副</span></div>' +
      '<div class="spacer"></div>' +
      '<div class="mode-switch" aria-label="对手难度">' +
      [0, 1, 2].map(function (i) {
        return '<button data-diff="' + i + '" aria-pressed="' + (S.difficulty === i) + '" class="' + (S.difficulty === i ? 'is-active' : '') + '">' + DIFF_NAME[i] + '</button>';
      }).join('') +
      '</div>' +
      '<label class="coach-toggle"><input type="checkbox" data-act="coach"' + (S.coach ? ' checked' : '') + '><span>教练</span></label>' +
      '<button class="btn btn-sm ghost" data-act="memory" aria-pressed="' + (S.showMemory ? 'true' : 'false') + '">' + (S.showMemory ? '记牌 ✓' : '记牌') + '</button>' +
      '<button class="btn btn-sm ghost" data-act="restart">重开</button>' +
      '<div class="play-order"><span>逆时针出牌</span><b>你 → 下家 → 队友 → 上家</b><span>·</span><span>你与对家同队</span></div>' +
      '</div>';
  }

  function seatHTML(i) {
    var d = S.match.deal;
    var cls = 'seat seat-' + ['s', 'e', 'n', 'w'][i];
    if (d.turn === i && d.phase === 'play') cls += ' is-active';
    if (G.isFinished(d, i)) cls += ' is-out';
    if (isMine(i)) cls += ' is-mine';

    var sub = G.isFinished(d, i)
      ? '第 ' + (d.finished.indexOf(i) + 1) + ' 游'
      : '余 ' + d.hands[i].length + ' 张';

    var t = d.table[i];
    var playHTML = '';
    if (t === 'pass') playHTML = '<span class="seat-pass">过</span>';
    else if (t && t.cards) playHTML = UI.row(t.cards, d.level, { size: 'xs', tight: true });

    return '<div class="' + cls + '" aria-label="' + name(i) + '，' + sub + '">' +
      '<div class="seat-top">' +
      '<span class="seat-name">' + name(i) + (isMine(i) ? '<i class="seat-tag">我方</i>' : '') + '</span>' +
      '<span class="seat-sub">' + sub + '</span>' +
      '</div>' +
      '<div class="seat-play">' + playHTML + '</div>' +
      '</div>';
  }

  function centerHTML() {
    var d = S.match.deal;
    var c = d.trick.combo;
    if (!c) {
      return '<div class="table-center is-empty">' +
        '<div class="tc-label">' + (d.turn === 0 ? '轮到你领出' : '等 ' + name(d.turn) + ' 领出') + '</div>' +
        '<div class="tc-empty">这一圈还没人出牌</div>' +
        '</div>';
    }
    return '<div class="table-center">' +
      '<div class="tc-label">当前最大</div>' +
      UI.row(c.cards, d.level, { size: 'sm' }) +
      '<div class="tc-sub">' + GD.comboLabel(c, d.level) + ' · ' + name(d.trick.owner) + ' 出</div>' +
      '</div>';
  }

  function handHTML() {
    var d = S.match.deal;
    var hand = GD.sortHand(d.hands[0], d.level);
    var picked = {};
    S.selected.forEach(function (c) { picked[GD.cardKey(c)] = 1; });
    var cards = hand.map(function (c) {
      var k = GD.cardKey(c);
      return UI.card(c, d.level, {
        size: 'sm',
        clickable: true,
        cls: picked[k] ? 'is-picked' : '',
        attrs: 'data-card="' + k + '"'
      });
    }).join('');

    var combo = selCombo();
    var selInfo;
    if (!S.selected.length) selInfo = '点击选牌，再点一次取消';
    else if (!combo) selInfo = '<span class="bad">已选 ' + S.selected.length + ' 张 · 不成牌型</span>';
    else selInfo = '<span class="good">已选 ' + S.selected.length + ' 张 · ' + GD.comboLabel(combo, d.level) + '</span>';

    var turn = myTurn();
    return '<div class="my-zone">' +
      '<div class="my-head">' +
      '<span class="my-title">你的手牌 · 剩 ' + d.hands[0].length + ' 张</span>' +
      '<span class="my-sel">' + selInfo + '</span>' +
      '</div>' +
      '<div class="my-hand">' + cards + '</div>' +
      '<div class="actions">' +
      '<button class="btn primary" data-act="play"' + (turn && S.selected.length ? '' : ' disabled') + '>出牌</button>' +
      '<button class="btn" data-act="pass"' + (turn && d.trick.combo ? '' : ' disabled') + '>过</button>' +
      '<button class="btn ghost" data-act="hint"' + (turn ? '' : ' disabled') + '>提示</button>' +
      '<button class="btn ghost" data-act="clear"' + (S.selected.length ? '' : ' disabled') + '>清空</button>' +
      '<span class="actions-tip kb-only">快捷键：Enter 出牌 · 空格 过 · H 提示</span>' +
      '</div>' +
      '</div>';
  }

  function coachHTML() {
    var d = S.match.deal;
    if (d.phase !== 'play') return '';
    if (S.error) return '<div class="coach-box is-err"><div class="coach-title">出牌不合法</div><div>' + S.error + '</div></div>';
    if (!S.coach) return '<div class="coach-box is-off"><div class="coach-title">教练已关闭</div><div class="coach-reason">自己先判断，再回来打开对照一下，进步更快。</div></div>';
    if (d.turn !== 0) {
      return '<div class="coach-box is-wait"><div class="coach-title">等待中</div><div class="coach-reason">' +
        name(d.turn) + ' 正在出牌… 轮到你时会给出建议。</div></div>';
    }
    if (!S.hint) return '';
    var h = S.hint;
    var act = h.action === 'play'
      ? '出 <b>' + (h.combo ? GD.comboLabel(h.combo, d.level) : '这手牌') + '</b>'
      : '<b>过</b>';
    return '<div class="coach-box">' +
      '<div class="coach-title">教练建议</div>' +
      '<div class="coach-act">' + act + '</div>' +
      '<div class="coach-reason">' + h.reason + '</div>' +
      (h.action === 'play' && h.cards ? '<div class="coach-cards">' + UI.row(h.cards, d.level, { size: 'xs', tight: true }) + '</div>' : '') +
      '<button class="btn btn-sm coach-apply" data-act="hint">' + (h.action === 'play' ? '帮我选这手' : '知道了') + '</button>' +
      (h.alts && h.alts.length ? '<div class="coach-alts">其他可选：' + h.alts.join(' / ') + '</div>' : '') +
      '</div>';
  }

  function logHTML() {
    var d = S.match.deal;
    var items = d.events.slice(-9).map(function (e) {
      if (e.type === 'play') return '<div class="log-line"><i>' + name(e.player) + '</i> 出 ' + GD.comboLabel(e.combo, d.level) + '</div>';
      if (e.type === 'pass') return '<div class="log-line is-pass"><i>' + name(e.player) + '</i> 过</div>';
      return '<div class="log-line is-sys">' + (e.text || '') + '</div>';
    }).join('');
    return '<div class="log-box"><div class="log-title">本圈记录</div><div class="log-lines">' + (items || '<div class="log-line is-pass">—</div>') + '</div></div>';
  }

  /* 记牌器：你自己的牌 + 场上已出的牌 → 推出"外面还剩什么" */
  function memoryHTML() {
    if (!S.showMemory) return '';
    var d = S.match.deal;
    var mem = G.memoryOf(S.match, 0);

    var chips = mem.list.map(function (it) {
      var cls = 'mem-chip';
      if (it.count === 0) cls += ' is-zero';
      if (it.kind === 'wild') cls += ' is-wild';
      if (it.isLevel) cls += ' is-level';
      if (it.kind === 'rank' && it.pBomb > 0.45) cls += ' is-bomb';
      return '<span class="' + cls + '">' + it.label + '<b>' + it.count + '</b></span>';
    }).join('');

    var bombText;
    if (mem.bombExpect < 0.25) bombText = '外面基本不会有炸弹了';
    else {
      var top = mem.topBombRanks.map(function (r) { return GD.RANK_TEXT[r]; }).join('、');
      bombText = '外面估计还有约 <b>' + Math.max(1, Math.round(mem.bombExpect)) + '</b> 个炸弹' +
        (top ? '（' + top + ' 概率较高）' : '') +
        '<span class="mem-note">（按未知牌均匀分布近似估计）</span>';
    }

    return '<div class="mem-strip">' +
      '<div class="mem-head">' +
      '<span class="mem-title">记牌</span>' +
      '<span class="mem-sub">外面还剩 <b>' + mem.unknownCount + '</b> 张（对手 ' + mem.oppHands + ' · 队友 ' + mem.partnerHand + '） · ' + bombText + '</span>' +
      '</div>' +
      '<div class="mem-chips">' + chips + '</div>' +
      '</div>';
  }

  function resultHTML() {
    var m = S.match, d = m.deal, r = d.result;
    var order = r.finished.map(function (p, i) {
      return '<div class="rank-row' + (isMine(p) ? ' is-mine' : '') + '">' +
        '<span class="rank-no">' + (i + 1) + '</span>' +
        '<span class="rank-name">' + name(p) + '</span>' +
        '<span class="rank-tag">' + (['头游', '二游', '三游', '末游'][i]) + '</span>' +
        '</div>';
    }).join('');

    var upgrade;
    if (r.passedA) upgrade = '<b class="gold">过 A！</b> 你们从 A 级成功通关。';
    else {
      var posText = r.partnerPos === 2 ? '队友拿到二游（双上）' : r.partnerPos === 3 ? '队友拿到三游' : '队友是末游';
      upgrade = '头游 + ' + posText + '，升 <b class="gold">' + r.inc + '</b> 级：' +
        GD.RANK_TEXT[r.levelsBefore[r.winnerTeam]] + ' → ' + GD.RANK_TEXT[r.levelsAfter[r.winnerTeam]] +
        (r.atA && !r.passedA ? '（打 A 必须头游 + 队友二游/三游才算过 A，这局没过，继续打 A）' : '');
    }

    var mineWin = r.winnerTeam === 0;
    var head = m.over
      ? (m.winnerTeam === 0
        ? '<div class="result-title win">🎉 你们打到 A 并过关，赢了这一局！</div>'
        : m.winnerTeam === 1
          ? '<div class="result-title lose">😮 对方先过 A，这一局输了。</div>'
          : '<div class="result-title">副数打完，按级数结算。我方 ' + GD.RANK_TEXT[m.levels[0]] + ' / 对方 ' + GD.RANK_TEXT[m.levels[1]] + '</div>')
      : '<div class="result-title ' + (mineWin ? 'win' : 'lose') + '">' + (mineWin ? '这一副你们赢了' : '这一副对方赢了') + '</div>';

    return '<div class="result-card">' +
      head +
      '<div class="rank-list">' + order + '</div>' +
      '<div class="result-line">' + upgrade + '</div>' +
      '<div class="result-actions">' +
      (m.over
        ? '<button class="btn primary" data-act="restart">再来一局</button>'
        : '<button class="btn primary" data-act="next-deal">下一副 →</button>' +
          '<span class="hint-line">下一副开始前会自动处理进贡/还贡</span>') +
      '</div>' +
      '</div>';
  }

  function paint() {
    var el = S.el;
    if (!el || !S.match) return;
    var m = S.match, d = m.deal;

    /* 重绘前记住手牌滚动位置：innerHTML 重建会把它丢掉，
       丢掉后手牌跳回最左，玩家下一次点击就会命中“不相干的牌”（v2 修复 A） */
    var prevHand = el.querySelector('.my-hand');
    var scrollL = prevHand ? prevHand.scrollLeft : 0;

    /* 选牌与手牌失同步时自动清理（换副 / 进贡还贡 / 引擎替换手牌等路径，v2 修复 B 防御） */
    if (S.selected.length) {
      var inHand = {};
      d.hands[0].forEach(function (c) { inHand[GD.cardKey(c)] = 1; });
      S.selected = S.selected.filter(function (c) { return inHand[GD.cardKey(c)]; });
    }

    /* 顶部“当前级牌”选择器与实战进度保持一致：升级后全站示例跟着变（v2 修复 B 配套） */
    if (root.App && typeof root.App.syncLevel === 'function' && d.phase === 'play') {
      root.App.syncLevel(d.level);
    }

    if (d.phase === 'play') ensureHint();

    var body;
    if (d.phase === 'over') {
      body = '<div class="table">' + seatHTML(2) + seatHTML(3) + seatHTML(1) + seatHTML(0) + centerHTML() + '</div>' + resultHTML();
    } else {
      body = '<div class="table">' +
        seatHTML(2) + seatHTML(3) + seatHTML(1) + seatHTML(0) + centerHTML() +
        '</div>' +
        handHTML() +
        memoryHTML() +
        '<div class="coach-row">' + coachHTML() + logHTML() + '</div>';
    }

    el.innerHTML = '<section class="panel play-panel">' + headerHTML() + body + '</section>';

    /* 恢复手牌滚动位置（同步一次 + 下一帧兜底一次，防个别浏览器布局时序） */
    var handEl = el.querySelector('.my-hand');
    if (handEl && scrollL > 0) {
      handEl.scrollLeft = scrollL;
      requestAnimationFrame(function () {
        if (S.el && S.el.querySelector('.my-hand')) {
          S.el.querySelector('.my-hand').scrollLeft = scrollL;
        }
      });
    }
  }

  /* ------------------------------------------------------------ AI 自动走 */

  function scheduleAI() {
    clearTimeout(S.timer);
    S.timer = null;
    var m = S.match;
    if (!m || m.over) return;
    var d = m.deal;
    if (!d || d.phase !== 'play' || d.turn === 0) return;

    var gen = ++S.gen;
    var seat = d.turn;
    /* 拟人化出牌节奏（v2 修复 D）：被迫过牌反应快，场面复杂 / 要不要炸想得久一点 */
    var thinkBase = 420 + Math.random() * 380;
    if (d.trick.combo) {
      var nBeats = G.beats(d.hands[seat], d.level, d.trick.combo).length;
      if (nBeats === 0) thinkBase = 260 + Math.random() * 220;          /* 只能过：很快 */
      else if (GD.bombFamily(d.trick.combo)) thinkBase += 420 + Math.random() * 480; /* 面对炸弹：纠结 */
      else if (nBeats > 6) thinkBase += 220 + Math.random() * 300;      /* 选择很多：掂量 */
    } else {
      thinkBase += 180 + Math.random() * 260;                          /* 领出：盘算一下 */
    }
    S.timer = setTimeout(function () {
      if (S.gen !== gen) return;
      var mm = S.match;
      if (!mm || mm !== m) return;
      var dd = mm.deal;
      if (dd.phase !== 'play' || dd.turn !== seat) return;

      var mv = G.aiTurn(mm, seat, S.difficulty);
      var res = mv.action === 'play' ? G.play(mm, seat, mv.cards) : G.pass(mm, seat);
      if (!res.ok) {
        /* 兜底：AI 万一给出非法动作，退化为过牌，避免卡死 */
        G.pass(mm, seat);
      }

      S.hint = null;
      paint();
      if (mm.deal.phase === 'play' && mm.deal.turn !== 0) scheduleAI();
    }, thinkBase);
  }

  /* ---------------------------------------------------------------- 操作 */

  function newMatch() {
    S.match = G.startMatch({ maxDeals: 20 });
    G.newDeal(S.match);
    S.selected = [];
    S.hint = null;
    S.hintToken = null;
    S.error = null;
    paint();
    scheduleAI();
  }

  function toggleCard(key) {
    var d = S.match.deal;
    /* 只要本副还在进行就可以预选牌：轮到别人时提前勾选是自然习惯，
       升级/进贡后新一副常由别家先出，此时点牌无反应会被当成“坏了”（v2 修复 B）。
       出牌按钮仍严格受回合限制（handHTML 的 myTurn 条件）。 */
    if (d.phase !== 'play') return;
    var card = null;
    for (var i = 0; i < d.hands[0].length; i++) {
      if (GD.cardKey(d.hands[0][i]) === key) { card = d.hands[0][i]; break; }
    }
    if (!card) return;
    var at = S.selected.indexOf(card);
    if (at >= 0) S.selected.splice(at, 1);
    else S.selected.push(card);
    S.error = null;
    paint();
  }

  function doPlay() {
    if (!myTurn() || !S.selected.length) return;
    var r = G.play(S.match, 0, S.selected.slice());
    if (!r.ok) { S.error = r.err; paint(); return; }
    S.selected = [];
    S.hint = null;
    S.error = null;
    paint();
    scheduleAI();
  }

  function doPass() {
    if (!myTurn()) return;
    if (!S.match.deal.trick.combo) { S.error = '你是这一圈的领出方，必须出牌'; paint(); return; }
    var r = G.pass(S.match, 0);
    if (!r.ok) { S.error = r.err; paint(); return; }
    S.selected = [];
    S.hint = null;
    S.error = null;
    paint();
    scheduleAI();
  }

  function doHint() {
    if (!myTurn()) return;
    S.error = null;
    S.coach = true;
    var h = G.hint(S.match, 0);
    S.hint = h;
    S.hintToken = hintToken();
    if (h && h.action === 'play' && h.cards) S.selected = h.cards.slice();
    paint();
  }

  function showHintIfCoach() {
    if (!S.coach || !myTurn()) return;
    ensureHint();
  }

  /* ---------------------------------------------------------------- 挂载 */

  root.ViewPlay = {
    mount: function (el) {
      S.el = el;

      el.addEventListener('click', function (ev) {
        var cardEl = ev.target.closest('[data-card]');
        if (cardEl) { toggleCard(cardEl.getAttribute('data-card')); return; }

        var diffBtn = ev.target.closest('[data-diff]');
        if (diffBtn) {
          S.difficulty = parseInt(diffBtn.getAttribute('data-diff'), 10);
          paint();
          return;
        }

        var act = ev.target.closest('[data-act]');
        if (!act) return;
        var a = act.getAttribute('data-act');
        if (a === 'play') doPlay();
        else if (a === 'pass') doPass();
        else if (a === 'hint') doHint();
        else if (a === 'clear') { S.selected = []; S.error = null; paint(); }
        else if (a === 'memory') { S.showMemory = !S.showMemory; paint(); }
        else if (a === 'restart') newMatch();
        else if (a === 'next-deal') {
          G.newDeal(S.match);
          S.selected = []; S.hint = null; S.error = null;
          paint();
          scheduleAI();
        }
      });

      el.addEventListener('change', function (ev) {
        if (ev.target.matches('[data-act="coach"]')) {
          S.coach = ev.target.checked;
          S.hint = null;
          paint();
        }
      });

      el.addEventListener('keydown', function (ev) {
        var cardEl = ev.target.closest('[data-card]');
        if (!cardEl || (ev.key !== 'Enter' && ev.key !== ' ')) return;
        ev.preventDefault();
        ev.stopPropagation();
        toggleCard(cardEl.getAttribute('data-card'));
      });

      /* 快捷键挂在 document 上，只在"实战对局"页生效 */
      document.addEventListener('keydown', function (ev) {
        if (!S.match) return;
        var view = document.getElementById('view-play');
        if (!view || !view.classList.contains('is-active')) return;
        var tag = ev.target && ev.target.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
        if (ev.key === 'Enter') {
          ev.preventDefault();
          var btnPlay = document.getElementById('btn-play');
          if (btnPlay && !btnPlay.disabled) doPlay();
        }
        else if (ev.key === ' ') {
          ev.preventDefault();
          var btnPass = document.getElementById('btn-pass');
          if (btnPass && !btnPass.disabled) doPass();
        }
        else if (ev.key.toLowerCase() === 'h') { ev.preventDefault(); doHint(); }
      });
    },

    render: function (el, level) {
      S.el = el;
      if (!S.match) { newMatch(); return; }
      paint();
      scheduleAI();
    },

    /* 仅用于自动化测试 */
    __test: { state: S, paint: paint, newMatch: newMatch, scheduleAI: scheduleAI }
  };
})(window);
