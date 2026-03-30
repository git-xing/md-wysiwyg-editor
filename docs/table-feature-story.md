# 表格功能开发历程

> 本文档整理了 markdownView 扩展中表格插入线、拖拽 handle、多格选中等功能的完整开发历程，
> 包括需求背景、实现思路、踩过的坑和最终解决方案。
>
> 信息来源：开发日志（`docs/devlog.md` [003]~[025]）+ 对话历史记录（JSONL）。

---

## 一、功能概述

最终实现的表格功能包括：

| 功能 | 文件 | 说明 |
|------|------|------|
| 表格插入线 | `webview/tableAddButtons.ts` | 鼠标悬浮在行/列边框时显示绿色高亮线和 `+` 图标，点击插入行/列 |
| 拖拽 handle | `webview/tableHandles.ts` | 鼠标悬浮表格时在行首/列首显示 ⠿ 图标，单击选中行/列，拖拽重排 |
| 表格工具栏 | `webview/tableToolbar.ts` | 选中整行/列后浮动工具栏显示对齐方式、删除等选项 |
| 多格选中 | `webview/editor.ts` (cellClickFixPlugin) | 支持 Excel 式跨格拖拽选中（CellSelection），单击则定位光标 |

---

## 二、初始需求（2026-03-17）

用户的原始设计描述（来自对话记录）：

> 设计 markdown 表格交互，可以拖拽选中表格，类似 excel 中的选择交互效果，当有选择表格时，一样会有弹框，会多一些选项（对齐方式 icon、删除 icon）。
> 当鼠标悬浮在表格里单元格内 x 轴最左边 / y 轴最上边显示一个拖拽 icon，单击是选择该 x 或 y 轴的表格，拖拽是拖拽该 x/y 轴的表格移动。
> 当鼠标悬浮在表格边框上，把该 x/y 轴的边框加粗，并在 x/y 轴边界上显示插入图标（± 行/列）。

**关键技术决策**：基于 Milkdown（底层 ProseMirror）+ prosemirror-tables 实现，不引入外部表格 UI 库。这带来了大量与 ProseMirror 内部机制的深度博弈。

---

## 三、第一阶段：基础表格交互（[003] 2026-03-17~19）

### 3.1 涉及文件

`webview/tableHandles.ts`、`webview/tableAddButtons.ts`、`webview/tableToolbar.ts`、`webview/selectionToolbar.ts`、`webview/style.css`

### 3.2 实现思路

**插入线（tableAddButtons.ts）**

- 在编辑器容器上监听 `mousemove`，计算鼠标是否靠近表格某行/列的边框
- 在靠近时动态定位一个绝对定位的 overlay 元素（`.table-add-line--h/v`），显示为绿色高亮线
- 线的端点附近放一个 `+` 图标按钮
- 点击 `+` 调用 prosemirror-tables 的 `addRowAfter` / `addColumnAfter` 命令

**拖拽 handle（tableHandles.ts）**

- 同样监听 `mousemove`，鼠标进入表格区域时，在行首/列首渲染 ⠿ 图标
- `mousedown` 记录拖拽起点，`mousemove` 实时显示拖拽占位线，`mouseup` 执行行/列移位
- 单击（无位移）则触发整行/列 CellSelection 高亮

**选中高亮**

- 选中行/列后用 CSS `background-color` 绿色 + 边框高亮
- 浮动工具栏（`selectionToolbar.ts`）监听 ProseMirror selection change，显示格式/发送/对齐等操作

### 3.3 视觉迭代过程

这个阶段视觉方案改了很多次：

```
初版：绿色背景（选中）
↓ 用户反馈"没有边框感觉像没有表格"
加绿色边框
↓ 边框与插入线冲突，视觉混乱
去掉边框，只保留背景
↓ 用户反馈"效果也不太好，还是要边框"
最终：绿色背景 + 绿色边框 + 绿色插入线（统一色调）
```

### 3.4 主要 Bug

| 编号 | 问题 | 根因 | 解决 |
|------|------|------|------|
| B010 | 表格选中样式不明显 | 背景色不够突出 | 浅绿色背景 + 绿色边框 |
| B011 | 离开表格后选中消失 | 选中状态被意外清除 | 修改逻辑保持状态直到主动取消 |
| B012 | 对齐 icon 显示条件错误 | 行/列区分判断缺失 | 仅整列选中时显示 |
| B013 | 插入线触发面积过小 | hover 判定区域太窄 | 扩大判定面积 |
| B014 | 新增行/列后无选中状态 | 新增后未设置选中 | 新增后直接设选中 |
| B015 | 斑马条纹与表头冲突 | 表头与第一行同色 | 表头单独设背景色 |
| B017 | 拖拽 icon 鼠标无法移入 | hover 事件层级冲突 | 修复鼠标事件层级 |
| B018 | 选中表头删除报错 undefined | 删除逻辑未处理 undefined | 增加 null 检查 |

