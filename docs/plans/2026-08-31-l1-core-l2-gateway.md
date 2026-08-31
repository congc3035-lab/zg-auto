# L1 Core + L2 Gateway 实施计划

> **给执行者**：本计划按 [开发契约](../../CONTRIBUTING.md) 第 3 步逐任务执行。
> 步骤用 `- [ ]` 复选框跟踪。每个任务独立走完红绿循环并提交，不得批量实现后补测试。

**目标**：建立 L1 Core 与 L2 Gateway 两层，把全部协议坑封装在一处，**不包含任何 Task**。

**架构**：单文件 IIFE，内部按 L1→L2 顺序排列。所有解析逻辑写成纯函数
（输入字符串、输出值，不碰网络与 DOM），因此可在 Node 中脱离浏览器测试。
网络与时间通过依赖注入传入，测试时替换为假实现。

**技术栈**：原生 JavaScript（ES2020），Node 20 内置 test runner，零第三方依赖。

**规格**：[需求规格 V0.4](../01-需求规格.md)、[架构设计 V1.0](../02-架构设计.md)

## 全局约束

以下取自规格，**每个任务都隐含包含**：

- 相邻请求间隔**不得低于 800 毫秒**
- `sid` **必须使用页面 href 原文**，禁止手工拼接（拼接会被重定向到登录页）
- 每个写操作前**必须重新拉取列表页**取当前 `_r`（一次性 token，复用只有第一次生效且静默失败）
- 单文件**不超过 1200 行**
- Gateway 公开函数**冻结为 `read` / `act` / `actAll` 三个**
- L1 Core **禁止出现任何游戏词汇**（军令、编队、押镖…）
- Dry-run **默认开启**

## 本计划需要批准的三项架构细化

它们是 L1/L2 的设计决策，按契约需报批。**批准本计划即批准这三项。**

### 细化一：解析走「实体解码 + 正则」，不用 DOMParser

**原因**：游戏页面把中文全部编码成 HTML 实体，等级写作 `(50&#x7EA7;)` 而非 `(50级)`。
浏览器 `DOMParser` 会自动解码，但 **Node 没有内置 DOMParser**，
引入 linkedom 之类的库会破坏「零依赖、不引入构建步骤」的约束。

**决定**：L1 提供 `decodeEntities()`，所有解析基于「解码后的字符串 + 正则」。
这一路的勘察全部是用正则完成的，已验证可行。

### 细化二：单文件末尾加条件 CJS 导出

**原因**：油猴脚本是 IIFE，Node 无法 import 其内部函数。

**决定**：IIFE 内部在 L2 之后插入一段条件导出。浏览器中 `module` 未定义，该段不执行；
Node `require()` 时拿到纯函数并 `return`，不触碰浏览器逻辑。

### 细化三：游戏语义的解析归属 L3，本计划不涉及

`decodeEntities` / `allHrefs` 这类是通用文本操作，属 L1。
而「从好友列表提取等级」这类含游戏语义的解析，将来归入 **L3 的 `parse` 命名空间**，
同样是纯函数、同样可测。本计划不实现任何 L3 内容，此处只做预先定位，避免后续放错层。

---

## 文件结构

| 文件 | 责任 | 本计划动作 |
|---|---|---|
| `src/zg-auto.user.js` | 唯一代码文件 | 填充 CFG、L1、L2 与条件导出 |
| `tests/core.test.mjs` | L1 纯函数测试 | 新建 |
| `tests/gateway.test.mjs` | L2 注入式测试 | 新建 |
| `fixtures/friend-colony.html` | 好友列表页真实样本 | 已存在，直接用 |
| `fixtures/login-page.html` | 登录页真实样本 | 新建（Task 4 前置） |

验证命令统一为：

```
node --test tests/
```

CI 在每次 push 后自动跑同一命令。

---

## Task 1：HTML 实体解码

**Files**
- Modify: `src/zg-auto.user.js`（在 `── L1 Core ──` 注释下方）
- Create: `tests/core.test.mjs`

**Interfaces**
- Produces: `decodeEntities(s: string) -> string`

- [ ] **Step 1：写失败的测试**

