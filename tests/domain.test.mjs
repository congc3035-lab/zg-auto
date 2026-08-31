// L3 Domain 测试。
// 解析部分是 (html) => value 纯函数；编队操作通过注入的 Gateway 假实现驱动，
// 全程不发任何真实请求。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  isWindowOpen,
  parseMine,
  parseFormation,
  parseFriendList,
  ensureFormation,
  withFormation
} = require('../src/zg-auto.user.js');

const mineHtml = readFileSync(new URL('../fixtures/mine.html', import.meta.url), 'utf8');
const formationSolo = readFileSync(new URL('../fixtures/formation-solo.html', import.meta.url), 'utf8');
const formationFour = readFileSync(new URL('../fixtures/formation-four.html', import.meta.url), 'utf8');
const friendHtml = readFileSync(new URL('../fixtures/friend-colony.html', import.meta.url), 'utf8');

const ESCORT = [[12, 13], [18, 19]];

function at(h, m) {
  return new Date(2026, 7, 31, h, m, 0);
}

test('窗口起点算开放', () => {
  assert.equal(isWindowOpen(ESCORT, at(12, 0)), true);
});

test('窗口中间算开放', () => {
  assert.equal(isWindowOpen(ESCORT, at(12, 59)), true);
});

test('窗口终点算关闭', () => {
  assert.equal(isWindowOpen(ESCORT, at(13, 0)), false);
});

test('两个窗口之间算关闭', () => {
  assert.equal(isWindowOpen(ESCORT, at(15, 30)), false);
});

test('第二个窗口同样生效', () => {
  assert.equal(isWindowOpen(ESCORT, at(18, 30)), true);
});

test('空窗口列表恒为关闭', () => {
  assert.equal(isWindowOpen([], at(12, 30)), false);
});

test('parseMine 解析全部资源字段', () => {
  const r = parseMine(mineHtml);
  assert.equal(typeof r.orders, 'number');
  assert.equal(typeof r.copper, 'number');
  assert.equal(typeof r.food, 'number');
  assert.equal(typeof r.merit, 'number');
  assert.equal(typeof r.prestige, 'number');
});

test('parseMine 铜币只取斜杠前的当前值', () => {
  const r = parseMine('铜币：953474/2883150');
  assert.equal(r.copper, 953474);
});

test('parseMine 军令不被后面的补充倒计时干扰', () => {
  const r = parseMine('军令：13\n<span>(11分26秒后补充) </span>');
  assert.equal(r.orders, 13);
});

test('parseMine 军功与威望在同一行也能分别取出', () => {
  const r = parseMine('军功：1845 威望：81360');
  assert.equal(r.merit, 1845);
  assert.equal(r.prestige, 81360);
});

test('parseMine 字段缺失时为 null 而非抛错', () => {
  const r = parseMine('<html>什么都没有</html>');
  assert.equal(r.orders, null);
  assert.equal(r.copper, null);
});

test('parseFormation 识别仅王翦的阵型', () => {
  assert.equal(parseFormation(formationSolo), 'solo');
});

test('parseFormation 识别四人阵', () => {
  assert.equal(parseFormation(formationFour), 'four');
});

test('parseFormation 前军也空时判为 other', () => {
  const html = '先锋:<span>空闲</span>前军:<span>空闲</span>中军:<span>空闲</span>后卫:<span>空闲</span>';
  assert.equal(parseFormation(html), 'other');
});

test('parseFormation 缺位阵型判为 other', () => {
  const html = '先锋:<span><a>甲</a></span>前军:<span><a>乙</a></span>中军:<span>空闲</span>后卫:<span>空闲</span>';
  assert.equal(parseFormation(html), 'other');
});

test('parseFormation 不被护卫位与援军位干扰', () => {
  assert.equal(parseFormation(formationSolo), 'solo');
  assert.ok(formationSolo.includes('护卫'));
});

test('parseFriendList 提取全部好友', () => {
  const list = parseFriendList(friendHtml);
  assert.equal(list.length, 10);
});

test('parseFriendList 解析等级为数字', () => {
  const list = parseFriendList(friendHtml);
  assert.deepEqual(list.map(f => f.level), [50, 43, 8, 26, 50, 27, 30, 31, 33, 47]);
});

test('parseFriendList 保留 href 原文供 Gateway 使用', () => {
  const list = parseFriendList(friendHtml);
  const first = list[0];
  assert.equal(first.id, '555555');
  assert.ok(first.href.startsWith('/Build/Operate/FColony?f=555555'));
});

