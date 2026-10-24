# dsh-skills-panel

DSH Web 客户端的左侧栏「技能」面板：列出本机所有已安装技能，可固定常用项，点一下就把 `/技能名` 写进输入框。

## 功能

- 左侧栏一个「技能」图标，悬停/点击展开浮层，只显示已固定的技能
- 浮层右上齿轮进入完整列表：搜索、固定（☆）、查看全部
- 点技能名直接把 `/技能名 ` 插入会话输入框（contenteditable 路径，走浏览器原生输入）
- 固定项存在浏览器 localStorage，重启不丢

## 安装

```
dsh plugin --profile <profile> add dsh-skills-panel
```

安装后重启 DSH，左侧栏出现「技能」图标。

## 技能清单

面板读的是构建期生成的清单。装完新技能后需要重新生成：

```
node scripts/sync-skills.mjs
```

脚本扫描 `~/.dsh/skills`、`~/.agents/skills`、`D:/tools/deepseekHarness/resources/runtime/office-skills` 以及当前工作区的 `.dsh/skills`，把 name / description / source 写进 `lib/client.js` 的标记块。

> 注意：内置在 `app.asar` 里的技能（例如 `diagnose-windows-sandbox-acl`）扫不到，不会出现在面板里。

## 卸载

```
dsh plugin --profile <profile> remove dsh-skills-panel
```

## 结构

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主侧 Cordis 插件（空壳，纯客户端功能） |
| `lib/client.js` | `window.__ModuleLoader__` 注册的客户端 bundle |
| `cordis.patch.yml` | bundle patch，挂载 `skills-panel` 行 |
| `scripts/sync-skills.mjs` | 重新生成技能清单 |

## License

MIT
