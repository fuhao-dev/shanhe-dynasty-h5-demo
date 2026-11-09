(() => {
  'use strict';
  const E = window.Shanhe;
  const $ = id => document.getElementById(id);
  const names = { crystal: '玄晶', jade: '灵璧', luck: '国运', fruit: '灵果', material: '辅材', sword: '剑魄' };
  const chinese = ['壹', '贰', '叁', '肆', '伍', '陆'];
  const titles = { world: '巡天山河', cultivation: '仙师修行', treasures: '万象养成', chronicle: '山河志' };
  const fmt = n => Math.floor(n).toLocaleString('zh-CN');
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const escape = text => String(text).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
  const price = obj => Object.entries(obj).map(([k, n]) => `${n} ${names[k]}`).join(' · ');
  const pct = n => Math.min(100, Math.max(0, n)).toFixed(1) + '%';
  let state, activeView = 'world', dialogType = null, dirty = true, storageAvailable = true, tabPaused = false;
  let lastFocus = 0, lastRender = 0, lastSave = Date.now(), lastTick = performance.now(), hiddenAt = null, lastEvent = null, toastTimer;
  const dialog = $('game-dialog');
  try {
    const raw = localStorage.getItem(E.SAVE_KEY);
    state = raw ? E.restore(raw) : E.create();
  } catch (error) {
    state = E.create();
    setTimeout(() => toast('未能读取旧存档，已创建新试玩；可在“玩法与存档”中导入备份。'), 1000);
  }
  function toast(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2800);
  }
  function save(manual = false) {
    if (tabPaused) return;
    try {
      localStorage.setItem(E.SAVE_KEY, E.serialize(state));
      $('save-status').textContent = '已自动存档'; storageAvailable = true;
      if (manual) toast('当前山河已保存到此浏览器');
    } catch (error) {
      storageAvailable = false; $('save-status').textContent = '存档受限 · 请导出';
      if (manual) toast('浏览器未允许本地存档，请在存档管理中导出 JSON 备份');
    }
    lastSave = Date.now();
  }
  // 尽早保存恢复后的时间，刷新页面不会重复计算同一段离线时间。
  save();
  function switchView(view) {
    if (!(view in titles)) return;
    activeView = view;
    document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + view));
    document.querySelectorAll('.nav-item').forEach(el => {
      const active = el.dataset.view === view; el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
    $('page-title').textContent = titles[view];
    renderDetails();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
  function upgradeButton(action, label, index = 0) {
    const max = action === 'book' ? state.book >= 6 : action === 'scan' ? state.scan.level >= 4 : action === 'vein' ? state.veins >= 200 : action === 'sword' ? state.swordLevel >= 10 : action === 'training' ? state.realms[index].level >= 10 : state[action] >= 20;
    const c = E.cost(state, action, index);
    return `<button class="primary" data-action="${action}" data-index="${index}" ${max || !E.canPay(state, c) ? 'disabled' : ''}>${max ? '已达 DEMO 上限' : label + ' · ' + price(c)}</button>`;
  }
  function render() {
    ['crystal', 'jade', 'luck'].forEach(k => { $('res-' + k).textContent = fmt(state.wallet[k]); });
    const power = E.power(state), next = E.nextStage(state), ratio = next ? power / next.power * 100 : 100;
    $('world-power').textContent = fmt(power);
    $('world-pop').innerHTML = fmt(E.population(state)) + ' <em>位</em>';
    $('world-aura').textContent = fmt(E.remaining(state));
    $('world-aura').classList.toggle('warning', E.remaining(state) < 10);
    $('map-veins').textContent = state.veins;
    $('stage-name').textContent = E.STAGES[state.stage].name;
    $('stage-number').textContent = chinese[state.stage] + ' / 陆';
    $('stage-flavor').textContent = E.STAGES[state.stage].flavor;
    $('next-stage-label').textContent = next ? '下一境 · ' + next.name : '本卷终境 · 山河长在';
    $('stage-percent').textContent = Math.min(100, ratio).toFixed(0) + '%';
    $('stage-fill').style.width = pct(ratio);
    $('stage-power').textContent = next ? `${fmt(power)} / ${fmt(next.power)} 战力` : '已完成本次 DEMO 的王朝成长';
    $('advance-button').disabled = !next || power < next.power;
    $('advance-button').classList.toggle('nudge', Boolean(next && power >= next.power));
    $('scan-button').innerHTML = icon('spark') + (state.scan.running ? '暂歇巡天' : '开启巡天');
    $('scan-label').textContent = state.pending ? '奇遇已至 · 待你抉择' : state.scan.running ? `神游山河 · 第 ${state.scan.laps + 1} 巡` : '山河静候 · 尚未巡天';
    $('scan-percent').textContent = state.pending ? '奇遇' : Math.floor(state.scan.progress) + '%';
    $('scan-fill').style.width = state.pending ? '100%' : pct(state.scan.progress);
    $('world-art').classList.toggle('scanning', state.scan.running && !state.pending);
    $('scan-dot').classList.toggle('on', state.scan.running);
    $('focus-button').disabled = !state.scan.running || Boolean(state.pending);
    $('quick-vein').textContent = `灵气供给 ${fmt(E.supply(state))} · ${state.veins} 条龙脉`;
    const trainingCount = state.realms.filter(r => r.training > 0).length;
    $('quick-cultivation').textContent = trainingCount ? `${trainingCount} 个境界 · 自动培养中` : '灵气渐满 · 扩充龙脉可继续培养';
    $('quick-beast').textContent = `白鹿 ${state.beast} 阶 · 全境界基础战力 +${state.beast * 10}`;
    const encounter = $('encounter-content');
    if (state.pending !== lastEvent || dirty) {
      if (state.pending && !lastEvent && lastEvent !== undefined && activeView !== 'world') toast('巡天有新奇遇，回到“巡天山河”即可处理');
      document.querySelector('.nav-item[data-view="world"]').classList.toggle('has-encounter', Boolean(state.pending));
      const tag = $('encounter-card').querySelector('.small-tag');
      tag.textContent = state.pending ? '已发现' : '待寻'; tag.classList.toggle('found', Boolean(state.pending));
      encounter.innerHTML = state.pending ? `<div class="found-encounter"><h3>${E.EVENTS[state.pending].title}</h3><p>${E.EVENTS[state.pending].type} · 山河正等待你的回应</p><button class="encounter-button" data-action="openEvent">前去一探 ${icon('arrow')}</button></div>` : `<div class="empty-encounter">${icon('mountain')}<p>开启巡天，发现隐于云雾中的龙脉与机缘。</p></div>`;
      lastEvent = state.pending;
    }
    let qi = E.QUESTS.findIndex((_, i) => !state.claimed.includes(i));
    if (qi === -1) $('quest-preview').innerHTML = '<p class="quest-preview-title">六愿皆成，山河可期。</p><div class="quest-preview-line">继续向玉泉漱石迈进</div>';
    else {
      const q = E.QUESTS[qi], value = E.questValue(state, q), ready = value >= q.goal;
      $('quest-preview').innerHTML = `<p class="quest-preview-title">${q.title}</p><div class="quest-preview-line"><span>${Math.min(q.goal, value)} / ${q.goal} · ${q.text}</span><button data-action="claimQuest" data-index="${qi}" ${ready ? '' : 'disabled'}>${ready ? '领取' : '进行中'}</button></div>`;
    }
    if (dirty || performance.now() - lastRender > 900) {
      renderDetails();
      if (dirty && dialog.open && ['vein', 'beast', 'dynasty'].includes(dialogType)) renderDialog();
      dirty = false; lastRender = performance.now();
    }
  }
  function renderDetails() {
    const focused = document.activeElement;
    const keepFocus = focused && focused.closest('.view') && focused.dataset.action ? { action: focused.dataset.action, index: focused.dataset.index } : null;
    if (activeView === 'cultivation') {
      $('aura-banner').innerHTML = `<div><h3>灵气如水，仙师如林</h3><p>${E.remaining(state) < 10 ? '灵气趋于饱和，寻访或梳理龙脉可继续扩张。' : '灵气充盈，仙师正在各自境界中成长。'}</p></div><div class="aura-values"><div><small>灵气供给</small><b>${fmt(E.supply(state))}</b></div><div><small>仙师消耗</small><b>${fmt(E.consume(state))}</b></div><div><small>可用余量</small><b class="${E.remaining(state) < 10 ? 'warning' : ''}">${fmt(E.remaining(state))}</b></div></div>`;
      $('realm-grid').innerHTML = E.REALMS.map((r, i) => {
        const info = state.realms[i], locked = state.stage < r.stage;
        if (locked) return `<article class="realm-card locked"><span class="realm-roman">0${i + 1}</span><h3>${r.name}</h3><p>更高一重天地</p><div class="locked-message">王朝达到「${E.STAGES[r.stage].name}」后解锁</div></article>`;
        const training = info.training > 0;
        return `<article class="realm-card"><span class="realm-roman">0${i + 1}</span><h3>${r.name}</h3><p>每位消耗 ${r.cut} 灵气 · 自动修炼</p><div class="realm-pop">${fmt(info.base + info.sword)}<small>位</small></div><div class="realm-details"><div><span>本体仙师 / 剑修</span><b>${fmt(info.base)} / ${fmt(info.sword)}</b></div><div><span>基础单体战力</span><b>${fmt(E.realmBase(state, i))}</b></div><div><span>每批培养</span><b>${E.batchSize(state, i)} 位 / ${r.seconds} 秒</b></div></div><div class="progress-track"><span style="width:${training ? pct((r.seconds - info.training) / r.seconds * 100) : '0%'}"></span></div><div class="training-status">${training ? `正在修炼 ${info.batch} 位 · ${Math.ceil(info.training)} 秒后入境` : '灵气不足以启动下一批，等待新龙脉'}</div>${upgradeButton('training', '提升培养效率', i)}</article>`;
      }).join('');
    }
    if (activeView === 'treasures') {
      $('material-bar').innerHTML = ['fruit', 'material', 'sword'].map(k => `<span>${names[k]}<b>${fmt(state.wallet[k])}</b></span>`).join('') + `<span>培养材料可通过巡天与愿景获取</span>`;
      const cards = [
        { action: 'beast', name: '白鹿听风', level: state.beast, icon: 'deer', intro: `每阶为全部境界增加 10 基础战力。当前 +${state.beast * 10}。`, label: '喂养灵果', beast: true },
        { action: 'book', name: '青岚诀', level: state.book, icon: 'book', intro: `青岚入卷，惠及众生。当前全境界基础战力 +${E.bookPower(state)}；本 DEMO 消耗玄晶必定升阶。`, label: state.book ? '参悟功法' : '领悟功法' },
        { action: 'sword', name: '太初剑道', level: state.swordLevel, icon: 'sword', intro: `剑修战力额外 +${state.swordLevel * 20} 个百分点。首次开启时半数本体转为剑修，后续新生约六成为剑修。`, label: '投入剑魄' },
        { action: 'comb', name: '龙脉梳理', level: state.comb, icon: 'mountain', intro: `${state.veins} 条龙脉，共供给 ${fmt(E.supply(state))} 灵气。每次梳理为全部龙脉增加 10 个百分点供给。`, label: '梳理龙脉' },
        { action: 'wall', name: '长城祝福', level: state.wall, icon: 'chest', intro: `国运长存。当前剑修群体加成 +${state.wall * 5} 个百分点，与剑道加成相加。`, label: '凝聚国运' },
        { action: 'scan', name: '巡天神念', level: state.scan.level, icon: 'spark', intro: `每巡用时 ${E.scanDuration(state)} 秒，每次精进缩短 1 秒，最低 4 秒。奇遇待处理期间暂停探索。`, label: '精进神念' }
      ];
      $('treasure-grid').innerHTML = cards.map(c => `<article class="treasure-card ${c.beast ? 'beast-treasure' : ''}">${c.beast ? '<img src="assets/spirit-deer.png" alt="玉角白鹿">' : ''}<span class="level">${c.level} 阶</span><div class="big-symbol">${icon(c.icon)}</div><h3>${c.name}</h3><p>${c.intro}</p>${upgradeButton(c.action, c.label)}</article>`).join('');
    }
    if (activeView === 'chronicle') {
      $('milestones').innerHTML = E.STAGES.map((stage, i) => `<div class="milestone ${state.stage >= i ? 'achieved' : ''} ${state.stage === i ? 'current' : ''}"><span>${chinese[i]}</span>${stage.name}</div>`).join('');
      $('quest-list').innerHTML = E.QUESTS.map((q, i) => {
        const claimed = state.claimed.includes(i), value = E.questValue(state, q), ready = value >= q.goal;
        return `<div class="quest-row"><span class="quest-index">0${i + 1}</span><div><h3>${q.title}</h3><p>${q.text} · ${Math.min(value, q.goal)} / ${q.goal}</p><small>${price(q.reward)}</small></div><button data-action="claimQuest" data-index="${i}" ${claimed || !ready ? 'disabled' : ''}>${claimed ? '已领取' : ready ? '领取奖励' : '进行中'}</button></div>`;
      }).join('');
      $('log-list').innerHTML = state.log.length ? state.log.map(e => `<li><time>${new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><span>${escape(e.text)}</span></li>`).join('') : '<li>山河初启，等你落下第一笔。</li>';
    }
    if (keepFocus && !focused.isConnected) {
      const candidates = document.querySelectorAll('.view.active button[data-action]');
      const nextFocus = [...candidates].find(el => el.dataset.action === keepFocus.action && el.dataset.index === keepFocus.index && !el.disabled);
      if (nextFocus) nextFocus.focus({ preventScroll: true });
    }
  }
  function openDialog(type) {
    dialogType = type; renderDialog();
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { dialog.close(); dialogType = null; }
  function renderDialog() {
    const focusedAction = dialog.contains(document.activeElement) ? document.activeElement.dataset.action : null;
    const body = $('dialog-body');
    $('dialog-eyebrow').textContent = dialogType === 'event' && state.pending ? E.EVENTS[state.pending].type : '山河纪 · ' + (dialogType === 'help' ? '试玩说明' : '万象有灵');
    if (dialogType === 'vein') {
      body.innerHTML = `<div class="dialog-art-icon">${icon('mountain')}</div><h2 id="dialog-title">百川归脉</h2><p>龙脉是王朝的灵气源头。灵气余量不足时，仙师会暂停开启下一批修炼。</p><div class="dialog-stats"><div>已纳龙脉<b>${state.veins} 条</b></div><div>梳理增益<b>+${state.comb * 10}%</b></div><div>灵气供给 / 消耗<b>${fmt(E.supply(state))} / ${fmt(E.consume(state))}</b></div></div><div class="dialog-actions stack">${upgradeButton('vein', '寻访一条龙脉')}${upgradeButton('comb', '梳理全部龙脉')}</div><div class="dialog-note">巡天中的龙脉奇遇更为划算：6 灵璧可引入 2 条龙脉。</div>`;
    } else if (dialogType === 'beast') {
      body.innerHTML = `<img class="dialog-deer" src="assets/spirit-deer.png" alt="玉角白鹿"><h2 id="dialog-title">白鹿听风</h2><p>鹿鸣山涧，灵泽众生。每次升阶为三个境界各增加 10 点基础单体战力。</p><div class="dialog-stats"><div>当前阶数<b>${state.beast} 阶</b></div><div>全境界基础战力<b>+${state.beast * 10}</b></div><div>拥有灵果<b>${state.wallet.fruit}</b></div></div><div class="dialog-actions">${upgradeButton('beast', '喂养灵果')}</div>`;
    } else if (dialogType === 'dynasty') {
      const next = E.nextStage(state);
      body.innerHTML = `<div class="dialog-art-icon">${icon('spark')}</div><h2 id="dialog-title">${E.STAGES[state.stage].name}</h2><p>${E.STAGES[state.stage].flavor}</p><div class="dialog-stats"><div>当前总战力<b>${fmt(E.power(state))}</b></div><div>下一王朝<b>${next ? next.name : '已达本卷终境'}</b></div>${next ? `<div>所需战力<b>${fmt(next.power)} · 达成后不扣除</b></div>` : ''}</div><p>${state.stage === 0 ? '首次进阶将解锁「纳灵」境界，获得更高基础战力的仙师。' : state.stage < 3 ? '达到「碧萝生烟」后解锁「练气」境界。' : '培养更高境界仙师，并通过剑道、灵兽与长城共同提升战力。'}</p><div class="dialog-actions"><button class="primary" data-action="advance" ${!next || E.power(state) < next.power ? 'disabled' : ''}>${next ? '王朝进阶' : '山河长在'}</button></div>`;
    } else if (dialogType === 'event') {
      if (!state.pending) { closeDialog(); return; }
      const id = state.pending, event = E.EVENTS[id];
      const labels = { vein: '引脉入境 · 6 灵璧', herb: '收下灵草 · 免费', book: '拓印古卷 · 免费', beast: '接受赠礼 · 免费', wave: '迎接散修 · 8 灵璧', chest: '打开宝匣 · 30 玄晶' };
      const rewards = { vein: '2 条龙脉，基础灵气供给 +200', herb: '灵果 +8 · 辅材 +12 · 剑魄 +5', book: '初次领悟青岚诀 · 玄晶 +40 · 剑魄 +6', beast: '灵果 +10 · 灵璧 +20', wave: '最多 30 位当前最高境界仙师（受灵气限制）· 灵璧 +10 · 国运 +5', chest: '灵璧 +35 · 灵果 +12 · 辅材 +12' };
      body.innerHTML = `<div class="dialog-art-icon">${icon(event.icon)}</div><h2 id="dialog-title">${event.title}</h2><p>${event.text}</p><div class="dialog-stats"><div>${rewards[id]}</div></div><div class="dialog-actions stack"><button class="primary" data-action="event">${labels[id]}</button><button class="quiet-button" data-action="skip">留待有缘 · 获得 10 玄晶</button></div><div class="dialog-note">奇遇等待期间修行照常进行；做出选择后，自动继续巡天。</div>`;
    } else if (dialogType === 'help') {
      body.innerHTML = `<h2 id="dialog-title">执掌你的一方山河</h2><p>这是基于策划文档重制的独立 H5 玩法原型。青绿山河与白鹿美术由 AI 生成。</p><ol class="help-steps"><li><b>开启巡天</b>，处理奇遇，获取龙脉和养成材料。</li><li><b>补足灵气</b>，仙师会自动成批入境。</li><li><b>培养灵兽、剑道与功法</b>，提高群体战力。</li><li><b>手动进阶王朝</b>，解锁纳灵与练气，冲向玉泉漱石。</li></ol><p>DEMO 调整：巡天 4～8 秒一轮，培养 3～5 秒一批；简化为 6 个王朝、3 个境界、1 只灵兽和 1 部功法。数值为试玩节奏重新配平。凝神可加快探索。</p><div class="dialog-stats"><div>存档位置<b>${storageAvailable ? '此浏览器 · 每 5 秒自动保存' : '浏览器限制 · 请手动导出'}</b></div><div>离线收益<b>每 20 秒 1 玄晶，上限 300</b></div></div>${state.offline ? `<button class="primary" style="width:100%" data-action="offline">领取离线巡守 · ${state.offline} 玄晶</button>` : ''}<div class="save-tools"><button class="secondary" data-action="export">导出存档 JSON</button><button class="secondary" data-action="import">导入存档 JSON</button><button class="quiet-button" data-action="save">立即保存</button><button class="danger-button" data-action="resetAsk">重新开局</button></div><div class="dialog-note">独立存档键：shanhe_h5_demo_v1。离线版与在线版、不同浏览器的存档各自独立，可导出互通。刷新或关闭前请确认已保存；清理浏览器数据会移除存档。</div>`;
    } else if (dialogType === 'reset') {
      body.innerHTML = `<h2 id="dialog-title">再起一朝？</h2><p>这会重置此浏览器内的 H5 DEMO 进度。若想保留当前山河，请先导出存档。</p><div class="dialog-actions stack"><button class="secondary" data-action="export">先导出当前存档</button><button class="danger-button" data-action="resetConfirm">确认重新开局</button><button class="quiet-button" data-action="help">返回</button></div>`;
    } else if (dialogType === 'complete') {
      body.innerHTML = `<div class="completion"><div class="completion-icon">${icon('mountain')}</div><span class="eyebrow">THE DYNASTY CONTINUES</span><h2 id="dialog-title" style="margin-top:12px">玉泉漱石 · 一朝初成</h2><p>从一缕清气，到万象归心。<br>你已抵达本次 DEMO 的终境，山河仍可继续生长。</p><div class="dialog-stats"><div>王朝战力<b>${fmt(E.power(state))}</b></div><div>仙师 / 龙脉<b>${fmt(E.population(state))} 位 / ${state.veins} 条</b></div><div>已处理奇遇<b>${state.events} 次</b></div></div><div class="dialog-actions stack"><button class="primary" data-action="export">保存这段山河 · 导出存档</button><button class="quiet-button" data-action="closeDialog">继续经营</button></div></div>`;
    } else if (dialogType === 'conflict') {
      body.innerHTML = `<h2 id="dialog-title">另一处山河已展开</h2><p>另一个标签页更新了此存档。本页暂时停止结算与保存，避免覆盖进度。</p><div class="dialog-actions"><button class="primary" data-action="takeover">载入最新存档，继续此页</button></div>`;
    }
    if (focusedAction) {
      const nextFocus = [...body.querySelectorAll('button[data-action]')].find(el => el.dataset.action === focusedAction && !el.disabled);
      if (nextFocus) nextFocus.focus({ preventScroll: true });
    }
  }
  function exportSave() {
    const blob = new Blob([E.serialize(state)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `山河纪存档-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('存档已导出');
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button, a[data-view]');
    if (!button || button.disabled) return;
    if (button.dataset.view) { event.preventDefault(); switchView(button.dataset.view); return; }
    const action = button.dataset.action;
    if (!action) return;
    if (action === 'closeDialog') { closeDialog(); return; }
    if (action === 'help') { openDialog('help'); return; }
    if (action === 'save') { save(true); return; }
    if (action === 'export') { exportSave(); return; }
    if (action === 'import') { $('import-file').click(); return; }
    if (action === 'resetAsk') { openDialog('reset'); return; }
    if (action === 'resetConfirm') { state = E.create(); tabPaused = false; hiddenAt = null; save(); closeDialog(); switchView('world'); dirty = true; render(); toast('清气初生，新一段山河已开启'); return; }
    if (action === 'takeover') {
      try { state = E.restore(localStorage.getItem(E.SAVE_KEY)); tabPaused = false; lastTick = performance.now(); closeDialog(); save(); dirty = true; render(); toast('已载入最新山河'); }
      catch (error) { toast('最新存档读取失败，可尝试导入备份'); }
      return;
    }
    const opens = { openVein: 'vein', openBeast: 'beast', openDynasty: 'dynasty', openEvent: 'event' };
    if (opens[action]) { openDialog(opens[action]); return; }
    if (tabPaused) { openDialog('conflict'); return; }
    if (action === 'focus') {
      if (performance.now() - lastFocus < 750) return;
      lastFocus = performance.now();
    }
    const result = E.act(state, action, Number(button.dataset.index || 0));
    if (action !== 'focus' || !result.ok) toast(result.message);
    if (result.ok) {
      if (['event', 'skip'].includes(action)) closeDialog();
      if (action === 'advance') { if (state.stage === 5) openDialog('complete'); else if (dialog.open) closeDialog(); }
      if (action === 'offline' && dialogType === 'help') renderDialog();
      dirty = true; render(); if (action !== 'focus') save();
    }
  });
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 100000) throw new Error('存档文件过大');
      const imported = E.restore(await file.text());
      // 先展示确认，避免无意覆盖。导入内容只在内存中等待确认。
      $('dialog-body').innerHTML = `<h2 id="dialog-title">载入这段山河？</h2><p>王朝「${E.STAGES[imported.stage].name}」，战力 ${fmt(E.power(imported))}，仙师 ${fmt(E.population(imported))} 位。确认后会替换当前 H5 DEMO 进度。</p><div class="dialog-actions"><button class="primary" id="confirm-import">确认载入</button><button class="quiet-button" data-action="help">取消</button></div>`;
      dialogType = 'import';
      if (!dialog.open) dialog.showModal();
      $('confirm-import').onclick = () => { state = imported; tabPaused = false; hiddenAt = null; save(); closeDialog(); switchView('world'); dirty = true; render(); toast('存档已载入'); };
    } catch (error) { toast('无法导入：' + error.message); }
    event.target.value = '';
  });
  dialog.addEventListener('close', () => { dialogType = null; });
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog(); } });
  window.addEventListener('pagehide', () => save());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); save(); }
    else {
      if (hiddenAt && !tabPaused) { state.offline = Math.min(300, state.offline + Math.floor((Date.now() - hiddenAt) / 20000)); save(); if (state.offline) toast(`离线巡守已积累 ${state.offline} 玄晶，可在玩法与存档中领取`); }
      hiddenAt = null; lastTick = performance.now();
    }
  });
  window.addEventListener('storage', event => { if (event.key === E.SAVE_KEY && event.newValue) { tabPaused = true; openDialog('conflict'); } });
  function frame(now) {
    const dt = Math.min(0.25, (now - lastTick) / 1000); lastTick = now;
    if (!document.hidden && !tabPaused) E.tick(state, dt);
    if (now - lastRender > 120 || dirty) render();
    if (Date.now() - lastSave >= 5000 && !document.hidden && !tabPaused) save();
    requestAnimationFrame(frame);
  }
  render(); requestAnimationFrame(frame);
  if (state.offline) setTimeout(() => toast(`离线巡守带回 ${state.offline} 玄晶，在“玩法与存档”中领取`), 600);
})();
