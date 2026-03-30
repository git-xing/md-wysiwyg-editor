# Markdown 全场景测试文档

> 本文件用于验证 Markdown WYSIWYG 编辑器的所有渲染场景。

*~~baidu12~~* **粗体**细体

# #H1 一级标题

## H2 二级标题

### H3 三级标题akwhdawd

#### H4 四级标题

### H5 五级标题

###### H6 六级标题

***

## 2. 文本样式

3

## 普通段落文本。这是第一段，**bundleawd**

**粗体文本** 和 *斜体文本* 以及 ***粗斜体文本***

~~删除线文本~~ 和 `行内代码 code` 并排显示

混合样式：**这是粗体，其中有** ***斜体*** **嵌套**`code`，还有 ~~删除~~ 和 `code`。

`123`

![](./images/image_mn8hv53j_1xpv.png)![](./images/image_mn8hw74s_5gtq.png)

***

## 3. 列表

### 无序列表

- 苹果

- 香蕉

- 橙子

  - 血橙

  - 脐橙

    - 赣南脐橙
    - <br />

* 葡萄

### 有序列表

1. 第一步：安装依赖
2. 第二步：配置环境
3. 第三步：启动服务

   1. 启动数据库
   2. 启动后端

      1. 检查日志
      2. 分析日志
      3. 上传日志
   3. 启动前端
   4. <br />
4. 第四步：验证功能

### 任务列表

- [x] 完成项目初始化

- [ ] 集成 Milkdown 编辑器

- [x] 修复复选框渲染问题

- [ ] 添加表格右键菜单

- [x] 发布第一个版本
  - [x] 准备 README

* [x] 打包 .vsix 文件

<br />

```
123
```

***

## 4. 代码块

行内代码

##### 使用 `pnpm install` 安装依赖，使用 `pnpm build` 构建项目。

**或者** *~~`pnpm install`~~*

### TypeScriptjava

```javascript
import { Editor, rootCtx } from '@milkdown/core';
i@milkdown/preset-commonmark';

async function createEditor(container: HTMLElement): Promise<Editor> {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
    })
    .use(commonmark)
    .create();
}
import { Editor, rootCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';

async function createEditor2(container: HTMLElement): Promise<Editor> {
  return Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, container);
    })
    .use(commonmark)
    .create();
}
```

<br />

### Shell 命令

```bash

# 安装依赖
pnpm install

# 开发模式（监听文件变化）
pnpm watch

# 生产构建
pnpm build --production


```

### JSON 配置

```json
{
  "name": "markdown-wysiwyg-editor",
  "contributes": {
    "customEditors": [
      {
        "viewType": "markdownWysiwyg.editor",
        "priority": "default"
      }
    ]
  }
}
```

***

## 5. 表格

### 基础表格

| 姓名 |  性别 | 年龄 | 城市 | <br /> |
| -- | :-: | -- | -- | :----- |
| 张三 |  男  | 28 | 北京 | <br /> |
| 李四 |  女  | 32 | 上海 | <br /> |
| 王五 |  男  | 25 | 广州 | <br /> |

### 对齐方式

| 左对齐         | 居中对齐 |    右对齐 |
| :---------- | :--: | -----: |
| 苹果          |  红色  |  ¥5.00 |
| 香蕉          |  黄色  |  ¥3.50 |
| 蓝莓1111wdwdw |  蓝色  | ¥28.00 |

<br />

含代码的表格

| 命令             | 说明   | 示例                            | <br /> |
| -------------- | ---- | ----------------------------- | :----- |
| `pnpm install` | 安装依赖 | `pnpm install @milkdown/core` | <br /> |
| `pnpm build`   | 构建项目 | `pnpm build --production`     | <br /> |
| `pnpm watch`   | 监听模式 | `pnpm watch`                  | <br /> |

<br />

## 6. 引用块

> 这是一段普通引用。引用内容通常来自外部资料或他人的话语。

