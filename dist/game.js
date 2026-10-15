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
  const SAVE_KEY = "lantern-dungeon-v1",
    PROGRESS_KEY = "lantern-dungeon-progress-v1";
  let engine,
    storageAvailable = true,
    tutorialCleared = false;
  try {
    tutorialCleared = localStorage.getItem(PROGRESS_KEY) === "true";
    engine = DungeonEngine.restore(localStorage.getItem(SAVE_KEY));
  } catch {
    storageAvailable = false;
  }
  const resumed = !!engine;
  engine ||= new DungeonEngine();
  engine.tutorialCleared ||= tutorialCleared;
  let sound = false,
    audio = null,
    lastInput = 0,
    modalKind = "",
    minimapVisible = true,
    announcedEnd = false,
    turnOnly = false;
  const facingNames = ["上", "右上", "右", "右下", "下", "左下", "左", "左上"];
  const renderer = createDungeonRenderer({
    canvas,
    minimap: $("minimap"),
    viewport: $("game-viewport"),
    getEngine: () => engine,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  function directionInput(dx, dy, faceOnly = turnOnly, force = false) {
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
    if (!storageAvailable) {
      $("save-label").textContent = "保存無効。このタブで冒険を続けられます";
      return;
    }
    try {
      if (engine.tutorialCleared) localStorage.setItem(PROGRESS_KEY, "true");
      localStorage.setItem(SAVE_KEY, engine.serialize());
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
    $("ammo-name").textContent = p.ammo === "arrow" ? "木の矢" : "未装備";
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
      ? "方向ボタンで向きだけ変更。ターンは進みません。"
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
      (e) =>
        e.hp > 0 && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) === 1,
    );
    $("location-hint").textContent =
      engine.status === "dead"
        ? "新しい冒険で、もう一度灯りを。"
        : engine.status === "won"
          ? `${info.treasure}を手に入れた！`
          : threat
            ? `${threat.name}が攻撃準備。黄色の予告マスから移動！`
            : p.hunger < 20
              ? "お腹が空いてきた。持ち物からパンを食べよう。"
              : p.hp / p.maxHp < 0.3
                ? "体力が少ない。持ち物から回復草を使おう。"
                : engine.onStairs()
                  ? engine.floor === engine.maxFloor()
                    ? `${info.guardian}を倒してランタンを手に入れよう。`
                    : "階段を見つけた！ Enter で次の階へ。"
                  : engine.monsterHouse?.triggered &&
                      engine.roomAt(p.x, p.y) ===
                        engine.rooms[engine.monsterHouse.room] &&
                      engine.enemies.some((e) => e.house && e.hp > 0)
                    ? "モンスターハウス！ 通路へ退くか、灯札で切り抜けよう。"
                    : nearest
                      ? MONSTERS[nearest.species]?.trait === "mimic" &&
                        !nearest.revealed
                        ? "怪しい金貨の山が近い。"
                        : `${nearest.name}が近い。${MONSTERS[nearest.species]?.feature?.split("。")[0] || "敵に向かって移動すると攻撃"}。`
                      : engine.turn < 8
                        ? "灯りの届く先へ、進んでみよう。"
                        : "あせらず、一歩ずつ。";
    inventoryUI.updateGround({ threat, nearest });
    if (portraitUI) $("mobile-progress").textContent = `Lv.${p.level} · ${p.gold}G`;
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
    if ($("modal").open || engine.status !== "playing" || renderer.remaining() > 0) return;
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
  });

  function showMonsters() {
    openModal(
      "monsters",
      `<div class="modal-inner">${modalHeader("魔物図鑑")}<p class="modal-description">全${Object.keys(MONSTERS).length}種。同じ名前の魔物は、階数やダンジョンが変わっても同じ能力です。強い別種は色・紋章・名前で見分けられます。敵の特徴と対処法を確認しましょう。遠距離攻撃と強打は黄色のマスに予告され、次の行動でそのマスから移動すると回避できます。</p><div class="item-list">${Object.entries(
        MONSTERS,
      )
        .map(
          ([species, m]) =>
            `<div class="item-card"><canvas data-monster="${species}" width="80" height="80" role="img" aria-label="${m.name}：${m.color}、${MONSTER_MARKS[m.tier]}"></canvas><div><strong>${m.name}</strong><p class="monster-story">${m.story}</p><p>${m.color}・${MONSTER_MARKS[m.tier]}<br>HP ${m.hp} ／ 攻撃力 ${m.attack} ／ 経験値 ${m.exp}<br><b>特徴</b>：${m.feature}<br><b>対処</b>：${m.counter}</p></div></div>`,
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
    openModal(
      "help",
      `<div class="modal-inner">${modalHeader("迷宮の歩き方")}<p class="modal-subtitle">${engine.dungeonInfo().name}：地下${engine.maxFloor()}階の「${engine.dungeonInfo().treasure}」を見つけよう。</p><p class="modal-description">あなたが1回行動すると、敵も1回行動します。操作を止めている間、時間は進みません。</p><div class="help-row"><span>↑ ↓ ← → / WASD</span><p>移動。敵に向かって移動すると攻撃。壁にぶつかってもターンは進みません。</p></div><div class="help-row"><span>Q E Z C</span><p>左上・右上・左下・右下に斜め移動。壁の角を斜めにすり抜けることはできません。</p></div><div class="help-row"><span>Shift＋方向 / T</span><p>Shiftを押しながら移動キーで、その場で向きだけ変更。Tまたは「向き変更」で切り替えると、方向ボタンや迷宮タップでも向きだけ変えられます。ターン・満腹度は変わらず、敵も動きません。</p></div><div class="help-row"><span>Space / F</span><p>向いている方向へ攻撃。空振りも1ターン。</p></div><div class="help-row"><span>R</span><p>装備した木の矢を向いている方向へ発射。1本消費し、最初の敵に12ダメージ。</p></div><div class="help-row"><span>. / X</span><p>足踏み。満腹なら7ターンごとに体力が1回復。</p></div><div class="help-row"><span>I / Enter / M</span><p>持ち物 / 階段を降りる / ミニマップ切替。</p></div><div class="help-row"><span>拾う・装備</span><p>床のアイテムは上に乗ると拾います。武器・盾は全階で同じ確率で出現し、拾うだけでは強化されません。持ち物から選んで装備すると、補正値と呪いが判明します。呪われた装備は清めの灯札で解呪するまで外せません。木の矢も持ち物から装備・解除でき、本数にかかわらず1枠です。</p></div><div class="help-row"><span>灯札の識別</span><p>チュートリアルの灯札は識別済み。深淵の迷宮では冒険ごとに仮名が変わり、かざすか真名の灯札で鑑定すると同種すべてが識別されます。「名前」で推測を記録でき、命名や対象選択では時間は進みません。</p></div><div class="help-row"><span>魔物の見分け方</span><p>同じ名前なら能力は同じ。強い別種は色と紋章が変わります。黄色の予告マスから移動すると遠距離攻撃・強打を回避できます。</p></div><button class="secondary-button" id="monster-guide-button">魔物図鑑を見る（${Object.keys(MONSTERS).length}種）</button><div class="help-row"><span>満腹度・保存</span><p>通常は4ターンで満腹度が1減少。革の盾を装備すると8ターンで1減少。0になると毎ターン体力が減少。冒険はブラウザに自動保存されます。</p></div><p class="modal-description">${engine.dungeonInfo().guardian}を倒し、最深部のランタンにたどり着くとクリア。チュートリアル10階の踏破で、高難度の深淵の迷宮30階が解放されます。倒れたら、新しい迷宮で再出発です。</p><button class="primary-button" data-close>冒険に戻る</button></div>`,
    );
    if (portraitUI) {
      const rows = $("modal-content").querySelectorAll(".help-row");
      ["方向ボタン", "斜め移動", "向き変更", "攻撃", "矢を放つ", "足踏み", "持ち物・階段"].forEach((label, index) => {
        rows[index].querySelector("span").textContent = label;
      });
      rows[2].querySelector("p").textContent = "「向き変更」で切り替え、方向ボタンか迷宮タップで向きを選びます。移動・ターン・満腹度は変わらず、敵も動きません。";
      rows[6].querySelector("p").textContent = "持ち物を開く / 階段を降りる。ミニマップは常に表示されます。";
      if (pwaPanel) $("modal-content").querySelector(".modal-inner").append(pwaPanel);
    }
    $("monster-guide-button").addEventListener("click", showMonsters);
  }
  function startNew(dungeon = engine.dungeon) {
    const next = new DungeonEngine(Date.now(), dungeon, engine.tutorialCleared);
    clearPickupNotice();
    closeModal();
    engine = next;
    announcedEnd = false;
    turnOnly = false;
    renderer.reset();
    updateUI();
    save();
  }
  function confirmNew() {
    openModal(
      "new",
      `<div class="modal-inner">${modalHeader("ダンジョンを選ぶ")}<p class="modal-description">挑む迷宮を選んで、地下1階から出発します。現在の冒険の持ち物・レベル・所持金はリセットされます。クリアによる解放は引き継がれます。</p><div class="dungeon-list">${Object.entries(
        DUNGEONS,
      )
        .map(
          ([id, info]) =>
            `<button class="dungeon-choice" data-dungeon="${id}" ${id === "depths" && !engine.tutorialCleared ? "disabled" : ""}><span class="dungeon-choice-heading">${info.name}<span>${info.label} · ${info.floors}階</span></span><span class="dungeon-choice-description">${id === "tutorial" ? "移動・戦闘・道具の使い方を覚える10階の冒険。" : engine.tutorialCleared ? "解放済み。敵と罠が増え、パンが少ない30階の冒険。" : "未解放。チュートリアルをクリアすると選べます。"}</span></button>`,
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
    const won = engine.status === "won",
      tutorial = engine.dungeon === "tutorial",
      p = engine.player,
      info = engine.dungeonInfo();
    openModal(
      "end",
      `<div class="modal-inner"><div class="end-symbol">${won ? "✦" : "☾"}</div>${modalHeader(won ? (tutorial ? "チュートリアル完了！" : "深淵の迷宮、踏破！") : "また、灯りをともして。")}<p class="modal-description">${won ? `${info.guardian}を倒し、${info.treasure}を手に入れました。${tutorial ? "高難度の「深淵の迷宮」が解放されました。次は地下30階を目指しましょう。" : "地下30階の冒険を達成しました。灯りは、永遠に。"}` : "ランタンの灯りが消え、リネは森のはずれの村に戻りました。見つけた道も、学んだことも、次の冒険の道しるべ。"}</p><div class="end-stats"><div><strong>${engine.floor}F</strong><span>到達した階</span></div><div><strong>${p.level}</strong><span>レベル</span></div><div><strong>${p.gold}</strong><span>獲得ゴールド</span></div></div><p class="modal-description" style="text-align:center">${engine.turn} ターンの冒険</p><button class="primary-button" id="restart-end">${won && tutorial ? "深淵の迷宮に挑む" : "同じダンジョンに再挑戦"}</button><button class="secondary-button" id="choose-end">ダンジョンを選ぶ</button><button class="secondary-button" data-close>迷宮を振り返る</button></div>`,
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
    choose.setAttribute("aria-label", "ダンジョン選択");
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
  window.addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save();
  });
  renderer.start();
  // Read-only snapshots make integration diagnostics possible without mutating a live run.
  window.lanternGame = {
    snapshot: () => JSON.parse(engine.serialize()),
    get status() {
      return engine.status;
    },
  };
})();
