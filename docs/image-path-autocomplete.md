# 图片路径智能提示功能 — 可行性计划

> 状态：待实现（后续会话）

## 功能目标

在 WYSIWYG 编辑器中，当用户输入特定触发字符时，自动弹出项目内图片文件的补全列表（含缩略图预览），选中后直接插入 `![alt](./images/foo.png)` 语法——体验类似 VS Code 里的文件路径自动补全。

---

## 可行性分析

### 方案 A：Milkdown InputRule（推荐）

**原理**：ProseMirror 的 `inputRules` 插件可以监听输入模式。当用户输入 `![` 时触发一个自定义 InputRule，显示浮动补全列表。

**优点**：
- 无需侵入 Milkdown 核心插件，以 `$useKeymap` 或自定义 plugin 形式添加
- 触发时机精准，在 `![` 输入后立即响应

**缺点**：
- InputRule 通常用于"匹配后自动替换"，弹出 UI 需要额外处理
- 需要阻止默认行为并手动管理浮动列表的生命周期

### 方案 B：ProseMirror Plugin + keydown 监听（备选）

**原理**：注册一个 ProseMirror Plugin，在 `handleKeyDown` 里检测到 `[` 且前一字符为 `!` 时触发补全。或者，检测括号 `(` 内的路径输入（类似文件 import 提示）。

**优点**：更灵活，可以随输入实时过滤列表

**缺点**：需要精心处理选区位置、列表定位、键盘导航等

### 最终推荐

**方案 A + Extension 提供图片列表**，具体流程：

```
用户输入 "!["
  → ProseMirror Plugin 检测到触发
  → 向 Extension 发送 getProjectImages 消息
  → Extension 扫描 workspace 内所有图片文件
  → 返回 [{relPath, webviewUri}] 列表
  → WebView 显示浮动补全列表（含缩略图）
  → 用户上下键导航，Enter 选中
  → 插入 "![alt](relPath)" 并关闭列表
```

---

## 实现步骤

### 第一步：Extension 提供图片列表

**`webview/messaging.ts`** 新增：
```typescript
export function notifyGetProjectImages(id: string): void {
  vscode.postMessage({ type: 'getProjectImages', id });
}
// IncomingMessage 新增：
| { type: 'projectImagesList'; id: string; images: Array<{relPath: string; webviewUri: string}> }
```

**`src/MarkdownEditorProvider.ts`** 新增 case：
```typescript
case "getProjectImages": {
    const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const searchUri = wsFolder?.uri ?? vscode.Uri.joinPath(document.uri, '..');
    // 递归查找所有图片文件（glob）
    const pattern = new vscode.RelativePattern(searchUri, '**/*.{png,jpg,jpeg,gif,webp,svg,bmp}');
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 200);
    const mdDir = path.dirname(document.uri.fsPath);
    const images = files.map(f => {
        const rel = path.relative(mdDir, f.fsPath).replace(/\\/g, '/');
        const relPath = rel.startsWith('.') ? rel : './' + rel;
        return { relPath, webviewUri: panel.webview.asWebviewUri(f).toString() };
    });
    panel.webview.postMessage({ type: 'projectImagesList', id: message.id, images });
    break;
}
```

### 第二步：WebView 补全组件

新建 **`webview/imageComplete.ts`**：
- `ImageCompleter` 类，接收 `getEditorView` 和 `onGetImages` 回调
- 注册一个 ProseMirror Plugin：
  - 检测 `![` 输入（通过 `appendTransaction` 或 `handleTextInput`）
  - 触发时：① 调用 `onGetImages()` 获取图片列表 ② 创建浮动 `<div>` 定位到光标下方 ③ 渲染带缩略图的列表
- 浮动列表：
  - `<img>` 缩略图（30×30）+ 路径文字
  - 上下键导航（`keydown` 拦截，`ArrowUp/Down/Enter/Escape`）
  - 鼠标 hover 高亮
  - 选中后插入 `![](relPath)` 并将光标定位到 alt 位置
- 实时过滤：用户继续输入时，过滤列表内容（搜索 `relPath`）

### 第三步：集成到 editor.ts

在 Milkdown 编辑器初始化时注入 `ImageCompleter` 作为 ProseMirror Plugin。

### 第四步：CSS

`.img-complete-list`：绝对定位，`z-index: 9990`，最多显示 8 条，可滚动
`.img-complete-item`：flex 横排，缩略图 + 路径
`.img-complete-item--active`：高亮背景

---

## 文件列表

| 文件 | 改动类型 |
|------|---------|
| `webview/imageComplete.ts` | 新建 |
| `webview/editor.ts` | 注入 Plugin |
| `webview/messaging.ts` | 新增消息类型 |
| `src/MarkdownEditorProvider.ts` | 新增 getProjectImages case |
| `webview/style.css` | 新增 .img-complete-* |
| `src/webviewTranslations.ts` | 无需新增（路径直接显示） |

---

## 已知风险

1. **扫描耗时**：大型项目图片可能超过 200 个，需要加 `maxResults` 限制并按最近修改时间排序
2. **相对路径**：图片在 workspace 子目录或父目录时，相对路径计算需要特别处理 `../` 前缀
3. **ProseMirror Plugin 与 Milkdown 兼容性**：需要通过 `$addPlugin` 接口注入，不能直接修改 `EditorState`
4. **WebviewUri 映射**：选中的图片 src 插入 editor 后，保存时需走现有 `_prepareContentForSave` 逻辑替换为 relPath——因此补全插入的 src 需要是 webviewUri 而非 relPath
