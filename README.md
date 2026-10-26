# dsh-skills-panel
[![开放插件市场](https://img.shields.io/endpoint?url=https%3A%2F%2Fdshopen.org%2Fbadge%2Fdsh-skills-panel.json)](https://dshopen.org/zh/plugins/dsh-skills-panel/)
DSH Web 客户端的左侧栏「技能」面板：列出**当前 DSH 实例中你已安装的技能**，可固定常用项，点一下就把 `/技能名` 写进输入框。

## 功能

- 左侧栏一个「技能」图标，悬停/点击展开浮层，只显示已固定的技能
- 浮层右上齿轮进入完整列表：搜索、固定（☆）、查看全部
- 点技能名直接把 `/技能名 ` 插入会话输入框（是插入，不是复制；前面已有内容时会自动补一个空格）
- 固定项存在浏览器 localStorage，重启不丢
- 技能列表在运行时读取，安装/删除技能后点「刷新」即可，无需重新打包

## 技能是从哪来的

面板通过 DSH 客户端的 `skills.list` 接口（与输入框 `/` 菜单同源）读取**当前会话所在的 DSH 实例**的技能目录，因此：

- 安装者只会看到自己机器上的技能，作者的技能不会被带进包里
- 支持所有来源：`~/.dsh/skills`、`~/.agents/skills`、项目内 `.dsh/skills`、DSH 内置技能
- 列表里每项显示名称、来源（用户/项目/内置）与描述

需要先有一个打开的会话才能读取目录（面板是会话级界面）。

## 安装

```
dsh plugin --profile <profile> add dsh-skills-panel
```

安装后重启 DSH，左侧栏出现「技能」图标。

## 刷新

技能增删后：

- 面板底部点「刷新」，或
- 打开技能面板时会自动刷新一次

不需要手动生成任何清单。`scripts/sync-skills.mjs` 只是命令行诊断工具，用来查看当前技能的发现结果与根目录：

```
node scripts/sync-skills.mjs
```

它会自动发现 `$DSH_HOME/skills`、`~/.agents/skills`、`$DSH_BUNDLED_SKILL_DIR` 和工作区内的技能目录，不包含任何写死的机器路径。

## 卸载

```
dsh plugin --profile <profile> remove dsh-skills-panel
```

## 结构

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主侧 Cordis 插件（空壳，功能全在客户端） |
| `lib/client.js` | `window.__ModuleLoader__` 注册的客户端 bundle |
| `cordis.patch.yml` | bundle patch，挂载 `skills-panel` 行 |
| `scripts/sync-skills.mjs` | 技能目录诊断脚本（可选） |

## License

MIT
