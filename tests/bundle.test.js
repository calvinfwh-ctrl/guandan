/* 单文件构建校验：dist/index.html 必须自包含、能独立启动
   运行：node tests/bundle.test.js */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const file = path.join(__dirname, '..', 'dist', 'index.html');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

assert.ok(fs.existsSync(file), '请先运行 node tools/build-single.cjs 生成 dist/index.html');
const html = fs.readFileSync(file, 'utf8');

function fakeEl(id) {
  return {
    id, innerHTML: '', className: '',
    _byType: {},
    addEventListener(t, fn) { (this._byType[t] = this._byType[t] || []).push(fn); },
    classList: {
      _s: {}, toggle(c, on) { this._s[c] = !!on; }, add(c) { this._s[c] = true; },
      remove(c) { this._s[c] = false; }, contains(c) { return !!this._s[c]; }
    },
    querySelectorAll: () => [], querySelector: () => null,
    closest: () => null, getAttribute: () => null
  };
}

console.log('\n[自包含检查]');
test('没有外链脚本、外链样式、外链图标', () => {
  assert.ok(!/<script src=/.test(html), '残留外链脚本');
  assert.ok(!/rel="stylesheet"/.test(html), '残留外链样式');
  assert.ok(!/href="favicon\.svg"/.test(html), '残留外链图标');
  assert.ok(/rel="icon" href="data:image\/svg\+xml;base64,/.test(html), '图标应内联为 data URI');
});

test('只有一个内联脚本块，且不含会截断的 </script>', () => {
  const blocks = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
  assert.strictEqual(blocks.length, 1, '内联脚本块数量为 ' + blocks.length);
  assert.ok(blocks[0][1].length > 100000, '内联脚本内容太短');
});

test('文件大小在合理范围（100~400KB）', () => {
  const kb = Buffer.byteLength(html, 'utf8') / 1024;
  assert.ok(kb > 100 && kb < 400, '大小 ' + kb.toFixed(1) + ' KB');
  console.log('        实际大小 ' + kb.toFixed(1) + ' KB');
});

console.log('\n[独立启动]');
test('抽掉外链后，内联脚本能在空 DOM 里跑起来并渲染五个页面', () => {
  const els = {};
  const document = {
    body: { classList: { toggle() { }, add() { }, remove() { } } },
    getElementById(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; },
    querySelectorAll: () => [], querySelector: () => null, addEventListener() { }
  };
  const store = {};
  const sandbox = {
    console, Math, Date, JSON, setTimeout, clearTimeout, document,
    scrollTo() { },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const code = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))[0][1];
  vm.runInContext(code, sandbox, { filename: 'dist/index.html#inline' });

  assert.ok(sandbox.GD, 'GD 未定义');
  assert.ok(sandbox.GDGame, 'GDGame 未定义');
  assert.ok(sandbox.App, 'App 未定义');

  ['rules', 'quiz', 'lab', 'split', 'play'].forEach((v) => {
    sandbox.App.setView(v);
    const out = document.getElementById('view-' + v).innerHTML;
    assert.ok(out && out.length > 300, v + ' 页面没渲染出来');
    assert.ok(!/undefined|NaN/.test(out), v + ' 页面出现 undefined/NaN');
  });
});

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项\n`);
if (fail) process.exitCode = 1;
