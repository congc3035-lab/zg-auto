// ==UserScript==
// @name         zg-auto
// @namespace    https://github.com/congc3035-lab/zg-auto
// @version      0.0.0
// @description  QQ战国（1 区）日常任务托管。开发中，当前无任何可用功能。
// @author       congc3035-lab
// @match        http://zg.pccsh.com/*
// @match        https://zg.pccsh.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/congc3035-lab/zg-auto/main/src/zg-auto.user.js
// @updateURL    https://raw.githubusercontent.com/congc3035-lab/zg-auto/main/src/zg-auto.user.js
// ==/UserScript==

// 分层顺序即依赖顺序，只能向前引用。下层禁止感知上层，
// 禁止出现具体任务的名字。详见 docs/02-架构设计.md。
//
// 按开发契约，任何 production 代码都必须先有一个失败的测试。
// 版本号保持 0.0.0 直到首个可用版本发布。

(function () {
  'use strict';

  //  ── CFG ────────────────  配置，全部可变值（阈值 / 路径 / GUID / 快捷键）

  var CFG = {
    throttleMs: 800,
    dryRun: true
  };

  //  ── L1 Core ────────────  http / dom / store / log / sleep

  // 游戏页面把中文全部编码成 HTML 实体，等级写作 (50&#x7EA7;) 而非 (50级)。
  // 浏览器 DOMParser 会自动解码，但 Node 没有内置 DOMParser，
  // 引入解析库会破坏「零依赖」约束，故这里自行解码。
  //
  // &amp; 必须放在最后替换，否则 &amp;lt; 会被二次解码成 <。
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

  // 返回页面中全部 href 的原文（已解码实体）。
  // sid 必须使用原文，手工拼接会被重定向到登录页。
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

  // 调用方传入的正则不得带 g 标志，否则 lastIndex 会导致漏匹配。
  function findHref(html, re) {
    var list = allHrefs(html);
    for (var i = 0; i < list.length; i++) {
      if (re.test(list[i])) return list[i];
    }
    return null;
  }

  // 先解码再匹配，因此正则可直接写中文（军令：(\d+)）而不必关心实体编码。
  function matchNumber(html, re) {
    var text = decodeEntities(html);
    var m = re.exec(text);
    if (!m || m[1] === undefined) return null;
    var n = parseInt(String(m[1]).replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
  }

  // 两重判据：标题含「登录」，或正文含「登录账号」。任一命中即认定会话失效。
  function isLoginPage(html) {
    if (typeof html !== 'string' || html === '') return false;
    var title = /<title>([^<]*)<\/title>/i.exec(html);
    if (title && title[1].indexOf('登录') !== -1) return true;
    return decodeEntities(html).indexOf('登录账号') !== -1;
  }

  // 网络与时间全部由外部注入，测试时替换为假实现。
  // last 初值为 -Infinity，保证第一次请求不等待。
  function createHttp(deps) {
    var last = -Infinity;
    return {
      get: async function (url) {
        var wait = deps.throttleMs - (deps.now() - last);
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

  //  ── L2 Gateway ─────────  read / act / actAll + FatalError

  function FatalError(message) {
    var e = Error.call(this, message);
    this.name = 'FatalError';
    this.message = message;
    this.stack = e.stack;
  }
  FatalError.prototype = Object.create(Error.prototype);
  FatalError.prototype.constructor = FatalError;

  // 全脚本唯一的游戏交互出口。任务层禁止绕过它直接发请求。
  //
  // act 固定五步：取列表页拿新 _r → 找 href 原文 → 节流后请求 → 检测登录页 → 返回。
  // _r 是一次性 token，批量复用只有第一次生效且静默失败，故每次动作前都要重取列表页。
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

    // 去重按路径（去掉 query）进行：同一动作每轮的 _r 都不同，
    // 按完整 URL 去重会导致同一动作被反复执行。
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

  //  ── Node 测试导出 ──────  浏览器中 module 未定义，本段不执行
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CFG: CFG,
      decodeEntities: decodeEntities,
      allHrefs: allHrefs,
      findHref: findHref,
      matchNumber: matchNumber,
      isLoginPage: isLoginPage,
      createHttp: createHttp,
      createGateway: createGateway,
      FatalError: FatalError
    };
    return;
  }

  //  ── L3 Domain ──────────  （后续计划）
  //  ── L4 Tasks ───────────  （后续计划）
  //  ── L5 Runtime ─────────  （后续计划）

})();
