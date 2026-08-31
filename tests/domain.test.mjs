// L3 Domain 测试。
// 解析部分是 (html) => value 纯函数；编队操作通过注入的 Gateway 假实现驱动，
// 全程不发任何真实请求。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isWindowOpen } = require('../src/zg-auto.user.js');

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
