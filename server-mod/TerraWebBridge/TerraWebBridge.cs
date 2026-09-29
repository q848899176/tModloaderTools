using System;
using System.Collections.Concurrent;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Terraria;
using Terraria.DataStructures;
using Terraria.ModLoader;

namespace TerraWebBridge;

public sealed class TerraWebBridge : Mod
{
    internal static readonly ConcurrentQueue<Action> Commands = new();

    public override void Load() => Main.OnTickForThirdPartySoftwareOnly += DrainCommands;
    public override void Unload()
    {
        Main.OnTickForThirdPartySoftwareOnly -= DrainCommands;
        Commands.Clear();
    }

    // Dedicated servers skip the normal update queue while empty. This event is
    // raised by the dedicated-server main loop even when no players are online.
    private static void DrainCommands()
    {
        while (Commands.TryDequeue(out var action))
            action();
    }
}

public sealed class BridgeCommand : ModCommand
{
    public override string Command => "twb";
    public override CommandType Type => CommandType.Console;
    public override bool IsCaseSensitive => true;
    public override string Usage => "twb <requestId> players | twb <requestId> give <slot> <itemId> <count> <playerNameBase64Url>";
    public override string Description => "Terra Web 服务端管理桥";

    public override void Action(CommandCaller caller, string input, string[] args)
    {
        if (caller.CommandType != CommandType.Console || !Main.dedServ)
            return;
        string requestId = args.Length > 0 ? args[0] : "";
        if (!Regex.IsMatch(requestId, @"\A[A-Za-z0-9_-]{1,80}\z"))
        {
            Reply(new { requestId = "", ok = false, error = "无效请求标识" });
            return;
        }

        TerraWebBridge.Commands.Enqueue(() =>
        {
            try
            {
                if (args.Length == 2 && args[1] == "players")
                {
                    var players = Main.player.Take(Main.maxPlayers).Where(p => p.active)
                        .Select(p => new { slot = p.whoAmI, name = p.name, life = p.statLife, maxLife = p.statLifeMax2 }).ToArray();
                    Reply(new { requestId, ok = true, players });
                    return;
                }
                if (args.Length != 6 || args[1] != "give")
                    throw new ArgumentException("无效管理命令或参数数量");
                int slot = ParseNumber(args[2]);
                int id = ParseNumber(args[3]);
                int count = ParseNumber(args[4]);
                if (slot < 0 || slot >= Main.maxPlayers || !Main.player[slot].active)
                    throw new ArgumentException("玩家已离线，请刷新玩家列表");
                if (!Regex.IsMatch(args[5], @"\A[A-Za-z0-9_-]{1,512}\z"))
                    throw new ArgumentException("玩家名称编码无效");
                string encodedName = args[5].Replace('-', '+').Replace('_', '/');
                string expectedName = new UTF8Encoding(false, true).GetString(Convert.FromBase64String(
                    encodedName.PadRight((encodedName.Length + 3) / 4 * 4, '=')));
                Player player = Main.player[slot];
                if (!string.Equals(player.name, expectedName, StringComparison.Ordinal))
                    throw new ArgumentException("玩家槽位已改变，请刷新玩家列表");
                if (id < 1 || id >= ItemLoader.ItemCount)
                    throw new ArgumentException("物品 ID 不存在于当前服务器");
                var item = new Item();
                item.SetDefaults(id);
                if (item.IsAir || item.type != id)
                    throw new ArgumentException("物品 ID 无效");
                if (count < 1 || count > item.maxStack)
                    throw new ArgumentException($"数量必须为 1 至 {item.maxStack}");
                // noBroadcast=false makes the server broadcast SyncItem to clients.
                int index = Item.NewItem(new EntitySource_DebugCommand("TerraWebBridge"), player.Hitbox, id, count, noBroadcast: false);
                if (index < 0 || index >= Main.maxItems || !Main.item[index].active)
                    throw new InvalidOperationException("物品生成失败");
                Reply(new { requestId, ok = true, item = new { id, name = item.Name, count, player = player.name, delivery = "world-drop" } });
            }
            catch (Exception ex)
            {
                Reply(new { requestId, ok = false, error = ex.Message });
            }
        });
    }

    private static int ParseNumber(string value)
    {
        if (!int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out int number))
            throw new ArgumentException("槽位、物品 ID 和数量必须为整数");
        return number;
    }

    private static void Reply(object value) => Console.WriteLine("TWB:" + JsonSerializer.Serialize(value));
}