创建 `tests/core.test.mjs`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeEntities } = require('../src/zg-auto.user.js');

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
```

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/core.test.mjs
```

预期：失败，报错类似 `TypeError: decodeEntities is not a function`。
**若测试直接通过，说明测试写错了，停下检查。**

- [ ] **Step 3：写最小实现**

在 `src/zg-auto.user.js` 的 `── L1 Core ──` 注释下方插入：

```js
  function decodeEntities(s) {
    if (typeof s !== 'string') return '';
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) {
        return String.fromCodePoint(parseInt(h, 16));
      })
      .replace(/&#(\d+);/g, function (_, d) {
        return String.fromCodePoint(parseInt(d, 10));
      })
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
```

同时在文件中 `── L2 Gateway ──` 段落之后插入条件导出（本计划后续任务会往这里补名字）：

```js
  //  ── Node 测试导出 ──────  浏览器中 module 未定义，本段不执行
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { decodeEntities };
    return;
  }
```

**`&amp;` 必须放在最后替换**，否则 `&amp;lt;` 会被二次解码成 `<`。第 4 个测试就是守这条的。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：全部通过，包含 baseline 的 2 个测试，共 7 个。

- [ ] **Step 5：提交**

提交信息：`feat(L1): HTML 实体解码`

---

## Task 2：href 提取

**Files**
- Modify: `src/zg-auto.user.js`（L1 段）
- Modify: `tests/core.test.mjs`

**Interfaces**
- Consumes: `decodeEntities`（Task 1）
- Produces: `allHrefs(html: string) -> string[]`、`findHref(html: string, re: RegExp) -> string | null`

- [ ] **Step 1：写失败的测试**

在 `tests/core.test.mjs` 末尾追加（顶部 require 改为同时取出三个函数）：

```js
import { readFileSync } from 'node:fs';

const friendHtml = readFileSync(
  new URL('../fixtures/friend-colony.html', import.meta.url),
  'utf8'
);

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
```

把文件顶部的解构改成：

```js
const { decodeEntities, allHrefs, findHref } = require('../src/zg-auto.user.js');
```

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/core.test.mjs
```

预期：新增的 4 个测试失败，`allHrefs is not a function`。

- [ ] **Step 3：写最小实现**

在 `decodeEntities` 下方插入：

```js
  function allHrefs(html) {
    if (typeof html !== 'string') return [];
    var out = [];
    var rx = /href=["']([^"']+)["']/gi;
    var m;
    while ((m = rx.exec(html)) !== null) {
      out.push(decodeEntities(m[1]));
    }
    return out;
  }

  function findHref(html, re) {
    var list = allHrefs(html);
    for (var i = 0; i < list.length; i++) {
      if (re.test(list[i])) return list[i];
    }
    return null;
  }
```

导出段补上两个名字：`module.exports = { decodeEntities, allHrefs, findHref };`

**注意**：`findHref` 里不要复用带 `g` 标志的正则去循环匹配 —— `lastIndex` 会导致漏匹配。
上面用 `re.test()` 逐个判断，调用方传入的正则若带 `g` 仍有此风险，故约定**调用方不得传 `g` 标志**。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：11 个测试全绿。

- [ ] **Step 5：提交**

提交信息：`feat(L1): href 提取与实体解码`

---

## Task 3：数值提取

**Files**
- Modify: `src/zg-auto.user.js`（L1 段）
- Modify: `tests/core.test.mjs`

**Interfaces**
- Consumes: `decodeEntities`
- Produces: `matchNumber(html: string, re: RegExp) -> number | null`

- [ ] **Step 1：写失败的测试**

追加到 `tests/core.test.mjs`：

```js
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
```

顶部解构追加 `matchNumber`。

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/core.test.mjs
```

预期：4 个新测试失败。

- [ ] **Step 3：写最小实现**

```js
  function matchNumber(html, re) {
    var text = decodeEntities(html);
    var m = re.exec(text);
    if (!m || m[1] === undefined) return null;
    var n = parseInt(String(m[1]).replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }
```

导出段补 `matchNumber`。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：15 个测试全绿。

- [ ] **Step 5：提交**

提交信息：`feat(L1): 数值提取`

