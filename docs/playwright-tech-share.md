# Playwright 技术分享



## 〇、TL;DR

> **Playwright 是微软开源的「跨浏览器自动化框架」**，一套 API 同时驱动 Chromium / Firefox / WebKit，主打**自动等待**、**多语言支持**、**强大的调试工具链**。它既能写端到端测试，也能做 UI 自动化、爬虫、截图/录屏。
>
> 👉我们这个项目已经用它跑通了**对 VSCode Electron 扩展 + 内嵌 WebView 的 E2E 测试**——这是连 Cypress 都做不到的场景。

---

## 一、Playwright 是什么

### 1.1 核心定位

Playwright 是微软在 2020 年开源的**端到端浏览器自动化框架**（由原 Puppeteer 团队主力打造）。它的目标是：**用一套代码，可靠地驱动所有主流浏览器内核完成自动化操作**。

### 1.2 主要能力

| 能力 | 说明 |
|------|------|
| **跨浏览器** | 一套 API 驱动 **Chromium**（Chrome/Edge）、**Firefox**、**WebKit**（Safari 内核） |
| **跨平台 & 跨语言** | 官方支持 **TypeScript/JavaScript、Python、Java、.NET**；Windows/macOS/Linux/CI 通吃 |
| **自动等待（Auto-wait）** | 操作元素前自动等待其「可见、可点、稳定、未被遮挡」，**几乎告别手写 sleep** |
| **强隔离 Context** | `BrowserContext` 类似「无痕窗口」，多用户/多会话并行互不污染，启动开销极低 |
| **网络拦截** | 可拦截/篡改/Mock 任意请求，前端可脱离后端独立测试 |
| **多端覆盖** | 移动端模拟（视口/UA/触摸/地理位置）、文件上传下载、多 Tab、iframe、Shadow DOM |
| **调试利器** | **Codegen**（录制生成脚本）、**Trace Viewer**（时间旅行式调试）、**UI Mode**、**Inspector** |

### 1.3 典型特性

- ✅ **Auto-wait + Web-first 断言**：`await expect(locator).toBeVisible()` 会自动轮询重试，不再有「偶发性闪退」的 flaky 测试。
- ✅ **Locator 惰性定位**：`page.locator()` 返回的是「查询描述」而非「当前快照」，每次操作重新求值，天然抗 DOM 重渲染。
- ✅ **开箱即并行**：测试默认按文件并行，配合 worker 进程横向扩展。
- ✅ **Trace Viewer**：失败时回放每一步的 DOM 快照、网络、控制台、截图，**CI 上的疑难杂症定位神器**。

---

## 二、应用场景

### 2.1 端到端（E2E）测试 —— 最主流场景

模拟真实用户走完整业务流：登录 → 下单 → 支付 → 查看订单。验证的是「用户真实看到/点到的东西」，而非单元测试里的函数返回值。

### 2.2 UI 自动化 / 回归测试

每次发版前自动跑一遍关键路径，配合**视觉回归**（`toHaveScreenshot()` 像素级比对）拦截「样式被改崩」。

### 2.3 爬虫 / 数据抓取

面对**重 JS 渲染的 SPA**（React/Vue 站点），传统 HTTP 爬虫拿到的是空壳 HTML，而 Playwright 跑的是真实浏览器，能拿到渲染后的完整 DOM；还能处理登录态、滚动加载、反爬交互。

### 2.4 自动化脚本 / RPA

批量截图、自动签到、生成 PDF、定时巡检页面可用性等重复性 Web 操作。


### 2.5 ：VSCode 扩展 E2E 测试
这是一个\*\*「非典型但极有说服力」\*\*的场景。我们的项目是一个 VSCode 自定义 Markdown 编辑器扩展，UI 渲染在 VSCode 的 WebView（iframe）里。难点在于：

1. 被测对象不是普通网页，而是 **Electron 应用（VSCode 本体）**；
2. 真正要测的 UI，藏在 **嵌套 iframe（vscode-webview）** 里。


```ts
// e2e/helpers/vscode.ts —— 用 Playwright 直接启动 VSCode（Electron）
import { _electron as electron } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const binary = await downloadAndUnzipVSCode('stable');
const app = await electron.launch({
    executablePath: binary,
    args: [
        '--extensionDevelopmentPath', process.cwd(), // 加载本扩展
        workspacePath,
    ],
});
const win = await app.firstWindow();        // 拿到 VSCode 主窗口
```

