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

// 文件骨架。
//
// 分层顺序即依赖顺序，只能向前引用。下层禁止感知上层，
// 禁止出现具体任务的名字。详见 docs/02-架构设计.md。
//
// 当前状态：仅骨架，无任何实现。
// 按开发契约，任何 production 代码都必须先有一个失败的测试。
// 版本号保持 0.0.0 直到首个可用版本发布。

(function () {
  'use strict';

  //  ── CFG ────────────────  配置，全部可变值（阈值 / 路径 / GUID / 快捷键）
  //  ── L1 Core ────────────  http / dom / store / log / sleep
  //  ── L2 Gateway ─────────  read / act / actAll + FatalError
  //  ── L3 Domain ──────────  resources / formation / windows
  //  ── L4 Tasks ───────────  各 Task 对象 + TASKS 注册表   ← 唯一增长区
  //  ── L5 Runtime ─────────  scheduler / panel / stealth
  //  ── Bootstrap ──────────  入口

})();