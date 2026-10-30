using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Server;
using Server.MirEnvir;

class ItemDef
{
    public string name { get; set; }
    public int type { get; set; }
    public int image { get; set; }
    public int dura { get; set; }
    public int price { get; set; }
    public int level { get; set; }
    public int job { get; set; }
    public Dictionary<int, int> stats { get; set; }
}

class Program
{
    static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        if (args.Length < 2)
        {
            Console.WriteLine("usage:");
            Console.WriteLine("  ItemImport <serverDir> <import-list.json> [--dry]        新增缺失物品");
            Console.WriteLine("  ItemImport <serverDir> <import-list.json> --update       按名字重建所有属性/图标");
            Console.WriteLine("  ItemImport <serverDir> --audit                            打印前20件新物品的实际属性");
            return 1;
        }
        var serverDir = args[0];
        var dry = args.Contains("--dry");
        var update = args.Contains("--update");
        var audit = args.Contains("--audit");

        Directory.SetCurrentDirectory(serverDir);

        Settings.LoadVersion();
        Settings.LoadRandomItemStats();

        var envir = Envir.Main;   // 静态单例：Buff/ItemInfo 等绑定逻辑都走 Main
        if (!envir.LoadDB())
        {
            Console.WriteLine("LoadDB failed");
            return 2;
        }
        Console.WriteLine($"loaded: items={envir.ItemInfoList.Count} ItemIndex={envir.ItemIndex}");

        if (args.Contains("--shop"))
        {
            var names = new[] { "新人战盔", "新人战链", "新人战镯", "新人战戒",
                                "新人战带", "新人战靴", "新人神剑", "新人神甲" };
            var already = new HashSet<int>(envir.GameShopList.Select(x => x.ItemIndex));
            int added = 0;
            foreach (var nm in names)
            {
                var info = envir.GetItemInfo(nm);
                if (info == null) { Console.WriteLine($"!! 未找到 {nm}"); continue; }
                if (already.Contains(info.Index)) { Console.WriteLine($"skip 已在商城: {nm}"); continue; }
                envir.AddToGameShop(info);
                var g = envir.GameShopList[envir.GameShopList.Count - 1];
                g.GoldPrice = (uint)info.Price;
                g.CanBuyGold = true;
                g.CanBuyCredit = false;
                g.Count = 1;
                added++;
                Console.WriteLine($"商城上架 #{g.GIndex} {nm} 金币={g.GoldPrice} 类型={g.Category}");
            }
            Console.WriteLine($"shop: added={added} total={envir.GameShopList.Count}");
            if (!dry) { envir.SaveDB(); Console.WriteLine("saved"); }
            return 0;
        }

        if (args.Contains("--give"))
        {
            // args: <serverDir> --give <accountID> <charName> [--dry]
            var account = args.Length > 2 ? args[2] : "test123";
            var charName = args.Length > 3 ? args[3] : "xianL";
            Console.WriteLine("加载 Buff 配置 ...");
            foreach (var buff in Server.MirDatabase.BuffInfo.Load()) envir.BuffInfoList.Add(buff);
            Console.WriteLine($"Buff {envir.BuffInfoList.Count} 个");
            Console.WriteLine("加载账号库 Server.MirADB ...");
            envir.LoadAccounts();
            Console.WriteLine($"账号数 {envir.AccountList.Count}");
            var acc = envir.AccountList.FirstOrDefault(a =>
                string.Equals(a.AccountID, account, StringComparison.OrdinalIgnoreCase));
            if (acc == null)
            {
                Console.WriteLine($"!! 找不到账号 {account}，现有账号:");
                foreach (var a in envir.AccountList)
                    Console.WriteLine($"   [{a.Index}] {a.AccountID}  角色: {string.Join(",", a.Characters.Select(c => c.Name))}");
                return 3;
            }
            Console.WriteLine($"账号 {acc.AccountID} 角色数 {acc.Characters.Count}");
            foreach (var c in acc.Characters)
                Console.WriteLine($"   角色: {c.Name} 等级={c.Level} 职业={c.Class}");
            var ch = acc.Characters.FirstOrDefault(c => string.Equals(c.Name, charName, StringComparison.OrdinalIgnoreCase));
            if (ch == null) { Console.WriteLine($"!! 找不到角色 {charName}"); return 4; }

            var give = new[] { "新人战盔", "新人战链", "新人战镯", "新人战戒",
                               "新人战带", "新人战靴", "新人神剑", "新人神甲", "新人扶持" };
            ulong uid = (ulong)DateTime.UtcNow.Ticks;
            int given = 0;
            foreach (var nm in give)
            {
                var info = envir.GetItemInfo(nm);
                if (info == null) { Console.WriteLine($"!! 未找到 {nm}"); continue; }
                int slot = Array.FindIndex(ch.Inventory, x => x == null);
                if (slot < 0) { Console.WriteLine("!! 背包已满"); break; }
                var ui = new UserItem(info)
                {
                    UniqueID = ++uid,
                    CurrentDura = info.Durability,
                    MaxDura = info.Durability,
                    Count = 1,
                };
                ch.Inventory[slot] = ui;
                given++;
                Console.WriteLine($"发放 slot={slot} {nm} 耐久={ui.CurrentDura}/{ui.MaxDura} 属性数={info.Stats.Values.Count}");
            }
            Console.WriteLine($"give: {given} 件 -> {ch.Name}");
            if (!dry) { envir.SaveAccounts(); Console.WriteLine("saved Server.MirADB"); }
            return 0;
        }

