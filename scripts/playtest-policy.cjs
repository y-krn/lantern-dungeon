// This factory is also injected into the browser; keep it independent of Node and the DOM.
function createPlaytestPolicy({ W, H, DIRS, MONSTERS, EQUIPMENT, equipmentKind, INVENTORY_CAPACITY, DUNGEONS }) {
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
      floor: s.floor, maxFloor: DUNGEONS[s.dungeon].floors, guardian: DUNGEONS[s.dungeon].guardian, turn: s.turn, status: s.status,
      inventoryCount: s.player.bag.filter(item => kind(item) !== 'arrow').length + Number(s.player.bag.some(item => kind(item) === 'arrow'))
        + Object.values(s.player.equipment).filter(Boolean).length,
      player: { ...s.player, bag: s.player.bag.map(known) },
      tiles: s.tiles.map((t, i) => s.seen[i] ? t : null),
      stairs: s.seen[key(s.stairs.x, s.stairs.y)] ? { ...s.stairs } : null,
      enemies: enemies.filter(e => !mimics.includes(e)).map(e => ({
        x: e.x, y: e.y, species: e.species, hp: e.hp, intent: e.intent && { ...e.intent },
        ...(e.elite ? {elite: true} : {}),
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
  function clearShot(o, from, to, range) {
    const x = to.x - from.x, y = to.y - from.y, n = Math.max(Math.abs(x), Math.abs(y));
    if (!n || n > range || !(x === 0 || y === 0 || Math.abs(x) === Math.abs(y))) return false;
    const dx = Math.sign(x), dy = Math.sign(y);
    for (let i = 1; i <= n; i++) {
      if (!canStep(o, from.x + dx * (i - 1), from.y + dy * (i - 1), dx, dy)) return false;
      if (i < n && o.enemies.some(e => e.x === from.x + dx * i && e.y === from.y + dy * i)) return false;
    }
    return true;
  }
  function choose(o, memory) {
    if (memory.floor !== o.floor) { memory.floor = o.floor; memory.visits = {}; memory.lastDodge = null; memory.guardianDefeated = false; }
    memory.guardianDefeated ||= o.log.some(entry => entry.text.startsWith(`${o.guardian}を倒した。`));
    const p = o.player, at = key(p.x, p.y), distance = e => Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y));
    memory.visits[at] = (memory.visits[at] || 0) + 1;
    const bagIndex = k => p.bag.findIndex(i => i.kind === k);
    const use = (index, reason) => ({ type: 'item', index, action: 'use', reason });
    const move = (dx, dy, reason) => ({ type: 'move', dx, dy, reason });
    const power = item => (EQUIPMENT[equipmentKind(item)]?.power || 0) + (item?.bonus || 0);
    const ground = o.items.find(item => item.x === p.x && item.y === p.y);
    const source = k => ground?.kind === k ? 'ground' : bagIndex(k);
    if (p.hp <= p.maxHp * .5 && source('potion') !== -1) return use(source('potion'), 'heal');
    if (p.hunger <= 50 && source('bread') !== -1) return use(source('bread'), 'eat');
    const adjacent = o.enemies.filter(e => distance(e) === 1 && canStep(o, p.x, p.y, e.x - p.x, e.y - p.y));
    const aimed = (e, x, y) => e.intent?.kind === 'charge'
      ? Array.from({length:e.intent.length}, (_, i) => i + 1).some(i => e.x + e.intent.dx * i === x && e.y + e.intent.dy * i === y)
      : e.intent?.x === x && e.intent?.y === y;
    const danger = (x, y) => o.enemies.some(e => aimed(e, x, y));
    const exposure = (x, y) => o.enemies.filter(e => ['ranged', 'snare', 'kite'].includes(MONSTERS[e.species]?.trait)
      && clearShot(o, e, { x, y }, MONSTERS[e.species].range)).length;
    const threats = o.enemies.filter(e => aimed(e, p.x, p.y));
    const bound = p.bindUntil >= o.turn + 1;
    if (danger(p.x, p.y) && !bound) {
      const weaponTrait = EQUIPMENT[equipmentKind(p.equipment.weapon)]?.trait;
      const lethal = adjacent.find(e => {
        const monster = MONSTERS[e.species];
        let damage = 4 + (p.level - 1) * 2 + power(p.equipment.weapon);
        if (weaponTrait === 'ghost' && monster.type === 'ghost') damage *= 2;
        return e.hp <= Math.max(1, damage - (weaponTrait === 'pierce' ? 0 : monster.armor || 0));
      });
      if (threats.length === 1 && threats[0] === lethal) return move(lethal.x - p.x, lethal.y - p.y, 'finish-threat');
      const exits = DIRS.filter(([dx, dy]) => canStep(o, p.x, p.y, dx, dy) && !danger(p.x + dx, p.y + dy)
        && !o.enemies.some(e => e.x === p.x + dx && e.y === p.y + dy));
      const risk = ([dx, dy]) => {
        const x = p.x + dx, y = p.y + dy;
        const near = o.enemies.filter(e => Math.max(Math.abs(e.x - x), Math.abs(e.y - y)) === 1 && canStep(o, x, y, e.x - x, e.y - y));
        const openings = near.filter(e => e.intent).length;
        const melee = near.filter(e => !['ranged', 'windup'].includes(MONSTERS[e.species]?.trait)).length;
        return melee * 10 - openings * 8 + exposure(x, y) * 4 + Math.min(4, memory.visits[key(x, y)] || 0);
      };
      exits.sort((a, b) => risk(a) - risk(b));
      if (o.enemies.length === 1 && threats.length === 1 && adjacent.includes(threats[0]) && MONSTERS[threats[0].species].stationary
        && !exits.some(([dx, dy]) => canStep(o, p.x + dx, p.y + dy, threats[0].x - p.x - dx, threats[0].y - p.y - dy)
          && Math.max(Math.abs(threats[0].x - p.x - dx), Math.abs(threats[0].y - p.y - dy)) === 1)) {
        const attack = MONSTERS[threats[0].species].attack;
        const maxHit = Math.max(1, (threats[0].elite ? Math.ceil(attack * 1.2) : attack) - power(p.equipment.shield));
        if (p.hp > Math.max(p.maxHp * .5, maxHit * 2))
          return { ...move(threats[0].x - p.x, threats[0].y - p.y, 'trade-hit'), maxIncomingDamage: maxHit };
      }
      if (exits.length) {
        memory.lastDodge = { ...threats[0], waits: 0 };
        return move(...exits[0], 'dodge');
      }
    }
    if (adjacent.length >= 2 && bagIndex('scroll') >= 0) return use(bagIndex('scroll'), 'crowd-control');
    if (adjacent.length) {
      adjacent.sort((a, b) => a.hp - b.hp);
      return move(adjacent[0].x - p.x, adjacent[0].y - p.y, 'melee');
    }
    if (p.ammo === 'arrow') {
      const target = o.enemies.find(e => MONSTERS[e.species]?.trait !== 'mirror' && clearShot(o, p, e, 7));
      if (target) {
        const dx = Math.sign(target.x - p.x), dy = Math.sign(target.y - p.y);
        return p.facing[0] === dx && p.facing[1] === dy
          ? { type: 'button', selector: '#shoot-button', reason: 'shoot' }
          : { type: 'face', dx, dy, reason: 'aim' };
      }
    }
    if (bound) return { type: 'button', selector: '#wait-button', reason: 'bound' };
    const lure = memory.lastDodge;
    if (lure && lure.waits < 2 && o.enemies.some(e => e.x === lure.x && e.y === lure.y && !e.intent
      && MONSTERS[e.species]?.trait === 'windup' && distance(e) === 2 && clearShot(o, e, p, 2))) {
      lure.waits++;
      return { type: 'button', selector: '#wait-button', reason: 'lure-counter' };
    }
    if (!o.enemies.length) {
      if (Object.values(p.equipment).some(item => item?.cursed) && bagIndex('uncurse') >= 0)
        return use(bagIndex('uncurse'), 'uncurse');
      if (bagIndex('arrow') >= 0 && p.ammo !== 'arrow')
        return { type: 'item', index: bagIndex('arrow'), action: 'equip-arrow', reason: 'equip-arrow' };
      const gear = p.bag.map((item, index) => ({ item, index })).concat(ground ? [{ item: ground, index: 'ground' }] : [])
        .filter(({item}) => ['weapon', 'shield'].includes(item.kind));
      for (const { item, index } of gear) {
        const old = p.equipment[item.kind];
        if (!['weapon', 'shield'].includes(item.kind) || old?.cursed) continue;
        if (item.identified && !item.cursed && power(item) > power(old))
          return index === 'ground' ? { type: 'item', index, action: 'equip-ground', reason: 'equip-known' } : use(index, 'equip-known');
      }
      const unknown = gear.find(({item}) => !item.identified && !p.equipment[item.kind]?.cursed);
      const target = unknown?.index ?? p.bag.findIndex(item => item.kind === 'unknown-scroll');
      if (bagIndex('identify') >= 0 && target !== -1)
        return { ...use(bagIndex('identify'), unknown ? 'identify-gear' : 'identify-scroll'), target };
      if (unknown && p.hp >= p.maxHp * .75 && (power(p.equipment[unknown.item.kind]) === 0 || bagIndex('uncurse') >= 0))
        return { type: 'item', index: unknown.index, action: unknown.index === 'ground' ? 'equip-ground' : 'use', reason: 'try-gear' };
    }
    if (o.floor < o.maxFloor && o.stairs?.x === p.x && o.stairs?.y === p.y)
      return { type: 'button', selector: '#stairs-button', reason: 'descend' };
    if (o.floor === o.maxFloor && memory.guardianDefeated && o.stairs?.x === p.x && o.stairs?.y === p.y)
      return { type: 'button', selector: '#wait-button', reason: 'claim-treasure' };
    // Integer-cost buckets keep weighted routing small and bounded on the 44×30 board.
    const costs = Array(W * H).fill(Infinity), queue = [[{ x: p.x, y: p.y, first: null }]];
    costs[at] = 0;
    let target = null, best = -Infinity;
    const risks = new Map();
    for (let cost = 0; cost < queue.length; cost++) for (const node of queue[cost] || []) {
      const k = key(node.x, node.y);
      if (costs[k] !== cost) continue;
      const frontier = DIRS.some(([dx, dy]) => inside(node.x + dx, node.y + dy) && o.tiles[key(node.x + dx, node.y + dy)] === null);
      const item = o.items.find(item => item.x === node.x && item.y === node.y);
      // Echo shards are a player choice, so the policy neither seeks nor avoids them.
      const useful = item && item.kind !== 'echoShard' && (o.inventoryCount < INVENTORY_CAPACITY || item.kind === 'gold' || (item.kind === 'arrow' && bagIndex('arrow') >= 0));
      const stairs = (o.floor < o.maxFloor || memory.guardianDefeated) && o.stairs?.x === node.x && o.stairs?.y === node.y;
      const enemy = o.enemies.some(e => e.x === node.x && e.y === node.y);
      if (enemy || useful || stairs || frontier) {
        const score = (enemy ? 28 : useful ? 16 : stairs ? 12 : 8) - cost - Math.min(12, (memory.visits[k] || 0) * 3);
        if (node.first && score > best) { target = { ...node, enemy }; best = score; }
      }
      for (const [dx, dy] of DIRS) {
        const x = node.x + dx, y = node.y + dy, next = key(x, y);
        if (!canStep(o, node.x, node.y, dx, dy) || danger(x, y)) continue;
        if (o.traps.some(t => t.x === x && t.y === y)) continue;
        if (!risks.has(next)) risks.set(next, exposure(x, y));
        const nextCost = cost + 1 + risks.get(next) * 4 + Math.min(4, memory.visits[next] || 0);
        if (nextCost >= costs[next]) continue;
        costs[next] = nextCost;
        (queue[nextCost] ||= []).push({ x, y, first: node.first || [dx, dy] });
      }
    }
    if (target) return move(...target.first, target.enemy ? 'approach-enemy' : 'explore');
    return { type: 'stop', reason: 'no-known-route' };
  }
  return { observe, choose, canStep, clearShot };
}
module.exports = createPlaytestPolicy;
