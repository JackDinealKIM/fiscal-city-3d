/* ══════════════════════════════════════════════════════════════
   재정도시 — 나라살림 5년
   게임 진행 · 지표 계산 · UI · 모달
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const D = global.GameData;
  const M = D.meta;
  const SECTORS = D.sectors;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.prototype.slice.call(document.querySelectorAll(sel));

  const S = {
    year: 1,
    alloc: Object.assign({}, M.startAmounts),
    tax: M.startTax,
    grant: M.startGrant,
    debt: M.startDebt,
    reserve: M.reservePerYear,
    metrics: { happiness: 62, growth: 52, safety: 58, trust: 56, soundness: 89 },
    quizAsked: 0, quizCorrect: 0,
    history: [],
    matchLock: false,
    usedEvents: [],
    lastGrade: null,
    over: false,
    busy: false,
    modal: null
  };

  let cityReady = false;
  let audio = null, soundOn = true;

  /* ── 숫자 유틸 ────────────────────────────────────────── */
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
  const pct = (v, d) => (v * 100).toFixed(d === undefined ? 0 : d);
  function sumAlloc() {
    return Object.keys(S.alloc).reduce((s, k) => s + S.alloc[k], 0);
  }
  function revenue() {
    return M.baseTaxRevenue * Math.pow(S.tax, 0.6) + S.grant + M.otherRevenue;
  }
  function debtRatio() { return (S.debt / M.totalBudget) * 100; }
  function soundness() { return cl(104 - Math.max(0, debtRatio() - 22) * 1.25, 0, 100); }
  function needOf(id) {
    const s = SECTORS.find(x => x.id === id);
    return (s.realShare / 100) * M.totalBudget;
  }

  /* ── 사운드 ───────────────────────────────────────────── */
  function audioCtx() {
    if (!audio) {
      try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
    }
    return audio;
  }
  function beep(freq, dur, type, vol, delay) {
    if (!soundOn) return;
    const ac = audioCtx(); if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol === undefined ? .12 : vol, t0 + .012);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + (dur || .16));
    osc.connect(g); g.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + (dur || .16) + .02);
  }
  function chord(freqs, step) {
    freqs.forEach((f, i) => beep(f, .3, 'triangle', .09, i * (step || .09)));
  }

  /* ── 토스트 ───────────────────────────────────────────── */
  function toast(msg, kind) {
    const root = $('#toast');
    const el = document.createElement('div');
    el.className = 'toast-item' + (kind ? ' ' + kind : '');
    el.innerHTML = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .4s,transform .4s';
      el.style.opacity = '0'; el.style.transform = 'translateY(-8px)';
      setTimeout(() => el.remove(), 400);
    }, 2600);
  }

  /* ── HUD ──────────────────────────────────────────────── */
  const GAUGES = [
    { key: 'happiness', label: '행복도' },
    { key: 'growth', label: '성장' },
    { key: 'safety', label: '안전' },
    { key: 'trust', label: '신뢰' },
    { key: 'soundness', label: '건전성' }
  ];
  function buildGauges() {
    const root = $('#gauges');
    root.innerHTML = GAUGES.map(g =>
      '<div class="gauge mid" data-g="' + g.key + '"><div class="g-top"><span>' + g.label +
      '</span><b>0</b></div><div class="g-bar"><i></i></div></div>'
    ).join('');
  }
  function renderGauges() {
    GAUGES.forEach(g => {
      const el = document.querySelector('[data-g="' + g.key + '"]');
      if (!el) return;
      const v = g.key === 'soundness' ? soundness() : S.metrics[g.key];
      el.querySelector('b').textContent = Math.round(v);
      el.querySelector('.g-bar i').style.width = cl(v, 0, 100) + '%';
      el.classList.remove('up', 'mid', 'low', 'warn');
      el.classList.add(v >= 66 ? 'up' : v >= 45 ? 'mid' : 'low');
      if (v < 40) el.classList.add('warn');
    });
  }

  /* ── 예산 패널 ────────────────────────────────────────── */
  function buildSectorRows() {
    const root = $('#sectorList');
    root.innerHTML = SECTORS.map(s =>
      '<div class="sector" data-sector="' + s.id + '">' +
      '<div class="sector-top"><i class="dot" style="background:' + s.color + ';color:' + s.color + '"></i>' +
      '<span class="sector-name">' + s.name + '</span>' +
      '<span class="sector-sub" data-sub="' + s.id + '"></span></div>' +
      '<div class="sector-amt"><input type="range" min="1" max="80" step="1" value="' +
      Math.round(S.alloc[s.id] * 10) + '" data-range="' + s.id + '" aria-label="' + s.name + ' 예산">' +
      '<b data-amt="' + s.id + '">0.0<small>조</small></b></div>' +
      '</div>'
    ).join('');

    $$('[data-range]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.getAttribute('data-range');
        S.alloc[id] = parseInt(input.value, 10) / 10;
        updateAllocationUI();
        if (cityReady) global.City.setAllocation(S.alloc, true);
        beep(420 + Math.random() * 60, .04, 'square', .035);
      });
      input.addEventListener('change', () => beep(520, .08, 'sine', .05));
    });
  }

  function updateAllocationUI() {
    const spend = sumAlloc(), rev = revenue();
    SECTORS.forEach(s => {
      const amt = S.alloc[s.id];
      const share = amt / Math.max(.001, spend) * 100;
      const el = document.querySelector('[data-amt="' + s.id + '"]');
      if (el) el.innerHTML = f1(amt) + '<small>조</small>';
      const sub = document.querySelector('[data-sub="' + s.id + '"]');
      if (sub) sub.textContent = '내 ' + share.toFixed(0) + '% · 정부 ' + s.realShare.toFixed(0) + '%';
      const inp = document.querySelector('[data-range="' + s.id + '"]');
      if (inp && parseInt(inp.value, 10) !== Math.round(amt * 10)) inp.value = Math.round(amt * 10);
    });

    $('#revTotal').textContent = f2(rev) + '조';
    $('#spendTotal').textContent = f2(spend) + '조';

    const bal = rev - spend;
    const fill = $('#balanceFill');
    const w = cl(spend / Math.max(rev, .1) * 50, 4, 100);
    fill.style.width = w + '%';
    fill.style.background = bal < -0.001
      ? 'linear-gradient(90deg,#ff9f6a,#ff7070)'
      : 'linear-gradient(90deg,var(--teal),var(--green))';
    const note = $('#balanceNote');
    if (bal < -0.05) {
      note.className = 'money-note deficit';
      note.innerHTML = '세출이 <b>' + f2(-bal) + '조</b> 많습니다 · 국채 발행 → 채무 ' + f2(S.debt + (-bal)) + '조';
    } else if (bal > 0.05) {
      note.className = 'money-note surplus';
      note.innerHTML = '<b>' + f2(bal) + '조</b> 흑자 · 채무를 갚습니다';
    } else {
      note.className = 'money-note';
      note.textContent = '세입과 세출이 균형입니다.';
    }
    $('#taxValue').textContent = Math.round(S.tax * 100) + '%';
    $('#grantValue').textContent = f2(S.grant) + '조';
    $('#panelYear').textContent = (2025 + S.year) + ' 회계연도';
    $('#yearLabel').textContent = (2025 + S.year);
    $('#yearStep').textContent = '회계연도 ' + S.year + ' / 5';
    renderGauges();
    if (cityReady) {
      global.City.setMood(S.metrics.happiness);
      global.City.setDebtRatio(debtRatio());
    }
  }

  /* ── 세율·보조금 ──────────────────────────────────────── */
  function bindLevers() {
    $('#taxRange').addEventListener('input', e => {
      S.tax = parseInt(e.target.value, 10) / 100;
      updateAllocationUI();
      beep(360, .05, 'square', .04);
    });
    $('#grantRange').addEventListener('input', e => {
      S.grant = parseInt(e.target.value, 10) / 10;
      updateAllocationUI();
      beep(300, .05, 'square', .04);
    });
    $('#btnQuick').addEventListener('click', () => {
      let acc = 0;
      SECTORS.forEach((s, i) => {
        if (i === SECTORS.length - 1) {
          S.alloc[s.id] = Math.round((M.totalBudget - acc) * 10) / 10;
        } else {
          S.alloc[s.id] = Math.round(s.realShare / 100 * M.totalBudget * 10) / 10;
          acc += S.alloc[s.id];
        }
      });
      updateAllocationUI();
      if (cityReady) global.City.setAllocation(S.alloc, true);
      toast('2026년 정부 분야 비중으로 채웠습니다. <b>복지 ' + f1(S.alloc.welfare) + '조</b>', 'good');
      beep(560, .12, 'sine', .08);
    });
    $('#btnReset').addEventListener('click', () => {
      S.alloc = Object.assign({}, M.startAmounts);
      S.tax = M.startTax; S.grant = M.startGrant;
      $('#taxRange').value = Math.round(S.tax * 100);
      $('#grantRange').value = Math.round(S.grant * 10);
      updateAllocationUI();
      if (cityReady) global.City.setAllocation(S.alloc, true);
      toast('초기 배분으로 되돌렸습니다');
    });
  }

  /* ── 모달 ─────────────────────────────────────────────── */
  function openModal(html, name) {
    const root = $('#modalRoot');
    root.innerHTML = '<div class="backdrop"></div>' + html;
    root.classList.add('open');
    S.modal = name || 'modal';
    const closes = root.querySelectorAll('[data-close]');
    if (closes.length) closes.forEach(el => el.addEventListener('click', () => {
      closeModal();
      // 모바일에서는 예산 패널을 바로 열어 결산 버튼을 보여준다
      if (window.innerWidth <= 900 && name === 'guide') $('#panel').classList.add('open');
    }));
  }
  function closeModal() {
    const root = $('#modalRoot');
    root.classList.remove('open');
    root.innerHTML = '';
    S.modal = null;
  }

  /* ── 시작 안내 ────────────────────────────────────────── */
  function showGuide(first) {
    openModal(
      '<div class="modal">' +
      '<button class="modal-close" data-close type="button" aria-label="닫기">✕</button>' +
      '<div class="modal-head"><span class="modal-kicker">' + (first ? '재정교육 시뮬레이션' : '도움말') + '</span>' +
      '<h3>당신은 재정도시의 시장입니다</h3>' +
      '<p class="lead">인구 100만 명의 도시, 1년 예산 <b>10조 원</b>. 5년 동안 매년 예산을 직접 짭니다.</p></div>' +
      '<div class="modal-body">' +
      '<div class="guide-grid">' +
      D.guideCards.map(c => '<div class="guide-card"><h4>' + c.h + '</h4><p>' + c.p + '</p></div>').join('') +
      '</div>' +
      '<div class="formula"><b>결산 공식</b> · 세입 = 지방세수(세율) + 국고보조 + 세외수입<br>' +
      '세출 &gt; 세입 이면 → <b>국채</b>가 쌓이고, 다음 해에 <b>이자(4.2%)</b>가 붙습니다.<br>' +
      '5년 뒤 <b>시민 행복도·성장·안전·신뢰·재정건전성</b>으로 도시의 성적이 매겨집니다.</div>' +
      '<p class="lead" style="margin-top:6px">목표: 행복도 70 이상, 건전성 60 이상으로 5년을 마치세요. ' +
      '화면의 3D 도시가 당신의 결정에 바로 반응합니다.</p>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn primary" data-close type="button">시장으로 취임하기</button></div>' +
      '</div>',
      'guide'
    );
    beep(440, .12, 'sine', .08);
  }

  /* ── 결산 ─────────────────────────────────────────────── */
  function settle() {
    if (S.busy || S.over) return;
    S.busy = true;
    closeModal();
    if (window.innerWidth <= 900) $('#panel').classList.remove('open');

    const prev = Object.assign({}, S.metrics);
    prev.soundness = soundness();

    const spend = sumAlloc();
    const rev = revenue();
    const interest = S.debt * M.interestRate;
    const balance = rev - spend - interest;
    let deficit = 0;
    if (balance < 0) { deficit = -balance; S.debt += deficit; }
    else { S.debt = Math.max(0, S.debt - balance); }

    // 매칭 조건 확인
    let matchBreak = false;
    if (S.matchLock) {
      if (S.alloc.welfare < 4.6 || S.alloc.edu < 1.6) {
        matchBreak = true;
        toast('국고보조 매칭 조건을 지키지 못했습니다 · 신뢰 −6', 'bad');
      }
      S.matchLock = false;
    }

    // 지표 계산 — 분야별 '서비스 수준'(q)을 정부 수준=1.0으로 두고 가중 평균
    const q = {};
    SECTORS.forEach(s => {
      q[s.id] = cl(S.alloc[s.id] / Math.max(.15, needOf(s.id)), 0, 1.35);
    });
    const HSW = { welfare: .30, edu: .18, safety: .10, growth: .10, soc: .11, env: .09, culture: .12 };
    const GSW = { growth: .50, soc: .22, edu: .14, env: .06, welfare: .06, culture: .02, safety: 0 };
    const SSW = { safety: .58, soc: .14, env: .10, welfare: .08, edu: .06, growth: .04 };
    const wsum = (w) => Object.keys(w).reduce((a, k) => a + w[k], 0);
    const wavg = (w) => Object.keys(w).reduce((a, k) => a + w[k] * q[k], 0) / wsum(w);
    const taxPenalty = (S.tax - 1);
    const dr = debtRatio();

    let happiness = 71 * wavg(HSW) - taxPenalty * 32 - Math.max(0, dr - 55) * .2;
    let growth = 64 * wavg(GSW) - taxPenalty * 24 + (S.year - 1) * .4;
    let safety = 68 * wavg(SSW);
    let trust = 62 + (S.quizAsked ? (S.quizCorrect / S.quizAsked - .5) * 16 : 0)
      + (balance >= 0 ? 6 : -6) - (matchBreak ? 6 : 0) - Math.max(0, dr - 70) * .25;

    // 이벤트 누적 효과
    happiness += (S.fx.happiness || 0);
    growth += (S.fx.growth || 0);
    safety += (S.fx.safety || 0);
    trust += (S.fx.trust || 0);
    S.fx = { happiness: 0, growth: 0, safety: 0, trust: 0 };

    S.metrics.happiness = cl(happiness, 5, 100);
    S.metrics.growth = cl(growth, 5, 100);
    S.metrics.safety = cl(safety, 5, 100);
    S.metrics.trust = cl(trust, 5, 100);
    S.metrics.soundness = soundness();

    const score = composite(S.metrics, soundness());
    const grade = gradeOf(score);
    S.lastGrade = grade;

    S.history.push({
      year: 2025 + S.year,
      metrics: Object.assign({}, S.metrics),
      score, grade,
      spend, rev, debt: S.debt,
      alloc: Object.assign({}, S.alloc),
      tax: S.tax
    });

    renderGauges();
    if (cityReady) {
      global.City.setAllocation(S.alloc, true);
      global.City.setMood(S.metrics.happiness);
      global.City.setDebtRatio(debtRatio());
      global.City.playEffect(deficit > .05 ? 'dust' : 'coins');
      if (S.metrics.happiness >= 70) global.City.playEffect('confetti');
    }
    chord(deficit > .05 ? [330, 294, 262] : [392, 494, 587], .1);
    showSettleModal({ prev, spend, rev, interest, balance, deficit, score, grade });
  }

  function composite(m, snd) {
    return .32 * m.happiness + .22 * m.growth + .16 * m.safety + .12 * m.trust + .18 * snd;
  }
  function gradeOf(score) {
    if (score >= 80) return 'S';
    if (score >= 70) return 'A';
    if (score >= 60) return 'B';
    if (score >= 50) return 'C';
    return 'D';
  }
  function gradeWord(g) {
    return { S: '재정의 달인', A: '균형의 시장', B: '성실한 살림꾼', C: '공부가 더 필요한 시장', D: '위기의 시장' }[g] || '';
  }

  function showSettleModal(o) {
    const deltas = [
      { k: 'happiness', label: '시민 행복도' },
      { k: 'growth', label: '경제 성장' },
      { k: 'safety', label: '안전' },
      { k: 'trust', label: '신뢰' },
      { k: 'soundness', label: '재정건전성' }
    ].map(d => {
      const now = d.k === 'soundness' ? soundness() : S.metrics[d.k];
      const diff = now - o.prev[d.k];
      return '<div class="delta ' + (diff >= 0 ? 'up' : 'down') + '"><span class="dlabel">' + d.label +
        '</span><span class="dv">' + (diff >= 0 ? '+' : '') + Math.round(diff) + ' → ' + Math.round(now) + '</span></div>';
    }).join('');

    const grade = o.grade;
    const newsline = o.balance < -0.05
      ? '<b>' + (2025 + S.year) + '년 결산</b> 세출이 세입보다 ' + f2(-o.balance) + '조 원 많아 국채가 ' +
        f2(S.debt) + '조 원으로 늘었습니다. 이자 부담은 내년 예산에서 먼저 빠져나갑니다.'
      : '<b>' + (2025 + S.year) + '년 결산</b> ' + f2(o.balance) + '조 원 흑자를 냈습니다. 남은 돈으로 채무를 갚아 ' +
        f2(S.debt) + '조 원이 되었습니다.';

    openModal(
      '<div class="modal">' +
      '<div class="modal-head"><span class="modal-kicker">' + (2025 + S.year) + ' 회계연도 결산</span>' +
      '<h3>예산을 집행했습니다</h3></div>' +
      '<div class="modal-body">' +
      '<div class="settle-hero">' +
      '<div class="settle-grade">' + grade + '</div>' +
      '<div><div style="font-size:15px;font-weight:800">' + gradeWord(grade) + ' · ' + Math.round(o.score) + '점</div>' +
      '<div class="settle-nums" style="margin-top:8px">' +
      '<div><span>세입</span><b>' + f2(o.rev) + '조</b></div>' +
      '<div><span>세출</span><b>' + f2(o.spend) + '조</b></div>' +
      '<div><span>이자</span><b>' + f2(o.interest) + '조</b></div>' +
      '<div><span>국채 잔액</span><b>' + f2(S.debt) + '조</b></div>' +
      '</div></div></div>' +
      '<div class="delta-list">' + deltas + '</div>' +
      '<div class="newsline">' + newsline + '</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn primary" id="btnAfterSettle" type="button">계속</button></div>' +
      '</div>',
      'settle'
    );
    $('#btnAfterSettle').addEventListener('click', afterSettle);
  }

  function afterSettle() {
    closeModal();
    S.busy = false;
    const ev = eventForYear(S.year);
    if (ev) showEvent(ev);
    else {
      const q = quizForYear(S.year);
      if (q) showQuiz(q);
      else nextYear();
    }
  }
  function eventForYear(y) {
    if (y !== 2 && y !== 4) return null;
    const pool = D.events.filter(e => S.usedEvents.indexOf(e.id) < 0);
    const ev = pool.length ? pool[Math.floor(Math.random() * pool.length)] : D.events[0];
    if (S.usedEvents.indexOf(ev.id) < 0) S.usedEvents.push(ev.id);
    return ev;
  }
  function pickEvent(id) { return D.events.find(e => e.id === id); }
  function quizForYear(y) {
    if (y === 1) return D.quizzes[4];
    if (y === 3) return D.quizzes[2];
    if (y === 5) return D.quizzes[7];
    return null;
  }

  /* ── 이벤트 ───────────────────────────────────────────── */
  function showEvent(ev) {
    S.busy = true;
    openModal(
      '<div class="modal wide">' +
      '<div class="modal-head"><span class="modal-kicker">돌발 재정 수요 · ' + ev.tag + '</span>' +
      '<h3>' + ev.title + '</h3><p class="lead">' + ev.body + '</p></div>' +
      '<div class="modal-body">' +
      '<div class="options">' + ev.options.map(o =>
        '<button class="option" data-opt="' + o.key + '" type="button">' +
        '<span class="option-key">' + o.key + '</span>' +
        '<span class="option-body"><b>' + o.label + '</b><span>' + o.detail + '</span></span>' +
        '<span class="option-cost">' + (o.cost > 0 ? f1(o.cost) + '조' : (o.debt ? '국채 ' + f1(o.debt) + '조' : '0원')) + '</span>' +
        '</button>'
      ).join('') + '</div>' +
      '<div class="newsline" style="border-left-color:#67a6e8">예비비 잔액 <b>' + f2(S.reserve) +
      '조 원</b> · 선택에 따라 예비비가 먼저 쓰이고, 모자라면 국채로 넘어갑니다.</div>' +
      '</div></div>',
      'event'
    );
    $$('[data-opt]').forEach(btn => {
      btn.addEventListener('click', () => chooseOption(ev, btn.getAttribute('data-opt')));
    });
    beep(220, .35, 'sawtooth', .06);
    global.City && global.City.playEffect('rain');
  }

  function chooseOption(ev, key) {
    const o = ev.options.find(x => x.key === key);
    if (!o) return;
    let paid = 0, borrowed = 0;
    let cost = o.cost || 0;
    if (cost > 0) {
      if (o.useReserve && S.reserve > 0) {
        paid = Math.min(S.reserve, cost);
        S.reserve -= paid;
        cost -= paid;
      }
      if (cost > 0) { borrowed += cost; S.debt += cost; }
    }
    if (o.debt) { borrowed += o.debt; S.debt += o.debt; }
    if (o.revenueCut) { S.debt += o.revenueCut; borrowed += o.revenueCut; }
    if (o.grant) { S.grant = Math.min(2.5, S.grant + o.grant); }
    if (o.fromSector) {
      S.alloc[o.fromSector] = Math.max(.3, S.alloc[o.fromSector] - (o.cost || 0));
    }
    if (o.lock) S.matchLock = true;
    S.fx = S.fx || {};
    Object.keys(o.fx || {}).forEach(k => { S.fx[k] = (S.fx[k] || 0) + o.fx[k] * 0.7; });

    closeModal();
    S.busy = false;
    const q = quizForYear(S.year);
    const msg = [];
    if (paid > 0) msg.push('예비비 ' + f1(paid) + '조 사용');
    if (borrowed > 0) msg.push('국채 ' + f1(borrowed) + '조 증가');
    toast('<b>' + o.label + '</b> · ' + (msg.join(' · ') || '추가 부담 없음'), 'good');
    updateAllocationUI();
    if (cityReady) {
      global.City.setAllocation(S.alloc, true);
      global.City.playEffect(key === 'C' ? 'coins' : 'dust');
    }
    beep(520, .14, 'triangle', .09);
    setTimeout(() => { if (q) showQuiz(q); else nextYear(); }, 620);
  }

  /* ── 퀴즈 ─────────────────────────────────────────────── */
  function showQuiz(q) {
    S.busy = true;
    openModal(
      '<div class="modal thin">' +
      '<div class="modal-head"><span class="modal-kicker">재정 개념 확인</span>' +
      '<h3>한 문제만 더</h3></div>' +
      '<div class="modal-body">' +
      '<p class="quiz-q">' + q.q + '</p>' +
      '<div class="quiz-options">' + q.options.map((o, i) =>
        '<button class="quiz-opt" data-q="' + i + '" type="button">' + o + '</button>'
      ).join('') + '</div>' +
      '<div id="quizExplain" hidden></div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn primary" id="btnQuizNext" type="button" disabled>계속</button></div>' +
      '</div>',
      'quiz'
    );
    let answered = false;
    $$('[data-q]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const i = parseInt(btn.getAttribute('data-q'), 10);
        const ok = i === q.answer;
        S.quizAsked += 1;
        if (ok) S.quizCorrect += 1;
        $$('[data-q]').forEach((b, bi) => {
          if (bi === q.answer) b.classList.add('correct');
          else if (bi === i) b.classList.add('wrong');
        });
        const ex = $('#quizExplain');
        ex.hidden = false;
        ex.className = 'quiz-explain';
        ex.innerHTML = (ok ? '<b>정답입니다.</b> ' : '<b>아쉽습니다.</b> ') + q.explain;
        $('#btnQuizNext').disabled = false;
        beep(ok ? 660 : 240, .2, ok ? 'triangle' : 'sawtooth', .1);
        if (ok) beep(880, .18, 'sine', .08, .1);
      });
    });
    $('#btnQuizNext').addEventListener('click', () => {
      closeModal();
      S.busy = false;
      nextYear();
    });
  }

  /* ── 다음 해 ──────────────────────────────────────────── */
  function nextYear() {
    if (S.over) return;
    if (S.year >= M.years) {
      showResult();
      return;
    }
    S.year += 1;
    S.reserve = M.reservePerYear;
    updateAllocationUI();
    toast('<b>' + (2025 + S.year) + ' 회계연도</b>가 시작되었습니다 · 예산을 다시 짜세요', 'good');
    beep(392, .12, 'sine', .07);
    if (cityReady) global.City.playEffect('coins');
  }

  /* ── 최종 결과 ────────────────────────────────────────── */
  function showResult() {
    S.over = true;
    const last = S.history[S.history.length - 1] || { metrics: S.metrics, score: 50, grade: 'C' };
    const avg = {};
    ['happiness', 'growth', 'safety', 'trust', 'soundness'].forEach(k => {
      avg[k] = S.history.reduce((s, h) => s + h.metrics[k], 0) / Math.max(1, S.history.length);
    });
    const finalScore = .32 * avg.happiness + .22 * avg.growth + .16 * avg.safety + .12 * avg.trust + .18 * avg.soundness;
    const grade = gradeOf(finalScore);

    const compare = SECTORS.map(s => {
      const mine = S.history.reduce((sum, h) => sum + (h.alloc[s.id] || 0), 0) / Math.max(1, S.history.length);
      const myShare = mine / M.totalBudget * 100;
      const diff = myShare - s.realShare;
      return '<div class="compare-row">' +
        '<span class="cname" style="color:' + s.color + '">' + s.name + '</span>' +
        '<span class="compare-track"><i style="width:' + cl(myShare * 1.7, 2, 100) + '%;background:' + s.color + '"></i>' +
        '<u style="left:' + cl(s.realShare * 1.7, 0, 99) + '%"></u></span>' +
        '<span class="cval">내 ' + myShare.toFixed(1) + '% · 정부 ' + s.realShare.toFixed(0) + '%</span>' +
        '<span class="cdiff" style="color:' + (diff >= 0 ? '#9df2c4' : '#ffb0a8') + '">' + (diff >= 0 ? '+' : '') + diff.toFixed(1) + 'p</span>' +
        '</div>';
    }).join('');

    const lessons = [];
    if (S.debt > M.startDebt + .5) lessons.push('<b>국채</b>는 결국 다음 해의 예산을 줄입니다. 5년 동안 채무가 ' + f2(S.debt - M.startDebt) + '조 원 늘었습니다.');
    else if (S.debt < M.startDebt) lessons.push('<b>흑자</b>로 채무를 ' + f2(M.startDebt - S.debt) + '조 원 갚았습니다. 재정건전성이 곧 미래의 선택지입니다.');
    else lessons.push('채무를 안정적으로 관리했습니다.');
    const welfareShare = S.history.reduce((s2, h) => s2 + h.alloc.welfare, 0) / Math.max(1, S.history.length) / M.totalBudget * 100;
    const welfareReal = SECTORS.find(s => s.id === 'welfare').realShare;
    lessons.push('복지·돌봄 배분은 평균 <b>' + welfareShare.toFixed(1) + '%</b>로, 정부 비중(' + welfareReal.toFixed(1) + '%)보다 ' +
      Math.abs(welfareShare - welfareReal).toFixed(1) + 'p ' + (welfareShare >= welfareReal ? '많았습니다' : '적었습니다') + '. 예산은 결국 <b>무엇을 먼저 살릴지</b>의 문제입니다.');
    lessons.push('기억하세요 — 예산은 1년, 기금은 별도, 부족하면 <b>추경</b>, 뜻밖의 지출엔 <b>예비비</b>. 국가채무 1,413.8조 원은 GDP의 51.6%입니다.');

    const share = '[재정도시: 나라살림 5년] ' + grade + '등급 · ' + Math.round(finalScore) + '점\n' +
      '5년 최종 행복도 ' + Math.round(avg.happiness) + ' · 성장 ' + Math.round(avg.growth) +
      ' · 안전 ' + Math.round(avg.safety) + ' · 신뢰 ' + Math.round(avg.trust) +
      ' · 건전성 ' + Math.round(avg.soundness) + '\n국채 ' + f2(S.debt) + '조 (' + Math.round(debtRatio()) + '%)';

    openModal(
      '<div class="modal wide">' +
      '<div class="modal-head"><span class="modal-kicker">5년 임기 종료 · 최종 결산</span>' +
      '<div class="result-top" style="margin-top:12px">' +
      '<div class="result-seal">' + grade + '</div>' +
      '<div><div class="result-headline">' + gradeWord(grade) + '</div>' +
      '<div class="result-sub">재정도시 5년 평균 ' + Math.round(finalScore) + '점 · ' +
      '최종 국채 ' + f2(S.debt) + '조 원 (' + Math.round(debtRatio()) + '%)</div></div></div></div>' +
      '<div class="modal-body">' +
      '<table class="score-table"><thead><tr><th>연도</th><th>배분 총액</th><th class="bar-cell">행복도</th><th class="num">건전성</th><th class="num">등급</th></tr></thead><tbody>' +
      S.history.map(h =>
        '<tr><td>' + h.year + '</td><td>' + f1(h.spend) + '조</td>' +
        '<td><span class="mini-bar"><i style="width:' + h.metrics.happiness + '%"></i></span></td>' +
        '<td class="num">' + Math.round(h.metrics.soundness) + '</td><td class="num">' + h.grade + '</td></tr>'
      ).join('') +
      '</tbody></table>' +
      '<div class="compare"><h4>내 배분 vs 2026년 정부 배분 (5년 평균 · 흰 선이 정부 비중)</h4>' + compare + '</div>' +
      '<div class="lesson">' + lessons.map(l => '<div>💡 ' + l + '</div>').join('') + '</div>' +
      '<div class="share-box" id="shareBox">' + share + '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
      '<button class="btn ghost" id="btnCopy" type="button">결과 복사</button>' +
      '<button class="btn primary" id="btnAgain" type="button">다시 도전</button>' +
      '</div></div>',
      'result'
    );

    if (cityReady) {
      global.City.setMood(avg.happiness);
      global.City.playEffect('fireworks');
      global.City.playEffect('confetti');
    }
    chord([523, 659, 784, 1046], .11);

    const copy = () => {
      const t = $('#shareBox').innerText;
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast('결과를 복사했습니다', 'good'));
      else toast('복사할 수 없습니다. 화면의 텍스트를 선택하세요', 'bad');
    };
    const cb = $('#btnCopy'); if (cb) cb.addEventListener('click', copy);
    const ag = $('#btnAgain'); if (ag) ag.addEventListener('click', () => { closeModal(); resetGame(); });
  }

  function resetGame() {
    S.year = 1;
    S.alloc = Object.assign({}, M.startAmounts);
    S.tax = M.startTax; S.grant = M.startGrant;
    S.debt = M.startDebt; S.reserve = M.reservePerYear;
    S.metrics = { happiness: 62, growth: 52, safety: 58, trust: 56, soundness: 89 };
    S.quizAsked = 0; S.quizCorrect = 0;
    S.history = []; S.fx = { happiness: 0, growth: 0, safety: 0, trust: 0 };
    S.matchLock = false; S.usedEvents = []; S.over = false; S.busy = false;
    $('#taxRange').value = Math.round(S.tax * 100);
    $('#grantRange').value = Math.round(S.grant * 10);
    updateAllocationUI();
    if (cityReady) { global.City.setAllocation(S.alloc, true); global.City.resetView(); }
    showGuide(true);
  }

  /* ── 티커 ─────────────────────────────────────────────── */
  function buildTicker() {
    const track = $('#tickerTrack');
    const line = D.news.map(n => '<span>· ' + n + '</span>').join('');
    track.innerHTML = line + line;
  }

  /* ── 초기화 ───────────────────────────────────────────── */
  function init() {
    S.fx = { happiness: 0, growth: 0, safety: 0, trust: 0 };
    buildGauges();
    buildSectorRows();
    buildTicker();
    bindLevers();
    updateAllocationUI();

    $('#btnSettle').addEventListener('click', settle);
    $('#btnGuide').addEventListener('click', () => showGuide(!S.history.length));
    $('#btnSound').addEventListener('click', () => {
      soundOn = !soundOn;
      $('#btnSound').textContent = soundOn ? '🔊' : '🔇';
      $('#btnSound').setAttribute('aria-pressed', String(soundOn));
      if (soundOn) beep(520, .1, 'sine', .08);
    });
    $('#btnOpenPanel').addEventListener('click', () => $('#panel').classList.toggle('open'));
    $('#btnClosePanel').addEventListener('click', () => $('#panel').classList.remove('open'));
    $('#panelGrip').addEventListener('click', () => $('#panel').classList.toggle('open'));

    // 3D 초기화
    try {
      global.City.init({
        canvas: $('#gl'),
        labelsEl: $('#labels'),
        sectors: SECTORS,
        onPick: (id) => {
          const row = document.querySelector('[data-sector="' + id + '"]');
          if (row) {
            $$('.sector').forEach(r => r.classList.remove('focus'));
            row.classList.add('focus');
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
          if (window.innerWidth <= 900) $('#panel').classList.add('open');
          global.City.focus(id);
          beep(600, .08, 'sine', .06);
        }
      });
      cityReady = true;
      global.City.setAllocation(S.alloc, false);
      global.City.setMood(S.metrics.happiness);
      global.City.setDebtRatio(debtRatio());
    } catch (e) {
      console.error('3D 초기화 실패', e);
      toast('3D 도시를 불러오지 못했습니다. 브라우저를 최신 버전으로 열어 주세요.', 'bad');
    }

    setTimeout(() => {
      const l = $('#loading');
      l.classList.add('hide');
      setTimeout(() => { l.style.display = 'none'; }, 600);
    }, 700);

    setTimeout(() => { if (!S.over) showGuide(true); }, 1100);
  }

  /* ── 디버그·검증 API ──────────────────────────────────── */
  global.FiscalCity = {
    version: '1.0.0',
    state: () => JSON.parse(JSON.stringify({
      year: S.year, alloc: S.alloc, tax: S.tax, grant: S.grant, debt: S.debt,
      reserve: S.reserve, metrics: S.metrics, soundness: soundness(),
      revenue: revenue(), spend: sumAlloc(), history: S.history.length,
      modal: S.modal, quizAsked: S.quizAsked, quizCorrect: S.quizCorrect
    })),
    debug: () => ({
      ready: cityReady,
      modal: S.modal,
      year: S.year,
      revenue: +revenue().toFixed(2),
      spend: +sumAlloc().toFixed(2),
      debt: +S.debt.toFixed(2),
      grade: S.lastGrade,
      city: cityReady ? global.City.debug() : null
    }),
    setAlloc: (obj) => { Object.assign(S.alloc, obj); updateAllocationUI(); if (cityReady) global.City.setAllocation(S.alloc, true); },
    only: (id, amt) => {
      Object.keys(S.alloc).forEach(k => S.alloc[k] = 0.1);
      S.alloc[id] = amt;
      updateAllocationUI(); if (cityReady) global.City.setAllocation(S.alloc, true);
    },
    setTax: (t) => { S.tax = t; $('#taxRange').value = Math.round(t * 100); updateAllocationUI(); },
    setGrant: (g) => { S.grant = g; $('#grantRange').value = Math.round(g * 10); updateAllocationUI(); },
    settle: () => settle(),
    closeModal: () => closeModal(),
    guide: () => showGuide(true),
    afterSettle: () => afterSettle(),
    event: (i) => showEvent(D.events[i || 0]),
    chooseOption: (k) => { const e = D.events[0]; chooseOption(e, k); },
    quiz: (i) => showQuiz(D.quizzes[i || 0]),
    answer: (i) => { const b = document.querySelector('[data-q="' + i + '"]'); if (b) b.click(); },
    next: () => document.getElementById('btnQuizNext') && document.getElementById('btnQuizNext').click(),
    result: () => showResult(),
    reset: () => resetGame(),
    openPanel: (b) => $('#panel').classList.toggle('open', b !== false),
    forceModal: (name) => { if (name === 'event') showEvent(D.events[4]); else if (name === 'quiz') showQuiz(D.quizzes[2]); else if (name === 'result') showResult(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