        if (args.Contains("--npcs"))
        {
            var mapNames = new Dictionary<int, string>();
            foreach (var m in envir.MapInfoList) if (m != null) mapNames[m.Index] = m.FileName;
            foreach (var npc in envir.NPCInfoList.Where(x => x != null)
                .Where(x => x.FileName != null &&
                    (x.FileName.Contains("Clothing") || x.FileName.Contains("Blacksmith") ||
                     x.FileName.Contains("Necklace") || x.FileName.Contains("Bracelet") ||
                     x.FileName.Contains("Ring") || x.FileName.Contains("Potion"))))
            {
                mapNames.TryGetValue(npc.MapIndex, out var mn);
                Console.WriteLine($"npc#{npc.Index} {npc.Name} file={npc.FileName} map={mn} loc={npc.Location}");
            }
            return 0;
        }

        if (args.Contains("--fixdup"))
        {
            // 列表位置是可靠判据：原库物品必然排在追加的新物品之前
            var posOf = new Dictionary<ItemInfo, int>();
            for (int i = 0; i < envir.ItemInfoList.Count; i++)
                if (envir.ItemInfoList[i] != null) posOf[envir.ItemInfoList[i]] = i;

            var groups = envir.ItemInfoList.Where(x => x != null && !string.IsNullOrEmpty(x.Name))
                .GroupBy(x => x.Index).Where(g => g.Count() > 1).ToList();
            int renumbered = 0;
            foreach (var g in groups)
            {
                var ordered = g.OrderBy(x => posOf[x]).ToList();
                var keep = ordered[0];
                Console.WriteLine($"group Index {g.Key}: keep [{posOf[keep]}] {keep.Name} ({keep.Type})");
                foreach (var it in ordered.Skip(1))
                {
                    it.Index = ++envir.ItemIndex;
                    renumbered++;
                    Console.WriteLine($"  renumbered [{posOf[it]}] {it.Name} -> {it.Index}");
                }
            }
            Console.WriteLine($"fixdup: renumbered={renumbered} newItemIndex={envir.ItemIndex}");
            if (!dry)
            {
                envir.SaveDB();
                Console.WriteLine("saved Server.MirDB");
            }
            return 0;
        }

        if (args.Contains("--dups"))
        {
            var groups = envir.ItemInfoList.Where(x => x != null && !string.IsNullOrEmpty(x.Name))
                .GroupBy(x => x.Index).Where(g => g.Count() > 1).ToList();
            Console.WriteLine($"duplicate index groups: {groups.Count}");
            Console.WriteLine($"max Index in list: {envir.ItemInfoList.Where(x => x != null).Max(x => x.Index)}, ItemIndex={envir.ItemIndex}");
            foreach (var g in groups.Take(20))
            {
                Console.WriteLine($"  Index {g.Key}:");
                foreach (var it in g)
                    Console.WriteLine($"     Name={it.Name} Type={it.Type} img={it.Image} stats={it.Stats.Values.Count} price={it.Price}");
            }
            return 0;
        }

