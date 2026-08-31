// L2 Gateway 与 HTTP 封装测试。
// 网络与时间通过依赖注入传入，测试中全部替换为假实现，不发任何真实请求。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHttp } = require('../src/zg-auto.user.js');

function fakeResponse(html) {
  return { ok: true, status: 200, url: 'http://x/final', text: async () => html };
}

test('get 返回规范化结构', async () => {
  const http = createHttp({
    fetchImpl: async () => fakeResponse('<html>hi</html>'),
    sleepImpl: async () => {},
    now: () => 0,
    throttleMs: 800,
  });
  const r = await http.get('/a');
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
  assert.equal(r.html, '<html>hi</html>');
  assert.equal(r.finalUrl, 'http://x/final');
});

test('两次连续请求之间会节流等待', async () => {
  const waits = [];
  let clock = 0;
  const http = createHttp({
    fetchImpl: async () => fakeResponse('x'),
    sleepImpl: async (ms) => { waits.push(ms); clock += ms; },
    now: () => clock,
    throttleMs: 800,
  });
  await http.get('/a');
  await http.get('/b');
  assert.equal(waits.length, 1);
  assert.equal(waits[0], 800);
});

test('距上次请求已超过节流间隔则不等待', async () => {
  const waits = [];
  let clock = 0;
  const http = createHttp({
    fetchImpl: async () => fakeResponse('x'),
    sleepImpl: async (ms) => { waits.push(ms); },
    now: () => clock,
    throttleMs: 800,
  });
  await http.get('/a');
  clock = 5000;
  await http.get('/b');
  assert.equal(waits.length, 0);
});
