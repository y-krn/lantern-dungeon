(function (root) {
  "use strict";
  const { INVENTORY_CAPACITY, ITEMS, SCROLLS, itemKind, isEquipment } =
    typeof module !== "undefined" && module.exports
      ? require("./data.js")
      : root.DungeonData;

  function createInventoryUI({
    getEngine,
    document = root.document,
    requestAnimationFrame = root.requestAnimationFrame,
    openModal,
    closeModal,
    modalHeader,
    act,
    save,
    updateUI,
  }) {
    const $ = (id) => document.getElementById(id);
    const groundUseButton = document.createElement("button");
    groundUseButton.id = "ground-use-button";
    groundUseButton.className = "ground-use-button";
    groundUseButton.hidden = true;
    const groundItemButton = document.createElement("button");
    groundItemButton.id = "ground-item-button";
    groundItemButton.className = "ground-item-button";
    const groundContext = document.createElement("div");
    groundContext.id = "ground-context";
    groundContext.hidden = true;
    groundContext.append(groundItemButton, groundUseButton);
    $("location-hint").after(groundContext);

    const escapeHTML = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    function itemLabel(item, count = 1) {
      const engine = getEngine();
      if (item.kind === "gold") return `${item.amount}G`;
      return engine.itemName(item) + (itemKind(item) === "arrow" ? ` × ${typeof item === "object" ? item.amount || 1 : count}` : "");
    }
    function useLabel(item) {
      const engine = getEngine();
      const kind = itemKind(item);
      if (kind === "identify" && engine.identification.known.includes(kind)) return "鑑定する";
      return kind === "bread" ? "食べる" : kind === "arrow" ? "1本放つ" : SCROLLS.includes(kind) ? "かざす" : "使う";
    }
    function isUnknown(item) {
      const engine = getEngine();
      return isEquipment(item) ? !item.identified : SCROLLS.includes(itemKind(item)) && !engine.identification.known.includes(itemKind(item));
    }
    function actionButton(action, label, index = "ground", disabled = false) {
      return `<button class="use-button" data-item-action="${action}" data-index="${index}" ${disabled ? "disabled" : ""}>${label}</button>`;
    }
    function groundButtons() {
      const engine = getEngine();
      const item = engine.groundItem();
      if (!item) return "";
      const kind = itemKind(item), old = engine.player.equipment[kind];
      const canPickup = kind === "gold" || (kind === "arrow" && engine.arrowCount()) || engine.inventoryCount() < INVENTORY_CAPACITY;
      const primary = isEquipment(item)
        ? actionButton("equip-ground", old ? "持ち替える" : "装備する", "ground", old?.cursed || (!old && !canPickup))
        : kind === "gold" ? "" : actionButton("use", useLabel(item));
      const appraise = isUnknown(item) && engine.identification.known.includes("identify") && engine.player.bag.includes("identify")
        ? actionButton("appraise", "鑑定（灯札1枚）") : "";
      const naming = SCROLLS.includes(kind) && isUnknown(item) ? actionButton("name", "名前を付ける") : "";
      return (isEquipment(item) && appraise ? appraise + primary : primary + appraise) + actionButton("pickup", "拾う", "ground", !canPickup) +
        (kind !== "gold" ? actionButton("exchange", "交換する", "ground", engine.onStairs() || !engine.player.bag.length) : "") + naming;
    }
    function groundNote() {
      const engine = getEngine();
      const item = engine.groundItem();
      if (!item) return "";
      const notes = [];
      if (isEquipment(item)) {
        const old = engine.player.equipment[item.kind];
        if (old?.cursed) notes.push("装備中の品は呪われていて外せません。");
        else if (old) notes.push(`持ち替えると、${engine.itemName(old)}を足元に置きます。`);
      }
      if (engine.inventoryCount() >= INVENTORY_CAPACITY && item.kind !== "gold" && !(item.kind === "arrow" && engine.arrowCount()))
        notes.push("持ち物がいっぱいです。交換なら枠は増えません。");
      if (engine.onStairs() && item.kind !== "gold") notes.push("階段の上では交換できません。");
      return notes.length ? `<p class="item-note">${notes.map(escapeHTML).join("<br>")}</p>` : "";
    }
    function bagRow(item, buttons, count = 1, badge = "", ground = false) {
      const engine = getEngine();
      const kind = itemKind(item), icon = SCROLLS.includes(kind) ? "✧" : ITEMS[kind]?.icon || "●";
      return `<details class="bag-entry"${ground ? ' data-ground-row' : ''}><summary><span class="item-icon" aria-hidden="true">${icon}</span><strong>${escapeHTML(itemLabel(item, count))}</strong>${badge ? `<span class="bag-badge">${badge}</span>` : ""}</summary><div class="bag-entry-detail"><p>${escapeHTML(engine.itemDescription(item))}</p>${ground ? groundNote() : ""}<div class="bag-actions">${buttons}</div></div></details>`;
    }
    function bindItemActions(onReturn) {
      $("modal-content").querySelectorAll("[data-item-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const engine = getEngine();
          const action = button.dataset.itemAction,
            index = button.dataset.index === "ground" ? "ground" : Number(button.dataset.index);
          const returnTo = onReturn === showBag ? () => showBag(index) : onReturn;
          if (action === "name") { showItemName(index, returnTo); return; }
          if (action === "exchange" && index === "ground") { showExchange(returnTo); return; }
          if (action === "use" && engine.scrollNeedsTarget(index)) { showIdentify(index, returnTo); return; }
          closeModal();
          act(() => {
            const engine = getEngine();
            if (action === "use") return engine.use(index);
            if (action === "pickup") return engine.pickup();
            if (action === "equip-ground") return engine.equip("ground");
            if (action === "appraise") return engine.use(engine.player.bag.indexOf("identify"), "ground");
            if (action === "drop" || action === "exchange") return engine.drop(index, action === "exchange");
            if (action === "equip-arrow") return engine.equipArrow();
            if (action === "unequip") return engine.unequip(button.dataset.index);
            return false;
          }, true);
        });
      });
    }
    function showGround() {
      const engine = getEngine();
      const item = engine.groundItem();
      if (engine.status !== "playing" || !item) return;
      openModal("ground", `<div class="modal-inner bag-modal ground-modal">${modalHeader("足元の品")}<div class="ground-detail"><h3>${escapeHTML(itemLabel(item))}</h3><p>${escapeHTML(engine.itemDescription(item))}</p>${groundNote()}<div class="bag-actions">${groundButtons()}</div></div><p class="bag-turn-hint">見る・命名は時間が進みません。その他の操作は1ターン。</p><button class="secondary-button" data-close>冒険に戻る</button></div>`);
      bindItemActions(showGround);
    }
    function revealBagRow(row) {
      if (!row.open) return;
      const list = row.closest(".bag-list"), rect = row.getBoundingClientRect();
      const top = rect.top - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + rect.height > list.scrollTop + list.clientHeight)
        list.scrollTop = Math.min(top, top + rect.height - list.clientHeight);
    }
    function showBag(selected = null) {
      const engine = getEngine();
      if (engine.status !== "playing") return;
      if (typeof selected !== "number" && selected !== "ground") selected = null;
      const p = engine.player, ground = engine.groundItem(),
        entries = engine.inventoryEntries().sort((a, b) => {
          const priority = ({kind,index}) => kind === "arrow" ? 0 : isEquipment(p.bag[index]) && !p.bag[index].identified ? 1 : 2;
          return priority(a) - priority(b);
        });
      const equippedCards = Object.entries(p.equipment).filter(([, item]) => item)
        .map(([kind, item]) => bagRow(item, actionButton("unequip", "外す", kind), 1, "装備中")).join("");
      const bagCards = entries.map(({kind,index,count}) => {
        const item = p.bag[index], equipped = kind === "arrow" && p.ammo === "arrow";
        const primary = kind === "arrow" ? actionButton("equip-arrow", equipped ? "外す" : "装備する", index)
          : actionButton("use", isEquipment(item) ? "装備する" : useLabel(item), index);
        const naming = SCROLLS.includes(kind) && isUnknown(item) ? actionButton("name", "名前を付ける", index) : "";
        return bagRow(item, primary + naming + actionButton("drop", "置く", index, !!ground || engine.onStairs()) +
          (ground && ITEMS[ground.kind] && !engine.onStairs() ? actionButton("exchange", "足元と交換", index) : ""), count, equipped ? "装備中" : "");
      }).join("");
      const groundCard = ground ? bagRow(ground, groundButtons(), 1, "足元", true) : "";
      openModal("bag", `<div class="modal-inner bag-modal">${modalHeader("旅の持ち物")}<div class="bag-overview"><strong>${engine.inventoryCount()} / ${INVENTORY_CAPACITY} 枠</strong><span>品名を選んで操作</span></div><p class="bag-turn-hint">見る・命名は時間が進みません。その他の操作は1ターン。</p><div class="bag-list" role="region" aria-label="足元と持ち物" tabindex="0">${groundCard}${equippedCards}${bagCards}${!equippedCards && !bagCards ? '<p class="item-note">持ち物はありません。</p>' : ""}</div><details class="bag-rules"><summary>持ち物のルール</summary><div tabindex="0"><p>装備・予備装備・道具は1個につき1枠。矢は1束で1枠です。足元の品は枠に含みません。</p><p>鑑定・交換の対象選択とキャンセルでは時間は進みません。操作を実行すると1ターン進みます。</p><p>足元の品は持たずに使えます。矢の使用は1本、置く・交換は束ごと。階段や品がある場所には置けません。</p></div></details><button class="secondary-button" data-close>冒険に戻る</button></div>`);
      const rows = $("modal-content").querySelectorAll(".bag-entry");
      if (selected !== null) rows.forEach((row) => {
        if (row.querySelector(`[data-index="${selected}"]`)) {
          row.open = true;
          requestAnimationFrame(() => revealBagRow(row));
        }
      });
      rows.forEach((row) => row.querySelector("summary").addEventListener("click", () => {
        if (!row.open) {
          rows.forEach((other) => { if (other !== row) other.open = false; });
          requestAnimationFrame(() => revealBagRow(row));
        }
      }));
      bindItemActions(showBag);
    }
    function useGroundFromField() {
      const engine = getEngine();
      if ($("modal").open || engine.status !== "playing") return;
      const item = engine.groundItem();
      if (!item) return;
      if (isEquipment(item)) { showGround(); return; }
      if (engine.scrollNeedsTarget("ground")) { showIdentify("ground", closeModal); return; }
      act(() => item.kind === "gold" ? getEngine().pickup() : getEngine().useGround(), true);
    }
    function targetRow(target, item, place, action, count = 1) {
      return `<button class="target-choice" data-${action}="${target}"><span class="item-icon" aria-hidden="true">${SCROLLS.includes(itemKind(item)) ? "✧" : ITEMS[itemKind(item)].icon}</span><strong>${escapeHTML(itemLabel(item, count))}</strong><span class="bag-badge">${place}</span></button>`;
    }
    function showIdentify(index, onCancel = showBag) {
      const engine = getEngine();
      const sourceItem = engine.targetItem(index);
      const targets = [
        ...(index !== "ground" && engine.groundItem() ? [{target: "ground", item: engine.groundItem(), place: "足元"}] : []),
        ...engine.inventoryEntries().filter((entry) => entry.index !== index).map((entry) => ({target: entry.index, item: engine.player.bag[entry.index], place: "持ち物"})),
      ].filter(({item}) => isUnknown(item));
      openModal("identify", `<div class="modal-inner bag-modal">${modalHeader("鑑定する品を選ぶ")}<p class="selection-source">使う灯札：${escapeHTML(engine.itemName(sourceItem))}</p><p class="bag-turn-hint">対象を選ぶと1ターン。キャンセルは消費なし。</p><div class="bag-list" role="region" aria-label="鑑定できる品" tabindex="0">${targets.map(({target,item,place}) => targetRow(target,item,place,"target")).join("") || '<p class="item-note">鑑定できる品がありません。</p>'}</div><button class="secondary-button" id="identify-cancel">戻る</button></div>`);
      $("modal-content").querySelectorAll("[data-target]").forEach((button) => button.addEventListener("click", () => {
        const value = button.dataset.target, target = /^\d+$/.test(value) ? Number(value) : value;
        closeModal();
        act(() => getEngine().use(index, target), true);
      }));
      $("identify-cancel").addEventListener("click", onCancel);
    }
    function showExchange(onCancel = showBag) {
      const engine = getEngine();
      const item = engine.groundItem();
      if (!item || engine.onStairs()) return;
      openModal("exchange", `<div class="modal-inner bag-modal">${modalHeader("交換する持ち物を選ぶ")}<p class="selection-source">拾う品：${escapeHTML(itemLabel(item))}</p><p class="bag-turn-hint">選んだ持ち物を足元に置きます。交換は1ターン。</p><div class="bag-list" role="region" aria-label="交換できる持ち物" tabindex="0">${engine.inventoryEntries().map(({index,count}) => targetRow(index,engine.player.bag[index],"持ち物","exchange",count)).join("")}</div><button class="secondary-button" id="exchange-cancel">戻る</button></div>`);
      $("modal-content").querySelectorAll("[data-exchange]").forEach((button) => button.addEventListener("click", () => {
        closeModal();
        act(() => getEngine().drop(Number(button.dataset.exchange), true), true);
      }));
      $("exchange-cancel").addEventListener("click", onCancel);
    }
    function showItemName(index, onReturn = showBag) {
      const engine = getEngine();
      const kind = itemKind(engine.targetItem(index));
      openModal("name", `<div class="modal-inner">${modalHeader("灯札に名前を付ける")}<p class="modal-description">推測した効果を20文字以内で記録できます。同じ仮名の灯札すべてに表示されます。</p><form id="item-name-form"><label for="item-name">${escapeHTML(engine.itemName(kind))}</label><input id="item-name" maxlength="20" autocomplete="off"><button class="primary-button" type="submit">名前を保存</button></form><button class="secondary-button" id="name-cancel">戻る</button></div>`);
      $("item-name").value = engine.identification.names[kind] || "";
      $("item-name").focus();
      $("item-name-form").addEventListener("submit", (event) => {
        event.preventDefault();
        getEngine().nameScroll(index, $("item-name").value);
        save();
        updateUI();
        onReturn();
      });
      $("name-cancel").addEventListener("click", onReturn);
    }

    function updateGround({ threat, nearest } = {}) {
      const engine = getEngine();
      const ground = engine.groundItem();
      groundContext.hidden = engine.status !== "playing" || !ground;
      groundUseButton.hidden = groundContext.hidden || isEquipment(ground);
      if (!groundContext.hidden) {
        groundItemButton.innerHTML = `<span class="ground-marker">足元</span><span class="ground-name">${escapeHTML(itemLabel(ground))}</span><span aria-hidden="true">${isEquipment(ground) ? "操作" : "⋯"}</span>`;
        groundItemButton.setAttribute("aria-label", `${itemLabel(ground)}の操作を開く`);
        groundUseButton.textContent = isEquipment(ground) ? "操作" : ground.kind === "gold" ? "拾う" : useLabel(ground);
        groundUseButton.setAttribute("aria-label", `${itemLabel(ground)}：${groundUseButton.textContent}`);
      }
      $("location-hint").hidden = !groundContext.hidden && !threat && !nearest;
      $("location-hint").closest(".canvas-caption").hidden = groundContext.hidden && ["灯りの届く先へ、進んでみよう。", "あせらず、一歩ずつ。"].includes($("location-hint").textContent);
    }

    $("bag-button").addEventListener("click", showBag);
    groundUseButton.addEventListener("click", useGroundFromField);
    groundItemButton.addEventListener("click", showGround);
    return { showBag, showGround, showIdentify, showExchange, showItemName, useGroundFromField, updateGround };
  }
  root.createInventoryUI = createInventoryUI;
  if (typeof module !== "undefined" && module.exports) module.exports = createInventoryUI;
})(typeof window !== "undefined" ? window : globalThis);
