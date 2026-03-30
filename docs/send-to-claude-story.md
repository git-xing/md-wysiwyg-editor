# "发送到 Claude" 功能开发全纪录

> 这是 markdownView 项目开发过程中最曲折的一个功能。
> 从 2026-03-17 到 2026-03-22，历经 7 个阶段，5 个主要 Bug，才最终完成。
> 本文记录完整的问题发现→失败→顿悟→解决过程，可用于演示分享。

***

## 功能目标

在 Markdown 编辑器中选中一段文字，点击浮动工具栏的"发送到 Claude"按钮，让 Claude VSCode 扩展的聊天面板自动打开，并插入一个 `@文件路径#起始行-结束行` 的引用 mention，方便用户就这段内容向 Claude 提问。

***

## 第一阶段：最简单的想法

### 初始方案

功能按钮做好了，触发逻辑用的是 VSCode 内置命令：

```typescript
await vscode.commands.executeCommand('workbench.action.chat.open', {
  query: `@${relPath}\n\n${selectedText}`
});
```

**结果：** Chat 面板确实打开了，但 `query` 参数完全没效果——面板里是空的。

**判断：** VSCode 内置 Chat 可能不接受 `query` 参数，或者参数格式不对。放弃这条路。

***

## 第二阶段：找到正确的命令

### 发现 `insertAtMention`

用户在 VSCode 按键绑定里发现了 Claude 扩展注册的快捷键 `Option+K`，对应命令：

```
claude-vscode.insertAtMention
```

这才是正确入口！格式应该是 `@src/file.md#103-105`。

### 参数格式的四次尝试

```typescript
// 尝试 1：文件路径字符串
executeCommand('claude-vscode.insertAtMention', relPath)          // ❌ 无效

// 尝试 2：@ 前缀字符串
executeCommand('claude-vscode.insertAtMention', `@${relPath}`)   // ❌ 无效

// 尝试 3：带行号的字符串
executeCommand('claude-vscode.insertAtMention', `@${relPath}#${line}-${line}`)  // ❌ 无效

// 尝试 4：对象格式（其他 AI 建议）
executeCommand('claude-vscode.insertAtMention', {
  uri: document.uri.toString(),
  line: startLine - 1,
  character: 0,
  endLine: endLine - 1,
  displayText: `@${relPath}#${startLine}-${endLine}`
})  // ❌ 还是无效
```

每次都返回 `undefined`，命令好像执行了，但什么都没发生。没有报错，没有 UI 变化。

**陷入迷茫**：参数格式没问题，但就是不工作。

***

## 第三阶段：发现根本原因（ 深入调试）

### 关键顿悟

深入分析 Claude VSCode 扩展的行为规律后，发现了问题所在：

```javascript
// Claude 扩展 insertAtMention 的内部逻辑（反推）
let editor = window.activeTextEditor;
if (!editor) return;   // ← 问题在这里！
```

**根本原因：**

markdownView 使用的是 VSCode 的 `CustomEditorProvider`（WebView 自定义编辑器）。这类编辑器**不会**设置 `window.activeTextEditor`——它是 WebView，不是文本编辑器。

当 `window.activeTextEditor` 为 `undefined` 时，`insertAtMention` 命令直接返回，什么都不做。

这是 VSCode API 的设计限制，无法直接绕过。

### 为什么之前一直看不出来

* 命令调用没有报错（不会 throw）

* 返回值是 `undefined`（正常命令也返回 undefined）

* Claude 面板不给出任何失败提示

***

## 第四阶段：创意解法——临时文本编辑器

### 突破思路

既然 `activeTextEditor` 必须有值，那就**临时创造一个**：

1. 用 `vscode.window.showTextDocument()` 在同一列打开同一个 `.md` 文件的文本编辑器（此时 `activeTextEditor` 有值了）
2. 用 `editor.selection` 把选区设置到目标行号
3. 调用 `claude-vscode.focus`（它会读取 `activeTextEditor` 的文件和选区位置，自动插入正确的 `@file#line-line` mention）
4. 关闭临时文本编辑器（通过 `vscode.window.tabGroups` API 只关掉文本类型的 tab，不影响 WebView）