---

## 四、插入线闪烁问题（[007] 2026-03-22）

### 4.1 问题描述

鼠标在绿色边框（选中高亮）和插入线之间来回移动时，绿色边框会瞬间消失，造成明显闪烁。

用户原话：
> 表格选中后把鼠标移入插入线上选中表格的边框会隐藏掉，这个效果我不满意；会出现闪烁现象。

### 4.2 根因分析

原来的 `mousemove` 处理逻辑：

```
鼠标移动
→ hideAll()  // 先全部隐藏
→ 计算当前位置
→ 只显示应该显示的 overlay
```

`hideAll()` 会同时清除表格选中的绿色边框样式，而此时插入线 overlay 还没来得及显示 → 视觉上出现一帧边框消失的闪烁。

### 4.3 解决方案

改为按需选择性隐藏：

```
鼠标移动
→ 判断当前鼠标位置属于哪个区域（插入线区 / handle 区 / 其他）
→ 只隐藏"与当前不兼容"的 overlay，保留其他
→ 显示当前区域应该显示的 overlay
```

不再经历 `hide-show` 循环，边框样式不受干扰，闪烁消除。

---

## 五、插入线/Handle 位置不更新（[004] 2026-03-20）

### 5.1 问题描述

在表格单元格里输入内容，表格被撑大后，鼠标静止不动时，插入线和 handle 的位置还停留在原来的坐标，不跟随表格尺寸变化。

### 5.2 根因

位置计算依赖 `mousemove` 事件，鼠标不动就不重算。

### 5.3 解决方案（B021）

用 `ResizeObserver` 监听每个表格元素的尺寸变化：

```typescript
const ro = new ResizeObserver(() => {
  // 表格尺寸变了，向编辑器容器派发一个合成 mousemove 事件
  // 触发现有的位置重算逻辑，无需重复代码
  editorContainer.dispatchEvent(new MouseEvent('mousemove', {
    clientX: lastMouseX,
    clientY: lastMouseY,
    bubbles: true
  }));
});
ro.observe(tableElement);
```

复用已有的 mousemove 处理逻辑，代价最小。

---

## 六、单击表格单元格闪烁（[014]~[016] 2026-03-23）

### 6.1 问题描述

单击表格单元格时，绿色高亮背景闪一下然后消失（期望行为：光标定位，不出现绿色高亮）。

### 6.2 根因（B049）

Milkdown 的 GFM preset 使用了 `tableEditing({ allowTableNodeSelection: true })`，prosemirror-tables 的 `normalizeSelection` 会将 `NodeSelection(cell)` 自动转换为 `CellSelection`（多格绿色高亮）。单击 → NodeSelection → 被转为 CellSelection → 页面渲染出绿色背景 → 再等下一次事件才纠正 → 闪烁。

### 6.3 解决方案

新增 `cellClickFixPlugin` ProseMirror 插件，使用 `appendTransaction`（在每次 state 更新后、DOM 渲染前同步执行）：

```
检测到单格 CellSelection（anchorCell === headCell）
且来源是单击（event.detail === 1）
→ 立即将 CellSelection 转换为 TextSelection（定位光标）
→ 此次替换在首次渲染前完成，用户看不到绿色闪烁
```

双击/三击（`event.detail !== 1`）不触发，保留 prosemirror-tables 原生的三击选中单元格行为。

---

## 七、多格拖拽选区丢失（[017]~[020] 2026-03-23~24）

这是整个表格功能开发中最复杂的一段，涉及 ProseMirror 内部异步机制，前后修了四次。

### 7.1 问题描述（B054~B056）

拖拽跨越多个单元格选中后（绿色高亮），松手瞬间高亮偶发消失，变成普通文字光标位置。

### 7.2 根因溯源过程

**第一次修复（B054）**：发现 `pendingClickPos` 用微任务延迟清除，但 ProseMirror 在 mouseup 冒泡阶段触发的 `appendTransaction` 在微任务之前执行，此时 `pendingClickPos` 仍存在，误走「格内拖拽」分支，创建了错误的 TextSelection。

→ 解决：新增 `wasCrossCell` 标志，检测到多格拖拽时同步清除 `pendingClickPos`。

**第二次修复（B055）**：极端 edge case 下 `wasCrossCell` 未被正确设置，同步清除失效。

→ 解决：在「格内拖拽」分支加同格检查（anchor 和 head 必须在同一个 table_cell 内）。

**第三次修复（B056，最终方案）**：以上两次修复后仍有小概率复现。根因在于 ProseMirror 原生的 `mouseDown.up()` 在 mouseup 时读取浏览器 DOM 原生选区并 dispatch，浏览器不理解 CellSelection，`createSelectionBetween` 偶发失败时产生 TextSelection，而此时 `appendTransaction` 的入口已经是 TextSelection，无法拦截。

