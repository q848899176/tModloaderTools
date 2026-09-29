# 泰拉控制台 · tModloaderTools

使用 Vue 3 + TypeScript 构建的 Windows tModLoader 服务器管理工具。支持本机及局域网访问，中文界面、响应式布局、交互动画，统一使用北京时间。

## 功能

- **多世界服务器**：不同端口运行不同世界，独立配置、日志、启动、保存和正常关闭。
- **世界管理**：识别现有世界及 Mod 存档，展示猩红/腐化像素树、大小和难度；支持创建世界。
- **共享 Mod 管理**：行列表、搜索、筛选、批量启停、依赖校验和修改备份。
- **Steam 创意工坊**：通过链接或 ID 下载兼容 Mod，并补齐可识别的工坊依赖。
- **服务器配置**：表单和配置文本编辑端口、人数、密码、欢迎消息等。
- **在线用户**：查看玩家、生命值，按当前服务端物品 ID 在玩家位置发放物品。

## 安装与启动

需要 Windows x64、已安装的 tModLoader，以及下载依赖时的网络连接。已测试 tModLoader `2026.07.3.0`（Terraria `1.4.4.9`）。

1. 下载或克隆本仓库，在 PowerShell 中执行：

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\安装环境.ps1
   ```

   脚本从官方源下载便携 Node.js 24 LTS、SteamCMD，并安装和构建网页。

2. 将 `settings.example.json` 复制为 `data/settings.json`，填写自己的 tModLoader 安装目录、存档根目录和 Steam 工坊目录。**请将 `YOUR_USERNAME` 替换为实际用户名**。存档根目录是包含 `Worlds`、`Mods`、`ModConfigs` 的目录。

   ```powershell
   New-Item -ItemType Directory -Force data
   Copy-Item settings.example.json data/settings.json
   notepad data/settings.json
   ```

3. 双击 **启动工具.cmd**，浏览器打开 **http://localhost:3000/**。
4. 在服务器配置中选择世界和端口，然后进入服务器概览启动。

若管理桥与当前 tModLoader 不兼容，可重新构建：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-bridge.ps1 -TmlPath 'D:\Steam\steamapps\common\tModLoader'
```

本项目只附带自有管理桥，不附带 Terraria/tModLoader 游戏程序或第三方 Mod。

## 局域网联机

管理网页的局域网地址显示在“工具设置”中。需要放行防火墙时，双击 **开启局域网.cmd**，同意 Windows 管理员授权。仅放行域/专用网络中本地子网的网页和已配置游戏端口；新增或修改端口后再次运行。

客户端选择多人游戏 → 通过 IP 加入，输入服务器 IP 和对应端口。例如世界 A 使用 `7777`，世界 B 使用 `7778`。本机连接可用 `127.0.0.1`。客户端需使用兼容的游戏和内容 Mod。

**此工具没有管理登录认证，仅适合可信局域网。不要将管理端口直接暴露到公网。公开仓库不等于公开管理服务。**

## 数据与运行规则

- 所有世界共用一份 `Mods/enabled.json`；游戏客户端或任何实例运行期间锁定共享 Mod 修改。退出后自动解锁。
- 同一世界禁止重复运行，实例端口不能重复；创建世界不会覆盖同名配套存档及备份。
- 启动时复制本地 Mod 和 ModConfigs 到独立快照，工坊包共享读取。原世界仍在原 `Worlds` 目录保存。
- 每实例配置位于 `data/instances/<ID>/serverconfig.txt`；注册表位于 `data/instances.json`。使用网页保存配置；如手动编辑文本，请同时通过网页配置文本入口保存。
- 启动快照位于 `data/instances/<ID>/runs`，停服后可清理历史快照，不要删除正在使用的目录。
- 关闭浏览器不会关闭服务器。使用“保存并关闭”等待正常退出，避免丢失存档。
- 用户管理桥仅服务端加载，客户端无需安装。发放物品是**地面掉落**，需玩家拾取，可能被附近玩家拾取；回执不表示已进入指定背包。Mod 物品数字 ID 可能随加载组合变化。

## 开发与测试

```powershell
npm install
npm test
npm run build
npm run server
```

开发界面可另开终端运行 `npm run dev`。生产启动器使用项目中的 `.tools/node.exe`。

`tests/` 包含配置、路径保护、Mod、下载队列、进程生命周期和 Vue 玩家页刷新回归测试。`scripts/*acceptance.ts` 为需要本机游戏环境的真实集成验收脚本；部分脚本依赖先生成的隔离测试世界，请阅读脚本再执行。

已验证双实例同时运行、空服玩家查询、离线物品发放拒绝、正常保存关服，以及原存档校验不变。真人客户端拾取过程仍需进一步验证。Windows 文件符号链接测试在权限不足时会跳过，目录 junction 保护另有测试。

## 开源许可与致谢

项目代码采用 [MIT License](LICENSE)，允许使用、修改、分发与商业使用，须保留许可证声明。第三方依赖遵循各自许可证。

基于 [Vue](https://vuejs.org/)、[Vite](https://vite.dev/)、[Express](https://expressjs.com/) 和 [Lucide](https://lucide.dev/) 构建。感谢 [tModLoader](https://github.com/tModLoader/tModLoader) 提供 Mod API。世界头字段解析参考其文件格式及 [TEdit](https://github.com/TEdit/Terraria-Map-Editor)；世界树图形为本项目绘制。本项目与 Re-Logic、Valve 及 tModLoader 团队无隶属关系。