> **嵌套引用：**
>
> > 这是嵌套的引用内容，可以表示对话或多层引用。
>
> 引用可以包含 **粗体**、*斜体* 和 `代码`。

> ### 引用中的标题
>
> 引用块内也可以包含列表：
>
> - 条目一
> - 条目二

***

## 7. 链接与图片

### 链接[123](312)

[Milkdown 官网 ](https://milkdown.dev)

[带标题的链接](https://github.com/Milkdown/milkdown "Milkdown GitHub 仓库") 我的

自动链接：<https://milkdown.dev>

123123

### 图片

<br />

<br />

***

## 8. 水平分割线

上方内容

***

中间内容

***

下方内容

***

## 9. 特殊文本

### 转义字符

\*不是斜体\* 和 \`不是代码\` 和 # 不是标题

### 长段落换行

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.

第二段落。中文长段落测试123：工欲善其事，必先利其器。磨刀不误砍柴工。一寸光阴一寸金，寸金难买寸光阴。

***

## 10. 综合示例

### 项目清单

|     功能     |  状态 |       备注       |
| :--------: | :-: | :------------: |
| WYSIWYG 编辑 |  ✅  | 基于 Milkdown v7 |
|    自动保存    |  ✅  |      1s 防抖     |
|    表格编辑    |  🚧 |       开发中      |
|    模式切换    |  🚧 |       开发中      |

### 代码审查清单

- [x] 无语法错误
- [x] 类型检查通过
- [ ] 单元测试覆盖率 > 80%
- [ ] 无安全漏洞
- [x] 性能达标（FCP < 1s）
- [ ] 文档已更新中间内容

***

## 11. Mermaid 图表

### 流程图（复杂分支 + 子图）

```mermaid
flowchart TD
    A([用户发起请求]) --> B{身份验证}
    B -->|未登录| C[跳转登录页]
    B -->|已登录| D{权限检查}
    C --> E[用户登录] --> D
    D -->|无权限| F[返回 403]
    D -->|有权限| G[解析请求参数]

    G --> H{缓存命中?}
    H -->|命中| I[从 Redis 读取]
    H -->|未命中| J[查询数据库]
    J --> K{查询成功?}
    K -->|失败| L[返回 500 错误]
    K -->|成功| M[写入缓存]
    M --> I

    I --> N[业务逻辑处理]
    N --> O{数据有效?}
    O -->|无效| P[返回 400 参数错误]
    O -->|有效| Q[序列化响应]
    Q --> R([返回 200 JSON])

    subgraph 缓存层
        H
        I
        M
    end

    subgraph 持久层
        J
        K
    end

    style A fill:#4CAF50,color:#fff
    style R fill:#2196F3,color:#fff
    style F fill:#f44336,color:#fff
    style L fill:#f44336,color:#fff
    style P fill:#FF9800,color:#fff
```

### 时序图（微服务调用链）

```mermaid
sequenceDiagram
    autonumber
    actor User as 用户
    participant FE as 前端 (React)
    participant GW as API 网关
    participant Auth as 认证服务
    participant Order as 订单服务
    participant Pay as 支付服务
    participant MQ as 消息队列

    User->>FE: 点击"立即支付"
    FE->>GW: POST /api/orders/pay {orderId, amount}
    GW->>Auth: 验证 JWT Token
    Auth-->>GW: 200 {userId, roles}
    GW->>Order: 锁定订单 (orderId, userId)

    alt 订单已过期
        Order-->>GW: 410 ORDER_EXPIRED
        GW-->>FE: 返回错误
        FE-->>User: 提示订单已过期
    else 订单有效
        Order-->>GW: 200 {lockToken}
        GW->>Pay: 发起扣款 {amount, lockToken}
        Pay->>Pay: 调用第三方支付 SDK

        loop 轮询支付结果（最多 3 次）
            Pay->>Pay: 等待回调 (2s)
        end

        Pay-->>GW: 200 {transactionId}
        GW->>MQ: 发布 ORDER_PAID 事件
        MQ-->>Order: 更新订单状态
        GW-->>FE: 支付成功 {transactionId}
        FE-->>User: 跳转到成功页面
    end
```

### 类图（设计模式示例）

```mermaid
classDiagram
    class EventEmitter {
        -listeners Map~string, Function[]~
        +on(event, handler) void
        +off(event, handler) void
        +emit(event, data) void
    }

    class Store~T~ {
        -state T
        -reducers Map~string, Reducer~
        #middleware Middleware[]
        +getState() T
        +dispatch(action Action) void
        +subscribe(listener) unsubscribe
        +use(middleware) Store
    }

    class Action {
        +type string
        +payload any
        +meta Record
    }

    class Reducer~T~ {
        <<interface>>
        +handle(state T, action Action) T
    }

    class Middleware {
        <<interface>>
        +apply(store, next, action) any
    }

    class LoggerMiddleware {
        -logger Console
        +apply(store, next, action) any
    }

    class ThunkMiddleware {
        +apply(store, next, action) any
    }

    Store --|> EventEmitter : 继承
    Store "1" *-- "0..*" Reducer : 组合
    Store "1" *-- "0..*" Middleware : 组合
    LoggerMiddleware ..|> Middleware : 实现
    ThunkMiddleware ..|> Middleware : 实现
    Store ..> Action : 使用
```

### 状态机（订单生命周期）

```mermaid
stateDiagram-v2
    [*] --> Draft : 用户创建

    Draft --> Pending : 提交订单
    Draft --> [*] : 取消草稿

    Pending --> Confirmed : 商家确认
    Pending --> Cancelled : 超时自动取消
    Pending --> Cancelled : 用户主动取消

    Confirmed --> Shipped : 发货
    Confirmed --> Refunding : 用户申请退款

    Shipped --> Delivered : 确认收货
    Shipped --> Refunding : 签收后申请退款

    Refunding --> Refunded : 退款成功
    Refunding --> Confirmed : 商家拒绝退款

    Delivered --> Reviewed : 用户评价
    Delivered --> [*] : 自动完成（15天）
    Reviewed --> [*] : 完成

    Refunded --> [*] : 完成
    Cancelled --> [*] : 结束

    state Shipped {
        [*] --> InTransit
        InTransit --> OutForDelivery
        OutForDelivery --> [*]
    }
```

### Gantt 甘特图（项目排期）

```mermaid
gantt
    title 扩展开发路线图 Q1-Q2
    dateFormat  YYYY-MM-DD
    excludes    weekends

    section 阶段一：基础框架
    项目初始化与 esbuild 配置    :done,    a1, 2025-01-06, 3d
    Milkdown 集成与 CSP 配置     :done,    a2, after a1, 5d
    自动保存与消息协议            :done,    a3, after a2, 4d

    section 阶段二：编辑功能
    工具栏与快捷键                :done,    b1, after a3, 5d
    表格拖拽与行列操作            :done,    b2, after b1, 8d
    代码块语法高亮                :done,    b3, after b2, 3d
    图片上传与 lightbox           :done,    b4, after b3, 6d

    section 阶段三：高级功能
    TOC 目录面板                  :done,    c1, 2025-02-10, 4d
    链接弹窗                      :done,    c2, after c1, 3d
    Mermaid 图表渲染              :done,    c3, after c2, 5d
    国际化 i18n                   :done,    c4, after c3, 4d

    section 阶段四：发布准备
    单元测试覆盖                  :active,  d1, 2025-03-17, 10d
    性能优化                      :         d2, after d1, 5d
    Marketplace 发布              :         d3, after d2, 3d
```

### 错误语法测试（验证错误提示）

```mermaid
flowchart TD
    A --> B -->
    INVALID SYNTAX HERE @@@@
    --> missing node
```