```ts
// 在嵌套 frame 中找到我们扩展的 WebView 内容区
export async function findContentFrame(win: Page): Promise<Frame> {
    for (const frame of win.frames()) {
        if (frame.url().includes('vscode-webview')) {
            const child = frame.childFrames()[0] ?? frame;
            const hasToc = await child.evaluate(
                () => !!document.querySelector('.toc-panel')
            ).catch(() => false);
            if (hasToc) return child;        // 命中扩展 UI 所在 frame
        }
    }
    throw new Error('找不到扩展的 WebView frame');
}
```

```ts
// e2e/tests/features/toc-overlay.spec.ts —— 像测网页一样测扩展 UI
test('TOC 面板结构正确', async ({ contentFrame }) => {
    const info = await contentFrame.evaluate(() => ({
        hasPanel: !!document.querySelector('.toc-panel'),
        hasTab: !!document.querySelector('.toc-toggle-tab'),
    }));
    expect(info.hasPanel).toBe(true);
    expect(info.hasTab).toBe(true);
});
```


---

## 三、工作原理

### 3.1 整体架构：单 WebSocket 长连接 + 协议驱动

```
┌─────────────────┐   单条 WebSocket 长连接    ┌──────────────────────┐
│  你的测试脚本    │ ────────────────────────► │  Playwright Server    │
│ (TS/Py/Java...) │ ◄──────────────────────── │  (Node 进程)          │
└─────────────────┘     双向消息 / 事件         └──────────┬───────────┘
                                                            │ 各内核的调试协议
                                          ┌─────────────────┼─────────────────┐
                                          ▼                 ▼                 ▼
                                      Chromium           Firefox            WebKit
                                      (CDP)           (patched proto)   (patched proto)
```

关键设计：

- **客户端 ↔ Server 走一条 WebSocket 长连接**，所有命令和事件都在这条管道上多路复用。相比 Selenium 经典的「每个动作一次 HTTP 请求/响应」，**延迟更低、能实时接收浏览器事件**。
- **Server ↔ 浏览器**：Chromium 走标准 **CDP（Chrome DevTools Protocol）**；Firefox 和 WebKit 则由微软**打了补丁、内置了对应的调试协议**——这正是它能「真正跨内核」的根基（Puppeteer 早期只懂 CDP，所以只支持 Chromium）。

### 3.2 自动等待（Auto-wait）机制

执行 `locator.click()` 时，Playwright 不会立刻点，而是先轮询检查一组**可操作性条件（actionability checks）**：

1. 元素已**附加到 DOM**（attached）
2. **可见**（visible，非 `display:none`）
3. **稳定**（stable，两帧之间位置不再移动，即动画结束）
4. **能接收事件**（未被其他元素遮挡，命中测试通过）
5. **可交互**（enabled，非 disabled）

全部满足才执行动作；超时（默认 30s）则报错。**这就是为什么 Playwright 几乎不需要手写 `sleep`，flaky 率天然很低。**

> ⚠️ 对比项目里偶尔出现的 `waitForTimeout(3000)`：那是**等待 VSCode/扩展冷启动**这种「无明确 DOM 信号」的特殊场景的妥协；常规元素交互完全靠 auto-wait 即可，不应滥用固定等待。

### 3.3 Locator：惰性、可重入的元素引用

```ts
const tocTab = contentFrame.locator('.toc-toggle-tab');
await tocTab.click();   // 此刻才真正去 DOM 里查询 + 等待 + 点击
```

`locator()` 返回的是一个「**如何找到元素的描述**」，而不是某一时刻的元素快照。每次 `.click()` / `.isVisible()` 都会**重新求值**。因此即使页面重渲染、元素被替换，引用依然有效——这解决了 Selenium 时代经典的 `StaleElementReferenceException`。

### 3.4 Web-first 断言

```ts
await expect(locator).toBeVisible();   // 内置轮询重试，直到通过或超时
```

断言本身带重试，把「等待」和「校验」合二为一，进一步消灭竞态。

---

## 四、同类技术对比

