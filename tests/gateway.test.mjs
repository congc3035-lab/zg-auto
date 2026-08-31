// L2 Gateway 与 HTTP 封装测试。
// 网络与时间通过依赖注入传入，测试中全部替换为假实现，不发任何真实请求。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createHttp, createGateway, FatalError } = require('../src/zg-auto.user.js');

function fakeResponse(html) {
  return { ok: true, status: 200, url: 'http://x/final', text: async () => html };
}

function stubHttp(pages) {
  const calls = [];
  return {
    calls,
    get: async (url) => {
      calls.push(url);
      const html = pages[url];
      if (html === undefined) throw new Error('未预置页面: ' + url);
      return { ok: true, status: 200, html, finalUrl: url };
    },
  };
}

const LIST_ONE = '<a href="/Do/Claim?sid=S&amp;_r=T1">领取</a>';
const LOGIN = '<title>登录-探玩驿站</title>';

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

test('read 返回页面 HTML', async () => {
  const http = stubHttp({ '/list': '<html>ok</html>' });
  const gw = createGateway({ http, dryRun: false });
  assert.equal(await gw.read('/list'), '<html>ok</html>');
});

test('read 遇到登录页抛 FatalError', async () => {
  const http = stubHttp({ '/list': LOGIN });
  const gw = createGateway({ http, dryRun: false });
  await assert.rejects(() => gw.read('/list'), FatalError);
});

test('act 先取列表页再请求动作链接原文', async () => {
  const http = stubHttp({
    '/list': LIST_ONE,
    '/Do/Claim?sid=S&_r=T1': '<html>done</html>',
  });
  const gw = createGateway({ http, dryRun: false });
  const r = await gw.act('/list', /Do\/Claim/);
  assert.equal(r.ok, true);
  assert.equal(r.matched, true);
  assert.equal(r.url, '/Do/Claim?sid=S&_r=T1');
  assert.deepEqual(http.calls, ['/list', '/Do/Claim?sid=S&_r=T1']);
});

test('act 找不到链接时 matched 为 false 且不发第二个请求', async () => {
  const http = stubHttp({ '/list': LIST_ONE });
  const gw = createGateway({ http, dryRun: false });
  const r = await gw.act('/list', /NoSuch/);
  assert.equal(r.matched, false);
  assert.equal(r.ok, false);
  assert.deepEqual(http.calls, ['/list']);
});

test('dry-run 只记录 URL 不发出动作请求', async () => {
  const logged = [];
  const http = stubHttp({ '/list': LIST_ONE });
  const gw = createGateway({ http, dryRun: true, log: (e) => logged.push(e) });
  const r = await gw.act('/list', /Do\/Claim/);
  assert.equal(r.skipped, true);
  assert.equal(r.url, '/Do/Claim?sid=S&_r=T1');
  assert.deepEqual(http.calls, ['/list']);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].url, '/Do/Claim?sid=S&_r=T1');
});

test('actAll 每轮重新取列表页拿新 token', async () => {
  let round = 0;
  const calls = [];
  const http = {
    calls,
    get: async (url) => {
      calls.push(url);
      if (url === '/list') {
        round++;
        if (round === 1) return { ok: true, status: 200, html: '<a href="/Do/A?_r=T1">a</a><a href="/Do/B?_r=T1">b</a>', finalUrl: url };
        if (round === 2) return { ok: true, status: 200, html: '<a href="/Do/B?_r=T2">b</a>', finalUrl: url };
        return { ok: true, status: 200, html: '<span>无</span>', finalUrl: url };
      }
      return { ok: true, status: 200, html: '<html>done</html>', finalUrl: url };
    },
  };
  const gw = createGateway({ http, dryRun: false });
  const rs = await gw.actAll('/list', /^\/Do\//, 5);
  assert.equal(rs.length, 2);
  assert.equal(calls[1], '/Do/A?_r=T1');
  assert.equal(calls[3], '/Do/B?_r=T2');
});

test('actAll 达到上限即停', async () => {
  const http = stubHttp({
    '/list': LIST_ONE,
    '/Do/Claim?sid=S&_r=T1': '<html>done</html>',
  });
  const gw = createGateway({ http, dryRun: false });
  const rs = await gw.actAll('/list', /Do\/Claim/, 1);
  assert.equal(rs.length, 1);
});