```typescript
// 核心实现
const tempEditor = await vscode.window.showTextDocument(document.uri, {
  viewColumn: webviewPanel.viewColumn,   // 同一列，不开新窗
  preview: false,                         // 不用预览模式
  preserveFocus: false,
});

// 设置选区到目标行
const startPos = new vscode.Position(startLine - 1, 0);
const endPos = new vscode.Position(endLine - 1, 0);
tempEditor.selection = new vscode.Selection(startPos, endPos);

// 调用 Claude focus（此时 activeTextEditor 有值）
await vscode.commands.executeCommand('claude-vscode.focus');

// 延迟关闭临时编辑器
setTimeout(async () => {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText &&
          tab.input.uri.toString() === document.uri.toString()) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
  webviewPanel.reveal();  // 恢复 WebView 焦点
}, 500);
```

**结果：Claude 面板打开，插入了正确的** **`@sample.md#15-18`！**

***

## 第五阶段：三个后续 Bug

### Bug 1：Claude 面板已打开时，第二次发送失败

**现象：** 第一次发送成功，关掉 Claude 面板后再发送失败。

**根因：** 流程中 `claude-vscode.openLast`（或 `focus`）打开 Claude 面板时会抢走焦点，导致 `activeTextEditor` 再次变成 `undefined`，后续的 `insertAtMention` 失效。

**修复：** 在调用前检测 Claude 面板状态：

```typescript
// 检测 Claude 面板是否已打开
const claudeOpen = vscode.window.tabGroups.all.some(g =>
  g.tabs.some(t => (t.input as any)?.viewType?.includes('claudeVSCodePanel'))
);

if (claudeOpen) {
  // 已打开：直接 focus，不需要 openLast
  await vscode.commands.executeCommand('claude-vscode.focus');
} else {
  // 未打开：先 openLast，等面板加载，再激活文本编辑器，再 insertAtMention
  await vscode.commands.executeCommand('claude-vscode.openLast');
  await delay(700);
  // ... 重新激活临时文本编辑器 ...
}
```

### Bug 2：发送时编辑器窗口闪烁

**现象：** 点击发送按钮，右侧突然出现一列新的文本编辑器，像闪烁一样。

**根因：** 最初临时打开文本编辑器用的是 `ViewColumn.Beside`（在旁边创建新列），每次都产生一个新列。

**修复：** 改为 `viewColumn: webviewPanel.viewColumn`（同一列内切换 tab），不产生新列。

### Bug 3：发送的行号与文件实际行号不符

**现象：** 选中第 15 行的文字，Claude 里显示 `@sample.md#8-8`（差了好几行）。

**根因：**

* ProseMirror 内部用位置（pos）计数，块之间的分隔符只算 1 个字符

* 但 Markdown 文件里段落之间有**空行**（2 个换行）

* 用 `textBetween(0, pos, '\n')` 统计换行数时，空行被漏掉了

* 结果：ProseMirror 计算出的行号 < 文件实际行号，偏差会随空行数量累积

**临时方案（后来发现有缺陷）：**
在扩展侧拿到行号后，搜索文件内容，用选中文字的第一行在 ±30 行范围内找最近匹配，用文件中的真实行号替换。

**缺陷：** 文档里有重复文本时会误匹配到错误位置。

***

## 第六阶段：彻底解决行号——lineMap

### 方案设计

不在扩展侧搜索（搜索天然容易出错），从根本上建立精确映射。

**核心思路：** 在加载文件时，计算一个 `lineMap` 数组：

* 索引 `i` = Milkdown/ProseMirror 文档里第 `i` 个顶层块（段落、标题、代码块…）

* 值 = 该块在**原始 Markdown 文件**中的起始行号（1-based）

```
lineMap = [1, 3, 8, 9, 15, 25, ...]
           ↑   ↑   ↑       ↑
         第1块 第2块 第3块  第5块的文件行号
```

### 实现链路

```
Extension（加载文件时）
  → 解析 Markdown 块边界
  → 计算 lineMap[]
  → 随 {type:'init', content, lineMap} 传给 WebView

WebView（收到 init）
  → 缓存 lineMap

WebView（点击"发送到 Claude"）
  → $from.index(0) 获取选区起始块的顶层索引
  → lineMap[startBlockIdx] → 精确的文件行号
  → 不需要搜索、不需要正则，直接查表
```

**优势：**

* 完全基于原始文件结构，不受编辑器内部格式影响

