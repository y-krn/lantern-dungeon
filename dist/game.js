(() => {
  "use strict";
  const {
    INVENTORY_CAPACITY,
    DIRS,
    DUNGEONS,
    MONSTERS,
    MONSTER_MARKS,
  } = DungeonData;
  const $ = (id) => document.getElementById(id);
  $("game-viewport").after($("location-hint").closest(".canvas-caption"));
  const portraitUI = matchMedia("(max-width:600px) and (orientation:portrait)").matches;
  const pwaPanel = $("pwa-panel");
  const canvas = $("game");
  const pickupNotice = document.createElement("div");
  pickupNotice.className = "pickup-notice";
  pickupNotice.setAttribute("role", "status");
  pickupNotice.setAttribute("aria-atomic", "true");
  $("game-viewport").append(pickupNotice);
  let pickupTimer;
  function clearPickupNotice() {
    clearTimeout(pickupTimer);
    pickupNotice.textContent = "";
  }
  function showPickupNotice(text) {
    clearPickupNotice();
    pickupNotice.textContent = text;
    pickupTimer = setTimeout(clearPickupNotice, 1000);
  }
  const trial = typeof URLSearchParams !== "undefined" && new URLSearchParams(window.location.search).get("trial") === "strategy";
  const Engine = trial ? StrategyEngine : DungeonEngine;
  const SAVE_KEY = trial ? "lantern-strategy-trial-v2" : "lantern-dungeon-v1",
    PROGRESS_KEY = trial ? "lantern-strategy-progress-v2" : "lantern-dungeon-progress-v1",
    MONSTERS_KEY = trial ? "lantern-strategy-monsters-v2" : "lantern-dungeon-monsters-v1";
  const knownMonsters = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(MONSTERS_KEY) || "[]");
    if (Array.isArray(saved))
      saved.filter((species) => typeof species === "string" && Object.hasOwn(MONSTERS, species)).forEach((species) => knownMonsters.add(species));
  } catch {
    // A damaged field journal does not invalidate the current adventure.
  }
  let engine,
    storageAvailable = true,
    tutorialCleared = false;
  try {
    tutorialCleared = localStorage.getItem(PROGRESS_KEY) === "true";
    const raw = localStorage.getItem(SAVE_KEY);
    engine = Engine.restore(raw);
    if (trial && raw && !engine) storageAvailable = false;
  } catch {
    storageAvailable = false;
  }
  const resumed = !!engine;
  engine ||= new Engine();
  // A brand-new adventure (not a resumed one) starts with the kit offer.
  if (!resumed && !trial) engine.kitOffered = true;
  engine.tutorialCleared ||= tutorialCleared;
  let sound = false,
    audio = null,
    lastInput = 0,
    modalKind = "",
    minimapVisible = true,
    announcedEnd = false,
    turnOnly = false;
  const facingNames = ["上", "右上", "右", "右下", "下", "左下", "左", "左上"];
  let strategyAim = null;
  const renderer = createDungeonRenderer({
    canvas,
    minimap: $("minimap"),
    viewport: $("game-viewport"),
    getEngine: () => engine,
    getTarget: () => strategyAim && ({...strategyAim, plan: engine.previewUse(strategyAim.index, strategyAim, strategyAim.mode)}),
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  function directionInput(dx, dy, faceOnly = turnOnly, force = false) {
    if (strategyAim) {
      strategyAim.x = Math.max(0, Math.min(DungeonData.W - 1, strategyAim.x + dx));
      strategyAim.y = Math.max(0, Math.min(DungeonData.H - 1, strategyAim.y + dy));
      updateAim(); return;
    }
    act(
      () => (faceOnly ? engine.face(dx, dy) : engine.move(dx, dy)),
      force || faceOnly,
    );
  }
  function toggleTurnOnly() {
    if ($("modal").open || engine.status !== "playing") return;
    turnOnly = !turnOnly;
    updateUI();
  }
  function save() {
    const notice = $("save-label").closest(".save-status");
    notice.hidden = false;
    if (!storageAvailable) {
      $("save-label").textContent = "保存無効。このタブで冒険を続けられます";
      return;
    }
    try {
      if (engine.tutorialCleared) localStorage.setItem(PROGRESS_KEY, "true");
      localStorage.setItem(SAVE_KEY, engine.serialize());
      localStorage.setItem(MONSTERS_KEY, JSON.stringify([...knownMonsters]));
      notice.hidden = true;
      $("save-label").textContent = "冒険は自動で保存されます";
    } catch {
      storageAvailable = false;
      $("save-label").textContent =
        "保存できません。このタブで冒険を続けられます";
    }
  }
  function beep(kind) {
    if (!sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(),
        g = audio.createGain();
      o.connect(g);
      g.connect(audio.destination);
      const now = audio.currentTime;
      const tones = {
        hit: [180, 80, 0.08],
        damage: [100, 45, 0.12],
        pickup: [650, 850, 0.13],
        heal: [430, 780, 0.22],
        kill: [380, 140, 0.11],
        level: [540, 1080, 0.35],
        descend: [280, 560, 0.4],
        lightning: [800, 60, 0.23],
        won: [660, 1320, 0.5],
        dead: [200, 40, 0.5],
      };
      const [f, to, duration] = tones[kind] || [110, 85, 0.025];
      o.type = kind === "damage" ? "sawtooth" : "triangle";
      o.frequency.setValueAtTime(f, now);
      o.frequency.exponentialRampToValueAtTime(to, now + duration);
      g.gain.setValueAtTime(0.045, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + duration);
      o.start(now);
      o.stop(now + duration);
    } catch {
      sound = false;
      updateSoundButton();
    }
  }
  function flushEffects() {
    renderer.playEffects(engine.effects, (e) => {
      beep(e.type);
      if (e.type === "pickup") showPickupNotice(e.text);
      if (e.type === "damage" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        $("damage-flash").classList.add("active");
        setTimeout(() => $("damage-flash").classList.remove("active"), 200);
      }
    });
    engine.effects = [];
  }
  function updateUI() {
    const p = engine.player,
      info = engine.dungeonInfo();
    for (const enemy of engine.enemies)
      if (enemy.hp > 0 && engine.visible[engine.key(enemy.x, enemy.y)] &&
          (MONSTERS[enemy.species]?.trait !== "mimic" || enemy.revealed))
        knownMonsters.add(enemy.species);
    $("quest-title").textContent = `${info.label} · ${info.name}`;
    $("quest-goal").textContent =
      `地下${engine.maxFloor()}階の「${info.treasure}」を探そう`;
    $("dungeon-label").textContent =
      `${info.label} · ${info.name}（${engine.floor} / ${engine.maxFloor()}階）`;
    $("floor-label").textContent = `地下 ${engine.floor} 階`;
    $("floor-name").textContent =
      engine.floorName() +
      (engine.layoutName() ? ` · ${engine.layoutName()}` : "");
    $("turn-count").textContent = engine.turn;
    $("level").textContent = p.level;
    $("hp").textContent = p.hp;
    $("max-hp").textContent = p.maxHp;
    $("mobile-hp").textContent = `${p.hp} / ${p.maxHp}`;
    $("mobile-hunger").textContent = `${p.hunger}%`;
    $("hunger").textContent = p.hunger;
    $("hp-bar").style.width = `${(p.hp / p.maxHp) * 100}%`;
    $("hunger-bar").style.width = `${p.hunger}%`;
    $("exp-bar").style.width = `${(p.exp / p.nextExp) * 100}%`;
    $("exp-label").textContent = `${p.exp} / ${p.nextExp}`;
    $("gold").textContent = p.gold;
    $("weapon-name").textContent = engine.weaponName();
    $("shield-name").textContent = engine.shieldName();
    $("attack-stat").textContent = engine.attackPower();
    $("defense-stat").textContent = engine.defense();
    $("hero-title").textContent =
      p.level >= 8
        ? "星の灯りを継ぐ旅人"
        : p.level >= 4
          ? "遺跡の灯りを集める旅人"
          : "はじまりの灯りを持つ旅人";
    document.body.classList.toggle("low-hunger", p.hunger < 20);
    document.body.classList.toggle("low-hp", p.hp / p.maxHp < 0.3);
    $("state-label").textContent =
      engine.status === "dead"
        ? "冒険終了"
        : engine.status === "won"
          ? "踏破達成"
          : "探索中";
    $("state-label").hidden = engine.status === "playing";
    $("stairs-button").disabled =
      !engine.onStairs() ||
      engine.status !== "playing" ||
      engine.floor === engine.maxFloor();
    $("bag-count").textContent =
      `${engine.inventoryCount()} / ${INVENTORY_CAPACITY}`;
    const infusion = engine.infusionInfo();
    $("ammo-name").textContent = (p.ammo === "arrow" ? "木の矢" : "未装備") + (infusion ? `（${infusion.name} ${infusion.shots}本）` : "");
    const echoInfo = engine.echoInfo();
    $("echo-name").textContent = engine.echoes().map((e) => e.name).join("・") || "灯影なし";
    $("echo-text").textContent = echoInfo.text;
    $("ammo-count").textContent = engine.arrowCount();
    $("shoot-button").disabled =
      engine.status !== "playing" || p.ammo !== "arrow" || !engine.arrowCount();
    const facingIndex = DIRS.findIndex(
      ([dx, dy]) => dx === p.facing[0] && dy === p.facing[1],
    );
    $("facing-label").textContent = `向き：${facingNames[facingIndex]}`;
    $("turn-button").setAttribute("aria-pressed", String(turnOnly));
    $("turn-button").textContent = turnOnly ? "向き変更中" : "向き変更";
    $("direction-help").textContent = turnOnly
      ? "方向ボタンで向きだけ変更。"
      : portraitUI
        ? "「向き変更」で移動せずに方向を選べます。"
        : "Shift＋方向キーで向きだけ変更。";
    document.querySelectorAll("[data-direction]").forEach((b) => {
      const [dx, dy] = b.dataset.direction.split(",").map(Number),
        name = facingNames[DIRS.findIndex((d) => d[0] === dx && d[1] === dy)];
      b.disabled = engine.status !== "playing";
      b.setAttribute("aria-label", turnOnly ? `${name}を向く` : `${name}へ`);
    });
    [
      "attack-button",
      "wait-button",
      "bag-button",
      "touch-wait",
      "turn-button",
    ].forEach((id) => ($(id).disabled = engine.status !== "playing"));
    const threat = engine.enemies.find(
      (e) => e.intent && engine.visible[engine.key(e.x, e.y)],
    );
    const nearest = engine.enemies.find(
      (e) => e.hp > 0 && engine.visible[engine.key(e.x, e.y)] &&
        (MONSTERS[e.species]?.trait !== "mimic" || e.revealed) &&
        Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) === 1,
    );
    const lowHP = p.hp / p.maxHp < 0.3, lowHunger = p.hunger < 20;
    const warnings = [
      lowHP ? "体力が少ない。" : "",
      lowHunger ? (p.hunger === 0 ? "空腹で体力が減っている。" : "お腹が空いてきた。") : "",
    ].filter(Boolean).join(" ");
    const situation = engine.status === "dead"
      ? "新しい冒険で、もう一度灯りを。"
      : engine.status === "won"
        ? `${info.treasure}を手に入れた！`
        : threat
          ? `${threat.name}が力をためている。`
          : engine.site() === "shrine"
            ? "灯台がある。「灯台に触れる」で、三つの灯りから一つを受け取れる。"
          : engine.site() === "merchant"
            ? "灯り売りの露店。「露店を見る」で買い物と鑑定・解呪ができる。"
          : engine.onStairs()
            ? engine.floor === engine.maxFloor()
              ? `${info.guardian}がランタンを守っている。`
              : "下へ続く階段がある。"
            : engine.monsterHouse?.triggered &&
                engine.roomAt(p.x, p.y) === engine.rooms[engine.monsterHouse.room] &&
                engine.enemies.some((e) => e.house && e.hp > 0)
              ? "魔物たちが一斉に目を覚ました！"
              : nearest ? `${nearest.name}がすぐ近くにいる。` : "";
    const site = engine.site();
    $("site-button").hidden = !site;
    $("site-button").textContent = site === "shrine" ? "灯台に触れる" : "露店を見る";
    $("location-hint").textContent = engine.status === "playing"
      ? [warnings, situation].filter(Boolean).join(" ") : situation;
    inventoryUI.updateGround({ threat, nearest, danger: lowHP || lowHunger });
    if (portraitUI) $("mobile-progress").textContent = [`Lv.${p.level}`, `矢 ${engine.arrowCount()}本${infusion ? `(${infusion.name[0]}${infusion.shots})` : ""}`, echoInfo.short ? `灯影:${echoInfo.short}` : ""].filter(Boolean).join(" · ");
    if (trial) {
      const echo = engine.echo();
      const states = [echo ? `灯影「${echo.short}」${echo.text}` : "", engine.strategy.lamp ? `分け灯 あと${engine.strategy.lamp.remaining}手` : "", p.bindUntil >= engine.turn + 1 ? "蔓で移動できない" : ""].filter(Boolean);
      $("strategy-status").textContent = states.join(" · ");
      $("strategy-status").hidden = portraitUI || states.length === 0;
      if (portraitUI) $("mobile-progress").textContent = [p.bindUntil >= engine.turn + 1 ? "移動不可" : `Lv.${p.level}`, engine.strategy.lamp ? `灯り${engine.strategy.lamp.remaining}手` : `矢 ${engine.arrowCount()}本`, echo ? `灯影:${echo.short}` : ""].filter(Boolean).join(" · ");
      if (strategyAim) updateAim();
    }
    const list = $("event-log");
    list.replaceChildren();
    for (const event of engine.log.slice(0, portraitUI ? 40 : 5)) {
      const li = document.createElement("li");
      li.className = event.type;
      li.textContent = event.text;
      list.append(li);
    }
    list.scrollTop = 0;
    if (engine.status !== "playing" && !announcedEnd) {
      announcedEnd = true;
      const endedEngine = engine;
      setTimeout(() => {
        if (engine === endedEngine) showEnd();
      }, Math.max(350, renderer.remaining()));
    }
  }
  function act(action, force = false) {
    if (strategyAim || $("modal").open || engine.status !== "playing" || renderer.remaining() > 0) return;
    const now = performance.now();
    if (!force && now - lastInput < 95) return;
    lastInput = now;
    const before = {
        x: engine.player.x,
        y: engine.player.y,
        facing: engine.player.facing.join(","),
        log: engine.log[0],
      },
      floor = engine.floor;
    const changed = action();
    if (
      !changed &&
      before.facing === engine.player.facing.join(",") &&
      before.log === engine.log[0]
    )
      return;
    if (floor !== engine.floor) {
      clearPickupNotice();
      renderer.reset({ x: engine.player.x + 0.5, y: engine.player.y + 0.5 });
    } else if (before.x !== engine.player.x || before.y !== engine.player.y)
      renderer.movePlayer(before, now);
    flushEffects();
    updateUI();
    save();
  }
  function toggleMinimap() {
    if (portraitUI) return;
    minimapVisible = !minimapVisible;
    $("minimap-content").hidden = !minimapVisible;
    $("minimap-toggle").setAttribute("aria-expanded", String(minimapVisible));
  }
  function closeModal() {
    if (trial && modalKind === "trial-kit" && !engine.kitChosen) { engine.chooseKit("none"); updateUI(); save(); }
    if (modalKind === "start-kit" && engine.kitOffered) { engine.chooseStartKit("none"); updateUI(); save(); }
    $("modal").close();
    modalKind = "";
    canvas.focus({ preventScroll: true });
  }
  function openModal(kind, html) {
    if (portraitUI && pwaPanel) document.querySelector("main").append(pwaPanel);
    modalKind = kind;
    $("modal").classList.toggle("bag-dialog", ["bag", "ground", "identify", "exchange"].includes(kind));
    $("modal-content").innerHTML = html;
    if (!$("modal").open) $("modal").showModal();
    $("modal-content")
      .querySelectorAll("[data-close]")
      .forEach((b) => b.addEventListener("click", closeModal));
  }
  const modalHeader = (title) =>
    `<div class="modal-header"><h2>${title}</h2><button class="close-modal" data-close aria-label="閉じる">×</button></div>`;
  const inventoryUI = createInventoryUI({
    getEngine: () => engine,
    openModal,
    closeModal,
    modalHeader,
    act,
    save,
    updateUI,
    beginTarget,
  });

  function updateAim() {
    const active = !!strategyAim;
    document.body.classList.toggle("strategy-targeting", active);
    $("strategy-aim").hidden = !active;
    if (active) {
      const plan = engine.previewUse(strategyAim.index, strategyAim, strategyAim.mode);
      $("strategy-target-label").textContent = `${engine.itemName(engine.targetItem(strategyAim.index))}：${plan ? plan.label : "ここは選べません"}`;
      $("strategy-confirm").disabled = !plan;
    }
    for (const id of ["attack-button", "wait-button", "touch-wait", "bag-button", "shoot-button", "stairs-button", "turn-button"])
      if (active) $(id).disabled = true;
    $("direction-help").textContent = active ? "迷宮をタップ、または方向ボタンで狙う場所を選びます。" : $("direction-help").textContent;
  }
  function beginTarget(index, mode = "use") {
    if (!trial) return;
    closeModal();
    const p = engine.player;
    strategyAim = {index, mode, x: p.x + p.facing[0], y: p.y + p.facing[1]};
    updateAim();
  }
  function finishAim(commit) {
    const target = strategyAim;
    if (!target || (commit && !engine.previewUse(target.index, target, target.mode))) return;
    strategyAim = null; updateAim();
    if (commit) act(() => engine.use(target.index, target, target.mode), true);
    else updateUI();
  }
  function offerStartKit() {
    const kits = DungeonData.START_KITS;
    openModal("start-kit", `<div class="modal-inner">${modalHeader("旅支度")}<p class="modal-description">どの支度で出発しますか。閉じると、いつもの装備で出発します。</p><div class="dungeon-list">${Object.entries(kits).map(([id, kit]) => `<button class="dungeon-choice" data-start-kit="${id}"><strong>${kit.name}</strong><span class="dungeon-choice-description">${kit.text}</span></button>`).join("")}</div><button class="secondary-button" data-start-kit="none">いつもの装備で出発する</button></div>`);
    $("modal-content").querySelectorAll("[data-start-kit]").forEach((button) => button.addEventListener("click", () => {
      engine.chooseStartKit(button.dataset.startKit); closeModal(); updateUI(); save();
    }));
  }
  function showSite() {
    const site = engine.site();
    if (site === "shrine") {
      const options = engine.boonOptions();
      openModal("shrine", `<div class="modal-inner">${modalHeader("灯台")}<p class="modal-description">三つの灯りから一つを受け取れます。受け取ると灯台の灯りは消えます。ターンは進みません。</p><div class="dungeon-list">${options.map((o, i) => `<button class="dungeon-choice" data-boon="${i}" ${o.available ? "" : "disabled"}><strong>${o.name}</strong><span class="dungeon-choice-description">${o.text}${o.available ? "" : "（今は受け取れません）"}</span></button>`).join("")}</div><button class="secondary-button" data-close>あとで</button></div>`);
      $("modal-content").querySelectorAll("[data-boon]").forEach((button) => button.addEventListener("click", () => {
        if (engine.chooseBoon(Number(button.dataset.boon))) { closeModal(); updateUI(); save(); }
      }));
    } else if (site === "merchant") {
      const {wares, services} = engine.shopOffers(), p = engine.player;
      const row = (attr, value, name, price, available, note) => `<button class="dungeon-choice" data-${attr}="${value}" ${available ? "" : "disabled"}><strong>${name}</strong><span class="dungeon-choice-description">${note || `${price}G${!available && p.gold < price ? "（所持金が足りません）" : ""}`}</span></button>`;
      openModal("merchant", `<div class="modal-inner">${modalHeader("灯り売りの露店")}<p class="modal-description">所持金 ${p.gold}G。買い物と鑑定・解呪ではターンは進みません。</p><div class="dungeon-list">${wares.map(w => row("ware", w.index, w.name, w.price, w.available, w.sold ? "売り切れ" : !w.available && p.gold >= w.price ? `${w.price}G（持ち物がいっぱい）` : "")).join("")}${services.map(s => row("service", s.id, s.name, s.price, s.available, s.price ? "" : "—")).join("")}</div><button class="secondary-button" data-close>露店を離れる</button></div>`);
      $("modal-content").querySelectorAll("[data-ware]").forEach((button) => button.addEventListener("click", () => {
        if (engine.buy(Number(button.dataset.ware))) { updateUI(); save(); showSite(); }
      }));
      $("modal-content").querySelectorAll("[data-service]").forEach((button) => button.addEventListener("click", () => {
        if (engine.service(button.dataset.service)) { updateUI(); save(); showSite(); }
      }));
    }
  }
  function chooseTrialKit() {
    openModal("trial-kit", `<div class="modal-inner">${modalHeader("分け灯の旅支度")}<p class="modal-description">灯種と札を携え、五つの回廊へ。武器を一つ選ぶか、今の装備で出発できます。ほかの武器も道中で見つかります。</p><div class="dungeon-list">${Object.keys(StrategyEngine.GEAR).map(kind => `<button class="dungeon-choice" data-kit="${kind}"><strong>${DungeonData.EQUIPMENT[kind].name}</strong><span class="dungeon-choice-description">${DungeonData.EQUIPMENT[kind].description}</span></button>`).join("")}</div><button class="secondary-button" data-kit="none">今の装備で出発する</button></div>`);
    $("modal-content").querySelectorAll("[data-kit]").forEach(button => button.addEventListener("click", () => {
      engine.chooseKit(button.dataset.kit); closeModal(); updateUI(); save();
    }));
  }
  if (trial) {
    const status = document.createElement("p"); status.id = "strategy-status"; status.className = "strategy-status"; status.hidden = true;
    const panel = document.createElement("section"); panel.id = "strategy-aim"; panel.className = "strategy-aim"; panel.hidden = true;
    panel.innerHTML = '<p id="strategy-target-label" role="status" aria-live="polite"></p><div><button id="strategy-confirm" class="primary-button">ここに使う</button><button id="strategy-cancel" class="secondary-button">やめる</button></div>';
    $("game-viewport").after(status);
    document.querySelector(".action-bar").append(panel);
    $("strategy-confirm").addEventListener("click", () => finishAim(true));
    $("strategy-cancel").addEventListener("click", () => finishAim(false));
    const exit = document.createElement("a"); exit.href = "./"; exit.textContent = "いつもの迷宮へ"; exit.className = "trial-exit";
    document.querySelector(".site-header nav").append(exit);
    document.title = "分け灯の回廊 — 灯りの迷宮 試作";
  }

  function showMonsters() {
    const entries = Object.entries(MONSTERS).filter(([species]) => knownMonsters.has(species));
    openModal(
      "monsters",
      `<div class="modal-inner">${modalHeader("魔物図鑑")}<p class="modal-description">${entries.length ? `出会った魔物 ${entries.length}種。旅の中で見つけた姿を記しています。` : "まだ魔物の記録はありません。"}</p><div class="item-list">${entries
        .map(
          ([species, m]) =>
            `<div class="item-card"><canvas data-monster="${species}" width="80" height="80" role="img" aria-label="${m.name}：${m.color}、${MONSTER_MARKS[m.tier]}"></canvas><div><strong>${m.name}</strong><p class="monster-story">${m.story}</p><p>${m.color}・${MONSTER_MARKS[m.tier]}</p>${DungeonData.echoOfSpecies(species) ? `<p>${DungeonData.echoOfSpecies(species).name}：${DungeonData.echoOfSpecies(species).text}</p>` : ""}</div></div>`,
        )
        .join(
          "",
        )}</div><button class="secondary-button" data-close>冒険に戻る</button></div>`,
    );
    $("modal-content")
      .querySelectorAll("[data-monster]")
      .forEach((c) => {
        const m = MONSTERS[c.dataset.monster],
          context = c.getContext("2d");
        context.imageSmoothingEnabled = false;
        renderer.sprite(context, m.type, 0, 0, 5, 1, false, c.dataset.monster);
      });
    $("modal").scrollTop = 0;
    $("modal-content")
      .querySelector("[data-close]")
      .focus({ preventScroll: true });
  }
  function showHelp() {
    if (trial) {
      openModal("help", `<div class="modal-inner">${modalHeader("分け灯の歩き方")}<p class="modal-description">持ち物から灯種や札を選び、迷宮をタップするか方向ボタンで照準を動かします。「ここに使う」で確定、「やめる」で戻れます。</p><div class="help-row"><span>分けた灯り</span><p>6手で消え、仮宿の灯札の帰還先になります。</p></div><div class="help-row"><span>食料と蔓</span><p>団子は食べると満腹度を15回復。蔓は自分も踏みます。足止めしても敵は攻撃できます。</p></div><div class="help-row"><span>灯守りの槍</span><p>敵の方向へ進むと、直線2マス以内の最初の敵をその場で突きます。敵がいなければ移動します。向き変更だけでは攻撃しません。</p></div><p class="modal-description">地下5階の星の番人を倒し、分け灯のランタンを探す短い冒険です。いつもの迷宮とは別に保存されます。</p><button class="primary-button" data-close>冒険に戻る</button></div>`); return;
    }
    openModal(
      "help",
      `<div class="modal-inner">${modalHeader("迷宮の歩き方")}<p class="modal-subtitle">${engine.dungeonInfo().name}：地下${engine.maxFloor()}階の「${engine.dungeonInfo().treasure}」を探す旅。</p><div class="help-row"><span>↑ ↓ ← → / WASD</span><p>移動。敵に向かって移動すると攻撃します。</p></div><div class="help-row"><span>Q E Z C</span><p>左上・右上・左下・右下に斜め移動。壁の角はすり抜けられません。</p></div><div class="help-row"><span>Shift＋方向 / T</span><p>その場で向きだけ変更。「向き変更」でも切り替えられます。</p></div><div class="help-row"><span>Space / F</span><p>向いている方向へ攻撃します。</p></div><div class="help-row"><span>R</span><p>装備した木の矢を向いている方向へ放ちます。</p></div><div class="help-row"><span>. / X</span><p>その場で足踏みします。</p></div><div class="help-row"><span>I / Enter / M</span><p>持ち物 / 階段を降りる / ミニマップ切替。</p></div><div class="help-row"><span>拾う・装備</span><p>床の品は上に乗ると拾います。武器・盾は装備すると効果を発揮します。呪われた装備は、清めの灯札で呪いを解くまで外せません。</p></div><div class="help-row"><span>灯札</span><p>灯札をかざすと、その力が現れます。効果が分からない灯札には、推測した名前を付けて記録できます。</p></div><div class="help-row"><span>灯影</span><p>倒した魔物が「灯影の欠片」を残すことがあります。踏むとランタンに宿り、その魔物の力が使えます。宿せるのは一つで、新しい欠片を踏むと入れ替わります。</p></div><div class="help-row"><span>地形</span><p>水たまりは雷光を伝え、油と草むらは燃え広がります。草むらと霧の中にいると遠くから狙われず、霧の中を狙った攻撃は空振りします。水袋・油瓶・火種・爆ぜ実は向いている方向へ投げ、煙玉は足元に霧を広げます。</p></div><div class="help-row"><span>矢に灯す</span><p>木の矢を持っている時、雷光の灯札・火種・煙玉を「矢に灯す」と、次の5本がその力を帯びます。</p></div><div class="help-row"><span>武器の形</span><p>槍・鎌は2マス先まで届き、斧は前の3マスを薙ぎ、槌は敵を押し出します。敵の方向へ進むか「攻撃」で振るいます。</p></div><div class="help-row"><span>魔物の記録</span><p>出会った魔物の姿を図鑑に記しています。</p></div><button class="secondary-button" id="monster-guide-button">魔物図鑑を見る</button><div class="help-row"><span>冒険の保存</span><p>冒険はブラウザに自動保存されます。</p></div><p class="modal-description">灯りの迷宮を踏破すると、地下30階へ続く深淵の迷宮に挑めます。倒れたら、新しい旅の始まりです。</p><button class="primary-button" data-close>冒険に戻る</button></div>`,
    );
    if (portraitUI) {
      const rows = $("modal-content").querySelectorAll(".help-row");
      ["方向ボタン", "斜め移動", "向き変更", "攻撃", "矢を放つ", "足踏み", "持ち物・階段"].forEach((label, index) => {
        rows[index].querySelector("span").textContent = label;
      });
      rows[2].querySelector("p").textContent = "「向き変更」で切り替え、方向ボタンか迷宮タップで向きを選びます。";
      rows[6].querySelector("p").textContent = "持ち物を開く / 階段を降りる。ミニマップは常に表示されます。";
      if (pwaPanel) $("modal-content").querySelector(".modal-inner").append(pwaPanel);
    }
    $("monster-guide-button").addEventListener("click", showMonsters);
  }
  function startNew(dungeon = engine.dungeon) {
    const next = new Engine(Date.now(), dungeon, engine.tutorialCleared);
    if (trial) storageAvailable = true;
    strategyAim = null;
    clearPickupNotice();
    closeModal();
    engine = next;
    announcedEnd = false;
    turnOnly = false;
    renderer.reset();
    updateUI();
    if (!trial) engine.kitOffered = true;
    save();
    if (trial) chooseTrialKit();
    else offerStartKit();
  }
  function confirmNew() {
    if (strategyAim) return;
    if (trial) {
      if (!engine.kitChosen) { chooseTrialKit(); return; }
      openModal("new", `<div class="modal-inner">${modalHeader("分け灯の回廊")}<p class="modal-description">新しい支度で地下1階から出発します。今の試作の冒険は終了します。</p><button id="trial-restart" class="primary-button">新しい支度で出発する</button><button class="secondary-button" data-close>今の冒険へ戻る</button></div>`);
      $("trial-restart").addEventListener("click", () => startNew()); return;
    }
    openModal(
      "new",
      `<div class="modal-inner">${modalHeader("迷宮を選ぶ")}<p class="modal-description">挑む迷宮を選んで、地下1階から出発します。現在の冒険は終了し、持ち物・レベル・所持金は初期状態に戻ります。深淵の迷宮に挑む資格は失われません。</p><div class="dungeon-list">${Object.entries(
        DUNGEONS,
      )
        .map(
          ([id, info]) =>
            `<button class="dungeon-choice" data-dungeon="${id}" ${id === "depths" && !engine.tutorialCleared ? "disabled" : ""}><span class="dungeon-choice-heading">${info.name}<span>${info.label} · ${info.floors}階</span></span><span class="dungeon-choice-description">${id === "tutorial" ? "移動・戦闘・道具の使い方を覚える10階の冒険。" : engine.tutorialCleared ? "敵と罠が増え、食料の乏しい地下30階へ。" : "灯りの迷宮を踏破すると、この先へ進めます。"}</span></button>`,
        )
        .join(
          "",
        )}</div><button class="secondary-button" data-close>今の冒険に戻る</button></div>`,
    );
    $("modal-content")
      .querySelectorAll("[data-dungeon]")
      .forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.dungeon === "depths" && !engine.tutorialCleared) return;
          startNew(b.dataset.dungeon);
        }),
      );
  }
  function showEnd() {
    if (trial) {
      openModal("end", `<div class="modal-inner">${modalHeader(engine.status === "won" ? "分け灯の回廊、踏破！" : "また、灯りを分けて。")}<p class="modal-description">地下${engine.floor}階 · ${engine.turn}手の冒険。次は違う支度で、別の灯りの使い方を。</p><button id="trial-restart" class="primary-button">新しい支度で出発する</button><button class="secondary-button" data-close>迷宮を振り返る</button></div>`);
      $("trial-restart").addEventListener("click", () => startNew()); return;
    }
    const won = engine.status === "won",
      tutorial = engine.dungeon === "tutorial",
      p = engine.player,
      info = engine.dungeonInfo();
    openModal(
      "end",
      `<div class="modal-inner"><div class="end-symbol">${won ? "✦" : "☾"}</div>${modalHeader(won ? (tutorial ? "灯りの迷宮、踏破！" : "深淵の迷宮、踏破！") : "また、灯りをともして。")}<p class="modal-description">${won ? `${info.guardian}を倒し、${info.treasure}を手に入れました。${tutorial ? "「深淵の迷宮」への道が開かれました。さらに奥の灯りを探す旅が待っています。" : "地下30階の冒険を達成しました。灯りは、永遠に。"}` : "ランタンの灯りが消え、リネは森のはずれの村に戻りました。見つけた道も、学んだことも、次の冒険の道しるべ。"}</p><div class="end-stats"><div><strong>${engine.floor}F</strong><span>到達した階</span></div><div><strong>${p.level}</strong><span>レベル</span></div><div><strong>${p.gold}</strong><span>獲得ゴールド</span></div></div><p class="modal-description" style="text-align:center">${engine.turn} ターンの冒険</p><button class="primary-button" id="restart-end">${won && tutorial ? "深淵の迷宮に挑む" : "同じ迷宮へ旅立つ"}</button><button class="secondary-button" id="choose-end">迷宮を選ぶ</button><button class="secondary-button" data-close>迷宮を振り返る</button></div>`,
    );
    $("restart-end").addEventListener("click", () =>
      startNew(won && tutorial ? "depths" : engine.dungeon),
    );
    $("choose-end").addEventListener("click", confirmNew);
  }
  function updateSoundButton() {
    $("sound-button").setAttribute("aria-pressed", String(sound));
    $("sound-button").setAttribute(
      "aria-label",
      sound ? "効果音を無効にする" : "効果音を有効にする",
    );
    $("sound-waves").setAttribute(
      "d",
      sound ? "M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" : "m16 9 5 6m0-6-5 6",
    );
  }
  $("minimap-toggle").addEventListener("click", toggleMinimap);
  $("turn-button").addEventListener("click", toggleTurnOnly);
  $("attack-button").addEventListener("click", () =>
    act(() => engine.attack(), true),
  );
  $("shoot-button").addEventListener("click", () =>
    act(() => engine.shoot(), true),
  );
  $("site-button").addEventListener("click", () => {
    if (!$("modal").open && renderer.remaining() === 0) showSite();
  });
  $("wait-button").addEventListener("click", () =>
    act(() => engine.wait(), true),
  );
  $("touch-wait").addEventListener("click", () =>
    act(() => engine.wait(), true),
  );
  $("stairs-button").addEventListener("click", () =>
    act(() => engine.descend(), true),
  );
  $("help-button").addEventListener("click", showHelp);
  $("world-button").addEventListener("click", () => {
    openModal("world", `<div class="modal-inner world-modal">${modalHeader("灯りを拾う旅")}<img class="world-cover" src="art/lantern-cover.png" alt="ランタンを掲げるリネと、苔むす遺跡に暮らす魔物たち"><h3>灯りを集める旅人、リネ</h3><p class="modal-description">森のはずれの村から来た旅人。葉飾りの帽子、星の留め具、祖母から譲られたランタンが目印です。「まだ見ぬ灯りを、探しに行こう。」</p><p class="modal-description">迷宮は、かつて灯りを分け合って暮らした人々の遺跡。人が去ったあとも、苔や花、灯りに惹かれる魔物たちが息づいています。奥に眠る星のランタンには、失われた灯りをともす力があるといわれています。</p><button class="secondary-button" id="world-monsters">遺跡の魔物たちを見る</button><button class="primary-button" data-close>リネと探索に戻る</button></div>`);
    $("world-monsters").addEventListener("click", showMonsters);
  });
  let closeView = true;
  $("view-button").addEventListener("click", () => {
    closeView = !closeView; renderer.setCloseView(closeView);
    $("view-button").setAttribute("aria-pressed", String(closeView));
    $("view-button").textContent = closeView ? "近景" : "広域";
    $("view-button").setAttribute("aria-label", closeView ? "広域表示に切り替える" : "近景表示に切り替える");
  });
  $("new-game-button").addEventListener("click", confirmNew);
  $("sound-button").addEventListener("click", () => {
    sound = !sound;
    updateSoundButton();
    if (sound) beep("pickup");
  });
  document.querySelectorAll("[data-direction]").forEach((button) =>
    button.addEventListener("click", () => {
      const [dx, dy] = button.dataset.direction.split(",").map(Number);
      directionInput(dx, dy, turnOnly, true);
    }),
  );
  $("modal").addEventListener("cancel", () => {
    if (trial && modalKind === "trial-kit" && !engine.kitChosen) { engine.chooseKit("none"); updateUI(); save(); }
    if (modalKind === "start-kit" && engine.kitOffered) { engine.chooseStartKit("none"); updateUI(); save(); }
    modalKind = "";
    canvas.focus({ preventScroll: true });
  });
  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) {
      const r = $("modal").getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeModal();
    }
  });
  const bindings = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    w: [0, -1],
    s: [0, 1],
    a: [-1, 0],
    d: [1, 0],
    q: [-1, -1],
    e: [1, -1],
    z: [-1, 1],
    c: [1, 1],
  };
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (strategyAim && !$("modal").open && ["Escape", "Enter"].includes(key)) { event.preventDefault(); finishAim(key === "Enter"); return; }
    if ($("modal").open) return;
    if (event.target.matches("input,textarea,select")) return;
    if (bindings[key]) {
      event.preventDefault();
      const [dx, dy] = bindings[key];
      directionInput(dx, dy, turnOnly || event.shiftKey);
    } else if (key === "t") {
      event.preventDefault();
      if (!event.repeat) toggleTurnOnly();
    } else if (key === " " || key === "f") {
      if (key === " " && event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      act(() => engine.attack());
    } else if (key === "r") {
      event.preventDefault();
      act(() => engine.shoot());
    } else if (key === "." || key === "x") {
      event.preventDefault();
      act(() => engine.wait());
    } else if (key === "i") {
      event.preventDefault();
      if (!event.repeat) inventoryUI.showBag();
    } else if (key === "Enter" && event.target === canvas) {
      event.preventDefault();
      act(() => engine.descend());
    } else if (key === "m") {
      event.preventDefault();
      if (!event.repeat) {
        toggleMinimap();
      }
    } else if (key === "?" || key === "h") {
      event.preventDefault();
      if (!event.repeat) showHelp();
    } else if (key === "Enter" && event.target === document.body) {
      event.preventDefault();
      act(() => engine.descend());
    }
  });
  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus({ preventScroll: true });
    if (strategyAim) { Object.assign(strategyAim, renderer.tileAt(event)); updateAim(); return; }
    const [dx, dy] = renderer.directionAt(event);
    if (dx || dy) directionInput(dx, dy, turnOnly || event.shiftKey, true);
    else if (!turnOnly && !event.shiftKey) act(() => engine.wait(), true);
  });
  if (portraitUI) {
    $("canvas-wrap").append($("event-log").closest(".log-section"));
    $("event-log").tabIndex = 0;
    $("event-log").setAttribute("aria-label", "冒険の記録。スクロールして以前の出来事を確認できます。");
    const progress = document.createElement("span");
    progress.id = "mobile-progress";
    document.querySelector(".player-status").append(progress);
    const turn = $("turn-button");
    turn.classList.add("action-button");
    document.querySelector(".action-bar").append(turn);
    document.querySelector(".control-deck").append(document.querySelector(".save-status"));
    const choose = $("new-game-button");
    choose.textContent = "迷宮";
    choose.classList.add("header-button");
    choose.setAttribute("aria-label", "迷宮選択");
    document.querySelector(".site-header nav").prepend(choose);
    $("minimap-toggle").disabled = true;
  }
  new ResizeObserver(() => renderer.resize()).observe($("game-viewport"));
  renderer.resize();
  const portrait = $("portrait").getContext("2d");
  portrait.imageSmoothingEnabled = false;
  renderer.sprite(portrait, "hero", 8, 5, 2);
  renderer.ready.then(() => {
    portrait.clearRect(0, 0, 48, 48);
    renderer.sprite(portrait, "hero", 8, 5, 2);
    const brandPortrait = $("brand-portrait").getContext("2d");
    renderer.sprite(brandPortrait, "hero", 4, 0, 3.5);
    document.querySelectorAll('[data-monster]').forEach(c => {
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      renderer.sprite(c.getContext('2d'), MONSTERS[c.dataset.monster].type, 0, 0, 5, 1, false, c.dataset.monster);
    });
  });
  if (resumed && engine.status === "playing")
    engine.say("ランタンを灯し直した。冒険の続きへ。", "good");
  updateUI();
  save();
  if (trial && !engine.kitChosen) chooseTrialKit();
  else if (engine.kitOffered && engine.turn === 0) offerStartKit();
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  renderer.start();
  // Read-only snapshots make integration diagnostics possible without mutating a live run.
  window.lanternGame = {
    snapshot: () => JSON.parse(engine.serialize()),
    get inputReady() {
      return engine.status === "playing" && !$("modal").open &&
        renderer.remaining() === 0 && performance.now() - lastInput >= 95;
    },
    get status() {
      return engine.status;
    },
  };
})();