test('按 40 级门槛过滤后只剩 4 位', () => {
  const list = parseFriendList(friendHtml).filter(f => f.level >= 40);
  assert.equal(list.length, 4);
  assert.deepEqual(list.map(f => f.level), [50, 43, 50, 47]);
});

test('parseFriendList 对空输入返回空数组', () => {
  assert.deepEqual(parseFriendList(''), []);
  assert.deepEqual(parseFriendList(null), []);
});

// ---- 编队切换与守卫 ----
//
// fakeGw 按调用顺序消费 states 数组：第 n 次 read 返回 states[n-1]，
// 数组耗尽后固定返回最后一个。act 只记录正则源码、不改变状态，
// 状态变化由 states 的下一项表达。这样每个测试都能明确写出
// 「切换前读到什么、切换后读到什么」。
function fakeGw(states) {
  const acts = [];
  const reads = [];
  let i = 0;
  return {
    acts,
    reads,
    read: async (p) => {
      reads.push(p);
      const s = states[Math.min(i, states.length - 1)];
      i++;
      return s;
    },
    act: async (p, re) => {
      acts.push(re.source);
      return { ok: true, matched: true, html: null, url: 'x', skipped: false };
    },
  };
}

const GENERALS = { sima: 'G-SIMA', wang: 'G-WANG', yue: 'G-YUE', wu: 'G-WU' };

const SOLO = '先锋:<span>空闲</span>前军:<span><a>王翦</a></span>中军:<span>空闲</span>后卫:<span>空闲</span>';
const FOUR = '先锋:<span><a>甲</a></span>前军:<span><a>王翦</a></span>中军:<span><a>乙</a></span>后卫:<span><a>丙</a></span>';
const OTHER = '先锋:<span><a>甲</a></span>前军:<span>空闲</span>中军:<span>空闲</span>后卫:<span>空闲</span>';

test('已是目标阵型时不发任何写请求（幂等）', async () => {
  const gw = fakeGw([SOLO]);
  const r = await ensureFormation({ gw, generals: GENERALS }, 'solo');
  assert.equal(r, 'solo');
  assert.equal(gw.acts.length, 0);
});

test('从 four 切到 solo 会下阵三位', async () => {
  const gw = fakeGw([FOUR, SOLO]);
  const r = await ensureFormation({ gw, generals: GENERALS }, 'solo');
  assert.equal(gw.acts.length, 3);
  assert.ok(gw.acts[0].includes('a=0'));
  assert.ok(gw.acts[1].includes('a=2'));
  assert.ok(gw.acts[2].includes('a=3'));
  assert.equal(r, 'solo');
});

test('从 solo 切到 four 会上阵三位并带对应 GUID', async () => {
  const gw = fakeGw([SOLO, FOUR]);
  const r = await ensureFormation({ gw, generals: GENERALS }, 'four');
  assert.equal(gw.acts.length, 3);
  assert.ok(gw.acts[0].includes('G-SIMA'));
  assert.ok(gw.acts[1].includes('G-YUE'));
  assert.ok(gw.acts[2].includes('G-WU'));
  assert.equal(r, 'four');
});

test('从 other 切到 four 也走上阵流程', async () => {
  const gw = fakeGw([OTHER, FOUR]);
  const r = await ensureFormation({ gw, generals: GENERALS }, 'four');
  assert.equal(gw.acts.length, 3);
  assert.equal(r, 'four');
});

test('切换后重新读取，返回的是实际状态而非期望状态', async () => {
  const gw = fakeGw([SOLO, OTHER]);
  const r = await ensureFormation({ gw, generals: GENERALS }, 'four');
  assert.equal(r, 'other');
});

test('withFormation 正常执行后切回四人阵', async () => {
  const gw = fakeGw([SOLO, SOLO, FOUR]);
  const out = await withFormation({ gw, generals: GENERALS }, 'solo', async () => 42);
  assert.equal(out, 42);
  assert.ok(gw.acts.some(s => s.includes('UpOk')));
});

test('fn 抛错时仍然切回四人阵，且错误继续向上抛', async () => {
  const gw = fakeGw([SOLO, SOLO, FOUR]);
  const boom = new Error('任务炸了');
  await assert.rejects(
    () => withFormation({ gw, generals: GENERALS }, 'solo', async () => { throw boom; }),
    (e) => e === boom
  );
  assert.ok(gw.acts.some(s => s.includes('UpOk')));
});

test('withFormation 把 fn 的返回值原样传出', async () => {
  const gw = fakeGw([FOUR, FOUR]);
  const out = await withFormation({ gw, generals: GENERALS }, 'four', async () => ({ n: 7 }));
  assert.deepEqual(out, { n: 7 });
});
