# zg-auto

QQ战国（1 区）日常任务托管脚本。Tampermonkey 用户脚本，单文件。

## 安装

1. 浏览器安装 Tampermonkey
   - 桌面：Chrome / Edge 应用商店
   - 安卓：Kiwi Browser 或 Firefox for Android
   - iOS：Safari + Userscripts
2. 打开安装链接，Tampermonkey 会提示安装：
   https://raw.githubusercontent.com/congc3035-lab/zg-auto/main/src/zg-auto.user.js
3. 登录游戏，页面右下角出现浮层
4. **开关默认关闭**，手动开启后才开始执行

脚本头部声明了 `@updateURL`，三端安装后会自动跟随本仓库更新。

## 多端使用

三端可同时安装，但**同一时刻只允许一端开启执行开关**。
脚本无法检测其他终端是否在运行，两端同时执行会导致编队被并发覆盖。
切换终端时，先手动关闭前一端。

## 文档

- [需求规格](docs/01-需求规格.md) —— 做什么、不做什么
- [架构设计](docs/02-架构设计.md) —— 五层结构与防膨胀规则
- [变更日志](docs/03-变更日志.md) —— 改动记录
- [开发契约](CONTRIBUTING.md) —— 六步流程，动手前必读

## 状态

开发中，尚未发布可用版本。
# zg-auto
