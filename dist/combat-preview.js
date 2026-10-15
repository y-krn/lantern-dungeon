(() => {
  "use strict";
  const { W, H, monsterStats } = DungeonData;
  const $ = id => document.getElementById(id);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let engine, scene = new URLSearchParams(location.search).get("scene") === "walk" ? "walk" : "duel", auto = null;
  let walkDirection = [1, 0];
  let footfall = new URLSearchParams(location.search).get("footfall") === "1", slow = false, reviewFrame = 0;
  const reviewCanvas = $("gait-review"), reviewContext = reviewCanvas.getContext("2d");
  const renderer = createDungeonRenderer({
    canvas: $("scene"), minimap: $("minimap"), viewport: $("viewport"),
    getEngine: () => engine, reduced,
  });
  const labels = {
    walk: "歩行 · 足運びとランタンの揺れ（8方向）",
    duel: "一対一 · 攻撃 → 反撃", surrounded: "囲まれる · 攻撃 → 三方向の反撃",
    miss: "空振り · 敵がいなくても剣を振る", kill: "撃破 · 命中してから消える",
    ranged: "敵の射撃 · 構え → 次のターンに発射",
    arrow: "矢の命中 · 発射 → 飛行 → 着弾", arrowMiss: "矢の空振り · 壁まで飛んで落ちる",
    arrowKill: "矢で撃破 · 着弾してから消える",
  };
  function prepare() {
    engine = new DungeonEngine(73, "tutorial");
    const x = Math.floor(W / 2), y = Math.floor(H / 2);
    engine.player.x = x; engine.player.y = y; engine.player.facing = [1, 0];
    engine.player.hp = engine.player.maxHp = 100;
    engine.tiles.fill(0);
    for (let py = y - 5; py <= y + 5; py++)
      for (let px = x - 5; px <= x + 5; px++) engine.tiles[engine.key(px, py)] = 1;
    engine.rooms = [{ x: x - 5, y: y - 5, w: 11, h: 11 }];
    engine.stairs = { x: x - 4, y: y - 4 };
    engine.items = []; engine.traps = []; engine.monsterHouse = null; engine.enemies = [];
    const add = (species, dx, dy, hp = 60) => engine.enemies.push({
      ...monsterStats(species), id: engine.enemies.length + 1,
      x: x + dx, y: y + dy, hp, maxHp: hp, awake: true, revealed: true,
    });
    if (scene === "duel" || scene === "kill") add("mossSlime", 1, 0, scene === "kill" ? 1 : 60);
    if (scene === "surrounded") {
      add("mossSlime", 1, 0); add("caveBat", -1, 0); add("cobaltBeetle", 0, -1);
    }
    if (scene === "ranged") {
      const species = Object.keys(DungeonData.MONSTERS).find(key => DungeonData.MONSTERS[key].trait === "ranged");
      add(species, 3, 0);
    }
    if (scene.startsWith("arrow")) {
      engine.player.bag.push(...Array(20).fill("arrow")); engine.player.ammo = "arrow";
      if (scene !== "arrowMiss") add("mossSlime", 3, 0, scene === "arrowKill" ? 1 : 60);
    }
    engine.log = []; engine.effects = [];
    engine.reveal(); engine.seen = engine.visible.slice();
    renderer.reset({ x: x + .5, y: y + .5 });
    $("scene-label").textContent = labels[scene];
    $("walk-directions").hidden = scene !== "walk";
    $("walk-review").hidden = scene !== "walk";
    $("gait-review").hidden = scene !== "walk" || !footfall;
    $("scene").hidden = scene === "walk" && footfall;
    $("minimap").hidden = scene === "walk" && footfall;
    $("footfall").setAttribute("aria-pressed", String(footfall));
    $("slow").disabled = !footfall;
    $("attack").textContent = scene === "walk" ? footfall ? "次のコマ" : "一歩進む" : "攻撃する";
    $("wait").textContent = scene === "walk" ? "停止する" : "足踏み";
    document.querySelector("h1").textContent = scene === "walk" ? "灯りを手に、一歩ずつ。" : "剣を振る、魔物が返す。";
    document.title = scene === "walk" ? "歩く動き — 灯りの迷宮" : "攻撃の動き — 灯りの迷宮";
    $("feedback").textContent = scene === "walk" ? footfall ? "「次のコマ」で足の接地・支持・振り出しを確認できます。" : "「一歩進む」または「自動再生」で歩行を確認できます。" : "「攻撃する」で動きを確認できます。";
    document.querySelectorAll("[data-scene]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.scene === scene)));
  }
  function setAuto(enabled) {
    clearInterval(auto);
    const count = renderer.walkFrameCount(renderer.heroSprite(walkDirection));
    const cycleTime = 160 * renderer.walkCycleDistance(renderer.heroSprite(walkDirection));
    const interval = scene === "walk" && footfall ? slow ? 180 : cycleTime / count : scene === "walk" ? 140 : 1200;
    auto = enabled ? setInterval(() => { if (!document.hidden) act(); }, interval) : null;
    $("auto").setAttribute("aria-pressed", String(!!auto));
    $("auto").textContent = auto ? "再生を止める" : "自動再生";
  }
  function act(wait = false) {
    if (renderer.remaining() > 0) return;
    if (engine.status !== "playing" || (!["walk", "miss", "arrowMiss"].includes(scene) && !engine.enemies.length) ||
        (scene.startsWith("arrow") && !engine.arrowCount())) prepare();
    engine.player.hp = engine.player.maxHp;
    if (scene === "walk") {
      if (wait) { setAuto(false); return; }
      if (footfall) {
        const count = renderer.walkFrameCount(renderer.heroSprite(walkDirection));
        reviewFrame = (reviewFrame + 1) % count;
        document.querySelectorAll("[data-walk]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.walk === walkDirection.join(","))));
        return;
      }
      const from = { x: engine.player.x, y: engine.player.y };
      if (!engine.move(...walkDirection)) {
        walkDirection = walkDirection.map(value => -value);
        engine.move(...walkDirection);
      }
      document.querySelectorAll("[data-walk]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.walk === walkDirection.join(","))));
      renderer.movePlayer(from, performance.now());
      $("feedback").textContent = "方向ボタンで向きを変更。「停止する」で歩き終えて立ち止まります。";
    }
    else if (wait) engine.wait(); else if (scene.startsWith("arrow")) engine.shoot(); else engine.attack();
    renderer.playEffects(engine.effects, event => {
      if (["hit", "damage", "swing"].includes(event.type)) {
        const from = event.attack?.source.id === "player" ? "リネ" : DungeonData.MONSTERS[event.attack?.source.species]?.name;
        $("feedback").textContent = event.type === "swing" ? `${from || "リネ"}：空振り。`
          : `${from || "魔物"}の攻撃：${event.value}ダメージ。`;
      }
      if (event.type === "kill") $("feedback").textContent = "命中 → 魔物を撃破。もう一度攻撃すると同じ場面を試せます。";
      if (event.type === "warning") $("feedback").textContent = "敵が射撃の構え。次のターンに発射します。";
      if (event.type === "arrow" && scene === "arrowMiss") $("feedback").textContent = "木の矢は敵に当たらず、壁にぶつかって床に落ちました。";
    });
    engine.effects = [];
  }
  for (const button of document.querySelectorAll("[data-scene]")) button.addEventListener("click", () => {
    const playing = !!auto; setAuto(false);
    scene = button.dataset.scene;
    document.querySelectorAll("[data-scene]").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    prepare();
    if (playing) setAuto(true);
  });
  for (const button of document.querySelectorAll("[data-walk]")) button.addEventListener("click", () => {
    walkDirection = button.dataset.walk.split(",").map(Number); reviewFrame = 0; act();
    if (auto) setAuto(true);
  });
  $("attack").addEventListener("click", () => act());
  $("wait").addEventListener("click", () => act(true));
  $("auto").addEventListener("click", () => {
    if (auto) setAuto(false); else { act(); setAuto(true); }
  });
  $("footfall").addEventListener("click", () => {
    const playing = !!auto; setAuto(false); footfall = !footfall; reviewFrame = 0; prepare();
    if (playing) setAuto(true);
  });
  $("slow").addEventListener("click", () => {
    const playing = !!auto; setAuto(false); slow = !slow;
    $("slow").setAttribute("aria-pressed", String(slow));
    if (playing) setAuto(true);
  });
  function drawFootfall() {
    if (scene === "walk" && footfall) {
      const width = reviewCanvas.width, height = reviewCanvas.height;
      const s = Math.min(width / 44, height / 50), baseline = height * .7;
      reviewContext.fillStyle = "#1f2928";
      reviewContext.fillRect(0, 0, width, height);
      reviewContext.strokeStyle = "#a89368";
      reviewContext.lineWidth = 2;
      reviewContext.beginPath(); reviewContext.moveTo(width * .2, baseline); reviewContext.lineTo(width * .8, baseline); reviewContext.stroke();
      const type = renderer.heroSprite(walkDirection), count = renderer.walkFrameCount(type);
      renderer.sprite(reviewContext, type, width / 2 - 8 * s, baseline - 18 * s, s, 1, walkDirection[0] < 0, null, reduced ? null : reviewFrame % count);
      const phases = ["接地", "体重移動", "足の通過", "反対脚の接地", "体重移動", "足の通過"];
      $("scene-label").textContent = reduced ? "動き軽減：歩行の自動切替を省略" : `足運び（拡大） · ${reviewFrame % count + 1} / ${count}${count === 6 ? ` · ${phases[reviewFrame % count]}` : ""}`;
    }
    requestAnimationFrame(drawFootfall);
  }
  $("motion-notice").hidden = !reduced;
  prepare(); new ResizeObserver(() => {
    renderer.resize(); reviewCanvas.width = $("scene").width; reviewCanvas.height = $("scene").height;
  }).observe($("viewport"));
  renderer.resize(); renderer.start();
  requestAnimationFrame(drawFootfall);
})();
