/* 把整个站点打包成单个 HTML（内联 CSS / JS / 图标）
   输出：dist/index.html —— 可以直接双击打开，也可以整个 dist 文件夹拖到静态托管
   用法：node tools/build-single.cjs */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const SCRIPTS = [
  'js/engine.js',
  'js/game.js',
  'js/ui.js',
  'js/view-rules.js',
  'js/view-quiz.js',
  'js/view-lab.js',
  'js/view-split.js',
  'js/view-play.js',
  'js/app.js'
];

let html = read('index.html');

/* 1) CSS 内联 */
const css = read('assets/style.css');
html = html.replace(
  '<link rel="stylesheet" href="assets/style.css">',
  '<style>\n' + css + '\n</style>'
);

/* 2) 图标内联成 data URI */
const svg = read('favicon.svg');
const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
html = html.replace('<link rel="icon" href="favicon.svg" type="image/svg+xml">',
  '<link rel="icon" href="' + dataUri + '">');

/* 3) 脚本合并内联（顺序必须和 index.html 一致） */
let js = '';
SCRIPTS.forEach(function (f) {
  const code = read(f);
  if (code.indexOf('<\/script>') >= 0) throw new Error(f + ' 里含有 </script>，会对内联造成破坏');
  js += '\n/* ======== ' + f + ' ======== */\n' + code + '\n';
});
SCRIPTS.forEach(function (f) {
  html = html.replace(new RegExp('\\s*<script src="' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"></script>'), '');
});
if (/<script src=/.test(html)) throw new Error('还有没被内联的 <script src>');
html = html.replace('</body>', '<script>\n' + js + '\n</script>\n</body>');

/* 4) 加个来源注释 */
html = html.replace('<!DOCTYPE html>',
  '<!DOCTYPE html>\n<!-- 掼蛋教练 · 单文件构建版（由 tools/build-single.cjs 生成，请勿手改） -->');

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('已生成 dist/index.html（' + kb + ' KB）');
console.log('  双击可直接打开；把 dist 文件夹拖到 Netlify Drop 即可得到网址');
