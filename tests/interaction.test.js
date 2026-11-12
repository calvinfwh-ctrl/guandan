/* 交互回归（v2 修复 A/B）：真实浏览器点击序列
   覆盖：手牌滚动位置保持 / 已选牌不遮挡相邻牌 / 非本人回合预选 / 升级后级牌组合 / 失同步选牌清理 / console 零错误
   依赖 playwright + chromium；不可用时跳过（exit 0），避免离线环境 npm test 挂死。
   运行：node tests/interaction.test.js */
const path = require('path');
const fs = require('fs');

let PW;
try { PW = require('playwright'); }
catch (e) { console.log('[交互测试] playwright 不可用，跳过（' + e.code + '）。本测试需要本地 chromium。'); process.exit(0); }

const assert = require('assert');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { pass++; console.log('  ok  ' + name); })
    .catch(e => { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); });
}

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForSelector('.my-hand', { timeout: 5000 });
  await page.waitForTimeout(300);
  page.__errors = errors;
  return page;
}

async function stopAI(page) {
  await page.evaluate(() => { clearTimeout(window.ViewPlay.__test.state.timer); });
}

(async () => {
  let browser;
  try { browser = await PW.chromium.launch(); }
  catch (e) { console.log('[交互测试] chromium 启动失败，跳过: ' + e.message.split('\n')[0]); process.exit(0); }

  /* ---------- T1 手牌滚动位置：点击选牌后不能跳回最左（移动端主路径） ---------- */
  await test('T1 选牌后手牌滚动位置保持（390px 视口）', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForSelector('.my-hand', { timeout: 5000 });
    await page.waitForTimeout(300);
    page.__errors = errors;
    await stopAI(page);
    const overflow = await page.evaluate(() => {
      const h = document.querySelector('.my-hand');
      return h.scrollWidth - h.clientWidth;
    });
    assert.ok(overflow > 100, '该视口下手牌应可横向滚动（溢出 ' + overflow + 'px）');
    await page.evaluate(() => { const h = document.querySelector('.my-hand'); h.scrollLeft = h.scrollWidth; });
    const before = await page.evaluate(() => document.querySelector('.my-hand').scrollLeft);
    const key = await page.evaluate(() => {
      const h = document.querySelector('.my-hand');
      const r = h.getBoundingClientRect();
      const vis = [...h.querySelectorAll('[data-card]')].filter(c => {
        const b = c.getBoundingClientRect();
        return b.right > r.left + 12 && b.left < r.right - 12;
      });
      return vis[vis.length - 1].getAttribute('data-card');
    });
    await page.tap('[data-card="' + key + '"]');
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => ({
      sl: document.querySelector('.my-hand').scrollLeft,
      picked: [...document.querySelectorAll('.my-hand .card.is-picked')].map(c => c.getAttribute('data-card'))
    }));
    console.log('       scrollLeft ' + before + ' → ' + after.sl + '，选中 ' + JSON.stringify(after.picked));
    assert.ok(after.picked.indexOf(key) >= 0, '点击的牌应被选中');
    assert.ok(Math.abs(after.sl - before) < 30, '选牌后滚动位置应保持（跳回最左会让下一次点击命中不相干的牌）');
    assert.strictEqual(page.__errors.length, 0, 'console 错误: ' + page.__errors.join(';'));
    await page.close();
  });

  /* ---------- T2 已选牌抬起后不得遮挡相邻牌的点击区 ---------- */
  await test('T2 已选牌不遮挡右侧相邻牌（点击相邻牌左缘应选中它）', async () => {
    const page = await freshPage(browser, { width: 1280, height: 900 });
    await stopAI(page);
    const keys = await page.evaluate(() => [...document.querySelectorAll('.my-hand [data-card]')].map(c => c.getAttribute('data-card')));
    const aKey = keys[5], bKey = keys[6];
    await page.click('[data-card="' + aKey + '"]');
    await page.waitForTimeout(80);
    const hit = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.my-hand [data-card]')];
      const B = cards[6];
      const b = B.getBoundingClientRect();
      const el = document.elementFromPoint(b.left + 3, b.top + 30);
      return el && el.closest('[data-card]') ? el.closest('[data-card]').getAttribute('data-card') : null;
    });
    console.log('       点击相邻牌左缘实际命中: ' + hit);
    assert.strictEqual(hit, bKey, '相邻牌左缘的点击应命中相邻牌本身，而不是被抬起的前一张牌截走');
    await page.close();
  });

  /* ---------- T3 非本人回合可预选牌（升级/进贡后新一副常由别家先出） ---------- */
  await test('T3 非本人回合点击手牌可预选（出牌按钮保持禁用）', async () => {
    const page = await freshPage(browser, { width: 1280, height: 900 });
    await stopAI(page);
    await page.evaluate(() => {
      const S = window.ViewPlay.__test.state;
      S.match.deal.turn = 1; /* 轮到下家（AI），但玩家应能提前勾选 */
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(80);
    const key = await page.evaluate(() => document.querySelector('.my-hand [data-card]').getAttribute('data-card'));
    await page.click('[data-card="' + key + '"]');
    await page.waitForTimeout(80);
    const picked = await page.evaluate(() => document.querySelectorAll('.my-hand .card.is-picked').length);
    const playDisabled = await page.evaluate(() => document.querySelector('[data-act="play"]').disabled);
    console.log('       预选数=' + picked + ' 出牌钮禁用=' + playDisabled);
    assert.ok(picked >= 1, '非本人回合点击手牌应能预选（否则进贡后先手在别家时点牌无反应，像坏了）');
    assert.strictEqual(playDisabled, true, '不是本人回合时出牌按钮必须保持禁用');
    await page.close();
  });

  /* ---------- T4 升级后级牌组合 + 失同步选牌清理 ---------- */
  await test('T4 双上升3级后新一副：级牌三带二/顺子可选可出，且换手后旧选牌自动清空', async () => {
    const page = await freshPage(browser, { width: 1280, height: 900 });
    await stopAI(page);
    /* 快速打完第一副：我方(0/2)双上 → 2→5 */
    await page.evaluate(() => {
      const G = window.GDGame, GD = window.GD;
      const S = window.ViewPlay.__test.state;
      const d = S.match.deal;
      const C = (s, r, dd) => GD.makeCard(s, r, dd || 0);
      d.hands = [[C('S', 3)], [C('X', 15), C('X', 16)], [C('S', 4)], [C('S', 5), C('S', 6)]];
      d.turn = 0; d.trick = { combo: null, owner: -1, passes: 0 };
      d.finished = []; d.discarded = []; d.phase = 'play';
      G.play(S.match, 0, [d.hands[0][0]]);
      G.pass(S.match, 1); G.pass(S.match, 2); G.pass(S.match, 3);
      G.play(S.match, 2, [d.hands[2][0]]);
      G.pass(S.match, 3); G.pass(S.match, 1);
      G.play(S.match, 3, [d.hands[3][0]]);
      G.pass(S.match, 1);
      G.play(S.match, 3, [d.hands[3][0]]);
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(120);
    await page.click('[data-act="next-deal"]');
    await page.waitForTimeout(120);
    const lvl = await page.evaluate(() => window.ViewPlay.__test.state.match.deal.level);
    assert.strictEqual(lvl, 5, '双上后新一副应打5');
    await page.evaluate(() => {
      const S = window.ViewPlay.__test.state;
      const GD = window.GD;
      clearTimeout(S.timer);
      const C = (s, r, dd) => GD.makeCard(s, r, dd || 0);
      const d = S.match.deal;
      d.hands[0] = [C('S', 5), C('D', 5), C('C', 5), C('H', 3), C('D', 3), C('S', 4), C('S', 6), C('S', 7), C('S', 8)];
      d.turn = 0; d.trick = { combo: null, owner: -1, passes: 0 };
      S.selected = []; S.hint = null;
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(80);
    /* 选 555+33 */
    for (const k of ['S5#0', 'D5#0', 'C5#0', 'H3#0', 'D3#0']) {
      await page.click('[data-card="' + k + '"]');
      await page.waitForTimeout(50);
    }
    let sel = await page.evaluate(() => document.querySelector('.my-sel').textContent);
    console.log('       级牌三带二反馈: ' + sel);
    assert.ok(/三带二/.test(sel), '级牌三带二应被识别: ' + sel);
    await page.click('[data-act="play"]');
    await page.waitForTimeout(100);
    /* 出牌成功后手牌少 5 张，再选顺子 45678（含级牌5自然点数） */
    const n1 = await page.evaluate(() => window.ViewPlay.__test.state.match.deal.hands[0].length);
    assert.strictEqual(n1, 4, '出掉三带二后应剩4张');
    await page.evaluate(() => {
      const S = window.ViewPlay.__test.state;
      const d = S.match.deal;
      /* 强制回到玩家领出，测顺子（用剩余 4,6,7,8 + 补一张5 模拟场景），直接注入 */
      const GD = window.GD;
      const C = (s, r, dd) => GD.makeCard(s, r, dd || 0);
      d.hands[0] = [C('H', 3), C('S', 4), C('D', 5), C('S', 6), C('S', 7), C('S', 8)];
      d.turn = 0; d.trick = { combo: null, owner: -1, passes: 0 };
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(80);
    /* 关键：换手后之前若还有残留选牌应被清掉 —— 先制造残留 */
    await page.evaluate(() => {
      const S = window.ViewPlay.__test.state;
      S.selected = [S.match.deal.hands[0][0]]; /* 手动塞一张当前在手 —— 合法 */
      window.ViewPlay.__test.paint();
    });
    await page.evaluate(() => {
      /* 模拟手牌被外部替换（进贡/还贡/换副）后的失同步：塞一张已不在手里的旧牌 */
      const S = window.ViewPlay.__test.state;
      const GD = window.GD;
      S.selected.push(GD.makeCard('X', 16, 0)); /* 不在手里的牌 */
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(80);
    const selText = await page.evaluate(() => document.querySelector('.my-sel').textContent);
    console.log('       失同步后选牌反馈: ' + selText);
    assert.ok(!/已选 2 张/.test(selText), '不在手里的牌不应计入选牌（应被自动清理）: ' + selText);
    /* 顺子含级牌 */
    await page.click('[data-act="clear"]');
    for (const k of ['H3#0', 'S4#0', 'D5#0', 'S6#0', 'S7#0']) {
      await page.click('[data-card="' + k + '"]');
      await page.waitForTimeout(50);
    }
    sel = await page.evaluate(() => document.querySelector('.my-sel').textContent);
    console.log('       级牌顺子反馈: ' + sel);
    assert.ok(/顺子/.test(sel), '级牌按自然点数参与顺子应被识别: ' + sel);
    assert.strictEqual(page.__errors.length, 0, 'console 错误: ' + page.__errors.join(';'));
    await page.close();
  });

  /* ---------- T5 小局完整点击流程 + dist 版冒烟 ---------- */
  await test('T5 缩小局完整点击对局 0 console error', async () => {
    const page = await freshPage(browser, { width: 1280, height: 900 });
    await page.evaluate(() => {
      const S = window.ViewPlay.__test.state;
      const GD = window.GD;
      clearTimeout(S.timer);
      const C = (s, r, dd) => GD.makeCard(s, r, dd || 0);
      const d = S.match.deal;
      d.hands = [
        [C('S', 3)],
        [C('S', 4), C('S', 10)],
        [C('S', 5), C('S', 11)],
        [C('S', 6), C('S', 12)]
      ];
      d.turn = 0; d.trick = { combo: null, owner: -1, passes: 0 };
      d.finished = []; d.discarded = []; d.phase = 'play';
      S.selected = [];
      window.ViewPlay.__test.paint();
    });
    await page.waitForTimeout(80);
    await page.click('[data-card="S3#0"]');
    await page.waitForTimeout(60);
    await page.click('[data-act="play"]');
    /* AI 自动走完剩余动作，等待结算 */
    await page.waitForFunction(() => {
      const S = window.ViewPlay.__test.state;
      return S.match.deal.phase === 'over';
    }, null, { timeout: 20000 });
    const resultShown = await page.evaluate(() => !!document.querySelector('.result-card'));
    assert.ok(resultShown, '应显示结算面板');
    assert.strictEqual(page.__errors.length, 0, 'console 错误: ' + page.__errors.join(';'));
    await page.close();
  });

  const distPath = path.join(ROOT, 'dist', 'index.html');
  if (fs.existsSync(distPath)) {
    await test('T6 dist 单文件版：加载 + 选牌 0 console error', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
      await page.goto('file://' + distPath);
      await page.waitForSelector('.my-hand', { timeout: 5000 });
      await page.waitForTimeout(300);
      await page.evaluate(() => clearTimeout(window.ViewPlay.__test.state.timer));
      const key = await page.evaluate(() => document.querySelector('.my-hand [data-card]').getAttribute('data-card'));
      await page.click('[data-card="' + key + '"]');
      await page.waitForTimeout(100);
      const picked = await page.evaluate(() => document.querySelectorAll('.my-hand .card.is-picked').length);
      assert.ok(picked >= 1, 'dist 版选牌应生效');
      assert.strictEqual(errors.length, 0, 'console 错误: ' + errors.join(';'));
      await page.close();
    });
  }

  await browser.close();
  console.log('\n结果：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('交互测试崩溃: ' + e.message); process.exit(1); });