→ **最终方案**：在 `cellClickFixPlugin` 中增加 `filterTransaction`（VSCode 扩展层拦截所有 transaction）：
- 记录最近一次 CellSelection 为 `lastGoodCellSelection`
- 检测到可疑的 TextSelection dispatch（来自 `readDOMChange`，200ms 保护窗口内）时，直接拒绝该 transaction
- 保护窗口 200ms 后自动解除，不影响正常文字编辑

```
多格拖拽 → CellSelection（正确）
         → lastGoodCellSelection 保存
         ↓ mouseup 后 200ms 内
readDOMChange → dispatch TextSelection
         → filterTransaction 检测到保护窗口内的 TextSelection
         → return false，拒绝 transaction
         ↓ 200ms 后
保护窗口关闭，正常编辑恢复
```

### 7.3 时间线

| 会话 | 日期 | 修复内容 |
|------|------|----------|
| [017] | 2026-03-23 | wasCrossCell 同步清除（B054） |
| [018] | 2026-03-23 | 格内拖拽加同格检查（B055） |
| [019] | 2026-03-24 | 微任务恢复机制（B056，后被替代） |
| [020] | 2026-03-24 | filterTransaction 彻底修复（B056 最终方案） |

---

## 八、Handle 点击被误识别为拖拽（[021]~[022]）

### 8.1 问题（B057/B060）

触控板点击 ⠿ handle 图标时，由于触控板点击存在微小抖动，偶发被识别为拖拽操作而非单击选中。

### 8.2 解决过程

**第一次（B057）**：拖拽识别阈值从 `> 4px` 改为 `> 8px`。效果有改善，但触控板快速点击仍偶发触发。

**第二次（B060）**：在 drag 对象中增加 `startTime: number`，`onDragEnd` 时计算 `elapsed = Date.now() - startTime`，若 `elapsed < 150ms` 则强制视为点击（走单击选中分支），不走拖拽分支。

最终判断逻辑：
```
mouseup 时：
  if (距离 < 8px || 时间 < 150ms) → 视为点击，触发整行/列选中
  else → 视为拖拽，执行行列移位
```

---

## 九、CellSelection 行号计算（[022]~[025]）

这部分是发送到 Claude 功能的支撑，与表格选中交互强相关。

### 9.1 问题

用户多格拖拽选中表格内容后点击「发送到 Claude」，附带的行号（`file.md#L181-183`）计算错误。

### 9.2 根因

项目使用 `lineMap`（将 ProseMirror 节点索引映射到 Markdown 源码行号）定位行。但 lineMap 按空行分块，而 ProseMirror 会把多个空行分隔的列表项合并为一个 bullet_list 节点 → 索引严重错位（测试文件积累 +17 extra entries）。

### 9.3 解决方案（多级降级）

1. **textSearch 主路径**：提取 cell 内容，在 Markdown 源码中搜索匹配的行
2. **verbatim 逐字搜索**：不经 normalize，直接 `source.split('\n').findIndex(l => l.includes(firstLine))`（适用代码块注释等含特殊字符的文本）
3. **lineMap 兜底**：前两步失败时降级到 lineMap（精度不保证，但总有行号）

对于 CellSelection 的 anchor/head 定位，最终改为：
```typescript
// 不用 selection.from/to（可能落在 table_row 层间隙）
// 改用 $anchorCell.pos / $headCell.pos
const startLine = getCellRowSourceLine(selection.$anchorCell.pos, ...);
const endLine   = getCellRowSourceLine(selection.$headCell.pos, ...);
const [lo, hi]  = [Math.min(startLine, endLine), Math.max(startLine, endLine)];
```

---

## 十、遗留问题

| 问题 | 状态 |
|------|------|
| lineMap 根本性错位（松散列表 +17 extra entries） | ⏳ 已知，所有已知场景通过 textSearch 绕过 |
| 输入法下代码块语言选择器回车影响编辑器内容 | ⏳ 已知，未修复 |

---

## 十一、关键经验总结

1. **ProseMirror 的异步 mouseup 机制是最大的坑**：`readDOMChange` 通过 `setTimeout/rAF` 延迟执行，会绕过所有微任务恢复机制，必须在 `filterTransaction` 层拦截。

2. **overlay 元素的显隐要"按需"而非"全量清除再显示"**：全量 `hideAll()` 会导致同帧内的闪烁，改为选择性隐藏。

3. **鼠标交互的时间+距离双判断比单纯距离判断更可靠**：尤其在触控板场景下，单纯距离阈值无法区分"快速点击的微抖"和"真实的拖拽"。

4. **ResizeObserver + 合成事件是"位置跟随内容变化"的简洁方案**：复用已有的 mousemove 处理逻辑，零重复代码。

5. **视觉方案要早定**：表格选中样式（边框/背景/颜色）前后改了 5~6 次，每次改动都带动 CSS 和逻辑的联动修改；如果一开始就确定"统一绿色"方案，能省很多时间。
