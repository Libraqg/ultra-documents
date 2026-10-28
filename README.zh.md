# ultra-documents

[English](README.md) | 中文

[![npm](https://img.shields.io/npm/v/ultra-documents)](https://www.npmjs.com/package/ultra-documents) [![test](https://github.com/Libraqg/ultra-documents/actions/workflows/test.yml/badge.svg)](https://github.com/Libraqg/ultra-documents/actions/workflows/test.yml) [![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/libraqg/ultra-documents) [![DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

给 [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)（dsh）用的、类似 Claude Artifacts 的文档插件。

**在 dsh 侧边栏里得到可以批注、一键交给 AI 改出新版本、也能自己直接修改的文档。**

让 AI 写一份报告、方案、讲解、幻灯片、流程图或仪表盘，它会生成一个独立的
HTML 页面，在对话里显示为一张卡片，点开就在 dsh 右侧边栏打开。之后你可以：

- **批注**：选中任意文字，或点选图表、表格，写下意见。
- **交给 AI**：一键把待处理的批注交给 AI，它写出下一个版本，并逐条回复。
- **直接编辑**：自己修改最新版本的文字和格式，保存后生成新版本。

每次修改都是一个新版本，可以随时切换查看。所有内容只保存在你自己的电脑上：
不需要账号，没有服务器，也不分享给别人。

## 截图

| 生成 | 批注 | AI 修订后 |
|---|---|---|
| ![在 dsh 侧边栏打开的文档](docs/screenshots/created.jpg) | ![锚定在高亮文字上的批注](docs/screenshots/comment.jpg) | ![批注下 AI 的回复和新版本](docs/screenshots/revised.jpg) |

![在侧边栏里直接编辑文字和格式](docs/screenshots/edit.jpg)

## 安装

需要 dsh 0.2.1 或更高版本，以及它的网页界面（桌面版或 `dsh web`）。

```bash
dsh plugin --profile web add ultra-documents
```

不经过 npm、直接从 GitHub 源码安装：

```bash
dsh plugin --profile web add github:Libraqg/ultra-documents
```

从本地代码安装：

```bash
git clone https://github.com/Libraqg/ultra-documents
dsh plugin --profile web add link:/绝对路径/ultra-documents
```

桌面版的插件档案由桌面版自己管理，请在桌面版的插件管理里添加。

## 使用

1. 在某个工作区里新建会话，提出需求，比如“用 ultra-documents 做一份周末两天的杭州行程，带一张时间安排表”。
2. 点对话里的卡片，在侧边栏打开文档。
3. 选中文字或点选图表来批注。默认就是批注模式；想正常操作页面里的交互内容时，切换到阅读模式。
4. 点“交给 AI”生成下一个版本。点“显示已处理”可以看到 AI 对每条批注的回复。
5. 在最新版本上点“编辑”修改文字和格式，再点“保存为新版本”。

建议每篇文档用一个新会话：会话越长，每次修订带上的上下文越多，消耗也越大。

## 工作原理

| 组成部分 | 作用 |
|---|---|
| AI 工具 | `ultra_documents_create`、`ultra_documents_revise`、`ultra_documents_comments`、`ultra_documents_list` |
| 技能 | `ultra-documents`：什么时候用这些工具，以及怎样写 HTML（文风、图表、样式、幻灯片） |
| 侧边栏渲染器 | 接管 `*.ultra.html` 文件；在隔离的沙箱里显示文档，提供批注高亮、批注面板、版本切换、直接编辑和全屏 |
| 存储 | `<工作区>/.ultra-documents/<名称>/`：`v1.ultra.html`、`v2.ultra.html`……以及 `doc.json`、`comments.json`；整个目录默认不进 git |

文档运行在不带同源权限的 `<iframe sandbox="allow-scripts">` 里：文档中的脚本碰不到
dsh 页面、它的登录信息，也读不到你的文件。

设计细节见 [docs/DESIGN.md](docs/DESIGN.md)（英文）。

## 权限与风险

- **文件**：只在 `<工作区>/.ultra-documents/` 里写文件。插件用 Node `fs` 直接写入，
  会拒绝任何（包括通过符号链接）指向工作区以外的路径；草稿也只从工作区内的普通文件读取。
- **向 dsh 添加的内容**：4 个 AI 工具、1 个技能、1 个斜杠命令（`/ultra-documents`，
  供侧边栏保存批注和编辑），以及一个接管 `*.ultra.html` 文件的侧边栏渲染器。
- **网络与外部服务**：插件本身不发任何网络请求，也不使用外部服务。AI 写的文档在显示时
  可能从 CDN 加载字体或图表库。
- **模型消耗**：生成文档和“交给 AI”会使用你配置的模型、消耗 token；批注和直接编辑不消耗。
- **文档里的脚本**：运行在沙箱 iframe 里，碰不到 dsh 页面、登录信息和你的文件；只有你点击时才能打开链接。

## 已知限制

- 带自己脚本的文档可以批注，但不能直接编辑。
- 同一个会话如果同时在两个 dsh 进程里打开（比如桌面版和 `dsh web`），只有持有写锁的那个能保存批注和编辑。
- 每次批注操作会在对话里显示一张一行的“ultra-documents”命令卡片，它不会发给 AI。
- 侧边栏每 3 秒刷新一次；切换浅色/深色主题前已经打开的文档，要重新打开才会换主题。
- 只支持本地文件系统，不支持运行在远程文件系统上的会话。
- dsh 还是预览版，已在 0.2.1-rc.3 上测试。

## 开发

```bash
npm run build   # client/src/main.js → client.js
npm run check
npm test
```

`client.js` 是构建产物；请修改 `client/src/main.js` 后重新构建。

## 许可证

AGPL-3.0-or-later。ultra-documents 是 [tdoc](https://github.com/tornado-doc/tdoc)（作者
Serena Keyitan 及 tdoc 贡献者）的修改版；修改内容记录在 [NOTICE.md](NOTICE.md)。
随附的第三方内容保留其各自的许可证。