        if (audit)
        {
            var statNames = typeof(Stat).GetEnumNames();
            foreach (var it in envir.ItemInfoList.Where(x => x != null && x.Index >= 1349).Take(8))
            {
                var parts = it.Stats.Values
                    .OrderBy(kv => (int)kv.Key)
                    .Select(kv => $"{kv.Key}={kv.Value}");
                Console.WriteLine($"#{it.Index} {it.Name} [{it.Type}] img={it.Image} dur={it.Durability} => {string.Join(", ", parts)}");
            }
            Console.WriteLine("--- 同名前缀样例(新人) ---");
            foreach (var it in envir.ItemInfoList.Where(x => x != null && x.Name != null && x.Name.StartsWith("新人")).Take(12))
            {
                var parts = it.Stats.Values.OrderBy(kv => (int)kv.Key).Select(kv => $"{kv.Key}={kv.Value}");
                Console.WriteLine($"#{it.Index} {it.Name} [{it.Type}] => {string.Join(", ", parts)}");
            }
            return 0;
        }

        var listPath = Path.GetFullPath(args[1]);
        var defs = JsonSerializer.Deserialize<List<ItemDef>>(File.ReadAllText(listPath));

        if (update)
        {
            int changed = 0, missing = 0, skippedNoName = 0;
            var byName = new Dictionary<string, ItemInfo>();
            foreach (var it in envir.ItemInfoList)
            {
                if (it == null || string.IsNullOrEmpty(it.Name)) continue;
                if (!byName.ContainsKey(it.Name)) byName[it.Name] = it;
            }
            foreach (var d in defs)
            {
                if (string.IsNullOrEmpty(d.name)) { skippedNoName++; continue; }
                if (!byName.TryGetValue(d.name, out var info)) { missing++; continue; }

                info.Type = (ItemType)d.type;
                if (d.image > 0 && d.image <= 65535) info.Image = (ushort)d.image;
                if (d.dura > 0) info.Durability = (ushort)Math.Min(65535, d.dura);
                if (d.price > 0) info.Price = (uint)d.price;

                info.Stats.Clear();
                if (d.stats != null)
                    foreach (var kv in d.stats)
                        info.Stats[(Stat)kv.Key] = kv.Value;
                changed++;
            }
            Console.WriteLine($"update: changed={changed} name-not-found={missing} empty-name={skippedNoName}");
        }
        else
        {
            var existing = new HashSet<string>(envir.ItemInfoList.Where(x => x != null).Select(x => x.Name));
            var donors = new Dictionary<ItemType, List<ushort>>();
            foreach (var it in envir.ItemInfoList)
            {
                if (it == null || it.Image == 0) continue;
                if (!donors.TryGetValue(it.Type, out var pool)) donors[it.Type] = pool = new List<ushort>();
                if (!pool.Contains(it.Image)) pool.Add(it.Image);
            }
            var cursor = new Dictionary<ItemType, int>();
            int added = 0;
            foreach (var d in defs)
            {
                if (string.IsNullOrEmpty(d.name)) continue;
                if (existing.Contains(d.name))
                {
                    Console.WriteLine($"skip (already exists): {d.name}");
                    continue;
                }
                int img = d.image;
                if (img < 0 || img > 65535)
                {
                    var t = (ItemType)d.type;
                    if (donors.TryGetValue(t, out var pool2) && pool2.Count > 0)
                    {
                        cursor.TryGetValue(t, out int ci);
                        img = pool2[ci % pool2.Count];
                        cursor[t] = ci + 1;
                    }
                    else img = 0;
                }
                var info = new ItemInfo
                {
                    Index = ++envir.ItemIndex,
                    Name = d.name,
                    Type = (ItemType)d.type,
                    Image = (ushort)img,
                    Durability = (ushort)Math.Min(65535, d.dura),
                    Price = (uint)Math.Max(0, d.price),
                    Weight = 1,
                    StackSize = 1,
                    RequiredType = RequiredType.Level,
                    RequiredClass = RequiredClass.None,
                    Grade = ItemGrade.None,
                };
                if (d.stats != null)
                    foreach (var kv in d.stats)
                        info.Stats[(Stat)kv.Key] = kv.Value;
                envir.ItemInfoList.Add(info);
                existing.Add(d.name);
                added++;
                if (added <= 5 || added % 2000 == 0) Console.WriteLine($"added #{info.Index} {info.Name} type={info.Type} img={info.Image}");
            }
            Console.WriteLine($"total added: {added}, new ItemIndex={envir.ItemIndex}");
        }

        if (dry)
        {
            Console.WriteLine("dry run - not saving");
            return 0;
        }
        envir.SaveDB();
        Console.WriteLine("saved Server.MirDB");
        return 0;
    }
}
