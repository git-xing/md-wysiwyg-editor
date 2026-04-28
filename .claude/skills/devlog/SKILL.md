---
name: devlog
description: 将已知 bug 或功能需求记录为 GitHub Issue；触发词：记录 bug、已知 bug、功能需求、记录需求、/devlog
version: 1.0.0
---
# Devlog — GitHub Issue Recording Skill

## Purpose

将两类条目提交为 GitHub Issue（仓库：`git-xing/md-wysiwyg-editor`）：

1. **已知 Bug**：本次开发未修复或历史遗留的 bug（开发中已修复的不记录）
2. **功能需求**：计划实现但尚未动工的功能点

***

## Step 1：确认记录类型

用 AskUserQuestion 询问：

- 已知 Bug（未修复）
- 功能需求
- 两者都有

***

## Step 2A：记录已知 Bug

### 收集信息（AskUserQuestion）

一次性询问：

1. **标题**：一句话描述现象（Issue 标题）
2. **详细描述**：复现步骤、期望行为、实际行为
3. **根因**（可选）：已知根因，不知道填"待排查"
4. **严重程度**：高（功能不可用）/ 中（影响体验）/ 低（轻微缺陷）

### 创建 Issue

```bash
gh issue create \
  --repo git-xing/md-wysiwyg-editor \
  --title "[Bug] <标题>" \
  --label "bug,known-limitation" \
  --body "$(cat <<'EOF'
## 问题描述

<详细描述>

## 复现步骤

<步骤，不知道填 N/A>

## 根因分析

<根因，待排查时填 N/A>

## 严重程度

<高 / 中 / 低>

## 备注

> 此 Issue 由 `/devlog` skill 自动创建，记录已知但暂未修复的 bug。
EOF
)"
```

**Label 说明：**

- `bug`：GitHub 内置，标识这是一个 bug
- `known-limitation`：自定义，表示已知但暂不计划修复（需先确认此 label 存在，否则先创建）

### 检查并创建自定义 label

运行前先检查 `known-limitation` label 是否存在：

```bash
gh label list --repo git-xing/md-wysiwyg-editor | grep known-limitation
```

若不存在则创建：

```bash
gh label create "known-limitation" \
  --repo git-xing/md-wysiwyg-editor \
  --description "已知但暂未修复的限制或 bug" \
  --color "FFA500"
```

***

## Step 2B：记录功能需求

### 收集信息（AskUserQuestion）

询问以下字段：

1. **功能标题**：一句话概括（Issue 标题）
2. **解决什么问题**：用户场景/痛点描述
3. **期望效果**：功能实现后用户的操作体验
4. **完善度**：0–100%（0% = 仅有想法；50% = 部分实现）
5. **优先级**：高 / 中 / 低
6. **实现思路**（可选）：涉及哪些技术点、大致方案
7. **涉及文件**（可选）：预计需要改动的文件

### 创建 Issue

```bash
gh issue create \
  --repo git-xing/md-wysiwyg-editor \
  --title "[Feature] <功能标题>" \
  --label "enhancement,roadmap" \
  --body "$(cat <<'EOF'
## 问题 / 场景

<解决什么问题，用户痛点>

## 期望效果

<功能实现后的操作体验>

## 完善度

<0%（仅有想法）/ X%（部分实现）>

## 优先级

<高 / 中 / 低>

## 实现思路

<大致方案，涉及技术点，N/A 若暂无思路>

## 涉及文件

<预计改动的文件列表，N/A 若暂不清楚>

## 备注

> 此 Issue 由 `/devlog` skill 自动创建，记录计划功能需求。
EOF
)"
```

**Label 说明：**

- `enhancement`：GitHub 内置，标识功能需求
- `roadmap`：自定义，标识纳入路线图的计划功能（需先确认存在，否则先创建）

### 检查并创建自定义 label

```bash
gh label list --repo git-xing/md-wysiwyg-editor | grep roadmap
```

若不存在则创建：

```bash
gh label create "roadmap" \
  --repo git-xing/md-wysiwyg-editor \
  --description "纳入路线图的计划功能" \
  --color "0075CA"
```

***

## Step 3：输出结果

Issue 创建成功后，输出 Issue URL 让用户可以直接点击查看：

```
✅ Issue 已创建：https://github.com/git-xing/md-wysiwyg-editor/issues/XXX
```

若创建多个 Issue，逐一列出所有 URL。

***

## 注意事项

- Issue 标题前缀：Bug 用 `[Bug]`，需求用 `[Feature]`，方便在 Issues 列表一眼区分
- 使用 `gh` CLI，不需要浏览器操作
- 若用户信息不足，主动追问，确保 Issue 有足够上下文
- 不修改本地任何文件（devlog.md、roadmap.md 均不改动）
- 严重程度为"高"的 Bug Issue 可考虑加 `priority: high` label（如存在）
