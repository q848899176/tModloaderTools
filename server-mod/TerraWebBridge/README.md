# TerraWebBridge

仅服务端的 tModLoader 管理桥，`build.txt` 使用 `side = Server`（`ModSide.Server`）。客户端无需安装此桥，仍需满足服务器其他联机 Mod 的要求。没有新物品、新区块或客户端资源。

## 构建

在项目根目录运行：

```powershell
./scripts/build-bridge.ps1 -TmlPath 'D:\Steam\steamapps\common\tModLoader'
```

使用 tModLoader 自带 .NET 与 Roslyn，无需安装 SDK。构建存档和 Mod 输出隔离在 `.tools/bridge-build-save`，最终复制到 `server-mod/TerraWebBridge.tmod`。此脚本只构建，不启动世界，不修改实际游戏存档或 `enabled.json`。

本机已使用 tModLoader `2026.07.3.0` 构建，结果为 0 错误、0 警告。

## 控制台协议

仅 `CommandType.Console` 可以调用，玩家聊天无法调用。命令放入线程安全队列，由专用服主循环的 `Main.OnTickForThirdPartySoftwareOnly` 回调执行世界读取、验证和物品生成。没有在线玩家时该回调仍会运行，避免普通更新队列在空服时不消费导致查询超时。

```text
twb <requestId> players
twb <requestId> give <slot> <itemId> <count> <playerNameBase64Url>
```

`requestId` 为 1–80 个 ASCII 字母、数字、下划线或连字符。名称是 UTF-8 字节的无填充 Base64URL 编码，命令保留大小写。返回单行 `TWB:` 前缀和 JSON，非 ASCII 内容使用 JSON 转义，避免控制台编码丢失中文。

```json
{"requestId":"r1","ok":true,"players":[{"slot":0,"name":"玩家","life":100,"maxLife":100}]}
{"requestId":"r2","ok":true,"item":{"id":8,"name":"火把","count":1,"player":"玩家","delivery":"world-drop"}}
{"requestId":"r3","ok":false,"error":"玩家已离线，请刷新玩家列表"}
```

查询仅返回在线玩家。发放同时校验在线槽位和精确名称，拒绝槽位复用、非法编码、未知 ID、非整数以及超出物品最大堆叠数的数量。物品 ID 以当前服务器加载的 `ItemLoader.ItemCount` 为界限，Mod 物品 ID 随当前 Mod 集合变化。

发放使用 `Item.NewItem(..., noBroadcast: false)`，由服务端广播物品同步消息。`world-drop` 表示在玩家位置生成地面物品，可能被附近玩家捡走；成功不代表已经进入指定玩家背包。

## 运行验收

由管理工具在隔离测试服务器加载产物后依次检查：

1. 无玩家时执行 `twb probe1 players`，应返回成功和空数组。
2. 执行 `twb probe2 give 999 8 1 dGVzdA`，应返回玩家离线错误，不能生成物品。
3. 真实客户端连接后获取玩家槽位和名称，使用其名称编码发放 ID 8、数量 1；核验角色位置出现物品以及成功响应中的 `world-drop`。
4. 测试错误名称、ID 0、超出物品范围的 ID、数量 0、超出最大堆叠数的数量；均应返回失败。
5. 客户端聊天输入 `/twb ...`，不得执行管理操作。

2026-09-29 北京时间 11:13，隔离双实例实机验收已通过：两个实例均返回在线玩家空列表、桥状态 ready、离线玩家发放返回明确错误，保存并正常退出。真实玩家客户端的物品拾取端到端验收仍未执行。向 Windows tModLoader 进程标准输入写命令时，管理工具需使用进程实际输入编码（本机为 UTF-16LE）；中文服务端原生保存/退出命令为 `保存`、`退出`。
