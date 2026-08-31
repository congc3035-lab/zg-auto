// 测试基线。
//
// 这个文件不测业务逻辑，它证明一件事：CI 能在这个仓库里跑起测试。
// 开发契约要求「开工前必须确认测试基线是绿的」，这就是那条基线。
//
// 第一个真实的业务测试会在首个开发任务中出现（L1 Core 的 HTML 解析函数），
// 届时新增 tests/dom.test.mjs，本文件保留不动。

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Node 测试运行器可用', () => {
  assert.equal(1 + 1, 2);
});

test('ES 模块与断言库可用', () => {
  const parsed = JSON.parse('{"ok":true}');
  assert.deepEqual(parsed, { ok: true });
});