---

## Task 4：登录页检测

**Files**
- Create: `fixtures/login-page.html`（前置，见 Step 0）
- Modify: `src/zg-auto.user.js`（L1 段）
- Modify: `tests/core.test.mjs`

**Interfaces**
- Produces: `isLoginPage(html: string) -> boolean`

- [ ] **Step 0：提交登录页 fixture（前置）**

用一个无效 sid 请求任意页面即可得到登录页。该样本已抓好，
特征是 `<title>登录-探玩驿站</title>`，长度约 2846 字符，不含任何真实凭证。
把它提交到 `fixtures/login-page.html`。

- [ ] **Step 1：写失败的测试**

```js
const loginHtml = readFileSync(
  new URL('../fixtures/login-page.html', import.meta.url),
  'utf8'
);

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
```

顶部解构追加 `isLoginPage`。

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/core.test.mjs
```

预期：3 个新测试失败。

- [ ] **Step 3：写最小实现**

```js
  function isLoginPage(html) {
    if (typeof html !== 'string' || html === '') return false;
    var title = /<title>([^<]*)<\/title>/i.exec(html);
    if (title && title[1].indexOf('登录') !== -1) return true;
    return decodeEntities(html).indexOf('登录账号') !== -1;
  }
```

两重判据：标题含「登录」，或正文含「登录账号」。任一命中即认定失效。

导出段补 `isLoginPage`。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：18 个测试全绿。

- [ ] **Step 5：提交**

提交信息：`feat(L1): 登录页检测`

---

## Task 5：HTTP 封装与节流

**Files**
- Modify: `src/zg-auto.user.js`（CFG 段与 L1 段）
- Create: `tests/gateway.test.mjs`

**Interfaces**
- Produces: `createHttp(deps) -> { get(url) -> Promise<{ok, status, html, finalUrl}> }`
  - `deps = { fetchImpl, sleepImpl, now, throttleMs }`

- [ ] **Step 1：写失败的测试**

创建 `tests/gateway.test.mjs`：

```js
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
```

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/gateway.test.mjs
```

预期：3 个测试失败，`createHttp is not a function`。

- [ ] **Step 3：写最小实现**

先在 `── CFG ──` 段写入配置：

```js
  var CFG = {
    throttleMs: 800,
    dryRun: true
  };
```

再在 L1 段末尾插入：

```js
  function createHttp(deps) {
    var last = -Infinity;
    return {
      get: async function (url) {
        var elapsed = deps.now() - last;
        var wait = deps.throttleMs - elapsed;
        if (wait > 0) await deps.sleepImpl(wait);
        last = deps.now();
        var res = await deps.fetchImpl(url);
        return {
          ok: res.ok,
          status: res.status,
          html: await res.text(),
          finalUrl: res.url || url
        };
      }
    };
  }
```

`last` 初值为 `-Infinity`，保证**第一次请求不等待**。第 2 个测试守的就是「第二次才等」。

导出段补 `createHttp` 与 `CFG`。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：21 个测试全绿。

- [ ] **Step 5：提交**

提交信息：`feat(L1): HTTP 封装与请求节流`

---

## Task 6：Gateway

**Files**
- Modify: `src/zg-auto.user.js`（L2 段）
- Modify: `tests/gateway.test.mjs`

**Interfaces**
- Consumes: `findHref`、`allHrefs`、`isLoginPage`（L1）
- Produces:
  - `FatalError`（Error 子类）
  - `createGateway(deps) -> { read, act, actAll }`
  - `deps = { http, dryRun, log }`
  - `ActResult = { ok, matched, html, url, skipped }`

- [ ] **Step 1：写失败的测试**

追加到 `tests/gateway.test.mjs`（顶部解构补 `createGateway, FatalError`）：

```js
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
```

- [ ] **Step 2：跑测试，确认它失败**

```
node --test tests/gateway.test.mjs
```

预期：7 个新测试失败。

- [ ] **Step 3：写最小实现**

在 `── L2 Gateway ──` 注释下方插入：

