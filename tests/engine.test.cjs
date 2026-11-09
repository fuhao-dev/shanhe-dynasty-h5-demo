const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const run = (s, seconds) => { for (let t = 0; t < seconds * 4; t++) E.tick(s, .25, 1000 + t * 250); };

test('开局资源、战力、供需与原版存档隔离', () => {
  const s = E.create(1000);
  assert.equal(E.power(s), 2000); assert.equal(E.population(s), 20);
  assert.equal(E.supply(s), 200); assert.equal(E.consume(s), 20);
  assert.equal(E.SAVE_KEY, 'shanhe_h5_demo_v1');
});
test('成批培养；供需不足停止启动，已开始批次照常结算', () => {
  const s = E.create(1000); E.tick(s, .25);
  assert.equal(s.realms[0].batch, 10); assert.equal(E.population(s), 20);
  s.realms[0].base = 199;
  run(s, 3); assert.equal(E.population(s), 209);
  run(s, 10); assert.equal(E.population(s), 209); assert.equal(s.realms[0].training, 0);
});
test('基础群体不吃百分比，剑修单体向上取整，全部群体相加', () => {
  const s = E.create(); s.realms[0].base = 3; s.realms[0].sword = 4;
  s.book = 1; s.wall = 1; s.swordLevel = 1;
  // B=101; G+剑道=125%; 剑修单体 ceil(126.25)=127。
  assert.equal(E.power(s), 3 * 101 + 4 * 127);
});
test('梳理与灵兽作用于供给及基础战力；成功才扣材料', () => {
  const s = E.create(); assert.equal(E.act(s, 'comb').ok, true);
  assert.equal(s.wallet.jade, 36); assert.equal(E.supply(s), 220);
  E.act(s, 'beast'); assert.equal(E.realmBase(s, 0), 110); assert.equal(s.wallet.fruit, 3);
  const before = JSON.stringify(s); assert.equal(E.act(s, 'beast').ok, false); assert.equal(JSON.stringify(s), before);
});
test('巡天单槽事件，待处理时探索停止，修行继续', () => {
  const s = E.create(); E.act(s, 'toggleScan'); run(s, 8.5);
  assert.equal(s.pending, 'vein'); assert.equal(s.scan.laps, 1);
  const pop = E.population(s); run(s, 8); assert.equal(s.scan.laps, 1); assert.ok(E.population(s) > pop);
  assert.equal(E.act(s, 'event').ok, true); assert.equal(s.veins, 4); assert.equal(s.wallet.jade, 34);
  run(s, 8.5); assert.equal(s.pending, 'herb');
});
test('资源不足奇遇不丢失；离开免费且可继续', () => {
  const s = E.create(); s.pending = 'vein'; s.wallet.jade = 0;
  assert.equal(E.act(s, 'event').ok, false); assert.equal(s.pending, 'vein');
  assert.equal(E.act(s, 'skip').ok, true); assert.equal(s.pending, null); assert.equal(s.wallet.crystal, 130);
});
test('进阶只检查战力，不扣除战力，并解锁更高境界', () => {
  const s = E.create(); assert.equal(E.act(s, 'advance').ok, false);
  s.realms[0].base = 100; const before = E.power(s);
  assert.equal(E.act(s, 'advance').ok, true); assert.equal(s.stage, 1); assert.equal(E.power(s), before);
  E.tick(s, .25); assert.ok(s.realms[1].training > 0);
});
test('愿景奖励只领取一次；剑道转换守恒', () => {
  const s = E.create(); s.events = 1;
  assert.equal(E.act(s, 'claimQuest', 0).ok, true);
  assert.equal(E.act(s, 'claimQuest', 0).ok, false);
  const n = E.population(s); E.act(s, 'sword'); assert.equal(E.population(s), n);
  assert.equal(s.realms[0].sword, 10);
});
test('离线收益上限300，领取一次；回拨时间不产生收益', () => {
  const s = E.create(1000), raw = E.serialize(s, 1000);
  const loaded = E.restore(raw, 1000 + 20 * 1000 * 10000);
  assert.equal(loaded.offline, 300); E.act(loaded, 'offline'); assert.equal(loaded.offline, 0);
  assert.equal(E.act(loaded, 'offline').ok, false);
  assert.equal(E.restore(raw, 500).offline, 0);
  assert.equal(E.restore(E.serialize(loaded, 200000), 200000).offline, 0);
});
test('存档拒绝NaN、负资源、未知事件、越界境界与伪造对象', () => {
  for (const mutate of [s => s.wallet.jade = -1, s => s.realms[0].base = NaN, s => s.stage = 9, s => s.pending = '__proto__', s => s.book = 7, s => s.realms[1].base = 1]) {
    const s = E.create(); mutate(s); assert.throws(() => E.restore(s));
  }
  assert.throws(() => E.restore('{'));
  const s = E.create(); s.extra = '<script>'; const loaded = E.restore(s); assert.equal(loaded.extra, undefined);
});
test('所有养成上限与龙脉事件不会产生无效存档', () => {
  const s = E.create(); s.veins = 199; s.pending = 'vein'; E.act(s, 'event'); assert.equal(s.veins, 200);
  s.pending = 'vein'; E.act(s, 'event'); assert.equal(s.veins, 200);
  assert.doesNotThrow(() => E.restore(E.serialize(s)));
});
test('600秒自动策略模拟能完成六王朝，资源不负，存档可恢复', () => {
  const s = E.create(1000); E.act(s, 'toggleScan');
  let completedAt = null;
  for (let t = 0; t < 2400; t++) {
    E.tick(s, .25, 1000 + t * 250);
    if (s.pending) { if (!E.act(s, 'event').ok) E.act(s, 'skip'); }
    E.QUESTS.forEach((_, i) => E.act(s, 'claimQuest', i));
    if (s.scan.level < 4) E.act(s, 'scan');
    if (s.swordLevel < 8) E.act(s, 'sword');
    if (s.beast < 8) E.act(s, 'beast');
    if (s.comb < 12) E.act(s, 'comb');
    if (s.wall < 10) E.act(s, 'wall');
    for (let i = 0; i < 3; i++) if (s.realms[i].level < 4) E.act(s, 'training', i);
    if (E.act(s, 'advance').ok && s.stage === 5 && completedAt === null) completedAt = t / 4;
    assert.ok(Object.values(s.wallet).every(n => Number.isFinite(n) && n >= 0));
  }
  assert.equal(s.stage, 5, '模拟最终战力 ' + E.power(s));
  assert.doesNotThrow(() => E.restore(E.serialize(s, 601000), 601000));
  console.log(`自动策略模拟：${completedAt} 秒到达玉泉漱石；${E.population(s)} 位仙师；${E.power(s)} 战力。此为引擎模拟，不代表人工游玩耗时。`);
});
