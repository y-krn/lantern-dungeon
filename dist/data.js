(function (root) {
  "use strict";
  const W = 44,
    H = 30,
    INVENTORY_CAPACITY = 20;
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
    description: "倒した魔物の残り火。踏むとランタンに宿り、今の灯影と入れ替わります。",
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
  function echoOfSpecies(species) {
    const source = ECHO_SOURCES[species];
    if (!source) return null;
    const [id, tier] = source, echo = ECHOES[id];
    return { id, tier, species, name: echo.name, short: echo.short, text: echo.text[Math.min(tier, echo.text.length - 1)] };
  }
  const SCROLLS = ["scroll", "map", "identify", "uncurse"];
  const SCROLL_NAMES = ["赤い灯札", "青い灯札", "黄色い灯札", "緑の灯札"];
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
      weight: 22,
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
    pushMaul: {
      name: "打ち槌",
      slot: "weapon",
      power: 3,
      weight: 6,
      description: "攻撃力 +3。当てた敵を2マス押し出します。壁にぶつかると3ダメージ、敵にぶつかると双方に3ダメージ。罠も発動します。",
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
      weight: 30,
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
  function monsterStats(species) {
    const m = MONSTERS[species];
    return {
      species,
      type: m.type,
      name: m.name,
      maxHp: m.hp,
      attack: m.attack,
      exp: m.exp,
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
    SCROLL_NAMES,
    EQUIPMENT_NAMES,
    EQUIPMENT_KEYS,
    equipmentKind,
    itemKind,
    isEquipment,
    validEquipment,
    ITEM_ORDER,
    WEAPON_SHAPES,
    ECHOES,
    ECHO_SOURCES,
    echoOfSpecies,
  };
  root.DungeonData = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);
