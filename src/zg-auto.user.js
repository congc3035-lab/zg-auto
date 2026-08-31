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
    dryRun: true,
    formationPath: '/Build/Operate/Formation',
    generals: {
      sima: '723acde6-7f00-4378-a998-2f5baf76ca78',
      wang: 'fc4fa2cf-4775-4908-a4e6-12af041df335',
      yue: 'e01a0e22-6fa5-46d0-931f-efb4be56f4e4',
      wu: '94efcdbf-65df-421a-a92c-58239c0f8223'
    }
  };

  //  ── L1 Core ────────────  http / dom / store / log / sleep

  // 站点把中文全部编码成 HTML 实体，页面里看到的是 &#x7EA7; 而不是「级」。
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
  // 查询串必须使用原文，手工拼接会被站点重定向到登录页。
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

  // 先解码再匹配，因此调用方的正则可直接写中文，不必关心实体编码。
  // 例如 /总计：(\d+)/ 能匹配到编码成 &#24635;&#35745; 的页面文本。
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

  // 全脚本唯一的站点交互出口。上层禁止绕过它直接发请求。
  //
  // act 固定五步：取列表页拿新 _r → 找 href 原文 → 节流后请求 → 检测登录页 → 返回。
  // _r 是一次性 token，批量复用只有第一次生效且静默失败，故每次动作前都要重取列表页。
  function createGateway(deps) {
    var http = deps.http;
    var dryRun = deps.dryRun;
    var log = deps.log || function () {};

    async function read(path) {
      var r = await http.get(path);
      if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录');
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
      if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录');
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
        if (isLoginPage(r.html)) throw new FatalError('登录已失效，请重新登录');
        results.push({ ok: true, matched: true, html: r.html, url: next, skipped: false });
      }
      return results;
    }

    return { read: read, act: act, actAll: actAll };
  }

  //  ── L3 Domain ──────────  parse / formation / windows

  // ranges 形如 [[12,13],[18,19]]，含起点不含终点。
  // 终点算关闭：13:00 时站点已返回「未达到时间」，若把终点算作开放会误判。
  // date 由调用方注入，便于测试；生产代码传 new Date()。
  function isWindowOpen(ranges, date) {
    if (!Array.isArray(ranges) || ranges.length === 0) return false;
    var h = date.getHours();
    for (var i = 0; i < ranges.length; i++) {
      if (h >= ranges[i][0] && h < ranges[i][1]) return true;
    }
    return false;
  }

  // 站点在同一页混用原文中文与 HTML 实体，matchNumber 已内置解码，此处直接用。
  // 铜币与粮草的格式是「当前/上限」，正则只取斜杠前的当前值。
  function parseMine(html) {
    return {
      orders: matchNumber(html, /军令：(\d+)/),
      copper: matchNumber(html, /铜币：(\d+)\s*\//),
      food: matchNumber(html, /粮草：(\d+)\s*\//),
      merit: matchNumber(html, /军功：(\d+)/),
      prestige: matchNumber(html, /威望：(\d+)/)
    };
  }

  // 阵位判据取「该阵位后的 span 内是否含『空闲』」。
  // 不按有无链接判断：护卫位与援军位也渲染 span，内容是开启条件说明，
  // 按链接判断会把它们误算成有人。
  function slotOccupied(text, label) {
    var re = new RegExp(label + '\\s*[:：][\\s\\S]{0,40}?<span>([\\s\\S]{0,120}?)<\\/span>');
    var m = re.exec(text);
    if (!m) return false;
    return m[1].indexOf('空闲') === -1;
  }

  // four = 四位皆有人；solo = 仅前军有人；其余一律 other。
  // other 出现时上层必须先修复为 four 再继续，详见架构设计的三重保护。
  function parseFormation(html) {
    var text = decodeEntities(html);
    var van = slotOccupied(text, '先锋');
    var front = slotOccupied(text, '前军');
    var center = slotOccupied(text, '中军');
    var rear = slotOccupied(text, '后卫');
    if (van && front && center && rear) return 'four';
    if (!van && front && !center && !rear) return 'solo';
    return 'other';
  }

  // 好友条目形如：
  //   <a href="/Build/Operate/FColony?f=555555&amp;sid=...">昵称</a>(50&#x7EA7;)
  // 先整体解码，再一次性捕获 href、id、昵称、等级四段。
  //
  // 等级门槛不写在这里：本函数只负责解析，过滤由调用方按 CFG 决定，
  // L3 不该知道具体阈值从何而来。
  function parseFriendList(html) {
    if (typeof html !== 'string' || html === '') return [];
    var text = decodeEntities(html);
    var rx = /href=["'](\/Build\/Operate\/FColony\?f=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*\((\d+)级\)/g;
    var out = [];
    var m;
    while ((m = rx.exec(text)) !== null) {
      out.push({
        href: m[1],
        id: m[2],
        name: m[3].replace(/<[^>]*>/g, '').trim(),
        level: parseInt(m[4], 10)
      });
    }
    return out;
  }

  // 阵位号：0 先锋 / 1 前军 / 2 中军 / 3 后卫。
  // 王翦固定占前军(1)，两套阵型都不动它，切换只涉及 0 / 2 / 3 三位。
  //
  // 每个动作都走 gw.act，因此实际请求数是 6 个（3 读 + 3 写）而非 3 个。
  // 编队链接本身不带一次性 token，理论上可以直接连发，
  // 但为守住「Gateway 是唯一写入口」这条约束，不为编队开特例。
  //
  // 切换后必须重新读取：写操作可能因链接不存在而静默失败，
  // 返回实际状态而非期望状态，调用方据此判断是否真的切成功。
  async function ensureFormation(deps, kind) {
    var gw = deps.gw;
    var g = deps.generals;
    var cur = parseFormation(await gw.read(CFG.formationPath));
    if (cur === kind) return cur;

    if (kind === 'solo') {
      var slots = [0, 2, 3];
      for (var i = 0; i < slots.length; i++) {
        await gw.act(CFG.formationPath, new RegExp('Down\\?a=' + slots[i]));
      }
    } else if (kind === 'four') {
      var ups = [[g.sima, 0], [g.yue, 2], [g.wu, 3]];
      for (var j = 0; j < ups.length; j++) {
        await gw.act(
          CFG.formationPath,
          new RegExp('UpOk\\?g=' + ups[j][0] + '[^"\']*a=' + ups[j][1])
        );
      }
    }

    return parseFormation(await gw.read(CFG.formationPath));
  }

  // 作用域守卫：切到目标阵型 → 执行 fn → 无论成败都切回四人阵。
  //
  // finally 是这里的全部意义，不得改写成 catch 后 return：
  // 2026-08-28 编队在切成单人后中断，永久停在 solo，导致两场天梯 1 打 4 连败。
  async function withFormation(deps, kind, fn) {
    await ensureFormation(deps, kind);
    try {
      return await fn();
    } finally {
      await ensureFormation(deps, 'four');
    }
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
      FatalError: FatalError,
      isWindowOpen: isWindowOpen,
      parseMine: parseMine,
      parseFormation: parseFormation,
      parseFriendList: parseFriendList,
      ensureFormation: ensureFormation,
      withFormation: withFormation
    };
    return;
  }

  //  ── L4 Tasks ───────────  （后续计划）
  //  ── L5 Runtime ─────────  （后续计划）

})();
