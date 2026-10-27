/* 渲染冒烟测试：用 vm + 极简 DOM 桩，检查四个视图能不能正常生成 HTML
   运行：node tests/render.test.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

function fakeEl(id) {
  return {
    id,
    innerHTML: '',
    _listeners: [],
    _byType: {},
    className: '',
    addEventListener(t, fn) {
      this._listeners.push(fn);
      (this._byType[t] = this._byType[t] || []).push(fn);
    },
    classList: {
      _set: {},
      toggle(cls, on) { this._set[cls] = !!on; },
      add(cls) { this._set[cls] = true; },
      remove(cls) { this._set[cls] = false; },
      contains(cls) { return !!this._set[cls]; }
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => null,
    getAttribute: () => null
  };
}

const els = {};
const document = {
  body: { classList: { toggle() { }, add() { }, remove() { } } },
  getElementById(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() { }
};

const store = {};
const sandbox = {
  console,
  Math,
  Date,
  JSON,
  setTimeout,
  clearTimeout,
  document,
  scrollTo() { },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const files = ['js/engine.js', 'js/game.js', 'js/ui.js', 'js/view-rules.js', 'js/view-quiz.js',
  'js/view-lab.js', 'js/view-split.js', 'js/view-play.js', 'js/app.js'];

files.forEach((f) => {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
});

assert.ok(sandbox.GD, 'GD 未加载');
assert.ok(sandbox.App, 'App 未加载');

const views = ['rules', 'quiz', 'lab', 'split', 'play'];
let fail = 0;
views.forEach((v) => {
  sandbox.App.setView(v);
  const html = document.getElementById('view-' + v).innerHTML;
  const problems = [];
  if (!html || html.length < 300) problems.push('HTML 过短(' + (html ? html.length : 0) + ')');
  if (/undefined/.test(html)) problems.push('包含 undefined');
  if (/NaN/.test(html)) problems.push('包含 NaN');
  if (/\[object Object\]/.test(html)) problems.push('包含 [object Object]');
  if (problems.length) { console.log('  FAIL ' + v + ' → ' + problems.join('; ')); fail++; }
  else console.log('  ok   ' + v + ' (' + html.length + ' 字符)');
});

/* 切级牌后重新渲染也不应该出问题 */
[5, 10, 14].forEach((lv) => {
  sandbox.App.setLevel(lv);
  views.forEach((v) => {
    sandbox.App.setView(v);
    const html = document.getElementById('view-' + v).innerHTML;
    if (!html || /undefined|NaN/.test(html)) { console.log('  FAIL 级牌 ' + lv + ' / ' + v); fail++; }
  });
});
/* ---------- 实战对局视图：三个关键状态 ---------- */
(function playViewTest() {
  function assert(cond, msg) {
    if (!cond) { console.log('  FAIL 对局视图 / ' + msg); fail++; return false; }
    return true;
  }

  sandbox.App.setView('play');
  const P = sandbox.ViewPlay.__test;
  const G = sandbox.GDGame;
  const S = P.state;
  const el = document.getElementById('view-play');

  assert(!!S.match, '应自动开一局');
  assert(/你的手牌/.test(el.innerHTML), '应渲染手牌区');
  assert((el.innerHTML.match(/class="card[ "]/g) || []).length >= 27, '手牌应不少于 27 张');
  assert(/教练建议/.test(el.innerHTML), '轮到我时应自动给出教练建议');

  /* 选牌高亮 */
  S.selected = [S.match.deal.hands[0][0], S.match.deal.hands[0][1]];
  P.paint();
  assert(/is-picked/.test(el.innerHTML), '选中的牌应有高亮');
  S.selected = [];
  P.paint();

  /* 把这一副打完，检查结算界面 */
  const m = S.match;
  let guard = 0;
  while (m.deal.phase === 'play' && guard++ < 6000) {
    const d = m.deal;
    const idx = d.turn;
    const mv = G.aiTurn(m, idx, 1);
    if (mv.action === 'play') G.play(m, idx, mv.cards);
    else G.pass(m, idx);
  }
  assert(m.deal.phase === 'over', '一副应能打完');
  S.selected = [];
  P.paint();
  const html = el.innerHTML;
  assert(/头游/.test(html), '结算应显示名次');
  assert(/下一副|再来一局/.test(html), '结算应给出继续按钮');
  assert(!/undefined|NaN/.test(html), '结算界面不应有 undefined/NaN');

  /* 下一副：进贡流程不应报错 */
  G.newDeal(m);
  S.selected = [];
  P.paint();
  const h2 = el.innerHTML;
  assert(/你的手牌/.test(h2), '下一副应正常渲染');
  assert(!/undefined|NaN/.test(h2), '下一副不应有 undefined/NaN');
  if (!/FAIL/.test(h2)) { /* 静默 */ }
})();

/* ---------- 端到端：真实事件监听器 + 定时器链路 ---------- */
(async function e2e() {
  const el = document.getElementById('view-play');
  const P = sandbox.ViewPlay.__test;
  const S = P.state;

  /* 开一局全新的（首副由我领出，保证轮到我） */
  P.newMatch();
  const before = S.match.deal.events.length;

  function fireAct(act) {
    const target = {
      closest(sel) {
        if (sel === '[data-act]') return { getAttribute: (n) => (n === 'data-act' ? act : null) };
        return null;
      }
    };
    (el._byType.click || []).forEach((fn) => fn({ target }));
  }

  /* 1) 点「提示」：应该自动帮我选好牌 */
  fireAct('hint');
  if (!/is-picked/.test(el.innerHTML)) { console.log('  FAIL e2e / 点提示后应自动选牌'); fail++; }

  /* 2) 点「出牌」：应该出掉一手，并把轮次交给下家 */
  fireAct('play');
  const eventsNow = S.match.deal.events.length;
  if (eventsNow <= before) { console.log('  FAIL e2e / 点出牌后事件数没有增加'); fail++; }

  /* 3) 等 AI 自动应牌 */
  await new Promise((r) => setTimeout(r, 1600));
  const after = S.match.deal.events.length;
  if (after <= eventsNow) { console.log('  FAIL e2e / AI 没有自动出牌（定时器链路断了）'); fail++; }
  if (/undefined|NaN/.test(el.innerHTML)) { console.log('  FAIL e2e / AI 出牌后界面出现 undefined/NaN'); fail++; }

  console.log(fail ? '\n渲染冒烟测试失败 ' + fail + ' 项\n' : '\n渲染冒烟测试全部通过（含端到端）\n');
  process.exitCode = fail ? 1 : 0;
})();
