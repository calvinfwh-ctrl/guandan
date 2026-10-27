/* 生成各视图 HTML 并检查标签闭合 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function fakeEl(id) {
  return {
    id, innerHTML: '',
    addEventListener() { },
    classList: { toggle() { }, add() { }, remove() { } },
    querySelectorAll: () => [], querySelector: () => null,
    closest: () => null, getAttribute: () => null
  };
}
const els = {};
const document = {
  body: { classList: { toggle() { }, add() { }, remove() { } } },
  getElementById(id) { if (!els[id]) els[id] = fakeEl(id); return els[id]; },
  querySelectorAll: () => [], querySelector: () => null, addEventListener() { }
};
const sandbox = {
  console, Math, Date, JSON, setTimeout, clearTimeout, document,
  scrollTo() { },
  localStorage: { getItem: () => null, setItem() { } }
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
['js/engine.js', 'js/game.js', 'js/ui.js', 'js/view-rules.js', 'js/view-quiz.js', 'js/view-lab.js', 'js/view-split.js', 'js/view-play.js', 'js/app.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox, { filename: f }));

const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source']);
const problems = [];

function checkHTML(name, html) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3];
    if (VOID.has(tag) || /\/\s*$/.test(attrs)) continue;
    if (!closing) stack.push(tag);
    else {
      const top = stack.pop();
      if (top !== tag) problems.push(name + ': 期望 </' + top + '> 却遇到 </' + tag + '>');
    }
  }
  if (stack.length) problems.push(name + ': 未闭合 ' + stack.join(','));
}

sandbox.App.setView('rules');
fs.mkdirSync(path.join(__dirname, '..', '.preview'), { recursive: true });
['rules', 'quiz', 'lab', 'split', 'play'].forEach((v) => {
  sandbox.App.setView(v);
  const html = document.getElementById('view-' + v).innerHTML;
  checkHTML(v, html);
  fs.writeFileSync(path.join(__dirname, '..', '.preview', v + '.html'),
    '<!DOCTYPE html><meta charset="utf-8"><link rel="stylesheet" href="../assets/style.css"><body class="x" style="padding:20px;max-width:1180px;margin:0 auto">' + html);
});

console.log(problems.length ? problems.join('\n') : '标签闭合检查通过');
process.exitCode = problems.length ? 1 : 0;
