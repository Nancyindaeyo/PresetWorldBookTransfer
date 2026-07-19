# 预设备忘录 · 世界书转预设

世界书与预设互转、备忘录、变量检查等工具。

## 安装

### 前提

请先安装 [酒馆助手 (JS-Slash-Runner)](https://github.com/n0vi028/JS-Slash-Runner)。
升级到4.8.19+

### 方式一：扩展管理器安装（推荐）

1. 打开 SillyTavern → **扩展** → **Install Extension**
2. 粘贴仓库地址：`https://github.com/Nancyindaeyo/PresetWorldBookTransfer`
3. 选择「只给我安装」或「给所有人安装」
4. **刷新页面**
5. 在扩展列表中启用 **预设备忘录 · 世界书转预设**

扩展会自动在酒馆助手中注册脚本「预设备忘录」。

### 方式二：酒馆助手手动加载

在 **酒馆助手 → 脚本** 中新建脚本，内容：

```javascript
import 'https://cdn.jsdelivr.net/gh/Nancyindaeyo/PresetWorldBookTransfer@main/index.js'
```

## 使用

- 预设管理器底部工具栏：书签图标
- 扩展菜单：**预设备忘录**

## 仓库结构

| 文件 | 说明 |
| --- | --- |
| `manifest.json` | SillyTavern 扩展清单 |
| `bootstrap.js` | 扩展入口，自动注册酒馆助手脚本 |
| `index.js` | 打包后的可运行脚本 |
| `世界书转预设/` | 源码（TypeScript / Vue），仅供维护参考 |

## 更新

扩展管理器中点击「更新」，或重新执行上述安装步骤。
