// This factory is also injected into the browser; keep it independent of Node and the DOM.
function createPlaytestPolicy({ W, H, DIRS, MONSTERS, EQUIPMENT, equipmentKind, INVENTORY_CAPACITY }) {
  const key = (x, y) => y * W + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const kind = item => typeof item === 'string' ? item : item.kind;
  function observe(s) {
    const visible = p => !!s.visible[key(p.x, p.y)];
    const known = item => {
      const k = kind(item);
      if (['scroll', 'map', 'identify', 'uncurse'].includes(k) && !s.identification.known.includes(k))
        return { kind: 'unknown-scroll', appearance: s.identification.appearances[k] };
      if (typeof item === 'object' && !item.identified && ['weapon', 'shield'].includes(k))
        return { kind: k, identified: false };
      return typeof item === 'string' ? { kind: item } : { ...item };
    };
    const enemies = s.enemies.filter(e => e.hp > 0 && visible(e));
    const mimics = enemies.filter(e => MONSTERS[e.species]?.trait === 'mimic' && !e.revealed);
    return {
      floor: s.floor, turn: s.turn, status: s.status,
      inventoryCount: s.player.bag.filter(item => kind(item) !== 'arrow').length + Number(s.player.bag.some(item => kind(item) === 'arrow'))
        + Object.values(s.player.equipment).filter(Boolean).length,
      player: { ...s.player, bag: s.player.bag.map(known) },
      tiles: s.tiles.map((t, i) => s.seen[i] ? t : null),
      stairs: s.seen[key(s.stairs.x, s.stairs.y)] ? { ...s.stairs } : null,
      enemies: enemies.filter(e => !mimics.includes(e)).map(e => ({
        x: e.x, y: e.y, species: e.species, hp: e.hp, intent: e.intent && { ...e.intent },
      })),
      items: s.items.filter(i => i.discovered).map(i => ({ ...known(i), x: i.x, y: i.y }))
        .concat(mimics.map(e => ({ kind: 'gold', x: e.x, y: e.y }))),
      traps: s.traps.filter(t => t.found && s.seen[key(t.x, t.y)]).map(t => ({ x: t.x, y: t.y })),
      log: s.log,
    };
  }
  function canStep(o, x, y, dx, dy) {
    const floor = (xx, yy) => inside(xx, yy) && o.tiles[key(xx, yy)] > 0;
    return floor(x + dx, y + dy) && (!(dx && dy) || (floor(x + dx, y) && floor(x, y + dy)));
  }
  function choose(o, memory) {
    if (memory.floor !== o.floor) { memory.floor = o.floor; memory.visits = {}; }
    const p = o.player, at = key(p.x, p.y), distance = e => Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    memory.visits[at] = (memory.visits[at] || 0) + 1;
    const bagIndex = k => p.bag.findIndex(i => i.kind === k);
    const use = (index, reason) => ({ type: 'item', index, action: 'use', reason });
    const move = (dx, dy, reason) => ({ type: 'move', dx, dy, reason });
    if (p.hp <= p.maxHp * .5 && bagIndex('potion') >= 0) return use(bagIndex('potion'), 'heal');
    if (p.hunger <= 50 && bagIndex('bread') >= 0) return use(bagIndex('bread'), 'eat');
    const adjacent = o.enemies.filter(e => distance(e) === 1 && canStep(o, p.x, p.y, e.x - p.x, e.y - p.y));
    const danger = (x, y) => o.enemies.some(e => e.intent?.x === x && e.intent?.y === y);
    if (danger(p.x, p.y)) {
      const exits = DIRS.filter(([dx, dy]) => canStep(o, p.x, p.y, dx, dy) && !danger(p.x + dx, p.y + dy)
        && !o.enemies.some(e => e.x === p.x + dx && e.y === p.y + dy));
      exits.sort((a, b) => o.enemies.filter(e => Math.max(Math.abs(e.x - p.x - a[0]), Math.abs(e.y - p.y - a[1])) <= 1).length
        - o.enemies.filter(e => Math.max(Math.abs(e.x - p.x - b[0]), Math.abs(e.y - p.y - b[1])) <= 1).length);
      if (exits.length) return move(...exits[0], 'dodge');
    }
    if (adjacent.length >= 2 && bagIndex('scroll') >= 0) return use(bagIndex('scroll'), 'crowd-control');
    if (adjacent.length) {
      adjacent.sort((a, b) => a.hp - b.hp);
      return move(adjacent[0].x - p.x, adjacent[0].y - p.y, 'melee');
    }
    if (p.ammo === 'arrow') {
      const target = o.enemies.find(e => {
        const dx = e.x - p.x, dy = e.y - p.y, n = distance(e);
        if (n > 7 || !(dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) return false;
        for (let i = 0; i < n; i++) if (!canStep(o, p.x + Math.sign(dx) * i, p.y + Math.sign(dy) * i, Math.sign(dx), Math.sign(dy))) return false;
        return true;
      });
      if (target) {
        const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
        return p.facing[0] === dx && p.facing[1] === dy
          ? { type: 'button', selector: '#shoot-button', reason: 'shoot' }
          : { type: 'face', dx, dy, reason: 'aim' };
      }
    }
    if (!o.enemies.length) {
      if (bagIndex('arrow') >= 0 && p.ammo !== 'arrow')
        return { type: 'item', index: bagIndex('arrow'), action: 'equip-arrow', reason: 'equip-arrow' };
      for (let index = 0; index < p.bag.length; index++) {
        const item = p.bag[index], old = p.equipment[item.kind];
        if (!['weapon', 'shield'].includes(item.kind) || old?.cursed) continue;
        const power = gear => (EQUIPMENT[equipmentKind(gear)]?.power || 0) + (gear?.bonus || 0);
        if (item.identified && power(item) > power(old)) return use(index, 'equip-known');
      }
    }
    if (o.stairs?.x === p.x && o.stairs?.y === p.y)
      return { type: 'button', selector: '#stairs-button', reason: 'descend' };
    // ponytail: unweighted BFS is enough for a 44×30 map; add path costs only after measuring detours.
    const queue = [{ x: p.x, y: p.y, first: null, depth: 0 }], visited = new Set([at]);
    let target = null, best = -Infinity;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], k = key(node.x, node.y);
      const frontier = DIRS.some(([dx, dy]) => inside(node.x + dx, node.y + dy) && o.tiles[key(node.x + dx, node.y + dy)] === null);
      const item = o.items.find(item => item.x === node.x && item.y === node.y);
      const useful = item && (o.inventoryCount < INVENTORY_CAPACITY || item.kind === 'gold' || (item.kind === 'arrow' && bagIndex('arrow') >= 0));
      const stairs = o.stairs?.x === node.x && o.stairs?.y === node.y;
      const score = (useful ? 16 : stairs ? 12 : frontier ? 8 : -10000) - node.depth - (memory.visits[k] || 0) * 3;
      if (node.first && score > best) { target = node; best = score; }
      for (const [dx, dy] of DIRS) {
        const x = node.x + dx, y = node.y + dy, next = key(x, y);
        if (visited.has(next) || !canStep(o, node.x, node.y, dx, dy) || danger(x, y)) continue;
        if (o.traps.some(t => t.x === x && t.y === y)) continue;
        visited.add(next); queue.push({ x, y, first: node.first || [dx, dy], depth: node.depth + 1 });
      }
    }
    if (target && best > -10000) return move(...target.first, 'explore');
    return { type: 'stop', reason: 'no-known-route' };
  }
  return { observe, choose, canStep };
}
module.exports = createPlaytestPolicy;