### 4.1 总览表

| 维度 | **Playwright** | **Selenium** | **Cypress** | **Puppeteer** |
|------|----------------|--------------|-------------|---------------|
| 出品方 | Microsoft | 开源社区 / W3C | Cypress.io | Google |
| 跨浏览器 | ✅ Chromium/FF/WebKit | ✅ 最全（含真机/云） | ⚠️ Chrome 系为主，FF/WebKit 较弱 | ❌ 仅 Chromium（FF 实验性） |
| 多语言 | ✅ TS/JS/Py/Java/.NET | ✅ 最多语言 | ❌ 仅 JS/TS | ❌ 仅 JS/TS |
| 通信原理 | WS 长连接 + CDP/补丁协议 | W3C WebDriver（HTTP） | 运行在浏览器**内部** | CDP |
| 自动等待 | ✅ 内置强大 | ❌ 需手写显式/隐式等待 | ✅ 内置 | ⚠️ 较弱，常需手写 |
| 速度 | 🚀 快 | 🐢 较慢（HTTP 往返） | 🚀 快 | 🚀 快 |
| 调试体验 | ✅ Trace/UI Mode/Codegen | ⚠️ 一般 | ✅ 极佳（时间旅行 UI） | ⚠️ 一般 |
| 并行 | ✅ 原生免费 | ✅ 需 Grid | ⚠️ 免费版串行，并行需付费 Dashboard | 需自己搭 |
| iframe/多Tab | ✅ 一流 | ✅ 支持 | ❌ 痛点（多 Tab/跨域 iframe 受限） | ✅ 支持 |
| 网络拦截 | ✅ 强 | ⚠️ 弱 | ✅ 支持 | ✅ 支持 |
| 定位 | E2E / 自动化 / 爬虫 | 通用、生态成熟、企业标配 | 前端开发者友好的 E2E | 偏 Chrome 自动化/爬虫 |







---

## 五、Playwright vs Browser-use（传统框架 vs AI 浏览器代理）

> 这是两个**不同物种**，不是替代关系，而是「确定性脚本」与「智能体决策」的分层。

### 5.1 Browser-use 是什么

Browser-use 是一个让 **LLM（大模型）驱动浏览器**的开源库：你给它一句**自然语言目标**（如「帮我在 GitHub 搜索 playwright 并打开第一个仓库」），它把当前页面的可交互元素提取出来喂给 LLM，由 LLM **决策下一步点哪里、输入什么**，循环执行直到完成任务。底层的浏览器操作，恰恰**就是用 Playwright 来执行的**。

```
Browser-use = LLM（大脑：理解目标 + 规划决策）
            + Playwright（手脚：实际点击/输入/导航）
```

### 5.2 核心差异对比

| 维度 | **Playwright** | **Browser-use** |
|------|----------------|-----------------|
| 本质 | 确定性自动化框架 | 基于 LLM 的智能浏览器 Agent |
| 驱动方式 | 程序员写明确脚本（点 A 填 B） | 给自然语言目标，AI 自主决策 |
| 确定性 | ✅ 高，每次结果一致 | ⚠️ 不确定，依赖模型推理，可能跑偏 |
| 速度/成本 | 🚀 快，几乎零额外成本 | 🐢 慢，每步要调 LLM，有 Token 费用 |
| 对页面改版的鲁棒性 | ⚠️ 选择器变了要改脚本 | ✅ 语义理解，UI 小改动也能适应 |
| 可调试/可重放 | ✅ Trace Viewer 精确复现 | ⚠️ 决策链路是黑盒，较难复现 |
| 适用场景 | 回归测试、CI、稳定流程自动化 | 探索性任务、流程多变、一次性/无固定脚本的操作 |

### 5.3 怎么选 / 怎么配合

- **要稳定、可重复、跑在 CI 里的测试** → **Playwright**。我们项目的 E2E 就该用它。
- **目标模糊、页面经常变、需要"理解语义"完成一次性任务**（如自动调研、跨站信息收集） → **Browser-use** 这类 AI Agent。
- **二者可叠加**：用 Browser-use 探索并「录」出一条可行路径，再固化成 Playwright 稳定脚本进 CI；或让 Agent 在 Playwright 兜底的可控环境里运行。





























---









