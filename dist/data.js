(function (root) {
  "use strict";
  const W = 44,
    H = 30,
    INVENTORY_CAPACITY = 24;
  const DIRS = [
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
  ];
  const ITEMS = {
    bread: {
      name: "焼きたてパン",
      icon: "◒",
      description: "満腹度を50回復。",
    },
    potion: {
      name: "回復草",
      icon: "✿",
      description: "体力を25回復。",
    },
    scroll: {
      name: "雷光の灯札",
      icon: "✧",
      description: "かざすと灯りが雷に変わり、見えている敵すべてに18ダメージ。",
    },
    map: {
      name: "道しるべの灯札",
      icon: "✧",
      description:
        "かざすと光の道筋が浮かび、この階の地形と階段の場所を明らかにします。",
    },
    arrow: {
      name: "木の矢",
      icon: "➶",
      description:
        "装備して「矢を放つ」で向いている方向へ発射。1本消費し、最初の敵に12ダメージ。",
    },
    identify: {
      name: "真名の灯札",
      icon: "✧",
      description:
        "ランタンの光で、選んだ持ち物1つの正体を照らします。灯札は同じ種類すべて、剣・盾はその1つの本当の力と呪いが判明します。",
    },
    uncurse: {
      name: "清めの灯札",
      icon: "✧",
      description:
        "清らかな灯りで、装備中の剣・盾の呪いをすべて解きます。持ち物にある未装備の品には効きません。",
    },
    weapon: {
      name: "剣",
      icon: "⚔",
      description:
        "装備すると本当の力と呪いが判明します。呪われた装備は外せません。",
    },
    shield: {
      name: "盾",
      icon: "◈",
      description:
        "装備すると本当の力と呪いが判明します。呪われた装備は外せません。",
    },
  };
  ITEMS.echoShard = {
    name: "灯影の欠片",
    icon: "✦",
    description: "倒した魔物の残り火。踏むとランタンに宿ります。枠が埋まっている時は、入れ替えるかどうかを選べます。",
  };
  // Terrain tools: thrown in the facing direction (up to 4 cells) or used on the spot.
  Object.assign(ITEMS, {
    waterSkin: { name: "水袋", icon: "◍", description: "向いている方向へ投げ、落ちた周囲3×3を水たまりにします。火を消し、雷光は水たまりを伝わります。" },
    oilFlask: { name: "油瓶", icon: "◉", description: "向いている方向へ投げ、落ちた周囲3×3を油だまりにします。火が付くと燃え広がります。" },
    emberStone: { name: "火種", icon: "✺", description: "向いている方向へ投げ、落ちたマスに火を放ちます。そこにいる敵に10ダメージ。油と草むらは燃え広がります。" },
    blastNut: { name: "爆ぜ実", icon: "✹", description: "向いている方向へ投げ、落ちた周囲3×3に15ダメージ。リネも巻き込まれます。油と草むらに火が付きます。" },
    smokeBall: { name: "煙玉", icon: "☁", description: "足元の周囲5×5に霧を広げます。霧の中を狙った敵の射撃・強打は空振りし、霧の中のリネは遠くから狙われません。5ターンで晴れます。" },
  });
  Object.assign(ITEMS, {
    driedFruit: { name: "干し果実", icon: "❦", description: "満腹度を25、体力を5回復します。" },
    greatHerb: { name: "大回復草", icon: "✿", description: "体力を60回復します。体力が満タンなら、最大体力が3増えます。" },
    gustTalisman: { name: "突風の灯札", icon: "✧", description: "隣接する敵すべてを2マス押し出します。壁や敵との衝突で3ダメージ。途中の罠や炎にも触れます。" },
    sleepTalisman: { name: "眠りの灯札", icon: "✧", description: "見えている敵すべてを8ターン眠らせ、予告を取り消します。ダメージを受けると目覚めます。" },
    sharpenTalisman: { name: "鍛えの灯札", icon: "✧", description: "装備中の武器の補正値を1増やします。呪いは解けません。" },
    temperTalisman: { name: "守りの灯札", icon: "✧", description: "装備中の盾の補正値を1増やします。呪いは解けません。" },
    warpTalisman: { name: "転移の灯札", icon: "✧", description: "この階のどこかの空きマスへ転移します。行き先は選べません。" },
    copyTalisman: { name: "写しの灯札", icon: "✧", description: "見えている最も近い魔物の灯影の欠片を足元に写します。番人には効きません。足元に品がある時は隣に残ります。" },
    hookRope: { name: "鉤縄", icon: "⚓", description: "向いている方向へ5マス投げ、最初の敵を隣まで引き寄せます。途中の罠や炎にも触れます。" },
    slowDust: { name: "鈍りの粉", icon: "⌛", description: "向いている方向へ4マス投げ、最初の敵を10ターン鈍足にします。鈍足の敵は2ターンに1回だけ行動します。" },
    flashBall: { name: "光玉", icon: "☀", description: "向いている方向へ4マス投げ、落ちた周囲3×3の敵の予告を取り消し、次の1回の行動を奪います。" },
    keepJar: { name: "灯籠瓶", icon: "♜", description: "消耗品3個を入れて1枠で持ち運べます。入れる・取り出すと1ターン進みます。矢・装備・瓶は入りません。中の品は取り出してから使います。" },
  });
  const NEW_ITEM_POOL = [
    ["driedFruit", 14, 1], ["greatHerb", 4, 4], ["gustTalisman", 9, 2],
    ["sleepTalisman", 8, 2], ["sharpenTalisman", 6, 3], ["temperTalisman", 6, 3],
    ["warpTalisman", 8, 2], ["copyTalisman", 5, 4], ["hookRope", 10, 2],
    ["slowDust", 10, 3], ["flashBall", 10, 3], ["keepJar", 4, 3],
  ];
  const RESCUE_SCROLLS = ["scroll", "map", "identify", "uncurse"];
  const jarConsumable = (item) => typeof item === "string" && Object.hasOwn(ITEMS, item) &&
    !["arrow", "weapon", "shield", "keepJar", "echoShard"].includes(item);
  const validJar = (item) => item?.kind === "keepJar" && Array.isArray(item.contents) &&
    item.contents.length <= 3 && item.contents.every(jarConsumable);
  const THROWN_ITEMS = ["waterSkin", "oilFlask", "emberStone", "blastNut", "hookRope", "slowDust", "flashBall"];
  // Spending one of these lends its power to the next five arrows.
  const INFUSIONS = {
    scroll: { id: "thunder", name: "雷の灯", text: "命中した敵とつながった水たまりに12ダメージ。水たまりがなければ命中した敵に追加6ダメージ。" },
    emberStone: { id: "fire", name: "火の灯", text: "命中した場所に火を放つ。" },
    smokeBall: { id: "smoke", name: "霧の灯", text: "命中した場所の周囲3×3に霧を広げる。" },
    sleepTalisman: { id: "sleep", name: "眠りの灯", text: "命中した敵を5ターン眠らせる。ダメージを受けると目覚める。" },
  };
  const INFUSION_SHOTS = 5;
  const TERRAIN_ITEMS = ["waterSkin", "oilFlask", "emberStone", "blastNut", "smokeBall"];
  const SURFACES = {
    water: { name: "水たまり" },
    oil: { name: "油だまり" },
    grass: { name: "草むら" },
    fog: { name: "霧" },
    fire: { name: "炎" },
  };
  // Lantern shrines: one of three boons, chosen for free.
  const BOONS = {
    vigor: { name: "灯りの息吹", text: "最大体力+8、体力+8。" },
    whet: { name: "刃の灯", text: "装備中の武器の補正値+1。", needs: "weapon" },
    temper: { name: "盾の灯", text: "装備中の盾の補正値+1。", needs: "shield" },
    echo: { name: "灯影の授け", text: "灯影を宿す。" },
    rest: { name: "安らぎの灯", text: "体力と満腹度をすべて回復。" },
    quiver: { name: "矢の灯", text: "木の矢15本。" },
    insight: { name: "真名の灯", text: "未識別の灯札をすべて識別し、持ち物の未鑑定品をすべて鑑定。" },
    wick: { name: "灯芯の灯", text: "ランタンの灯影の枠が2つになる。" },
  };
  // Two held echoes of these families add a further effect.
  const RESONANCES = {
    meteor: { name: "流星", pair: ["wing", "shot"], text: "灯弾の威力が半分にならない。" },
    ambush: { name: "奇襲", pair: ["veil", "feast"], text: "まだ気づいていない敵と、眠っている敵への攻撃が2倍。" },
    mossShell: { name: "苔むす殻", pair: ["moss", "shell"], text: "苔の灯影が3歩ごとに働く。" },
    quake: { name: "地鳴り", pair: ["might", "root"], text: "押し出しの衝突ダメージ+3。" },
  };
  // A weapon that has felled enough monsters evolves at a shrine while Rine holds the matching echo.
  const EVOLUTIONS = {
    lampSpear: { into: "meteorSpear", echo: "shot" },
    sweepAxe: { into: "gorgeAxe", echo: "feast" },
    hookSickle: { into: "shadowSickle", echo: "veil" },
    pushMaul: { into: "quakeMaul", echo: "might" },
  };
  const EVOLVE_KILLS = 12;
  // Roadside stalls: wares priced by depth, plus appraisal and uncursing services.
  const SHOP_PRICES = { bread: 60, potion: 80, arrow: 60, waterSkin: 70, oilFlask: 70, emberStone: 80, blastNut: 90, smokeBall: 80, scroll: 120, map: 90, identify: 100, uncurse: 120 };
  const SHOP_SERVICES = { appraise: { name: "鑑定", base: 50 }, cleanse: { name: "解呪", base: 120 } };
  Object.assign(SHOP_PRICES, { driedFruit: 40, greatHerb: 200, gustTalisman: 130, sleepTalisman: 130, sharpenTalisman: 130, temperTalisman: 130, warpTalisman: 130, copyTalisman: 130, hookRope: 90, slowDust: 90, flashBall: 90, keepJar: 150 });
  const START_KITS = {
    spear: { name: "迎え撃つ旅", text: "灯守りの槍と木の矢10本。近づかれる前に突く。", weapon: "lampSpear", items: Array(10).fill("arrow") },
    maul: { name: "切り拓く旅", text: "打ち槌と爆ぜ実2個。押し出して道を開く。", weapon: "pushMaul", items: ["blastNut", "blastNut"] },
    shell: { name: "灯を宿す旅", text: "殻の灯影（鉄殻甲虫）と回復草2個。守りを固めて進む。", echo: "ironBeetle", items: ["potion", "potion"] },
  };
  // Hidden floor traps; the same spring rules apply to Rine and to monsters forced onto them.
  const TRAPS = {
    spike: { name: "トゲの罠", weight: 34, mark: "" },
    pit: { name: "落とし穴", weight: 10, mark: "穴" },
    warp: { name: "転移の罠", weight: 14, mark: "転" },
    rust: { name: "錆の罠", weight: 10, mark: "錆" },
    alarm: { name: "警鐘の罠", weight: 10, mark: "鐘" },
    fire: { name: "火の罠", weight: 11, mark: "火", minFloor: 3 },
    oil: { name: "油の罠", weight: 11, mark: "油", minFloor: 3 },
  };
  // Weapons whose direction input does more than strike the adjacent cell.
  const WEAPON_SHAPES = ["lampSpear", "sweepAxe", "hookSickle", "pushMaul"];
  // Lantern echoes: each monster family lends its own trait to Rine's lantern.
  const ECHOES = {
    moss: { name: "苔の灯影", short: "苔", text: ["5歩進むごとに体力+1。", "5歩進むごとに体力+2。"] },
    wing: { name: "翼の灯影", short: "翼", text: ["見える敵がいない時、1回の移動で2マス進む。", "3マス以内に見える敵がいない時、1回の移動で2マス進む。"] },
    shot: { name: "灯弾の灯影", short: "灯弾", text: ["正面に届く敵がいない時、「攻撃」が直線3マス以内の最初の敵に届く（威力半分）。", "正面に届く敵がいない時、「攻撃」が直線4マス以内の最初の敵に届く（威力半分）。"] },
    feast: { name: "喰らいの灯影", short: "喰らい", text: ["近接攻撃が当たるたび満腹度+1。", "近接攻撃が当たるたび満腹度+2。"] },
    ember: { name: "金灯の灯影", short: "金灯", text: ["敵を倒すたび体力+3。"] },
    blink: { name: "揺らぎの灯影", short: "揺らぎ", text: ["敵の攻撃を受けた後、1/4の確率で同じ部屋の3マス以内へ転移する。"] },
    shell: { name: "殻の灯影", short: "殻", text: ["防御力+2。", "防御力+4。"] },
    root: { name: "根の灯影", short: "根", text: ["2ターン続けて攻撃を当てると、2回目以降の攻撃+3。", "2ターン続けて攻撃を当てると、2回目以降の攻撃+5。"] },
    veil: { name: "擬態の灯影", short: "擬態", text: ["眠っている敵は3マス以内に近づくまで気づかない。", "眠っている敵は2マス以内に近づくまで気づかない。"] },
    might: { name: "剛腕の灯影", short: "剛腕", text: ["近接攻撃が当たった敵を1マス押し出す。壁や敵にぶつかると追加2ダメージ。", "近接攻撃が当たった敵を1マス押し出す。壁や敵にぶつかると追加4ダメージ。"] },
  };
  const ECHO_SOURCES = {
    mossSlime: ["moss", 0], amberSlime: ["moss", 1],
    caveBat: ["wing", 0], emberBat: ["wing", 0], obsidianBat: ["wing", 1],
    frostBat: ["shot", 0], lanternGhost: ["shot", 0], thunderBat: ["shot", 1], frostGhost: ["shot", 1],
    lanternMoth: ["feast", 0], jadeBat: ["feast", 1], eclipseMoth: ["feast", 1], jadeGhost: ["feast", 1],
    goldGhost: ["ember", 0], abyssGhost: ["blink", 0],
    ironBeetle: ["shell", 0], cobaltBeetle: ["shell", 1],
    thornPlant: ["root", 0], moonPlant: ["root", 1],
    coinMimic: ["veil", 0], starMimic: ["veil", 1],
    stoneGolem: ["might", 0], obsidianGolem: ["might", 1],
  };
  Object.assign(ECHO_SOURCES, {
    bubbleMother: ["moss", 1], gateGolem: ["might", 1],
    bubbleSlime: ["moss", 0], rustSlime: ["moss", 1], mudSlime: ["moss", 1],
    thiefBat: ["wing", 0], bellBat: ["wing", 0], hornBeetle: ["shell", 0],
    mirrorBeetle: ["shell", 1], snareVine: ["root", 0], blastMoth: ["feast", 0],
    archerGhost: ["shot", 1], mendGhost: ["ember", 0], wardGolem: ["might", 0],
  });
  function echoOfSpecies(species) {
    const source = ECHO_SOURCES[species];
    if (!source) return null;
    const [id, tier] = source, echo = ECHOES[id];
    return { id, tier, species, name: echo.name, short: echo.short, text: echo.text[Math.min(tier, echo.text.length - 1)] };
  }
  const SCROLLS = [...RESCUE_SCROLLS, "gustTalisman", "sleepTalisman", "sharpenTalisman", "temperTalisman", "warpTalisman", "copyTalisman"];
  const SCROLL_NAMES = ["赤い灯札", "青い灯札", "黄色い灯札", "緑の灯札", "紫の灯札", "白い灯札", "黒い灯札", "橙色の灯札", "桃色の灯札", "銀色の灯札"];
  const EQUIPMENT_NAMES = {
    weapon: ["木の剣", "銅の剣", "鉄の剣", "星鉄の剣"],
    shield: ["旅人の盾", "銅の盾", "鉄の盾", "星鉄の盾"],
  };
  const EQUIPMENT = {
    woodSword: {
      name: "木の剣",
      slot: "weapon",
      power: 0,
      weight: 10,
      description: "攻撃力 +0。使い慣れた木の剣。",
    },
    copperSword: {
      name: "銅の剣",
      slot: "weapon",
      power: 3,
      weight: 19,
      description: "攻撃力 +3。扱いやすい剣。",
    },
    ironSword: {
      name: "鉄の剣",
      slot: "weapon",
      power: 6,
      weight: 20,
      description: "攻撃力 +6。丈夫な鉄の剣。",
    },
    starSword: {
      name: "星鉄の剣",
      slot: "weapon",
      power: 9,
      weight: 7,
      description: "攻撃力 +9。まれに見つかる強力な剣。",
    },
    ghostSword: {
      name: "祓いの剣",
      slot: "weapon",
      power: 3,
      weight: 9,
      trait: "ghost",
      description: "攻撃力 +3。亡霊への近接ダメージが2倍。",
    },
    pickaxe: {
      name: "破甲のつるはし",
      slot: "weapon",
      power: 4,
      weight: 8,
      trait: "pierce",
      description: "攻撃力 +4。近接攻撃は敵の装甲による軽減を無視。",
    },
    lampSpear: {
      name: "灯守りの槍",
      slot: "weapon",
      power: 2,
      weight: 6,
      description: "攻撃力 +2。敵の方向へ進むと、直線2マス以内の最初の敵をその場で突きます。壁や手前の敵は越えません。",
    },
    sweepAxe: {
      name: "薙ぎの斧",
      slot: "weapon",
      power: 4,
      weight: 6,
      description: "攻撃力 +4。正面と、その左右斜め前の3マスにいる敵をまとめて攻撃します。",
    },
    hookSickle: {
      name: "鉤の鎌",
      slot: "weapon",
      power: 2,
      weight: 6,
      description: "攻撃力 +2。敵の方向へ進むと、直線2マス以内の最初の敵をその場で攻撃し、2マス先の敵は1マス手前へ引き寄せます。",
    },
    // Evolved weapons appear only through a shrine (weight 0).
    meteorSpear: {
      name: "流星の槍",
      slot: "weapon",
      power: 5,
      weight: 0,
      shape: "lampSpear",
      reach: 3,
      pierce: true,
      description: "攻撃力 +5。直線3マス以内の敵を突き、その奥の敵1体も貫きます。",
    },
    gorgeAxe: {
      name: "喰らいの大斧",
      slot: "weapon",
      power: 7,
      weight: 0,
      shape: "sweepAxe",
      leech: 1,
      description: "攻撃力 +7。正面と左右斜め前の3マスを薙ぎ、当たった敵1体ごとに体力+1。",
    },
    shadowSickle: {
      name: "影縫いの鎌",
      slot: "weapon",
      power: 4,
      weight: 0,
      shape: "hookSickle",
      reach: 3,
      pull: 2,
      description: "攻撃力 +4。直線3マス以内の最初の敵を攻撃し、最大2マス手前へ引き寄せます。",
    },
    quakeMaul: {
      name: "崩しの大槌",
      slot: "weapon",
      power: 6,
      weight: 0,
      shape: "pushMaul",
      push: 3,
      impact: 6,
      description: "攻撃力 +6。当てた敵を3マス押し出します。壁や敵にぶつかると6ダメージ。",
    },
    // Bane gear is always cursed: strong, with a cost while the curse holds.
    baneScythe: {
      name: "禍つの大鎌",
      slot: "weapon",
      power: 10,
      weight: 3,
      bane: "famine",
      description: "攻撃力 +10。必ず呪われていて、呪いがある間は満腹度が2倍の速さで減ります。清めると呪いと代償が消え、攻撃力の基本値が半分になります。",
    },
    pushMaul: {
      name: "打ち槌",
      slot: "weapon",
      power: 3,
      weight: 6,
      description: "攻撃力 +3。当てた敵を2マス押し出します。壁にぶつかると3ダメージ、敵にぶつかると双方に3ダメージ。罠も発動します。",
    },
    baneMirror: {
      name: "禍つの鏡盾",
      slot: "shield",
      power: 5,
      weight: 3,
      bane: "reflect",
      description: "防御力 +5。必ず呪われていて、呪いがある間は遠距離攻撃を跳ね返しますが、回復草の効果が半分になります。清めると呪いと効果が消え、防御力の基本値が半分になります。",
    },
    travelerShield: {
      name: "旅人の盾",
      slot: "shield",
      power: 0,
      weight: 12,
      description: "防御力 +0。旅のはじまりを支える盾。",
    },
    copperShield: {
      name: "銅の盾",
      slot: "shield",
      power: 2,
      weight: 27,
      description: "防御力 +2。扱いやすい盾。",
    },
    ironShield: {
      name: "鉄の盾",
      slot: "shield",
      power: 4,
      weight: 25,
      description: "防御力 +4。丈夫な鉄の盾。",
    },
    starShield: {
      name: "星鉄の盾",
      slot: "shield",
      power: 6,
      weight: 8,
      description: "防御力 +6。まれに見つかる強力な盾。",
    },
    leatherShield: {
      name: "革の盾",
      slot: "shield",
      power: 1,
      weight: 15,
      trait: "hunger",
      description:
        "防御力 +1。自然な満腹度の減少が半分。敵の空腹攻撃は防げません。",
    },
    mirrorShield: {
      name: "鏡の盾",
      slot: "shield",
      power: 2,
      weight: 10,
      trait: "ranged",
      description:
        "防御力 +2。敵の遠距離攻撃のダメージを、防御力で軽減した後に半減（切り上げ）。近接攻撃・強打・罠は対象外。",
    },
  };
  const EQUIPMENT_KEYS = {
    weapon: ["woodSword", "copperSword", "ironSword", "starSword"],
    shield: ["travelerShield", "copperShield", "ironShield", "starShield"],
  };
  const equipmentKind = (item) =>
    item?.variant ?? EQUIPMENT_KEYS[item?.kind]?.[item?.rank];
  const itemKind = (item) => (typeof item === "string" ? item : item?.kind);
  const isEquipment = (item) =>
    !!item &&
    typeof item === "object" &&
    Object.hasOwn(EQUIPMENT_NAMES, item.kind);
  const validEquipment = (item) =>
    isEquipment(item) &&
    Number.isInteger(item.rank) &&
    item.rank >= 0 &&
    item.rank <= 3 &&
    Number.isInteger(item.bonus) &&
    item.bonus >= -9 &&
    item.bonus <= 99 &&
    typeof item.cursed === "boolean" &&
    typeof item.identified === "boolean" &&
    (item.kills == null || (Number.isInteger(item.kills) && item.kills >= 0)) &&
    (item.purified == null || typeof item.purified === "boolean") &&
    (item.variant == null ||
      (Object.hasOwn(EQUIPMENT, item.variant) &&
        EQUIPMENT[item.variant].slot === item.kind));
  const ITEM_ORDER = Object.keys(ITEMS);
  const FLOOR_NAMES = [
    "苔むした入口",
    "静かな回廊",
    "忘れられた倉庫",
    "ひかり草の庭",
    "古井戸の底",
    "眠れる鉱山",
    "月影の遺跡",
    "深淵の回廊",
    "星を待つ間",
    "ランタンの聖域",
  ];
  const DEPTH_NAMES = [
    "封じられた入口",
    "冷たい石廊",
    "影の倉庫",
    "枯れ草の庭",
    "底なしの井戸",
    "黒鉄の鉱山",
    "月蝕の遺跡",
    "闇の回廊",
    "沈黙の間",
    "深淵の門",
    "霧の地下道",
    "崩れた礼拝堂",
    "灰の書庫",
    "忘却の庭",
    "凍える水路",
    "古代の採掘場",
    "亡霊の広場",
    "黄昏の回廊",
    "祈りの残響",
    "星なき祭壇",
    "虚ろな石廊",
    "黒曜の倉庫",
    "眠らぬ庭園",
    "奈落の井戸",
    "深層の鉱脈",
    "砕けた王座",
    "影の聖堂",
    "最後の回廊",
    "番人の間",
    "深淵の聖域",
  ];
  const DUNGEONS = {
    tutorial: {
      name: "灯りの迷宮",
      label: "はじめの冒険",
      floors: 10,
      treasure: "星のランタン",
      guardian: "星の番人",
      bossHp: 65,
      bossAttack: 14,
      bossExp: 30,
      names: FLOOR_NAMES,
    },
    depths: {
      name: "深淵の迷宮",
      label: "高難度",
      floors: 30,
      treasure: "深淵のランタン",
      guardian: "深淵の番人",
      bossHp: 180,
      bossAttack: 34,
      bossExp: 100,
      names: DEPTH_NAMES,
    },
  };
  const LAYOUT_NAMES = {
    branch: "枝分かれの迷宮",
    ring: "巡る回廊",
    hall: "大広間の迷宮",
  };
  const MONSTERS = {
    mossSlime: {
      type: "slime",
      tier: 0,
      name: "苔スライム",
      hp: 9,
      attack: 3,
      exp: 3,
      color: "苔色",
      colors: ["#4e6658", "#869374", "#a4c69b"],
    },
    amberSlime: {
      type: "slime",
      tier: 1,
      name: "琥珀スライム",
      hp: 15,
      attack: 6,
      exp: 5,
      color: "琥珀色",
      colors: ["#8f482c", "#da8b45", "#ffd293"],
    },
    caveBat: {
      type: "bat",
      tier: 1,
      name: "洞窟コウモリ",
      hp: 17,
      attack: 7,
      exp: 7,
      color: "紫",
      colors: ["#564764", "#87759b", "#d49bba"],
    },
    emberBat: {
      type: "bat",
      tier: 2,
      name: "紅翼コウモリ",
      hp: 25,
      attack: 10,
      exp: 9,
      color: "赤",
      colors: ["#83354a", "#d85d72", "#ffa899"],
    },
    frostBat: {
      type: "bat",
      tier: 3,
      name: "氷翼コウモリ",
      hp: 35,
      attack: 14,
      exp: 11,
      color: "水色",
      colors: ["#365e91", "#6cb9e6", "#c0edff"],
    },
    thunderBat: {
      type: "bat",
      tier: 4,
      name: "雷翼コウモリ",
      hp: 45,
      attack: 18,
      exp: 14,
      color: "黄",
      colors: ["#8d6933", "#e1bd54", "#fff2a0"],
    },
    jadeBat: {
      type: "bat",
      tier: 5,
      name: "翡翠コウモリ",
      hp: 55,
      attack: 22,
      exp: 16,
      color: "翡翠色",
      colors: ["#286961", "#56b89a", "#b2f1cf"],
    },
    obsidianBat: {
      type: "bat",
      tier: 6,
      name: "黒曜コウモリ",
      hp: 69,
      attack: 27,
      exp: 20,
      color: "銀灰色",
      colors: ["#41485f", "#8c99ad", "#d4deed"],
    },
    lanternGhost: {
      type: "ghost",
      tier: 2,
      name: "灯りの亡霊",
      hp: 27,
      attack: 11,
      exp: 11,
      color: "薄桃色",
      colors: ["#675777", "#87759b", "#d49bba"],
    },
    frostGhost: {
      type: "ghost",
      tier: 3,
      name: "氷灯の亡霊",
      hp: 37,
      attack: 15,
      exp: 13,
      color: "水色",
      colors: ["#365e91", "#6cb9e6", "#c0edff"],
    },
    goldGhost: {
      type: "ghost",
      tier: 4,
      name: "黄金の亡霊",
      hp: 47,
      attack: 19,
      exp: 16,
      color: "金色",
      colors: ["#8d6933", "#e1bd54", "#fff2a0"],
    },
    jadeGhost: {
      type: "ghost",
      tier: 5,
      name: "翡翠の亡霊",
      hp: 57,
      attack: 23,
      exp: 18,
      color: "翡翠色",
      colors: ["#286961", "#56b89a", "#b2f1cf"],
    },
    abyssGhost: {
      type: "ghost",
      tier: 6,
      name: "深淵の亡霊",
      hp: 71,
      attack: 28,
      exp: 22,
      color: "銀紫色",
      colors: ["#53406d", "#a494cc", "#e7d9ff"],
    },
    starGuardian: {
      type: "guardian",
      tier: 4,
      name: "星の番人",
      hp: 65,
      attack: 14,
      exp: 30,
      color: "金色",
      colors: ["#76563c", "#b99a58", "#ffe7a6"],
    },
    abyssGuardian: {
      type: "guardian",
      tier: 6,
      name: "深淵の番人",
      hp: 180,
      attack: 34,
      exp: 100,
      color: "青紫色",
      colors: ["#353e75", "#7f8de0", "#ccecff"],
    },
    ironBeetle: {
      type: "beetle",
      tier: 1,
      name: "鉄殻甲虫",
      hp: 18,
      attack: 5,
      exp: 7,
      color: "鉄灰色",
      colors: ["#3d4b59", "#7f97a2", "#c7dde0"],
    },
    cobaltBeetle: {
      type: "beetle",
      tier: 4,
      name: "蒼鋼甲虫",
      hp: 49,
      attack: 16,
      exp: 16,
      color: "鋼青色",
      colors: ["#284a70", "#528fcd", "#b4e5ff"],
    },
    thornPlant: {
      type: "plant",
      tier: 2,
      name: "棘吐き草",
      hp: 20,
      attack: 8,
      exp: 10,
      color: "若草色",
      colors: ["#3b5e37", "#80a855", "#dcad81"],
    },
    moonPlant: {
      type: "plant",
      tier: 5,
      name: "月光花",
      hp: 48,
      attack: 20,
      exp: 19,
      color: "月白色",
      colors: ["#4c6083", "#9cadce", "#f5efcb"],
    },
    coinMimic: {
      type: "mimic",
      tier: 1,
      name: "金貨ミミック",
      hp: 20,
      attack: 8,
      exp: 10,
      color: "金色",
      colors: ["#77552d", "#d2a457", "#ffdf91"],
    },
    starMimic: {
      type: "mimic",
      tier: 5,
      name: "星貨ミミック",
      hp: 64,
      attack: 24,
      exp: 25,
      color: "白金色",
      colors: ["#647282", "#afc9d2", "#f4f3d5"],
    },
    lanternMoth: {
      type: "moth",
      tier: 1,
      name: "灯喰い蛾",
      hp: 12,
      attack: 4,
      exp: 6,
      color: "橙色",
      colors: ["#775045", "#dc9860", "#ffe2a3"],
    },
    eclipseMoth: {
      type: "moth",
      tier: 4,
      name: "月蝕蛾",
      hp: 38,
      attack: 15,
      exp: 17,
      color: "藍紫色",
      colors: ["#433969", "#9c85c9", "#dce1ff"],
    },
    stoneGolem: {
      type: "golem",
      tier: 2,
      name: "石拳ゴーレム",
      hp: 34,
      attack: 14,
      exp: 14,
      color: "石灰色",
      colors: ["#515852", "#909d8a", "#d5ddbd"],
    },
    obsidianGolem: {
      type: "golem",
      tier: 6,
      name: "黒曜ゴーレム",
      hp: 86,
      attack: 32,
      exp: 30,
      color: "黒紫色",
      colors: ["#37364d", "#77718d", "#c8bce5"],
    },
  };
  Object.assign(MONSTERS.mossSlime, {
    trait: "slow",
    speed: 1,
    cadence: 2,
    feature: "2ターンに1歩進みます。隣接中は毎ターン攻撃します。",
    counter: "距離を取って矢で攻撃。追いかけられても離れやすい相手です。",
  });
  Object.assign(MONSTERS.amberSlime, {
    trait: "regen",
    regen: 1,
    feature: "毎ターンHPを1回復します。",
    counter: "攻撃を続け、回復する隙を与えずに倒しましょう。",
  });
  for (const key of ["caveBat", "emberBat", "obsidianBat"])
    Object.assign(MONSTERS[key], {
      trait: "fast",
      speed: 2,
      feature: "1ターンに最大2歩接近します。移動したターンは攻撃しません。",
      counter: "早めに矢で迎撃。距離2でも次の行動で隣接します。",
    });
  for (const [key, range] of [
    ["frostBat", 3],
    ["thunderBat", 4],
    ["lanternGhost", 3],
    ["frostGhost", 4],
    ["abyssGuardian", 5],
  ])
    Object.assign(MONSTERS[key], {
      trait: "ranged",
      range,
      feature: `直線${range}マス以内の1マスを狙い、次のターンに遠距離攻撃します。`,
      counter: "狙われたマスから移動。壁や別の敵でも射線を遮れます。",
    });
  for (const [key, hunger] of [
    ["jadeBat", 3],
    ["jadeGhost", 4],
    ["lanternMoth", 3],
    ["eclipseMoth", 5],
  ])
    Object.assign(MONSTERS[key], {
      trait: "hunger",
      hunger,
      feature: `近接攻撃が当たると、体力に加えて満腹度を${hunger}減らします。`,
      counter: "矢で先に倒すか、パンを温存して接近戦を短くしましょう。",
    });
  Object.assign(MONSTERS.goldGhost, {
    trait: "regen",
    regen: 3,
    feature: "毎ターンHPを3回復します。",
    counter: "矢と剣を組み合わせ、短いターンで倒しましょう。",
  });
  Object.assign(MONSTERS.abyssGhost, {
    trait: "blink",
    feature:
      "攻撃を受けると、次の行動で同じ部屋の3マス以内へ転移します。転移中は攻撃しません。",
    counter: "転移先を確認して矢で追撃。通路では転移できません。",
  });
  for (const key of ["ironBeetle", "cobaltBeetle"]) {
    const armor = key === "ironBeetle" ? 2 : 4;
    Object.assign(MONSTERS[key], {
      trait: "armor",
      armor,
      feature: `剣と矢のダメージを${armor}軽減します。受けるダメージは最低1です。`,
      counter: "雷光の灯札は殻の軽減を無視できます。",
    });
  }
  for (const key of ["thornPlant", "moonPlant"]) {
    const range = key === "thornPlant" ? 4 : 5;
    Object.assign(MONSTERS[key], {
      trait: "ranged",
      stationary: true,
      range,
      feature: `移動せず、直線${range}マス以内の1マスを狙って次のターンに攻撃します。`,
      counter: "射線を外して近づくか、予告に合わせて横へ移動しましょう。",
    });
  }
  for (const key of ["coinMimic", "starMimic"])
    Object.assign(MONSTERS[key], {
      trait: "mimic",
      feature:
        "金貨の山に化けています。隣接すると正体を現し、そのターンは攻撃しません。攻撃されると即座に正体を現します。",
      counter:
        "正体を見たら距離を取り、矢で迎撃。反撃前の1ターンを使いましょう。",
    });
  for (const key of ["starGuardian", "stoneGolem", "obsidianGolem"])
    Object.assign(MONSTERS[key], {
      trait: "windup",
      cadence: key === "starGuardian" ? 1 : 2,
      armor: key === "obsidianGolem" ? 4 : 0,
      feature: `隣の1マスを狙い、次のターンに強打します。${key === "starGuardian" ? "" : "移動は2ターンに1歩です。"}${key === "obsidianGolem" ? "剣と矢のダメージを4軽減します。" : ""}`,
      counter: "予告のマスから移動し、空振りの隙に攻撃しましょう。",
    });
  Object.assign(MONSTERS, {
    bubbleSlime: {
      type: "slime",
      tier: 1,
      name: "泡スライム",
      hp: 14,
      attack: 5,
      exp: 5,
      color: "泡色",
      colors: ["#5d7f8f", "#9fd2e0", "#e2f6fb"],
      trait: "split",
      feature: "傷を受けてHPが4以上残ると、一度だけHPを分けて分裂します。分身の経験値は1で、金貨と灯影は残しません。",
      counter: "一撃で倒すか、斧でまとめて薙ぎましょう。",
    },
    rustSlime: {
      type: "slime",
      tier: 3,
      name: "錆スライム",
      hp: 34,
      attack: 14,
      exp: 15,
      color: "赤錆色",
      colors: ["#5a3a2a", "#a8643a", "#e0a36c"],
      trait: "corrode",
      feature: "近接攻撃が当たると、装備中の盾の補正値を1下げます（−3まで）。",
      counter: "離れて矢や灯弾で倒しましょう。",
    },
    mudSlime: {
      type: "slime",
      tier: 4,
      name: "泥スライム",
      hp: 46,
      attack: 18,
      exp: 19,
      color: "泥色",
      colors: ["#3f3a2e", "#7d6b4f", "#b9a57e"],
      trait: "mudTrail",
      feature: "歩いた跡の何もない床を水たまりに変えます。階段や既存の地形は変えません。",
      counter: "水たまりを雷光や雷の矢で伝わせましょう。自分の足元にも注意。",
    },
    thiefBat: {
      type: "bat",
      tier: 2,
      name: "灯盗みコウモリ",
      hp: 22,
      attack: 6,
      exp: 12,
      color: "菫色",
      colors: ["#2e2a3a", "#5b4f7a", "#c7b8f0"],
      trait: "steal",
      feature: "近接攻撃で道具を1つ盗み、最大2歩ずつ逃げます。矢と装備は盗みません。倒すと取り返せますが、階を移ると失われます。",
      counter: "近づかれる前に矢で迎撃しましょう。",
    },
    bellBat: {
      type: "bat",
      tier: 3,
      name: "鐘鳴りコウモリ",
      hp: 30,
      attack: 12,
      exp: 14,
      color: "真鍮色",
      colors: ["#4a3b20", "#c9a43a", "#f6e3a0"],
      trait: "call",
      feature: "目を覚ますと仲間を起こす魔物。同じ部屋と周囲3マス以内に呼び声が届きます。",
      counter: "起きる前に倒すか、擬態の灯影で気づかれにくくしましょう。",
    },
    hornBeetle: {
      type: "beetle",
      tier: 3,
      name: "角甲虫",
      hp: 36,
      attack: 15,
      exp: 16,
      color: "赤銅色",
      colors: ["#3b2a22", "#8a4b32", "#e3a27b"],
      trait: "charge",
      range: 4,
      feature: "直線4マス以内を予告し、次のターンに突進します。攻撃力の1.5倍の衝撃で押し出します。壁にぶつかると6ダメージを受け、次の行動を失います。",
      counter: "予告の直線から横へ避け、壁や罠へ突っ込ませましょう。",
    },
    mirrorBeetle: {
      type: "beetle",
      tier: 5,
      name: "鏡甲虫",
      hp: 56,
      attack: 22,
      exp: 23,
      color: "鏡色",
      colors: ["#3d4650", "#b7c3cf", "#f3f7fb"],
      trait: "mirror",
      feature: "矢と灯弾を跳ね返し、リネに半分のダメージ。雷の矢の追加効果も防ぎます。",
      counter: "近接攻撃、押し出しの衝突、罠や雷光の灯札で倒しましょう。",
    },
    snareVine: {
      type: "plant",
      tier: 2,
      name: "絡み蔦",
      hp: 26,
      attack: 7,
      exp: 12,
      color: "蔦色",
      colors: ["#2f4a2a", "#4f8a3a", "#b8e09a"],
      trait: "snare",
      range: 3,
      stationary: true,
      feature: "移動せず、直線3マス以内を予告して射撃します。当たると次の1ターン移動できません。攻撃と道具は使えます。",
      counter: "射線を外すか、草むらや霧に隠れましょう。",
    },
    blastMoth: {
      type: "moth",
      tier: 3,
      name: "爆ぜ蛾",
      hp: 20,
      attack: 12,
      exp: 14,
      color: "火橙色",
      colors: ["#5a2a1e", "#e0662b", "#ffd66b"],
      trait: "burst",
      feature: "倒れると周囲3×3に10ダメージ。リネも巻き込まれ、油や草には火が付きます。HP半分以下で体が明るく点滅します。",
      counter: "離れて倒すか、敵の群れへ押し込んで爆散を狙いましょう。",
    },
    archerGhost: {
      type: "ghost",
      tier: 4,
      name: "影弓の亡霊",
      hp: 44,
      attack: 18,
      exp: 20,
      color: "影色",
      colors: ["#2a2a3a", "#6a6a8a", "#d0d0f0"],
      trait: "kite",
      range: 4,
      feature: "直線4マス以内を予告して射撃します。隣接すると1歩下がり、下がれない時は近接攻撃します。",
      counter: "曲がり角へ追い込むか、鉤の鎌で引き寄せましょう。",
    },
    mendGhost: {
      type: "ghost",
      tier: 5,
      name: "癒し灯の亡霊",
      hp: 40,
      attack: 10,
      exp: 20,
      color: "淡緑色",
      colors: ["#3a4a3a", "#9fd6a8", "#f0fff0"],
      trait: "mend",
      feature: "周囲3マス以内で最もHP割合の低い仲間を、自分の行動の代わりに8回復します。隣接すると1歩下がります。",
      counter: "灯弾や矢で最優先に倒しましょう。",
    },
    wardGolem: {
      type: "golem",
      tier: 4,
      name: "大盾ゴーレム",
      hp: 62,
      attack: 20,
      exp: 24,
      color: "灰白色",
      colors: ["#3a3a3a", "#8a8a7a", "#d8d6c0"],
      trait: "ward",
      cadence: 2,
      feature: "近接攻撃・矢・灯弾のダメージを半分にします。移動は2ターンに1歩。強打の予告はせず、隣接中は毎ターン攻撃します。",
      counter: "罠・炎・押し出しの衝突・雷光の灯札は軽減されません。",
    },
  });
  Object.assign(MONSTERS, {
    bubbleMother: {
      type: "slime", tier: 3, name: "大泡の母体", hp: 120, attack: 14, exp: 50,
      color: "泡青色", colors: ["#294f68", "#75bdd1", "#e2f6fb"],
      trait: "split", splitLimit: 3, miniboss: 10, size: 1.35,
      feature: "深淵10階の大きな泡スライム。傷を受けてHPが4以上残ると、HPを分けて3回まで分裂します。分身は分裂せず、経験値1で金貨と欠片を残しません。",
      counter: "斧や爆ぜ実でまとめて攻撃しましょう。母体を倒すと、次に使う灯台の候補が一つ増えます。戦わずに階段へ進むこともできます。",
    },
    gateGolem: {
      type: "golem", tier: 5, name: "鉄門の大ゴーレム", hp: 200, attack: 26, exp: 80,
      color: "鉄門色", colors: ["#343c46", "#8597ac", "#dce5ef"],
      trait: "charge", ward: true, range: 4, cadence: 2, miniboss: 20, size: 1.4,
      feature: "深淵20階の大きな守り手。近接攻撃・矢・灯弾を半減し、直線4マス以内を予告して突進します。普段の移動は2ターンに1歩です。",
      counter: "横へ避け、壁や罠へ突っ込ませましょう。衝突・炎・雷光は守りを無視します。倒すと次に使う灯台の候補が一つ増えますが、階段は討伐せずに使えます。",
    },
  });
  const monsterStories = {
    slime: "ひんやりした石畳に暮らす、葉飾りのぷるぷるした魔物。",
    bat: "大きな耳とふかふかの襟が目印。遺跡の天井が寝床です。",
    ghost: "かつての旅人の灯りが魂になった姿。小さなランタンを手放しません。",
    beetle: "鉱石のような甲殻を持つ虫。長い角で遺跡のかけらを掘り起こします。",
    plant: "一輪の花と葉のマントをまとった魔物。石の隙間に根を張ります。",
    mimic: "忘れられた宝箱に宿る魔物。ぴかぴかの金貨が大好きです。",
    moth: "ランタンに惹かれる、ふわふわの蛾。大きな羽に灯りの輪を描きます。",
    golem: "苔と若葉をまとい、古い遺跡を歩き続ける無口な守り手。",
    guardian: "ランタンを核にした古代の番人。失われた灯りを守り続けています。",
  };
  for (const monster of Object.values(MONSTERS)) monster.story = monsterStories[monster.type];
  const MONSTER_POOLS = [
    ["mossSlime"],
    ["amberSlime", "caveBat", "ironBeetle", "coinMimic", "lanternMoth"],
    [
      "emberBat",
      "lanternGhost",
      "ironBeetle",
      "coinMimic",
      "lanternMoth",
      "thornPlant",
      "stoneGolem",
    ],
    [
      "frostBat",
      "frostGhost",
      "ironBeetle",
      "coinMimic",
      "lanternMoth",
      "thornPlant",
      "stoneGolem",
    ],
    [
      "thunderBat",
      "goldGhost",
      "cobaltBeetle",
      "eclipseMoth",
      "stoneGolem",
      "coinMimic",
    ],
    [
      "jadeBat",
      "jadeGhost",
      "cobaltBeetle",
      "eclipseMoth",
      "moonPlant",
      "starMimic",
    ],
    [
      "obsidianBat",
      "abyssGhost",
      "cobaltBeetle",
      "eclipseMoth",
      "moonPlant",
      "starMimic",
      "obsidianGolem",
    ],
  ];
  for (const [tier, species] of [
    [1, "bubbleSlime"],
    [3, "rustSlime"],
    [4, "mudSlime"],
    [2, "thiefBat"],
    [3, "bellBat"],
    [3, "hornBeetle"],
    [5, "mirrorBeetle"],
    [2, "snareVine"],
    [3, "blastMoth"],
    [4, "archerGhost"],
    [5, "mendGhost"],
    [4, "wardGolem"],
    [6, "archerGhost"], [6, "mirrorBeetle"], [6, "wardGolem"],
  ]) MONSTER_POOLS[tier].push(species);
  const MONSTER_MARKS = [
    "無印",
    "横線",
    "菱形",
    "山形",
    "十字",
    "王冠",
    "星形",
  ];
  function monsterTier(floor, dungeon) {
    const depth = floor + (dungeon === "depths" ? 2 : 0);
    return depth < 3
      ? 0
      : depth < 6
        ? 1
        : depth < 11
          ? 2
          : depth < 16
            ? 3
            : depth < 21
              ? 4
              : depth < 26
                ? 5
                : 6;
  }
  function monsterStats(species, elite = false) {
    const m = MONSTERS[species];
    if (elite && (m.type === "guardian" || m.miniboss)) throw new RangeError("Guardians and minibosses cannot be elite");
    return {
      species,
      type: m.type,
      name: elite ? `灯冠の${m.name}` : m.name,
      maxHp: elite ? Math.ceil(m.hp * 1.5) : m.hp,
      attack: elite ? Math.ceil(m.attack * 1.2) : m.attack,
      exp: elite ? m.exp * 2 : m.exp,
      ...(elite ? {elite: true} : {}),
    };
  }
  const data = {
    W,
    H,
    INVENTORY_CAPACITY,
    DIRS,
    ITEMS,
    EQUIPMENT,
    FLOOR_NAMES,
    LAYOUT_NAMES,
    DUNGEONS,
    MONSTERS,
    MONSTER_POOLS,
    MONSTER_MARKS,
    monsterTier,
    monsterStats,
    SCROLLS,
    RESCUE_SCROLLS,
    NEW_ITEM_POOL,
    jarConsumable,
    validJar,
    SCROLL_NAMES,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    equipmentKind,
    itemKind,
    isEquipment,
    validEquipment,
    ITEM_ORDER,
    WEAPON_SHAPES,
    TRAPS,
    BOONS,
    RESONANCES,
    EVOLUTIONS,
    EVOLVE_KILLS,
    SHOP_PRICES,
    SHOP_SERVICES,
    START_KITS,
    THROWN_ITEMS,
    INFUSIONS,
    INFUSION_SHOTS,
    TERRAIN_ITEMS,
    SURFACES,
    ECHOES,
    ECHO_SOURCES,
    echoOfSpecies,
  };
  root.DungeonData = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);
