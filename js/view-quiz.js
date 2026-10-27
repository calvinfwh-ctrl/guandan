/* 视图 02 · 牌型判定练习 */
(function (root) {
  'use strict';
  var GD = root.GD, UI = root.UI;

  var ALL = ['single', 'pair', 'triple', 'fullhouse', 'tube', 'plate', 'straight', 'flush', 'bomb', 'jokerbomb'];
  /* 出题权重：把新手最容易混的牌型排前面 */
  var WEIGHTED = ['straight', 'flush', 'tube', 'plate', 'fullhouse', 'straight', 'flush',
    'tube', 'plate', 'fullhouse', 'bomb', 'triple', 'pair', 'jokerbomb', 'single'];

  var CONFUSE = {
    straight: ['flush', 'tube', 'plate', 'triple'],
    flush: ['straight', 'bomb', 'plate', 'fullhouse'],
    tube: ['plate', 'straight', 'triple', 'fullhouse'],
    plate: ['tube', 'straight', 'fullhouse', 'triple'],
    fullhouse: ['plate', 'triple', 'tube', 'straight'],
    triple: ['fullhouse', 'plate', 'pair', 'tube'],
    pair: ['triple', 'fullhouse', 'single', 'tube'],
    single: ['pair', 'triple', 'straight', 'bomb'],
    bomb: ['flush', 'jokerbomb', 'plate', 'fullhouse'],
    jokerbomb: ['bomb', 'flush', 'triple', 'plate']
  };

  var S = {
    level: 2, mode: 'identify', q: null, picked: null,
    right: 0, total: 0, streak: 0, best: 0
  };

  function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

  function shuffleArr(a, rnd) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function withWild(cards, type, level, rnd) {
    if (rnd() > 0.40) return cards;
    var wild = GD.makeCard('H', level, 0);
    for (var i = 0; i < cards.length; i++) {
      var trial = cards.slice();
      trial[i] = wild;
      var id = GD.identify(trial, level);
      if (id && id.type === type) return trial;
    }
    return cards;
  }

  function rankTextOf(combo, level) {
    if (combo.type === 'jokerbomb') return '四大天王';
    if (combo.type === 'bomb') return combo.size + ' 张炸弹 ' + (combo.nat === level ? '级牌' : GD.RANK_TEXT[combo.nat]);
    if (combo.type === 'flush') return '最大牌 ' + GD.RANK_TEXT[combo.rank];
    if (combo.type === 'straight') return '最大牌 ' + GD.RANK_TEXT[combo.rank];
    if (combo.type === 'tube') return '最大对 ' + GD.RANK_TEXT[combo.rank];
    if (combo.type === 'plate') return '最大三张 ' + GD.RANK_TEXT[combo.rank];
    if (combo.type === 'fullhouse') return '三张是 ' + (combo.tripleRank === level ? '级牌' : GD.RANK_TEXT[combo.tripleRank]);
    return combo.nat === level ? '级牌' : GD.RANK_TEXT[combo.nat];
  }

  /* ---------------------------------------------------------- 出题：认牌型 */

  function makeIdentify(rnd) {
    var type = pick(WEIGHTED, rnd);
    var level = S.level;
    var cards = null, id = null;
    for (var i = 0; i < 40; i++) {
      var base = GD.sample(type, level, rnd);
      var trial = withWild(base, type, level, rnd);
      var got = GD.identify(trial, level);
      if (got && got.type === type) { cards = trial; id = got; break; }
      if (!cards && got) { cards = trial; id = got; type = got.type; }
    }
    if (!cards) return null;

    var opts = [type];
    var pool = shuffleArr((CONFUSE[type] || []).slice(), rnd);
    pool.forEach(function (t) { if (opts.length < 4 && opts.indexOf(t) < 0) opts.push(t); });
    shuffleArr(ALL, rnd).forEach(function (t) { if (opts.length < 4 && opts.indexOf(t) < 0) opts.push(t); });
    shuffleArr(opts, rnd);

    return { kind: 'identify', type: type, cards: cards, combo: id, options: opts };
  }

  /* ---------------------------------------------------------- 出题：比大小 */

  function makeCompare(rnd) {
    var level = S.level;
    var normalTypes = ['single', 'pair', 'triple', 'fullhouse', 'tube', 'plate', 'straight'];
    var kind = rnd() < 0.55 ? 'same' : (rnd() < 0.55 ? 'bomb' : 'none');

    var a, b, answer, explain;

    if (kind === 'same') {
      var t = pick(normalTypes.concat(['bomb', 'flush']), rnd);
      for (var i = 0; i < 40; i++) {
        a = GD.identify(GD.sample(t, level, rnd), level);
        b = GD.identify(GD.sample(t, level, rnd), level);
        if (a && b && a.type === b.type && a.rank !== b.rank) break;
      }
      if (!a || !b || a.type !== b.type || a.rank === b.rank) return makeCompare(rnd);
      var biggerIsA = a.rank > b.rank;
      answer = biggerIsA ? 'A' : 'B';
      explain = '两边都是<b>' + GD.TYPE_NAME[a.type] + '</b>，同牌型比大小：' +
        '<b>' + rankTextOf(a, level) + '</b> vs <b>' + rankTextOf(b, level) + '</b>，' +
        '所以' + (biggerIsA ? '左边' : '右边') + '更大。';
    } else if (kind === 'bomb') {
      var nt = pick(normalTypes, rnd);
      var bm = pick(['bomb', 'flush', 'bomb'], rnd);
      a = GD.identify(GD.sample(nt, level, rnd), level);
      b = GD.identify(GD.sample(bm, level, rnd), level);
      if (!a || !b) return makeCompare(rnd);
      if (rnd() < 0.5) { var tmp = a; a = b; b = tmp; }
      answer = GD.bombFamily(a) ? 'A' : 'B';
      var bombSide = answer === 'A' ? '左边' : '右边';
      var bombCombo = answer === 'A' ? a : b;
      explain = bombSide + '的<b>' + GD.comboLabel(bombCombo, level) + '</b>属于炸弹家族，' +
        '可以压任何普通牌型 —— 普通牌型再大也压不过炸弹。';
    } else {
      var t1 = pick(normalTypes, rnd);
      var t2 = pick(normalTypes.filter(function (x) { return x !== t1; }), rnd);
      a = GD.identify(GD.sample(t1, level, rnd), level);
      b = GD.identify(GD.sample(t2, level, rnd), level);
      if (!a || !b || a.type === b.type) return makeCompare(rnd);
      answer = 'none';
      explain = '<b>' + GD.TYPE_NAME[a.type] + '</b> 和 <b>' + GD.TYPE_NAME[b.type] + '</b> 不是同一种牌型，' +
        '普通牌型之间不能互相压 —— 只有炸弹家族才能跨牌型出牌。';
    }

    return { kind: 'compare', a: a, b: b, answer: answer, explain: explain };
  }

  /* ---------------------------------------------------------------- 渲染 */

  function headHTML() {
    return '<div class="sec-head">' +
      '<h2>牌型判定</h2><p>练到看一眼就认出来</p>' +
      '<div class="spacer"></div>' +
      '<div class="mode-switch">' +
      '<button data-mode="identify" class="' + (S.mode === 'identify' ? 'is-active' : '') + '">认牌型</button>' +
      '<button data-mode="compare" class="' + (S.mode === 'compare' ? 'is-active' : '') + '">比大小</button>' +
      '</div>' +
      '</div>';
  }

  function statsHTML() {
    var rate = S.total ? Math.round(S.right / S.total * 100) : 0;
    return '<div class="quiz-bar">' +
      '<div class="stat">答对<b>' + S.right + '</b>/' + S.total + '</div>' +
      '<div class="stat">正确率<b>' + rate + '%</b></div>' +
      '<div class="stat">连对<b>' + S.streak + '</b></div>' +
      '<div class="spacer" style="flex:1"></div>' +
      '<button class="btn btn-sm ghost" data-act="reset">重新开始</button>' +
      '</div>';
  }

  function identifyHTML() {
    var q = S.q;
    var done = S.picked !== null;
    var opts = q.options.map(function (t) {
      var cls = 'opt';
      if (done) {
        if (t === q.type) cls += ' correct';
        else if (t === S.picked) cls += ' wrong';
      }
      return '<button class="' + cls + '" data-opt="' + t + '" ' + (done ? 'disabled' : '') + '>' +
        GD.TYPE_NAME[t] + '</button>';
    }).join('');

    var fb = '<div class="feedback">出好了就先自己判断，选完再看解释。</div>';
    if (done) {
      var ok = S.picked === q.type;
      var w = GD.wildAssignments(q.combo, S.level);
      fb = '<div class="feedback ' + (ok ? 'ok' : 'no') + '">' +
        (ok ? '✅ 答对了。' : '❌ 正确答案是 <b>' + GD.TYPE_NAME[q.type] + '</b>。') +
        '<br>这手是 <b>' + GD.comboLabel(q.combo, S.level) + '</b>。' + GD.TYPE_HINT[q.type] +
        (w.length ? '<br>其中 <b>逢人配</b> 被当作：' + w.map(function (x) {
          return GD.cardText(x.card) + ' → ' + x.as;
        }).join('、') + '。' : '') +
        '</div>';
    }

    return '<div class="quiz-stage">' +
      '<div class="quiz-q">第 ' + (S.total + (S.picked === null ? 1 : 0)) + ' 题 · 这手牌是什么牌型？</div>' +
      UI.row(q.cards, S.level, { size: 'lg' }) +
      '</div>' +
      '<div class="quiz-options four" style="margin-top:14px">' + opts + '</div>' +
      '<div style="margin-top:14px">' + fb + '</div>' +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">' +
      (done ? '<button class="btn primary" data-act="next">下一题 →</button>' : '') +
      '</div>';
  }

  function compareHTML() {
    var q = S.q;
    var done = S.picked !== null;
    var labels = [['A', q.a], ['B', q.b]];
    var opts = ['A', 'B', 'none'].map(function (v) {
      var text = v === 'A' ? '左边大' : v === 'B' ? '右边大' : '不能比较';
      var cls = 'opt';
      if (done) {
        if (v === q.answer) cls += ' correct';
        else if (v === S.picked) cls += ' wrong';
      }
      return '<button class="' + cls + '" data-opt="' + v + '" ' + (done ? 'disabled' : '') + '>' + text + '</button>';
    }).join('');

    var side = function (label, combo) {
      return '<div style="text-align:center">' +
        '<div class="quiz-q" style="margin-bottom:10px">' + label + '</div>' +
        UI.row(combo.cards, S.level, { size: 'lg' }) +
        '</div>';
    };

    var fb = '<div class="feedback">两边谁的牌更大？如果根本不能比，就选"不能比较"。</div>';
    if (done) {
      var ok = S.picked === q.answer;
      fb = '<div class="feedback ' + (ok ? 'ok' : 'no') + '">' +
        (ok ? '✅ 答对了。' : '❌ 答错了。') + '<br>' + q.explain +
        '</div>';
    }

    return '<div class="quiz-stage">' +
      '<div class="quiz-q">第 ' + (S.total + (S.picked === null ? 1 : 0)) + ' 题 · 谁能压过谁？</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:26px;width:100%;align-items:start">' +
      side('A', q.a) + side('B', q.b) +
      '</div>' +
      '</div>' +
      '<div class="quiz-options" style="margin-top:14px">' + opts + '</div>' +
      '<div style="margin-top:14px">' + fb + '</div>' +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">' +
      (done ? '<button class="btn primary" data-act="next">下一题 →</button>' : '') +
      '</div>';
  }

  function bodyHTML() {
    if (!S.q) return '<div class="empty-state">出题失败，点"重新开始"再试一次。</div>';
    return S.mode === 'identify' ? identifyHTML() : compareHTML();
  }

  function paint(el) {
    el.innerHTML = '<section class="panel">' + headHTML() + statsHTML() + bodyHTML() + '</section>';
  }

  function next() {
    var rnd = UI.seeded(Date.now() % 100000 + Math.floor(Math.random() * 99999));
    S.picked = null;
    var q = null, guard = 0;
    while (!q && guard++ < 30) {
      q = S.mode === 'identify' ? makeIdentify(rnd) : makeCompare(rnd);
    }
    S.q = q;
  }

  root.ViewQuiz = {
    mount: function (el) {
      el.addEventListener('click', function (ev) {
        var modeBtn = ev.target.closest('[data-mode]');
        if (modeBtn) {
          S.mode = modeBtn.getAttribute('data-mode');
          S.total = 0; S.right = 0; S.streak = 0;
          next();
          paint(el);
          return;
        }
        var reset = ev.target.closest('[data-act="reset"]');
        if (reset) {
          S.total = 0; S.right = 0; S.streak = 0;
          next();
          paint(el);
          return;
        }
        var nextBtn = ev.target.closest('[data-act="next"]');
        if (nextBtn) { next(); paint(el); return; }

        var opt = ev.target.closest('[data-opt]');
        if (opt && S.picked === null && S.q) {
          S.picked = opt.getAttribute('data-opt');
          S.total++;
          if (S.picked === S.q.answer || S.picked === S.q.type) {
            S.right++;
            S.streak++;
            if (S.streak > S.best) S.best = S.streak;
          } else {
            S.streak = 0;
          }
          paint(el);
        }
      });
    },
    render: function (el, level) {
      if (S.level !== level) { S.level = level; S.total = 0; S.right = 0; S.streak = 0; S.q = null; }
      if (!S.q) next();
      paint(el);
    }
  };
})(window);