* 未保存的编辑不影响行号准确性（lineMap 对应磁盘文件）

* 消除了所有行号偏差

***

## 第七阶段：Option+K 快捷键

有了 lineMap 基础后，扩展支持了 `Option+K` 快捷键：

* 在 WebView 中捕获 `altKey + k`（注意：需用 `e.code === 'KeyK'` 而非 `e.key === 'k'`，否则 macOS 下中文输入法会拦截）

* 不需要选区——直接获取光标所在顶层块的完整内容

* 用 `lineMap` 查到块的行号范围，走相同的发送流程

***

## 第八阶段：终端 Claude 优先

### 新需求的提出

lineMap 解决了行号问题后，用户提出了另一个场景：

> "当用户没有使用 VSCode 里的 Claude 扩展，而是在 VSCode 终端中使用 claude CLI，我们能不能把 `@sample.md#23` 发送到终端输入框？"

**设计目标：** 优先发到终端 Claude，没有再发到 VSCode 插件 Claude。

***

### 第一次尝试：用终端名称判断

最直观的想法：检查终端的 `name` 属性，名字里有 `claude` 就认为是 Claude 终端。

```typescript
const claudeTerminal = vscode.window.terminals.find(
  t => /\bclaude\b/i.test(t.name)
);
```

**问题：** `terminal.name` 是用户自己设置的标签名，不反映正在运行的命令。用户可以把 zsh 终端命名为 `claude`，也可以把真实的 claude 终端命名为 `dev`。这个方案不可靠。

***

### 第二次尝试：Shell Integration 事件监听

VSCode 1.80+ 提供了 Shell Integration API，可以监听终端里的命令执行：

```typescript
// extension.ts
const claudeTerminals = new Set<vscode.Terminal>();

vscode.window.onDidStartTerminalShellExecution(e => {
  if (e.execution.commandLine.value.trim().startsWith('claude')) {
    claudeTerminals.add(e.terminal);
  }
});
vscode.window.onDidEndTerminalShellExecution(e => {
  claudeTerminals.delete(e.terminal);
});
```

运行时保持一个 `claudeTerminals` 集合，发送时取最后一个。

**问题：** 如果用户在扩展**加载之前**就已经打开了 claude，`onDidStart` 事件早已触发并错过，集合永远是空的。

用户反馈：

> 打开了终端，有在用 claude，但路径还是被传入了 Claude 扩展中。`claudeTerminals` 打印的是空集合。

***

### 关键发现：`state.shell` 字段

调试时用户打印出了两种终端的完整对象结构：

**普通 zsh 终端：**

```json
{
  "name": "zsh",
  "state": {
    "isInteractedWith": false,
    "shell": "zsh"          ← 有 shell 字段
  }
}
```

**Claude CLI 终端（v2.1.80）：**

```json
{
  "name": "2.1.80",
  "state": {
    "isInteractedWith": true
                            ← 没有 shell 字段！
  }
}
```

**关键区别：** 普通 shell（zsh/bash/fish）运行时，VSCode 能识别 shell 类型并写入 `state.shell`。Claude CLI 不是标准 shell，VSCode 无法识别，所以 `state.shell` 缺失。这是区分 claude 终端与普通终端最可靠的特征。

***

### 最终实现：三级优先策略

```typescript
// 判断是否为 Claude-like 终端（state.shell 缺失）
const isClaudeLikeTerminal = (t: vscode.Terminal): boolean =>
    !(t.state as { shell?: string }).shell;

// 三级查找
const claudeTerminal =
    [...this.claudeTerminals].at(-1)                              // ① ShellIntegration 动态检测
    ?? vscode.window.terminals.find(isClaudeLikeTerminal)         // ② state.shell 缺失的终端
    ?? undefined;                                                  // ③ 不兜底到 activeTerminal
```

注意：最初有第三级兜底 `vscode.window.activeTerminal`（当前焦点终端），但这太宽泛了——用户如果在普通终端里工作，就会把内容错误地发到 zsh 里。最终去掉了这级兜底。

**发送逻辑：**

