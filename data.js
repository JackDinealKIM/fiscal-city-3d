/* ══════════════════════════════════════════════════════════════
   재정도시 데이터 — 2026년 대한민국 확정예산(2025.12.2. 국회 의결) 기반
   출처: 기획예산처 「2026년 예산 국회 확정」, 국회예산정책처
        「2026년도 예산안에 대한 국회 심의결과」(나보포커스 제130호)
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const REF_SUM = 514.8; // 아래 7개 분야 확정액 합계(조 원)

  const sectors = [
    {
      id: 'welfare', name: '복지·돌봄', short: '복지', icon: '🤝', color: '#7fd489',
      desc: '기초생활·연금·보육·의료·돌봄',
      realAmount: 269.1, realLabel: '보건·복지·고용 269.1조',
      need: 1.12, weight: { happiness: .30, growth: .02, safety: .04, trust: .10 }
    },
    {
      id: 'edu', name: '교육', short: '교육', icon: '🎓', color: '#74b4f5',
      desc: '학교·평생교육·장학·인재양성',
      realAmount: 99.9, realLabel: '교육 99.9조',
      need: 1.02, weight: { happiness: .18, growth: .14, trust: .10 }
    },
    {
      id: 'safety', name: '안전·재난', short: '안전', icon: '🚒', color: '#9aa7d6',
      desc: '소방·경찰·재난대응·시설안전',
      realAmount: 27.3, realLabel: '공공질서·안전 27.3조',
      need: 1.05, weight: { happiness: .10, safety: .55, growth: .03 }
    },
    {
      id: 'growth', name: '성장·R&D', short: '성장', icon: '🔬', color: '#f5b64a',
      desc: '연구개발·창업·산업·일자리',
      realAmount: 67.3, realLabel: 'R&D 35.5 + 산업·중소·에너지 31.8',
      need: 1.05, weight: { happiness: .10, growth: .50, trust: .05 }
    },
    {
      id: 'soc', name: '교통·SOC', short: 'SOC', icon: '🚉', color: '#b79bf0',
      desc: '도로·철도·대중교통·기반시설',
      realAmount: 27.7, realLabel: 'SOC 27.7조',
      need: 1.05, weight: { happiness: .11, growth: .22, safety: .08 }
    },
    {
      id: 'env', name: '환경', short: '환경', icon: '🌿', color: '#5fd6bb',
      desc: '기후·대기·수질·자원순환',
      realAmount: 13.9, realLabel: '환경 13.9조',
      need: 1.02, weight: { happiness: .09, growth: .06, safety: .04 }
    },
    {
      id: 'culture', name: '문화·관광', short: '문화', icon: '🎡', color: '#ff9bb4',
      desc: '문화예술·체육·관광·여가',
      realAmount: 9.6, realLabel: '문화·체육·관광 9.6조',
      need: 1.00, weight: { happiness: .12, growth: .03 }
    }
  ];
  sectors.forEach((s, i) => {
    s.realShare = +(s.realAmount / REF_SUM * 100).toFixed(1);
    s.angle = -Math.PI / 2 + i * (Math.PI * 2 / sectors.length);
  });

  const meta = {
    totalBudget: 10.0,          // 재정도시 1년 예산(조 원) — 시민 100만 명
    startAmounts: { welfare: 5.2, edu: 1.9, safety: 0.5, growth: 1.3, soc: 0.5, env: 0.3, culture: 0.2 },
    startTax: 1.00,
    startGrant: 1.20,
    startDebt: 3.2,             // 도시 출발 부채(조 원)
    interestRate: 0.042,        // 국채 이자율
    reservePerYear: 0.5,        // 매년 편성되는 예비비(조 원)
    baseTaxRevenue: 8.2,        // 세율 100%일 때 지방세수(조 원)
    otherRevenue: 0.4,          // 세외수입(조 원)
    years: 5,
    refTotal: 514.8,
    national: {
      totalSpend: 727.9, totalIncome: 675.2,
      consolidated: -52.7, managed: -107.8,
      debt: 1413.8, debtRatio: 51.6
    }
  };

  /* ── 돌발 재정 수요 이벤트 ─────────────────────────────── */
  const events = [
    {
      id: 'flood', icon: '🌧️', tag: '재해 · 예비비 · 추경',
      title: '기습 집중호우, 저지대 3개 동 침수',
      body: '밤사이 200mm가 넘는 폭우로 하천이 범람했습니다. 주택 1,200가구가 침수되고 복구에는 최소 0.8조 원이 필요합니다. 예산은 이미 짜여 있습니다.',
      options: [
        { key: 'A', label: '예비비로 즉시 복구', detail: '미리 편성해 둔 예비비 0.8조 원을 투입합니다. 예측할 수 없는 지출에 대비한 제도입니다.', cost: 0.8, useReserve: true, fx: { safety: 12, happiness: 6, trust: 4 } },
        { key: 'B', label: '추가경정예산(추경) 편성', detail: '국회 승인을 거쳐 0.8조 원을 더 씁니다. 빠르지만 국채가 늘어납니다.', cost: 0, debt: 0.8, fx: { safety: 14, happiness: 8, trust: -3 } },
        { key: 'C', label: '민간·자원봉사와 함께 복구', detail: '0.2조 원만 쓰고 기업·시민과 손잡습니다. 재정 부담은 적지만 복구는 느립니다.', cost: 0.2, fx: { safety: 6, happiness: 2, trust: 2 } }
      ],
      lesson: '예비비는 "예측할 수 없는 지출"을 위한 장치입니다. 매년 반복되는 지출에 쓰면 예산 원칙이 무너집니다.'
    },
    {
      id: 'virus', icon: '🦠', tag: '국고보조 · 매칭',
      title: '감염병 확산, 보건소가 멈췄다',
      body: '신종 감염병이 확산되어 보건 인력과 방역 물품에 0.7조 원이 급히 필요합니다. 시 재정만으로는 부담이 큽니다.',
      options: [
        { key: 'A', label: '복지 예산에서 전용', detail: '이미 짜 둔 복지 예산 0.7조 원을 보건으로 돌립니다. 복지 서비스가 줄어듭니다.', cost: 0.7, fromSector: 'welfare', fx: { safety: 9, happiness: -4 } },
        { key: 'B', label: '중앙정부 국고보조 요청', detail: '0.8조 원 국고보조를 받습니다. 대신 복지·교육 배분을 일정 수준 이상 유지해야 합니다.', cost: 0, grant: 0.8, lock: true, fx: { safety: 11, happiness: 2, trust: -2 } },
        { key: 'C', label: '민간 병원과 협력', detail: '0.2조 원으로 민간 병원에 위탁합니다. 대응은 빠르지만 범위가 좁습니다.', cost: 0.2, fx: { safety: 5, happiness: -2 } }
      ],
      lesson: '국고보조금은 매칭 조건이 붙는 경우가 많습니다. 돈은 늘지만 자율성은 줄어듭니다.'
    },
    {
      id: 'youth', icon: '🧑‍💻', tag: '일자리 · 세제',
      title: '청년 고용률 3분기 연속 하락',
      body: '청년 일자리 대책을 요구하는 목소리가 커집니다. 시의회는 다음 회계연도 예산에 반영하라고 압박합니다.',
      options: [
        { key: 'A', label: '청년 일자리 직접 사업 1.0조', detail: '공공 일자리와 인턴십을 직접 만듭니다. 즉시 효과가 크지만 매년 반복되는 지출입니다.', cost: 1.0, fx: { growth: 9, happiness: 5 } },
        { key: 'B', label: '고용주 세액공제 0.5조', detail: '기업이 청년을 채용하면 세금을 깎아 줍니다. 세입이 0.6조 원 줄어듭니다.', cost: 0.5, revenueCut: 0.6, fx: { growth: 6, trust: 2 } },
        { key: 'C', label: '직업훈련 민관 협약 0.3조', detail: '기업·대학과 함께 재교육 과정을 엽니다. 효과는 느리지만 지속됩니다.', cost: 0.3, fx: { growth: 4, happiness: 1 } }
      ],
      lesson: '직접 사업은 성과가 빠르지만 매년 반복되는 경직성 지출이 됩니다. 세액공제는 세입을 먼저 줄입니다.'
    },
    {
      id: 'ai', icon: '🤖', tag: 'R&D · 미래투자',
      title: 'AI 전환, 산업 구조가 바뀐다',
      body: '제조업 현장에 AI가 빠르게 들어오면서 재직자 재교육 수요가 폭증합니다. 지역 기업 40%가 인력난을 호소합니다.',
      options: [
        { key: 'A', label: 'R&D 특별투자 1.2조', detail: 'AI 연구단지와 실증 사업에 집중 투자합니다. 성장 효과가 크지만 회수에 시간이 걸립니다.', cost: 1.2, fx: { growth: 12, happiness: 2 } },
        { key: 'B', label: '재직자 재교육 0.6조', detail: '일하는 사람을 먼저 살립니다. 성장과 행복이 함께 오릅니다.', cost: 0.6, fx: { growth: 7, happiness: 6 } },
        { key: 'C', label: '시장에 맡긴다', detail: '재정을 쓰지 않습니다. 기업이 스스로 적응하도록 둡니다.', cost: 0, fx: { growth: 2, happiness: -5 } }
      ],
      lesson: 'R&D는 성장을 끌어올리는 대표적 미래투자입니다. 2026년 정부 R&D 예산은 35.5조 원으로 전년보다 5.9조 원 늘었습니다.'
    },
    {
      id: 'infra', icon: '🌉', tag: 'SOC · 유지보수',
      title: '노후 교량 3곳, 안전진단 D등급',
      body: '30년 넘은 교량 3곳이 D등급 판정을 받았습니다. 보수하지 않으면 통행을 제한해야 합니다.',
      options: [
        { key: 'A', label: '전면 보수 0.9조', detail: '교량을 새로 고칩니다. 안전과 물류가 함께 좋아집니다.', cost: 0.9, fx: { safety: 9, growth: 4 } },
        { key: 'B', label: '임시 보강 0.3조 + 통행 제한', detail: '급한 곳만 보강하고 일부 차량을 우회시킵니다. 시민 불편이 생깁니다.', cost: 0.3, fx: { safety: 3, happiness: -3, growth: -2 } },
        { key: 'C', label: '민간투자(BTL) 유치', detail: '민간 자본으로 짓고 나중에 나눠 냅니다. 당장 부담은 적지만 부채로 잡힙니다.', cost: 0, debt: .4, fx: { safety: 7, trust: -1 } }
      ],
      lesson: '임대형 민자사업(BTL)은 당장의 지출을 줄이지만, 나중에 갚아야 할 부채로 남습니다.'
    },
    {
      id: 'school', icon: '🏫', tag: '교육 · 인구',
      title: '학생 수 감소, 학교 통폐합 논의',
      body: '인구 감소로 초등학교 5곳이 통폐합 대상에 올랐습니다. 학부모와 지역사회가 반발합니다.',
      options: [
        { key: 'A', label: '작은학교 유지 0.6조', detail: '학급당 인원을 줄여 학교를 지킵니다. 교육 질은 오르지만 단위 비용이 커집니다.', cost: 0.6, fx: { happiness: 6, trust: 3 } },
        { key: 'B', label: '통폐합 + 통학버스 0.2조', detail: '규모를 키우고 통학을 지원합니다. 효율은 좋지만 지역 공동체가 흔들립니다.', cost: 0.2, fx: { growth: 3, happiness: -4 } },
        { key: 'C', label: '마을학교로 전환 0.4조', detail: '빈 교실을 평생교육·돌봄 공간으로 바꿉니다.', cost: 0.4, fx: { happiness: 4, growth: 2 } }
      ],
      lesson: '인구가 줄면 "1인당 교육비"가 올라갑니다. 효율과 형평성 사이의 선택이 재정의 숙제입니다.'
    }
  ];

  /* ── 재정 개념 퀴즈 ───────────────────────────────────── */
  const quizzes = [
    {
      q: '우리나라 국가예산은 원칙적으로 1월 1일부터 12월 31일까지, 1년 단위로 편성됩니다.',
      options: ['O', 'X'], answer: 0,
      explain: '맞습니다. 이것을 "회계연도 원칙"이라고 합니다. 예산은 1년이라는 울타리 안에서 짜이고 집행됩니다.'
    },
    {
      q: '예산이 부족할 때 국회의 승인을 받아 추가로 편성하는 예산은 무엇일까요?',
      options: ['예비비', '추가경정예산(추경)', '기금', '결산'], answer: 1,
      explain: '추가경정예산입니다. 본예산을 짠 뒤 뜻밖의 지출이 생겼을 때 국회 승인을 받아 더 편성합니다.'
    },
    {
      q: '국가채무가 늘어날 때 예산에서 자동으로 함께 늘어나는 지출은?',
      options: ['공무원 인건비', '국채 이자비용', '복지 급여', '연구개발비'], answer: 1,
      explain: '이자비용입니다. 빌린 돈에는 매년 이자가 붙어, 다음 세대의 예산을 먼저 쓰게 됩니다.'
    },
    {
      q: '다음 중 "예비비"의 쓰임으로 가장 알맞은 것은?',
      options: ['매년 반복되는 공무원 월급', '예측할 수 없었던 재해 복구', '국회의원 세비', '법에 정해진 연금 급여'], answer: 1,
      explain: '예비비는 예측할 수 없는 지출에 대비해 미리 편성해 두는 예산입니다. 반복 지출에 쓰면 예산 원칙이 무너집니다.'
    },
    {
      q: '2026년 우리나라 총지출(예산) 규모는 약 얼마일까요?',
      options: ['약 72조 원', '약 728조 원', '약 3,500조 원', '약 1,414조 원'], answer: 1,
      explain: '2026년 확정예산의 총지출은 727.9조 원입니다. 1,414조 원은 국가채무입니다.'
    },
    {
      q: '국가채무 1,413.8조 원은 GDP의 약 몇 %일까요?',
      options: ['11.6%', '31.6%', '51.6%', '91.6%'], answer: 2,
      explain: '2026년 국가채무는 GDP 대비 51.6%로 전망됩니다. 채무의 "크기"보다 "GDP 대비 비율"로 보는 이유입니다.'
    },
    {
      q: '조세부담률은 무엇을 무엇으로 나눈 값일까요?',
      options: ['세금 ÷ GDP', '예산 ÷ GDP', '세금 ÷ 인구', '국채 ÷ GDP'], answer: 0,
      explain: '국민이 낸 세금을 GDP로 나눈 값입니다. 나라살림의 크기를 경제 규모와 비교해 보는 지표입니다.'
    },
    {
      q: '2026년 예산에서 가장 큰 비중을 차지하는 분야는?',
      options: ['국방', '교육', '보건·복지·고용', 'R&D'], answer: 2,
      explain: '보건·복지·고용이 269.1조 원으로 총지출의 약 37%를 차지합니다. 그다음이 일반·지방행정, 교육, 국방 순입니다.'
    }
  ];

  const news = [
    '<b>2026년 확정예산</b> 총지출 727.9조 · 총수입 675.2조 · 관리재정수지 △107.8조',
    '국가채무 <b>1,413.8조 원</b>, GDP 대비 51.6%',
    '보건·복지·고용 <b>269.1조 원</b> — 총지출의 약 37%',
    'R&D <b>35.5조 원</b>, 전년보다 5.9조 원 증가',
    '국방 65.9조 · 교육 99.9조 · SOC 27.7조 · 환경 13.9조',
    '국민이 직접 확인하는 나라살림, <b>열린재정(openfiscaldata.go.kr)</b>',
    '추경은 본예산 이후 불가피한 지출에 대응하는 예산입니다',
    '예비비는 예측할 수 없는 지출을 위한 장치입니다'
  ];

  const guideCards = [
    { h: '당신은 재정도시 시장', p: '인구 100만 명의 도시, 1년 예산 10조 원. 5년 동안 매년 예산을 직접 짭니다.' },
    { h: '숫자는 실제 데이터', p: '분야 비중은 2026년 대한민국 확정예산(총지출 727.9조 원)을 그대로 옮겼습니다.' },
    { h: '배분은 선택', p: '복지를 늘리면 다른 분야가 줄어듭니다. 세율을 올리면 세입은 늘지만 시민 부담도 늘어납니다.' },
    { h: '결산이 남긴다', p: '세출이 세입보다 많으면 국채가 쌓이고 이자 부담이 다음 해 예산을 갉아먹습니다.' }
  ];

  global.GameData = { sectors, meta, events, quizzes, news, guideCards };
})(window);
