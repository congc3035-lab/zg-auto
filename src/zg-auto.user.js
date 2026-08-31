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

  //  ── L2 Gateway ─────────  read / act / actAll + FatalError

  //  ── Node 测试导出 ──────  浏览器中 module 未定义，本段不执行
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      decodeEntities: decodeEntities,
      allHrefs: allHrefs,
      findHref: findHref,
      matchNumber: matchNumber,
      isLoginPage: isLoginPage
    };
    return;
  }

  //  ── L3 Domain ──────────  （后续计划）
  //  ── L4 Tasks ───────────  （后续计划）
  //  ── L5 Runtime ─────────  （后续计划）

})();
