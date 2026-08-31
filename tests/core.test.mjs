// L1 Core 纯函数测试。
// 所有被测函数都是 (string) => value 形式，不碰网络与 DOM，故可在 Node 中直接跑。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  decodeEntities,
  allHrefs,
  findHref,
  matchNumber,
  isLoginPage
} = require('../src/zg-auto.user.js');

const friendHtml = readFileSync(
  new URL('../fixtures/friend-colony.html', import.meta.url),
  'utf8'
);

const loginHtml = readFileSync(
  new URL('../fixtures/login-page.html', import.meta.url),
  'utf8'
);

test('解码十六进制实体：等级文本', () => {
  assert.equal(decodeEntities('(50&#x7EA7;)'), '(50级)');
});

test('解码十进制实体', () => {
  assert.equal(decodeEntities('&#32423;'), '级');
});

test('解码命名实体', () => {
  assert.equal(decodeEntities('a&amp;b&lt;c&gt;d&quot;e'), 'a&b<c>d"e');
});

test('&amp; 最后解码，不产生二次解码', () => {
  assert.equal(decodeEntities('&amp;lt;'), '&lt;');
});

test('非字符串输入返回空串', () => {
  assert.equal(decodeEntities(null), '');
  assert.equal(decodeEntities(undefined), '');
});

test('allHrefs 提取全部链接并解码实体', () => {
  const hrefs = allHrefs(friendHtml);
  assert.ok(hrefs.length > 10);
  assert.ok(hrefs.some(h => h === '/Build/Operate/FColony?f=555555&sid=SID_REDACTED'));
});

test('allHrefs 把 &amp; 解码成 &', () => {
  const hrefs = allHrefs(friendHtml);
  assert.equal(hrefs.some(h => h.includes('&amp;')), false);
});

test('findHref 按正则找到第一个匹配', () => {
  const h = findHref(friendHtml, /FColony\?f=242732/);
  assert.equal(h, '/Build/Operate/FColony?f=242732&sid=SID_REDACTED');
});

test('findHref 找不到时返回 null', () => {
  assert.equal(findHref(friendHtml, /NoSuchPath/), null);
});

test('matchNumber 从解码后的文本取第一个捕获组数字', () => {
  assert.equal(matchNumber('军令：10\n(18分16秒后补充)', /军令：(\d+)/), 10);
});

test('matchNumber 能穿透 HTML 实体', () => {
  assert.equal(matchNumber('(43&#x7EA7;)', /\((\d+)级\)/), 43);
});

test('matchNumber 无匹配返回 null', () => {
  assert.equal(matchNumber('没有数字', /军令：(\d+)/), null);
});

test('matchNumber 忽略数字中的逗号', () => {
  assert.equal(matchNumber('铜币：1,234,567', /铜币：([\d,]+)/), 1234567);
});

test('isLoginPage 识别登录页', () => {
  assert.equal(isLoginPage(loginHtml), true);
});

test('isLoginPage 不误判正常页面', () => {
  assert.equal(isLoginPage(friendHtml), false);
});

test('isLoginPage 对空输入返回 false', () => {
  assert.equal(isLoginPage(''), false);
  assert.equal(isLoginPage(null), false);
});
