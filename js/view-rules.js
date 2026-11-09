/* 视图 01 · 牌力速查 */
(function (root) {
  'use strict';
  var GD = root.GD, UI = root.UI;

  var TYPES = ['single', 'pair', 'triple', 'fullhouse', 'tube', 'plate', 'straight', 'flush', 'bomb', 'jokerbomb'];

  var COMPARE = {
    single: '比点数',
    pair: '比点数',
    triple: '比点数',
    fullhouse: '只比三张的点数',
    tube: '比最大那对',
    plate: '比最大那组三张',
    straight: '比最大那张牌',
    flush: '比最大那张牌',
    bomb: '张数多的大；同张数比点数',
    jokerbomb: '最大，无解'
  };

  function example(type, level, rnd) {
    for (var i = 0; i < 24; i++) {
      var cards = GD.sample(type, level, rnd);
      var id = GD.identify(cards, level);
      if (id && id.type === type) return cards;
    }
    return GD.sample(type, level, rnd);
  }

  function ladderHTML(level) {
    var ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    var cells = ranks.map(function (r) {
      var isLv = r === level;
      var c = GD.makeCard('S', r, 0);
      return '<div class="rung">' +
        UI.card(c, level, { size: 'sm' }) +
        '<span>' + GD.RANK_TEXT[r] + (isLv ? '<br><em>级牌</em>' : '') + '</span>' +
        '</div>' +
        (r < 14 ? '<span class="arrow">›</span>' : '');
    }).join('');

    var special = '<span class="arrow">›</span>' +
      '<div class="rung">' + UI.card(GD.makeCard('X', 15, 0), level, { size: 'sm' }) + '<span>小王</span></div>' +
      '<span class="arrow">›</span>' +
      '<div class="rung">' + UI.card(GD.makeCard('X', 16, 0), level, { size: 'sm' }) + '<span>大王</span></div>';

    return '<div class="ladder">' + cells + special + '</div>';
  }

  function typeCardsHTML(level) {
    var rnd = UI.seeded(20240501 + level * 7);
    var seqTypes = { straight: 1, flush: 1, tube: 1, plate: 1 };
    return '<div class="type-grid">' + TYPES.map(function (type) {
      var cards = example(type, level, rnd);
      if (!seqTypes[type]) cards = GD.sortHand(cards, level);
      var isBomb = GD.bombFamily({ type: type });
      return '<div class="type-card">' +
        '<div class="tc-head">' +
        '<span class="tc-name">' + GD.TYPE_NAME[type] + '</span>' +
        '<span class="tc-tag' + (isBomb ? ' bomb' : '') + '">' + (isBomb ? '炸弹家族' : '普通牌型') + '</span>' +
        '</div>' +
        '<div class="tc-cards">' + UI.row(cards, level, { size: 'sm', tight: true }) + '</div>' +
        '<div class="tc-hint">' + GD.TYPE_HINT[type] + '<br>比较：' + COMPARE[type] + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  function bombLadderHTML() {
    var rows = [
      ['4 张炸弹（如 8888）', 34],
      ['5 张炸弹（如 88888）', 42],
      ['同花顺（如 ♣7♣8♣9♣10♣J）', 50],
      ['6 张炸弹（如 888888）', 58],
      ['7 张及以上炸弹', 66],
      ['四大天王（两小王 + 两大王）', 78]
    ];
    return '<div class="bomb-ladder">' + rows.map(function (r) {
      return '<div class="bomb-rung">' +
        '<div class="bomb-bar" style="width:' + r[1] + '%">' + r[0] + '</div>' +
        '</div>';
    }).join('') + '</div>' +
      '<p class="hint-line" style="margin:14px 0 0">' +
      '⚠️ 最容易记错的一条：<b class="kbd">同花顺</b> 夹在 5 张炸弹和 6 张炸弹之间 —— 它能压 5 炸，但会被 6 炸压。' +
      '</p>';
  }

  function stepsHTML(items) {
    return '<div class="steps">' + items.map(function (it) {
      return '<div class="step"><div><b>' + it[0] + '</b><span>' + it[1] + '</span></div></div>';
    }).join('') + '</div>';
  }

  function render(el, level) {
    el.innerHTML =
      /* 学习路径 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>先看这张地图</h2><p>新手最省力的学习顺序</p></div>' +
      '<div class="path">' +
      '<div class="path-item" data-goto="rules"><div class="pi-no">STEP 01</div><div class="pi-title">认牌力</div><div class="pi-desc">级牌到底多大？王有几张？先建立大小直觉。</div></div>' +
      '<div class="path-item" data-goto="quiz"><div class="pi-no">STEP 02</div><div class="pi-title">认牌型</div><div class="pi-desc">十种牌型，用限时判定练到条件反射。</div></div>' +
      '<div class="path-item" data-goto="lab"><div class="pi-no">STEP 03</div><div class="pi-title">玩转逢人配</div><div class="pi-desc">红桃级牌是万能牌，亲手摆一摆最快懂。</div></div>' +
      '<div class="path-item" data-goto="split"><div class="pi-no">STEP 04</div><div class="pi-title">学会拆牌</div><div class="pi-desc">27 张怎么分成几手，是从"会规则"到"会打"的分水岭。</div></div>' +
      '<div class="path-item" data-goto="play"><div class="pi-no">STEP 05</div><div class="pi-title">上桌实战</div><div class="pi-desc">和 AI 队友、AI 对手打完整一副，每一手都有教练讲解。</div></div>' +
      '</div>' +
      '<p class="hint-line" style="margin:16px 0 0">当前级牌：<b style="color:var(--gold-2)">' +
      GD.RANK_TEXT[level] + '</b>。右上角可以切换级牌，全站示例都会跟着变。</p>' +
      '</section>' +

      /* 牌力阶梯 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>牌力阶梯</h2><p>从最小到最大，一张牌能压谁</p></div>' +
      '<div class="panel-flat">' + ladderHTML(level) + '</div>' +
      '<p class="hint-line" style="margin:14px 0 0">' +
      '记法：<span class="kbd">2 3 4 … K A</span> 之后是 <span class="kbd">级牌</span>，再往上才是 <span class="kbd">小王</span>、<span class="kbd">大王</span>。' +
      '<br>注意：级牌只是"比大小"时高一级，在顺子、连对、钢板里它仍按原来的点数使用。' +
      '</p>' +
      '</section>' +

      /* 十种牌型 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>十种牌型</h2><p>看到这手牌，能叫出名字吗</p></div>' +
      typeCardsHTML(level) +
      '<div class="panel-flat" style="margin-top:16px;border-color:rgba(227,187,99,.28)">' +
      '<div class="tc-head" style="margin-bottom:8px">' +
      '<span class="tc-name" style="color:var(--gold-2)">🌟 逢人配（红桃级牌）</span>' +
      '<span class="tc-tag">万能牌</span></div>' +
      '<div class="tc-hint" style="font-size:12.5px">' +
      '打 ' + GD.RANK_TEXT[level] + ' 的时候，<b style="color:var(--gold-2)">♥' + GD.RANK_TEXT[level] + '</b> 就是逢人配：它可以变成除大小王之外的任意一张牌，' +
      '补对子、补顺子、补炸弹都行。单独出的时候，它只算级牌。' +
      '<br>默认规则：一手牌有多种配法时，按<b style="color:var(--gold-2)">最大的那种牌型</b>算。' +
      '</div></div>' +
      '</section>' +

      /* 炸弹天梯 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>炸弹家族</h2><p>谁大谁小，一条线记住</p></div>' +
      bombLadderHTML() +
      '</section>' +

      /* 一局怎么打 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>一局怎么打</h2><p>两副牌、四个人、对家是队友</p></div>' +
      stepsHTML([
        ['发牌', '两副牌 108 张，四人各 27 张。你对面的那个人是队友，左右两边是对手。'],
        ['定级牌', '每局有一个级牌，第一局从 <code>2</code> 开始。谁赢谁升级，级牌跟着变，打到 <code>A</code> 再赢就是通关。'],
        ['领出与跟牌', '逆时针出牌。头家可以随便出；后面的人必须出<b>同牌型、更大</b>的牌，或者用<b>炸弹</b>，或者喊"过"。其余人都过，就由最后出牌的人继续领出。'],
        ['接风', '队友打完最后一把牌，其他人都压不住 —— 这时候由<b>你</b>接着领出，这就是接风，是配合的关键。'],
        ['名次与升级', '先出完的是头游，依次二游、三游、末游。头游 + 二游（双上）升 <code>3</code> 级，头游 + 三游升 <code>2</code> 级，头游 + 末游升 <code>1</code> 级。'],
        ['过 A 才算赢', '<code>A</code> 这一级必须打，而且要头游的队友拿到二游或三游才算"过 A"。先过 A 的一方获胜。'],
        ['报牌', '出完一手后如果手上剩 10 张及以下，要报出张数 —— 这是在提醒对手，也在提醒队友。']
      ]) +
      '</section>' +

      /* 进贡还贡 */
      '<section class="panel">' +
      '<div class="sec-head"><h2>进贡 · 还贡 · 抗贡</h2><p>第二局开始的固定流程，不懂会直接被判违规</p></div>' +
      stepsHTML([
        ['单下（上局输方只有末游）', '末游把手上最大的牌进贡给头游（<b>红桃级牌除外</b>，其他花色级牌可以进贡），头游从手里还一张 <code>≤10</code> 的牌。然后由末游先出牌。'],
        ['双下（上局输方是末游 + 三游）', '两个输家都要进贡。头游拿点数大的那份，队友拿小的那份，各自还一张 <code>≤10</code> 的牌。<b>若两家进贡点数相同</b>：按顺时针方向进贡，由<b>头游下家</b>先出（对应「进贡给头游者首圈领出」）。'],
        ['抗贡', '该进贡的人手上抓到<b>两张大王</b>，就可以免贡；改由头游先出牌。'],
        ['还贡的限制', '还的牌必须是 10 或 10 以下，也不能还级牌 —— 进贡是把大牌送出去，还贡是礼节性地还一张小牌。<b>若全手牌均大于 10，则还最小的牌</b>（官方兜底条款）。'],
        ['接风（借风）', '某人出完最后一手牌，若其他人都放弃，下一圈由<b>其对家</b>领出；<b>若对家也已走完，则顺延至其下家</b>。']
      ]) +
      '</section>';
  }

  root.ViewRules = {
    mount: function (el) {
      el.addEventListener('click', function (ev) {
        var t = ev.target.closest('[data-goto]');
        if (t) root.App.setView(t.getAttribute('data-goto'));
      });
    },
    render: render
  };
})(window);
