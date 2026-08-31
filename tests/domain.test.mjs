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
  parseFriendList
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
