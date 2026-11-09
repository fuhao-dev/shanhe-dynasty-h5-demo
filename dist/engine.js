/* 山河纪 · 独立、无 DOM 的玩法层。原版存档与代码不在此目录使用。 */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.Shanhe = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const SAVE_KEY = 'shanhe_h5_demo_v1';
  const STAGES = [
    { name: '清气初生', power: 0, flavor: '一缕清气，万物始生。' },
    { name: '灵露凝华', power: 10000, flavor: '灵露成珠，仙师来归。' },
    { name: '青岚吐秀', power: 60000, flavor: '青岚出岫，道途渐明。' },
    { name: '碧萝生烟', power: 200000, flavor: '山河生烟，百脉共鸣。' },
    { name: '紫霭萦山', power: 800000, flavor: '紫气东来，万象归心。' },
    { name: '玉泉漱石', power: 2000000, flavor: '玉泉不息，此间已是人间仙境。' }
  ];
  const REALMS = [
    { name: '淬骨', base: 100, cut: 1, stage: 0, batch: 10, seconds: 3 },
    { name: '纳灵', base: 500, cut: 4, stage: 1, batch: 5, seconds: 4 },
    { name: '练气', base: 3000, cut: 16, stage: 3, batch: 2, seconds: 5 }
  ];
  const EVENTS = {
    vein: { title: '云深见龙脉', type: '山河奇遇', text: '山雾散去，一缕碧光自岩隙流出。引此地灵脉入境，可养更多仙师。', icon: 'mountain' },
    herb: { title: '灵圃逢春', type: '山河馈赠', text: '雨后山谷灵草遍生。随行仙师已采得一篮灵果与淬炼辅材。', icon: 'leaf' },
    book: { title: '古卷遗音', type: '功法奇遇', text: '残碑间藏着一卷《青岚诀》。拓印古卷，或将领悟带回王朝。', icon: 'book' },
    beast: { title: '白鹿衔芝', type: '灵兽奇遇', text: '一头白鹿踏云而来，将灵果与灵璧轻放在你的掌心。', icon: 'deer' },
    wave: { title: '山河聚灵', type: '灵气潮汐', text: '天降甘霖，散修闻讯而来。开启灵阵，可迎他们加入当前最高境界。', icon: 'spark' },
    chest: { title: '云游商人的匣子', type: '行旅奇遇', text: '商人愿用一只封存的宝匣，换取三十玄晶。匣内为固定灵璧与培养材料。', icon: 'chest' }
  };
  const QUESTS = [
    { title: '初巡山河', text: '处理 1 次巡天奇遇', goal: 1, key: 'events', reward: { jade: 10, fruit: 5 } },
    { title: '百川归脉', text: '拥有 4 条龙脉', goal: 4, key: 'veins', reward: { crystal: 80, luck: 10 } },
    { title: '灵露初成', text: '王朝达到「灵露凝华」', goal: 1, key: 'stage', reward: { jade: 20, material: 15 } },
    { title: '白鹿相伴', text: '培养白鹿至 1 阶', goal: 1, key: 'beast', reward: { fruit: 15, crystal: 60 } },
    { title: '千门纳灵', text: '总仙师达到 200 位', goal: 200, key: 'population', reward: { jade: 40, luck: 20 } },
    { title: '青岚之上', text: '王朝达到「青岚吐秀」', goal: 2, key: 'stage', reward: { crystal: 150, jade: 30 } }
  ];
  function create(now = Date.now()) {
    return {
      version: VERSION, created: now, savedAt: now, stage: 0,
      wallet: { crystal: 120, jade: 40, luck: 0, fruit: 8, material: 12, sword: 8 },
      realms: REALMS.map((_, i) => ({ base: i === 0 ? 20 : 0, sword: 0, training: 0, batch: 0, level: 0 })),
      veins: 2, comb: 0, wall: 0, beast: 0, book: 0, swordLevel: 0,
      scan: { running: false, progress: 0, level: 0, laps: 0 },
      pending: null, events: 0, claimed: [], offline: 0,
      log: [{ text: '你执掌一方山河。二十位淬骨仙师，静候王朝新生。', at: now }]
    };
  }
  const population = s => s.realms.reduce((n, r) => n + r.base + r.sword, 0);
  const bookPower = s => [0, 1, 2, 3, 5, 8, 13][s.book];
  const realmBase = (s, i) => REALMS[i].base + s.beast * 10 + bookPower(s);
  function power(s) {
    return s.realms.reduce((sum, r, i) => {
      if (s.stage < REALMS[i].stage) return sum;
      const b = realmBase(s, i);
      const sword = Math.ceil(b * (100 + s.wall * 5 + s.swordLevel * 20) / 100);
      return sum + Math.ceil(b * r.base) + Math.ceil(sword * r.sword);
    }, 0);
  }
  const supply = s => Math.floor(s.veins * 100 * (1 + s.comb * 0.1));
  const consume = s => s.realms.reduce((n, r, i) => n + (r.base + r.sword) * REALMS[i].cut, 0);
  const remaining = s => supply(s) - consume(s);
  const scanDuration = s => Math.max(4, 8 - s.scan.level);
  const batchSize = (s, i) => REALMS[i].batch + s.realms[i].level * (i === 0 ? 5 : 2);
  const nextStage = s => STAGES[s.stage + 1] || null;
  function addLog(s, text, now = Date.now()) {
    s.log.unshift({ text, at: now });
    s.log = s.log.slice(0, 60);
  }
  function grant(s, reward) {
    Object.entries(reward).forEach(([k, n]) => { if (k in s.wallet) s.wallet[k] += n; });
  }
  function canPay(s, cost) { return Object.entries(cost).every(([k, n]) => n >= 0 && Number.isFinite(n) && s.wallet[k] >= n); }
  function pay(s, cost) {
    if (!canPay(s, cost)) return false;
    Object.entries(cost).forEach(([k, n]) => { s.wallet[k] -= n; });
    return true;
  }
  function eventForLap(lap) {
    // 固定开局保证能接触核心系统；后续循环可供快速验收。
    return ['vein', 'herb', 'vein', 'book', 'beast', 'vein', 'wave', 'chest'][lap % 8];
  }
  function tick(s, dt, now = Date.now()) {
    dt = Math.min(1, Math.max(0, dt));
    s.realms.forEach((r, i) => {
      if (s.stage < REALMS[i].stage) return;
      if (r.training > 0) {
        r.training = Math.max(0, r.training - dt);
        if (r.training === 0) {
          // 正在修炼的整批仍会结算；灵气只决定下一批是否启动。
          if (s.swordLevel > 0) { const sword = Math.ceil(r.batch * 0.6); r.sword += sword; r.base += r.batch - sword; }
          else r.base += r.batch;
          r.batch = 0;
        }
      } else if (remaining(s) >= batchSize(s, i) * REALMS[i].cut) {
        r.batch = batchSize(s, i);
        r.training = REALMS[i].seconds;
      }
    });
    if (s.scan.running && !s.pending) {
      s.scan.progress = Math.min(100, s.scan.progress + dt * 100 / scanDuration(s));
      if (s.scan.progress >= 100) {
        s.pending = eventForLap(s.scan.laps); s.scan.laps++; s.scan.progress = 0;
        grant(s, { crystal: 24 + s.stage * 4, luck: 2 });
        addLog(s, '巡天归来：' + EVENTS[s.pending].title + '。', now);
      }
    }
  }
  function questValue(s, q) {
    return q.key === 'population' ? population(s) : s[q.key];
  }
  function cost(s, kind, index = 0) {
    switch (kind) {
      case 'vein': return { jade: 8 + s.veins * 2 };
      case 'comb': return { jade: 4 + s.comb * 4 };
      case 'beast': return { fruit: 5 + s.beast * 3 };
      case 'book': return { crystal: 15 + s.book * 15 };
      case 'sword': return { sword: 4 + s.swordLevel * 3 };
      case 'wall': return { luck: 10 + s.wall * 5 };
      case 'scan': return { crystal: 40 + s.scan.level * 40 };
      case 'training': return { material: 5 + s.realms[index].level * 5 };
      default: return {};
    }
  }
  function act(s, action, index = 0, now = Date.now()) {
    const fail = msg => ({ ok: false, message: msg });
    const done = message => ({ ok: true, message });
    if (action === 'toggleScan') { s.scan.running = !s.scan.running; return done(s.scan.running ? '巡天已开启，静候山河回应' : '巡天暂歇'); }
    if (action === 'focus') {
      if (!s.scan.running || s.pending) return fail('先开启巡天，或处理眼前的奇遇');
      s.scan.progress = Math.min(99.9, s.scan.progress + 12); return done('神念已凝聚');
    }
    if (action === 'advance') {
      const next = nextStage(s);
      if (!next) return fail('已抵达本次 DEMO 的最终王朝');
      if (power(s) < next.power) return fail('王朝战力尚未达到进阶所需');
      s.stage++; grant(s, { crystal: 60 + s.stage * 20, jade: 15, material: 10, sword: 5 });
      addLog(s, '王朝进阶 · ' + STAGES[s.stage].name + '。山河为你而新。', now);
      return done('王朝进阶：' + STAGES[s.stage].name);
    }
    if (action === 'claimQuest') {
      const q = QUESTS[index];
      if (!q || s.claimed.includes(index) || questValue(s, q) < q.goal) return fail('尚未完成此项山河愿景');
      s.claimed.push(index); grant(s, q.reward); addLog(s, '愿景达成 · ' + q.title, now); return done('愿景奖励已领取');
    }
    if (action === 'offline') {
      const n = s.offline; if (!n) return fail('当前没有待领取的离线收益');
      grant(s, { crystal: n }); s.offline = 0; addLog(s, '离线巡守带回 ' + n + ' 玄晶。', now); return done('获得 ' + n + ' 玄晶');
    }
    if (action === 'event' || action === 'skip') {
      const id = s.pending; if (!id) return fail('暂时没有待处理的奇遇');
      if (action === 'skip') {
        s.pending = null; s.events++; grant(s, { crystal: 10 }); addLog(s, '告别奇遇，带回 10 玄晶。', now); return done('继续巡天');
      }
      const eventCost = id === 'vein' ? { jade: 6 } : id === 'chest' ? { crystal: 30 } : id === 'wave' ? { jade: 8 } : {};
      if (!pay(s, eventCost)) return fail('资源不足，可以稍后处理或选择离开');
      let message;
      switch (id) {
        case 'vein': { const n = Math.min(2, 200 - s.veins); s.veins += n; message = '引入 ' + n + ' 条龙脉，基础灵气 +' + n * 100; break; }
        case 'herb': grant(s, { fruit: 8, material: 12, sword: 5 }); message = '灵果 +8，辅材 +12，剑魄 +5'; break;
        case 'book': if (s.book === 0) s.book = 1; grant(s, { crystal: 40, sword: 6 }); message = '领悟青岚诀，玄晶 +40，剑魄 +6'; break;
        case 'beast': grant(s, { fruit: 10, jade: 20 }); message = '灵果 +10，灵璧 +20'; break;
        case 'wave': {
          const i = s.stage >= 3 ? 2 : s.stage >= 1 ? 1 : 0;
          const n = Math.max(0, Math.min(30, Math.floor(remaining(s) / REALMS[i].cut)));
          if (s.swordLevel) s.realms[i].sword += n; else s.realms[i].base += n;
          grant(s, { jade: 10, luck: 5 }); message = n + ' 位' + REALMS[i].name + '仙师来归，灵璧 +10，国运 +5'; break;
        }
        case 'chest': grant(s, { jade: 35, fruit: 12, material: 12 }); message = '灵璧 +35，灵果 +12，辅材 +12'; break;
      }
      s.pending = null; s.events++; addLog(s, message, now); return done(message);
    }
    const limits = { vein: 200, comb: 20, beast: 20, book: 6, sword: 10, wall: 20, scan: 4, training: 10 };
    if (!(action in limits)) return fail('未知操作');
    if (action === 'training' && (!REALMS[index] || s.stage < REALMS[index].stage)) return fail('此境界尚未解锁');
    const level = action === 'training' ? s.realms[index].level : action === 'scan' ? s.scan.level : action === 'vein' ? s.veins : action === 'sword' ? s.swordLevel : s[action];
    if (level >= limits[action]) return fail('已达本次 DEMO 上限');
    if (!pay(s, cost(s, action, index))) return fail('材料不足，巡天奇遇与愿景奖励可以补充');
    const names = { vein: '新龙脉纳入山河', comb: '龙脉梳理完成', beast: '白鹿升阶', book: '青岚诀升阶', sword: '剑道精进', wall: '长城祝福提升', scan: '巡天速度提升', training: REALMS[index]?.name + '培养效率提升' };
    if (action === 'training') s.realms[index].level++;
    else if (action === 'scan') s.scan.level++;
    else if (action === 'sword') {
      s.swordLevel++;
      if (s.swordLevel === 1) s.realms.forEach(r => { const n = Math.ceil(r.base * 0.5); r.base -= n; r.sword += n; });
    } else s[action === 'vein' ? 'veins' : action]++;
    addLog(s, names[action], now); return done(names[action]);
  }
  function serialize(s, now = Date.now()) { s.savedAt = now; return JSON.stringify(s); }
  function restore(raw, now = Date.now()) {
    const x = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!x || x.version !== VERSION) throw new Error('存档版本不兼容');
    const finite = (n, max = 1e9) => Number.isFinite(n) && n >= 0 && n <= max;
    const integer = (n, max) => finite(n, max) && Number.isInteger(n);
    if (!integer(x.stage, 5) || !x.wallet || Object.keys(create(now).wallet).some(k => !integer(x.wallet[k], 1e9))) throw new Error('存档资源无效');
    const levels = { veins: 200, comb: 20, wall: 20, beast: 20, book: 6, swordLevel: 10, events: 1e8 };
    if (Object.entries(levels).some(([k, max]) => !integer(x[k], max)) || x.veins < 2) throw new Error('存档等级无效');
    if (!Array.isArray(x.realms) || x.realms.length !== 3 || x.realms.some((r, i) => !r || !integer(r.base, 1e7) || !integer(r.sword, 1e7) || !finite(r.training, 5) || !integer(r.batch, 100) || !integer(r.level, 10) || (x.stage < REALMS[i].stage && (r.base || r.sword || r.training || r.batch)))) throw new Error('存档仙师无效');
    if (!x.scan || typeof x.scan.running !== 'boolean' || !finite(x.scan.progress, 100) || !integer(x.scan.level, 4) || !integer(x.scan.laps, 1e8)) throw new Error('存档巡天无效');
    if (x.pending !== null && !Object.prototype.hasOwnProperty.call(EVENTS, x.pending)) throw new Error('存档奇遇无效');
    if (!Array.isArray(x.claimed) || x.claimed.some(n => !integer(n, QUESTS.length - 1)) || !finite(x.savedAt, 1e15) || !finite(x.created, 1e15) || !integer(x.offline, 300)) throw new Error('存档时间或奖励无效');
    // 白名单重建，导入内容从不作为 HTML。离线只结算玄晶，上限 300。
    const s = create(x.created);
    Object.keys(levels).forEach(k => { s[k] = x[k]; });
    s.stage = x.stage;
    s.wallet = Object.fromEntries(Object.keys(s.wallet).map(k => [k, x.wallet[k]]));
    s.realms = x.realms.map(r => ({ base: r.base, sword: r.sword, training: r.training, batch: r.batch, level: r.level }));
    s.scan = { running: x.scan.running, progress: x.scan.progress, level: x.scan.level, laps: x.scan.laps };
    s.pending = x.pending; s.claimed = [...new Set(x.claimed)];
    s.log = Array.isArray(x.log) ? x.log.filter(e => e && typeof e.text === 'string' && finite(e.at, 1e15)).slice(0, 60).map(e => ({ text: e.text.slice(0, 200), at: e.at })) : [];
    s.offline = Math.min(300, x.offline + Math.floor(Math.max(0, now - x.savedAt) / 20000));
    s.savedAt = now;
    return s;
  }
  return { VERSION, SAVE_KEY, STAGES, REALMS, EVENTS, QUESTS, create, population, power, supply, consume, remaining, scanDuration, batchSize, nextStage, bookPower, realmBase, tick, act, cost, questValue, canPay, serialize, restore };
});
