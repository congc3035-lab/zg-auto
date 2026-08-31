// L1 Core 纯函数测试。
// 所有被测函数都是 (string) => value 形式，不碰网络与 DOM，故可在 Node 中直接跑。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { decodeEntities, allHrefs, findHref } = require('../src/zg-auto.user.js');

const friendHtml = readFileSync(
  new URL('../fixtures/friend-colony.html', import.meta.url),
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