```typescript
if (claudeTerminal) {
  // 路径 A：有 claude 终端，直接 sendText
  claudeTerminal.show();
  claudeTerminal.sendText(`@${relPath}#${startLine}-${endLine}`, false);
  // false = 不自动回车，让用户看到内容后手动确认
} else {
  // 路径 B：没有终端 claude，走 VSCode 插件方案
  await this._sendToClaudePlugin(document, webviewPanel, startLine, endLine);
}
```

***

### 顺带修复：代码结构重构

这轮改动也暴露了 `sendToClaudeChat` 的 handler 代码嵌套层级过深。趁机重构：

```typescript
// 重构前：switch case 里 50+ 行嵌套代码
case "sendToClaudeChat":
  if (message.text) {
    // ...大量嵌套逻辑...
  }

// 重构后：3 行调用，逻辑移到私有方法
case "sendToClaudeChat":
  if (message.text) {
    await this._handleSendToClaudeChat(
      document, webviewPanel, message.text, message.startLine, message.endLine
    );
  }
```

***

## 技术总结

### 完整问题演进图

```
workbench.action.chat.open      ← query 参数无效，放弃
         ↓
claude-vscode.insertAtMention   ← 命令存在，但调用无效果
         ↓
参数格式猜测（4次尝试）          ← 全部无效
         ↓
发现根因：activeTextEditor = undefined（CustomEditorProvider 限制）
         ↓
创意解法：临时文本编辑器         ← 成功！但又引出 3 个新 Bug
         ↓
Bug 修复：面板状态检测/同列切换/行号搜索
         ↓
行号搜索方案有缺陷（重复文本误匹配）
         ↓
lineMap 精确映射                 ← 行号问题彻底解决
         ↓
新需求：优先发终端 Claude
         ↓
终端名称判断                     ← 不可靠（用户可改名）
         ↓
ShellIntegration 事件监听        ← 漏掉扩展加载前的终端
         ↓
发现 state.shell 缺失特征        ← 可靠区分 claude vs shell
         ↓
三级优先策略（动态检测→特征检测→无兜底）← 最终方案
```

### 核心 API 知识点

| 知识点                     | 内容                                                                         |
| ----------------------- | -------------------------------------------------------------------------- |
| CustomEditorProvider 限制 | WebView 不设置 `window.activeTextEditor`，依赖它的插件命令会静默失败                        |
| TabGroups API           | `vscode.window.tabGroups` 可按类型（`TabInputText` / `TabInputCustom`）枚举并关闭 tab |
| ProseMirror 行号          | 块节点分隔符 ≠ Markdown 文件换行，需要额外 lineMap 做映射                                    |
| Shell Integration API   | `onDidStartTerminalShellExecution` 可检测终端命令，但只能捕获注册后的事件                     |
| Claude 终端识别             | `state.shell` 缺失是 Claude CLI 终端的可靠特征（普通 shell 都有此字段）                       |

### 最终完整架构

```
用户选中文字并点击"发送到 Claude" / 按 Option+K
         ↓
WebView: 查 lineMap → startLine / endLine
         ↓
发消息 {type:'sendToClaudeChat', text, startLine, endLine}
         ↓
Extension._handleSendToClaudeChat()
         ↓
    ┌────────────────────────────────┐
    │  有 claude 终端？              │
    │  ① claudeTerminals Set 最后一个│
    │  ② state.shell 缺失的终端     │
    └────────────┬───────────────────┘
                 │
       ┌─────────┴──────────┐
       ↓ 有                 ↓ 无
  terminal.show()      临时文本编辑器
  terminal.sendText(   + 设置选区
   `@path#start-end`,  + claude-vscode.focus
   false               + 关闭临时 tab
  )                    + webviewPanel.reveal()
```

***

## 开发感悟

这个功能的难点不在于代码量，而在于**信息不对称**：VSCode 的 `CustomEditorProvider` 与普通文本编辑器有一个不起眼的差异（`activeTextEditor` 是否被设置），但这个差异导致了整条调用链的静默失败——没有报错，没有异常，只是什么都不发生。

终端 Claude 的识别问题同样如此。`state.shell` 缺失这个特征，是在打印出完整对象结构后才"看见"的——不是文档告诉你的，是通过观察实际数据发现的。

三个核心设计原则在这个功能里得到充分体现：

1. **从源头保证数据正确**，而非事后修复（lineMap vs 行号搜索）
2. **在现有 API 约束内找空间**，而非修改不可控的第三方（临时文本编辑器）
3. **特征检测优于名称约定**（`state.shell` 缺失 vs 终端名字匹配）