```js
  function FatalError(message) {
    var e = Error.call(this, message);
    this.name = 'FatalError';
    this.message = message;
    this.stack = e.stack;
  }
  FatalError.prototype = Object.create(Error.prototype);
  FatalError.prototype.constructor = FatalError;

  function createGateway(deps) {
    var http = deps.http;
    var dryRun = deps.dryRun;
    var log = deps.log || function () {};

    async function read(path) {
      var r = await http.get(path);
      if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录游戏');
      return r.html;
    }

    async function act(listPath, linkRe) {
      var listHtml = await read(listPath);
      var href = findHref(listHtml, linkRe);
      if (!href) return { ok: false, matched: false, html: null, url: null, skipped: false };
      if (dryRun) {
        log({ action: 'act', url: href, dryRun: true });
        return { ok: true, matched: true, html: null, url: href, skipped: true };
      }
      var r = await http.get(href);
      if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录游戏');
      return { ok: true, matched: true, html: r.html, url: href, skipped: false };
    }

    async function actAll(listPath, linkRe, max) {
      var results = [];
      var seen = {};
      for (var i = 0; i < max; i++) {
        var listHtml = await read(listPath);
        var candidates = allHrefs(listHtml).filter(function (h) { return linkRe.test(h); });
        var next = null;
        for (var j = 0; j < candidates.length; j++) {
          var key = candidates[j].split('?')[0];
          if (!seen[key]) { next = candidates[j]; seen[key] = true; break; }
        }
        if (!next) break;
        if (dryRun) {
          log({ action: 'actAll', url: next, dryRun: true });
          results.push({ ok: true, matched: true, html: null, url: next, skipped: true });
          continue;
        }
        var r = await http.get(next);
        if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录游戏');
        results.push({ ok: true, matched: true, html: r.html, url: next, skipped: false });
      }
      return results;
    }

    return { read: read, act: act, actAll: actAll };
  }
```

**`actAll` 的去重按路径（去掉 query）进行**，因为同一个动作每轮的 `_r` 都不同，
按完整 URL 去重会导致同一动作被重复执行。这正是实测中「批量复用 token 只有第一次生效」的对策。

导出段补 `createGateway` 与 `FatalError`。

- [ ] **Step 4：跑测试，确认通过**

```
node --test tests/
```

预期：28 个测试全绿，输出无警告。

- [ ] **Step 5：提交**

提交信息：`feat(L2): Gateway 唯一写入口与 dry-run`

---

## 完成后的验收

全部任务做完后，逐项核对，**每项都要有刚跑出来的证据**：

- [ ] `node --test tests/` 全绿，28 个测试
- [ ] CI 最新 run `conclusion: success`，附 run 链接
- [ ] `src/zg-auto.user.js` 行数 < 1200（`grep -c '' src/zg-auto.user.js`）
- [ ] L1、L2 段内搜索不到任何游戏词汇（军令 / 编队 / 押镖 / 天梯 / 农田）
- [ ] Gateway 公开函数恰好 3 个：`read`、`act`、`actAll`
- [ ] 文件末尾的条件导出在浏览器中不会执行（`module` 未定义）

**注意**：本计划完成后脚本仍**不能实际使用** —— 它没有任何 Task、没有调度器、没有浮层。
这是刻意的：地基先稳，再往上盖。首个可用版本预计在 L3 + 首批 Task 完成后。

## 自查记录

**规格覆盖**：本计划只覆盖架构设计第三节的 L1、L2 两层契约。
需求规格中的任务清单、编队规则、浮层、隐身模式均不在范围内，将由后续计划覆盖。

**占位扫描**：已通篇检查，无 TBD / TODO / 「稍后实现」/ 「加上错误处理」/ 「与任务 N 类似」。
每个代码步骤都给出可直接粘贴的完整代码。

**类型一致性**：
`decodeEntities` 在 Task 1 定义，Task 2、3、4 复用，签名一致。
`allHrefs` / `findHref` 在 Task 2 定义，Task 6 复用，签名一致。
`isLoginPage` 在 Task 4 定义，Task 6 复用，签名一致。
`createHttp` 产出的 `{ get }` 与 Task 6 中 `deps.http` 的用法一致。
`ActResult` 五个字段在 `act` 与 `actAll` 中保持相同形状。