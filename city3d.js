/* ══════════════════════════════════════════════════════════════
   재정도시 3D — Three.js 도시 렌더러
   · 7개 분야 지구(district)와 랜드마크, 예산에 따라 자라는 건물
   · 시민·차량·크레인·비·불꽃·시위 등 연출
   · 자체 구현 궤도 카메라(마우스·터치·휠)
   ══════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  const THREE = global.THREE;
  const City = {};
  const TAU = Math.PI * 2;

  let renderer, scene, camera, clock, canvasEl, labelsEl = null;
  let sky, sun, hemi, groundMesh, water, cityGroup, ringRoad, radialGroup;
  let raycaster, pointer, domListeners = false;
  let sectors = [], districts = [], towers = [], people = [], cars = [], trees = [];
  let cranes = [], fxGroup, pickPads = [], labels = {};
  let ready = false, webglKind = 'none';
  let mood = 62, debtRatio = 32;
  let allocShare = {};
  let onPick = null;
  let lastInteract = 0;
  let tween = null;
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();

  const cam = {
    theta: -1.02, phi: 0.72, dist: 122,
    tTheta: -1.02, tPhi: 0.72, tDist: 122,
    target: new THREE.Vector3(0, 2, 0),
    tTarget: new THREE.Vector3(0, 2, 0),
    drag: false, moved: 0, lx: 0, ly: 0, pinch: 0, auto: true
  };

  const COL = {
    ground: 0x1d2c33,
    pavement: 0x2a3a42,
    road: 0x111a20,
    water: 0x123a52,
    concrete: 0x9aa7b4,
    glass: 0x2d5f86,
    hill: 0x22372f
  };

  /* ── 텍스처 ───────────────────────────────────────────── */
  function windowTexture() {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#0c1624';
    g.fillRect(0, 0, 128, 256);
    const cols = 6, rows = 12;
    const cw = 128 / cols, rh = 256 / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const r = Math.random();
        let col = '#16283c';
        if (r > 0.52) col = r > 0.86 ? '#ffe3a8' : '#8fc6f0';
        else if (r > 0.42) col = '#22384f';
        g.fillStyle = col;
        g.fillRect(x * cw + 3, y * rh + 4, cw - 6, rh - 9);
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  function roadTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#111a20'; g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(240,230,190,.65)';
    for (let y = 0; y < 256; y += 34) g.fillRect(30, y, 4, 18);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 6);
    return t;
  }

  /* ── 기본 재질 ─────────────────────────────────────────── */
  const MAT = {};
  function buildMaterials() {
    const win = windowTexture();
    MAT.towerMats = [
      new THREE.MeshStandardMaterial({ color: 0xb9c6d4, roughness: .55, metalness: .25, map: win, emissive: 0xffdd99, emissiveMap: win, emissiveIntensity: .55 }),
      new THREE.MeshStandardMaterial({ color: 0x9fb2c6, roughness: .6, metalness: .2, map: win, emissive: 0xffd9a0, emissiveMap: win, emissiveIntensity: .5 }),
      new THREE.MeshStandardMaterial({ color: 0xc8d2dc, roughness: .5, metalness: .35, map: win, emissive: 0xa8d8ff, emissiveMap: win, emissiveIntensity: .6 })
    ];
    MAT.road = new THREE.MeshStandardMaterial({ color: 0x1b262e, roughness: .95, map: roadTexture() });
    MAT.pavement = new THREE.MeshStandardMaterial({ color: 0x33454f, roughness: .9 });
    MAT.concrete = new THREE.MeshStandardMaterial({ color: 0x8d9aa7, roughness: .8 });
    MAT.dark = new THREE.MeshStandardMaterial({ color: 0x2a3742, roughness: .7, metalness: .3 });
    MAT.glass = new THREE.MeshStandardMaterial({ color: 0x4d86b8, roughness: .18, metalness: .7, transparent: true, opacity: .82, emissive: 0x2b6fa8, emissiveIntensity: .35 });
    MAT.trunk = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
    MAT.leafA = new THREE.MeshStandardMaterial({ color: 0x3f8a4a, roughness: .9, flatShading: true });
    MAT.leafB = new THREE.MeshStandardMaterial({ color: 0x59a35b, roughness: .9, flatShading: true });
    MAT.white = new THREE.MeshStandardMaterial({ color: 0xdbe4ee, roughness: .62 });
    MAT.red = new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: .55 });
    MAT.gold = new THREE.MeshStandardMaterial({ color: 0xffc85c, roughness: .35, metalness: .8, emissive: 0x6b4a00, emissiveIntensity: .4 });
    MAT.water = new THREE.MeshStandardMaterial({ color: 0x14415c, roughness: .22, metalness: .5, transparent: true, opacity: .94 });
    MAT.tire = new THREE.MeshStandardMaterial({ color: 0x1a1e23, roughness: .9 });
  }

  /* ── 유틸 ─────────────────────────────────────────────── */
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function cyl(rt, rb, h, seg, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ── 스카이 · 조명 ─────────────────────────────────────── */
  function buildSky() {
    const geo = new THREE.SphereGeometry(320, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x04101f) },
        mid: { value: new THREE.Color(0x123354) },
        bot: { value: new THREE.Color(0x2b4a63) },
        glow: { value: 0.35 }
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float glow; varying vec3 vP;',
        'void main(){',
        '  float h = normalize(vP).y;',
        '  vec3 c = mix(bot, mid, smoothstep(-0.08, 0.28, h));',
        '  c = mix(c, top, smoothstep(0.2, 0.85, h));',
        '  float ang = atan(normalize(vP).z, normalize(vP).x);',
        '  float sunGlow = pow(max(0.0, cos(ang - 2.2)), 8.0) * (1.0 - smoothstep(0.0, 0.5, abs(h))) * glow;',
        '  c += vec3(0.45, 0.26, 0.10) * sunGlow;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'
      ].join('\n')
    });
    sky = new THREE.Mesh(geo, mat);
    scene.add(sky);

    // 별
    const starGeo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * TAU, p = Math.random() * 0.86 + 0.12, r = 290;
      pos.push(Math.cos(a) * Math.cos(p) * r, Math.sin(p) * r, Math.sin(a) * Math.cos(p) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: .75 }));
    scene.add(stars);
  }

  function buildLights() {
    hemi = new THREE.HemisphereLight(0x9fc6f0, 0x2a3630, .95);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffd6a0, 1.35);
    sun.position.set(46, 72, -34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const c = sun.shadow.camera;
    c.left = -85; c.right = 85; c.top = 85; c.bottom = -85; c.near = 10; c.far = 220;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x5c8fd6, .35);
    fill.position.set(-50, 34, 44);
    scene.add(fill);
  }

  /* ── 지형 · 도로 ──────────────────────────────────────── */
  function buildGround() {
    const g = new THREE.Mesh(new THREE.CircleGeometry(96, 64), new THREE.MeshStandardMaterial({ color: COL.ground, roughness: .95 }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.02;
    g.receiveShadow = true;
    scene.add(g);

    // 외곽 녹지 언덕
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + 0.2;
      const r = rnd(78, 92);
      const hill = new THREE.Mesh(new THREE.SphereGeometry(rnd(6, 13), 12, 8, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x24423a : 0x2c4a3c, roughness: 1, flatShading: true }));
      hill.position.set(Math.cos(a) * r, -1.6, Math.sin(a) * r);
      hill.scale.y = .45;
      hill.receiveShadow = true;
      scene.add(hill);
    }

    // 강
    water = new THREE.Mesh(new THREE.PlaneGeometry(190, 22, 1, 1), MAT.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.02, 56);
    scene.add(water);
    for (let i = 0; i < 26; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(rnd(4, 14), .18), new THREE.MeshBasicMaterial({ color: 0x63a9cf, transparent: true, opacity: .35 }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(rnd(-80, 80), .05, rnd(47, 65));
      strip.userData.spark = rnd(.3, 1.4);
      strip.userData.base = strip.position.x;
      water.add(strip);
    }

    // 중앙 광장
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(19, 48), new THREE.MeshStandardMaterial({ color: 0x3b4c55, roughness: .85 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = .03;
    plaza.receiveShadow = true;
    scene.add(plaza);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(7 + i * 4.2, 7.35 + i * 4.2, 48),
        new THREE.MeshBasicMaterial({ color: 0x94a9b8, transparent: true, opacity: .18, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = .06;
      scene.add(ring);
    }

    // 순환도로
    const ringGeo = new THREE.RingGeometry(40, 47, 96, 1);
    ringRoad = new THREE.Mesh(ringGeo, MAT.road);
    ringRoad.rotation.x = -Math.PI / 2;
    ringRoad.position.y = .04;
    ringRoad.receiveShadow = true;
    scene.add(ringRoad);

    // 순환도로 가로등
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + .1;
      const x = Math.cos(a) * 49.6, z = Math.sin(a) * 49.6;
      scene.add(cyl(.08, .1, 4.4, 5, MAT.dark, x, 2.2, z));
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.32, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdda0 }));
      bulb.position.set(x, 4.55, z);
      scene.add(bulb);
    }

    // 방사형 도로
    radialGroup = new THREE.Group();
    scene.add(radialGroup);
    sectors.forEach((s, i) => {
      const a = s.angle;
      const road = new THREE.Mesh(new THREE.PlaneGeometry(7, 34), MAT.road);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = -a + Math.PI / 2;
      road.position.set(Math.cos(a) * 24, .045, Math.sin(a) * 24);
      road.receiveShadow = true;
      radialGroup.add(road);
      // 보도
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 34), MAT.pavement);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = -a + Math.PI / 2;
        walk.position.set(Math.cos(a) * 24 + Math.cos(a + Math.PI / 2) * side * 4.6, .05, Math.sin(a) * 24 + Math.sin(a + Math.PI / 2) * side * 4.6);
        walk.receiveShadow = true;
        radialGroup.add(walk);
      }
    });

    // 다리
    for (const bx of [-26, 26]) {
      const bridge = box(9, 1.2, 24, MAT.concrete, bx, 1.2, 56);
      scene.add(bridge);
      for (const dz of [-8, 0, 8]) {
        scene.add(cyl(1.1, 1.3, 3.2, 8, MAT.dark, bx + (dz === 0 ? 6 : -2), .6, 56 + dz));
      }
      scene.add(box(.4, 3.4, 24, MAT.white, bx - 4.4, 3.2, 56));
    }
  }

  /* ── 시청 ─────────────────────────────────────────────── */
  function buildCityHall() {
    const g = new THREE.Group();
    const base = box(20, 1.1, 15, MAT.concrete, 0, .55, 0);
    g.add(base);
    g.add(box(12, 8, 8.5, MAT.glass, 0, 5.2, 0));
    g.add(box(13, 1, 9.4, MAT.white, 0, 9.6, 0));
    g.add(box(7.4, 6.6, 6, MAT.glass, 0, 13, 0));
    g.add(box(8.4, .9, 6.9, MAT.white, 0, 16.7, 0));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 12, 0, TAU, 0, Math.PI / 2), MAT.gold);
    dome.position.set(0, 17.1, 0);
    dome.castShadow = true;
    g.add(dome);
    g.add(cyl(.12, .12, 6, 6, MAT.white, 0, 23.5, 0));
    const flag = box(2.2, 1.3, .06, new THREE.MeshStandardMaterial({ color: 0xd94f4f, side: THREE.DoubleSide }), 1.2, 25.4, 0);
    g.add(flag);
    // 계단
    for (let i = 0; i < 4; i++) g.add(box(14 - i * 1.4, .28, 1.4, MAT.pavement, 0, .14 + i * .28, 8.4 + (3 - i) * .7));
    // 조명
    for (const sx of [-8.5, 8.5]) g.add(cyl(.16, .16, 6.5, 6, MAT.dark, sx, 3.2, 8));
    g.position.y = .05;
    scene.add(g);

    // 중앙 분수
    const f = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.4, .8, 28), new THREE.MeshStandardMaterial({ color: 0x67737f, roughness: .9 }));
    f.position.set(0, .4, -17);
    f.receiveShadow = true;
    scene.add(f);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(4.4, 28), new THREE.MeshStandardMaterial({ color: 0x1d5170, roughness: .18, metalness: .55 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, .82, -17);
    scene.add(pool);
    const jet = cyl(.1, .34, 2.4, 8, new THREE.MeshStandardMaterial({ color: 0x8fc8e8, transparent: true, opacity: .38, emissive: 0x1e5e88, emissiveIntensity: .45 }), 0, 1.9, -17);
    jet.userData.fountain = true;
    scene.add(jet);
  }

  /* ── 건물 ─────────────────────────────────────────────── */
  function makeTower(w, d, h, matIdx, tint) {
    const mat = MAT.towerMats[matIdx % MAT.towerMats.length].clone();
    if (tint) mat.color = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), .34);
    mat.emissiveIntensity = .75;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const capMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint || '#46586a').multiplyScalar(.62), roughness: .6, metalness: .35 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), capMat);
    cap.scale.set(w * .55, .6, d * .55);
    const g = new THREE.Group();
    g.add(mesh); g.add(cap);
    cap.position.y = h / 2 + .3;
    mesh.position.y = 0;
    // 옥상 디테일 — 안테나 · 설비 박스
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.8, 4), MAT.dark);
    ant.position.set(w * .22, h + 1.4, 0);
    g.add(ant);
    const boxUnit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MAT.concrete);
    boxUnit.scale.set(w * .3, .5, d * .3);
    boxUnit.position.set(-w * .18, h + .55, d * .1);
    g.add(boxUnit);
    g.userData = { body: mesh, cap, h, w, d, ant, boxUnit };
    return g;
  }

  function makeTree(scale) {
    const g = new THREE.Group();
    const tr = cyl(.22 * scale, .3 * scale, 1.4 * scale, 6, MAT.trunk, 0, .7 * scale, 0);
    g.add(tr);
    const leafMat = Math.random() > .5 ? MAT.leafA : MAT.leafB;
    const l1 = new THREE.Mesh(new THREE.ConeGeometry(1.25 * scale, 2.4 * scale, 7), leafMat);
    l1.position.y = 2.1 * scale; l1.castShadow = true;
    const l2 = new THREE.Mesh(new THREE.ConeGeometry(.95 * scale, 1.9 * scale, 7), leafMat);
    l2.position.y = 3.2 * scale; l2.castShadow = true;
    g.add(l1); g.add(l2);
    return g;
  }

  function makePerson(color) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .42, 3, 6), new THREE.MeshStandardMaterial({ color, roughness: .8 }));
    body.position.y = .46;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: .9 }));
    head.position.y = .84;
    g.add(body); g.add(head);
    g.userData.body = body;
    return g;
  }

  function makeCar(color) {
    const g = new THREE.Group();
    const b = box(1.5, .55, 2.8, new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .5 }), 0, .45, 0);
    const roof = box(1.3, .45, 1.5, new THREE.MeshStandardMaterial({ color: 0x22303c, roughness: .2, metalness: .7 }), 0, .85, -.1);
    b.castShadow = false; roof.castShadow = false;
    g.add(b); g.add(roof);
    for (const [sx, sz] of [[-.7, 1], [.7, 1], [-.7, -1], [.7, -1]]) {
      const wheel = cyl(.28, .28, .18, 10, MAT.tire, sx, .28, sz * 1.0);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
    const light = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    light.position.set(0, .45, 1.42); g.add(light);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(.11, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff5b4b }));
    tail.position.set(0, .45, -1.42); g.add(tail);
    return g;
  }

  function makeCrane(color) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .4 });
    g.add(box(.34, 15, .34, m, 0, 7.5, 0));
    const jib = box(13, .28, .28, m, 4.2, 15, 0);
    g.add(jib);
    g.add(box(3.4, .34, .34, m, -1.4, 15, 0));
    g.add(box(.16, 5.5, .16, m, 6.4, 12.4, 0));
    const hook = box(.5, .5, .5, MAT.gold, 6.4, 9.6, 0);
    g.add(hook);
    g.userData.jib = jib; g.userData.hook = hook;
    return g;
  }

  /* ── 지구(분야) 건설 ──────────────────────────────────── */
  const LANDMARKS = {
    welfare: (g, c) => {
      const b = box(6.4, 4.2, 5, MAT.white, 0, 2.1, 0);
      g.add(b);
      g.add(box(6.8, .5, 5.4, MAT.concrete, 0, 4.4, 0));
      // 적십자
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xe0534f, roughness: .5 });
      g.add(box(.9, 2.4, .14, crossMat, 0, 6.4, 0));
      g.add(box(2.4, .9, .14, crossMat, 0, 6.4, 0));
      // 구급차
      const amb = box(1.5, 1.3, 3, new THREE.MeshStandardMaterial({ color: 0xf4f6f8 }), 4.6, .9, 2.6);
      g.add(amb);
      g.add(box(.9, .5, .06, crossMat, 4.6, 1.35, 4.12));
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x67a6e8 }));
      beacon.position.set(4.6, 1.7, 2.6); g.add(beacon); g.userData.beacon = beacon;
    },
    edu: (g, c) => {
      g.add(box(8.6, 3.4, 4.6, new THREE.MeshStandardMaterial({ color: 0xd8c9a6, roughness: .85 }), 0, 1.7, 0));
      g.add(box(9, .4, 5, MAT.concrete, 0, 3.5, 0));
      for (let i = 0; i < 4; i++) g.add(box(1.3, 1.2, .12, new THREE.MeshBasicMaterial({ color: 0x9fd0ff }), -3 + i * 2, 1.9, 2.32));
      g.add(cyl(.08, .08, 6, 6, MAT.white, 4.2, 3, -1));
      const fl = box(1.3, .8, .05, new THREE.MeshStandardMaterial({ color: 0x67a6e8, side: THREE.DoubleSide }), 4.85, 5.4, -1);
      g.add(fl);
      // 학교 운동장
      const field = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), new THREE.MeshStandardMaterial({ color: 0x3d7a4b, roughness: 1 }));
      field.rotation.x = -Math.PI / 2; field.position.set(0, .07, 4.4);
      g.add(field);
    },
    safety: (g, c) => {
      g.add(box(5.6, 3.6, 4.4, new THREE.MeshStandardMaterial({ color: 0xb5524f, roughness: .75 }), 0, 1.8, 0));
      g.add(box(6, .4, 4.8, MAT.concrete, 0, 3.8, 0));
      for (let i = 0; i < 3; i++) g.add(box(1.5, 1.4, .12, new THREE.MeshStandardMaterial({ color: 0x2b3238 }), -1.8 + i * 1.8, 1.7, 2.24));
      // 소방 훈련탑
      g.add(cyl(.9, 1.1, 5.5, 8, MAT.concrete, 4.4, 2.75, -1));
      const light = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5b4b }));
      light.position.set(4.4, 5.8, -1); g.add(light); g.userData.beacon = light;
      // 소방차
      const truck = box(1.7, 1.5, 3.4, new THREE.MeshStandardMaterial({ color: 0xd94f4f, roughness: .5 }), -4.6, 1, 2.8);
      g.add(truck);
      g.add(box(.5, .3, .1, new THREE.MeshBasicMaterial({ color: 0x9fd0ff }), -4.6, 1.45, 4.5));
    },
    growth: (g, c) => {
      g.add(box(5, 9.5, 5, MAT.glass, 0, 4.75, 0));
      g.add(box(5.6, .5, 5.6, MAT.white, 0, 9.75, 0));
      g.add(cyl(.1, .1, 4.4, 6, MAT.white, 0, 12, 0));
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8, 0, TAU, 0, Math.PI / 2.4), MAT.white);
      dish.position.set(0, 14.2, 0); dish.rotation.x = -0.7; g.add(dish);
      // 태양광 패널
      for (let i = 0; i < 4; i++) {
        const p = box(2.2, .1, 1.4, new THREE.MeshStandardMaterial({ color: 0x1d3f66, metalness: .8, roughness: .25 }), -5.5 + i * 2.4, 1.2, 4.6);
        p.rotation.x = -.35; g.add(p);
        g.add(cyl(.06, .06, 1.2, 4, MAT.dark, -5.5 + i * 2.4, .6, 4.9));
      }
    },
    soc: (g, c) => {
      // 역
      g.add(box(9, 2.8, 4.4, new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: .7 }), 0, 1.4, 0));
      const roof = cyl(2.6, 2.6, 9, 14, new THREE.MeshStandardMaterial({ color: 0x8fa3b5, roughness: .4, metalness: .6 }), 0, 3.4, 0);
      roof.rotation.z = Math.PI / 2; roof.scale.set(.62, 1, 1);
      g.add(roof);
      for (const sx of [-3, 0, 3]) g.add(box(.3, 2.6, .3, MAT.white, sx, 1.3, 2.4));
      // 선로
      for (const dz of [-4.4, 4.4]) {
        g.add(box(15, .12, .3, MAT.dark, 0, .18, dz));
      }
      const train = box(2, 1.4, 1.8, new THREE.MeshStandardMaterial({ color: 0x67a6e8, roughness: .4, metalness: .5 }), -5, .95, -4.4);
      g.add(train);
    },
    env: (g, c) => {
      // 온실
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 16, 10, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x7ee0c0, transparent: true, opacity: .38, roughness: .1, metalness: .2 }));
      dome.position.set(-1, .1, 0); g.add(dome);
      g.add(cyl(3.6, 3.6, .5, 16, MAT.concrete, -1, .25, 0));
      // 풍력
      g.add(cyl(.22, .34, 9, 8, MAT.white, 4.6, 4.5, 0));
      const hub = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const blade = box(.28, 5.2, .12, MAT.white, 0, 2.6, 0);
        blade.rotation.z = (i / 3) * TAU;
        hub.add(blade);
      }
      hub.position.set(4.6, 9.2, 0);
      g.add(hub);
      g.userData.turbine = hub;
      // 나무숲
      for (let i = 0; i < 3; i++) {
        const t = makeTree(rnd(.9, 1.3));
        t.position.set(rnd(-5, -2), 0, rnd(3, 5));
        g.add(t);
      }
    },
    culture: (g, c) => {
      // 공연장 돔
      g.add(box(6.4, 2.4, 6.4, MAT.white, -1.4, 1.2, 0));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.3, 18, 10, 0, TAU, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xffc85c, roughness: .35, metalness: .55, emissive: 0x6b4600, emissiveIntensity: .35 }));
      dome.position.set(-1.4, 2.4, 0); g.add(dome);
      // 관람차
      const wheel = new THREE.Group();
      const rim = new THREE.Mesh(new THREE.TorusGeometry(3.1, .12, 8, 30), new THREE.MeshStandardMaterial({ color: 0xff8fb1, metalness: .5, roughness: .4 }));
      wheel.add(rim);
      for (let i = 0; i < 8; i++) {
        const spoke = box(.08, 6.2, .08, MAT.white, 0, 0, 0);
        spoke.rotation.z = (i / 8) * Math.PI;
        wheel.add(spoke);
        const cab = box(.6, .5, .5, new THREE.MeshStandardMaterial({ color: i % 2 ? 0x67a6e8 : 0xffc85c }), Math.cos(i / 8 * TAU) * 3.1, Math.sin(i / 8 * TAU) * 3.1, 0);
        wheel.add(cab);
      }
      wheel.position.set(4.4, 3.6, 1);
      g.add(wheel);
      g.userData.wheel = wheel;
      g.add(cyl(.18, .24, 3.6, 6, MAT.white, 4.4, 1.8, 1));
    }
  };

  function buildDistrict(s, idx) {
    const a = s.angle;
    const cx = Math.cos(a) * 34, cz = Math.sin(a) * 34;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = -a + Math.PI / 2;
    scene.add(g);

    // 지구 바닥
    const pad = box(23, .3, 20, new THREE.MeshStandardMaterial({
      color: new THREE.Color(s.color).lerp(new THREE.Color(0x25333c), .84), roughness: .92
    }), 0, .15, 0);
    g.add(pad);
    pad.userData.sector = s.id;
    pad.userData.isPad = true;
    pickPads.push(pad);

    // 색 띠 (분야 색)
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(21, .9),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: .55 }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, .31, 9);
    g.add(stripe);

    // 랜드마크
    const lm = new THREE.Group();
    LANDMARKS[s.id](lm, s.color);
    lm.position.set(0, .3, -4.2);
    g.add(lm);

    // 타워 6개
    const spots = [[-8.4, 4.6], [-3.4, 5.4], [1.8, 5.2], [6.8, 4.9], [-8.2, -0.2], [7.6, -1.2]];
    const district = { sector: s, group: g, towers: [], cx, cz, angle: a, landmark: lm, stripe };
    spots.forEach((sp, i) => {
      const w = rnd(2.1, 3.3), d = rnd(2.1, 3.0);
      const t = makeTower(w, d, 2.4, idx + i, s.color);
      t.position.set(sp[0], .3, sp[1]);
      g.add(t);
      const rec = { group: t, level: 1, target: 1, sector: s.id, w, d };
      towers.push(rec);
      district.towers.push(rec);
    });

    // 나무·가로등
    for (let i = 0; i < 4; i++) {
      const tree = makeTree(rnd(.85, 1.25));
      tree.position.set(rnd(-9.5, 9.5), .3, rnd(-8, -6.5));
      g.add(tree); trees.push(tree);
    }
    const lamp = cyl(.12, .12, 4.2, 6, MAT.dark, -10, 2.1, 8.4);
    g.add(lamp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    bulb.position.set(-10, 4.3, 8.4);
    g.add(bulb);

    districts.push(district);
    return district;
  }

  /* ── 사람 · 차 ────────────────────────────────────────── */
  function spawnPeople() {
    people = [];
    const colors = [0x67a6e8, 0x4fd9c4, 0xffc85c, 0xff8fb1, 0xa8b8d8, 0x9be08a];
    districts.forEach((d, di) => {
      for (let i = 0; i < 7; i++) {
        const p = makePerson(colors[(di + i) % colors.length]);
        const px = d.cx + rnd(-9, 9), pz = d.cz + rnd(-8, 8);
        p.position.set(px, .3, pz);
        p.userData = {
          ...p.userData,
          home: new THREE.Vector2(d.cx, d.cz),
          phase: Math.random() * TAU,
          speed: rnd(.35, .8),
          radius: rnd(2.5, 8.5),
          sector: d.sector.id,
          angry: false
        };
        p.rotation.y = Math.random() * TAU;
        scene.add(p);
        people.push(p);
      }
    });
  }

  function spawnCars() {
    cars = [];
    const colors = [0xe8ecf2, 0x2f3a46, 0x67a6e8, 0xc94f4f, 0xffc85c, 0x4fd9c4];
    for (let i = 0; i < 12; i++) {
      const c = makeCar(colors[i % colors.length]);
      c.userData = { t: (i / 12) * TAU, speed: rnd(.055, .11) * (i % 2 ? 1 : -1), lane: i % 2 ? 41.5 : 45.5 };
      scene.add(c);
      cars.push(c);
    }
  }

  /* ── 이펙트 ───────────────────────────────────────────── */
  const FX = [];
  function addFx(obj, life, fn) { obj.userData.life = life; obj.userData.maxLife = life; obj.userData.fn = fn; fxGroup.add(obj); FX.push(obj); }
  function burstCoins() {
    for (let i = 0; i < 26; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .1, 10), MAT.gold);
      coin.rotation.x = Math.PI / 2;
      const a = Math.random() * TAU;
      coin.position.set(0, 12 + Math.random() * 4, -18);
      coin.userData.v = new THREE.Vector3(Math.cos(a) * rnd(1, 4), rnd(3, 7), Math.sin(a) * rnd(1, 4));
      addFx(coin, 2.6, (o, dt, t) => {
        o.userData.v.y -= 9 * dt;
        o.position.addScaledVector(o.userData.v, dt);
        o.rotation.z += dt * 8;
        o.scale.setScalar(1 - t * .7);
      });
    }
  }
  function burstConfetti() {
    const cols = [0xffc85c, 0x4fd9c4, 0xff8fb1, 0x67a6e8, 0x9be08a];
    for (let i = 0; i < 90; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(.35, .6), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      p.position.set(rnd(-16, 16), rnd(16, 30), rnd(-16, 10));
      p.userData.v = new THREE.Vector3(rnd(-1.4, 1.4), rnd(-1.5, -.4), rnd(-1.4, 1.4));
      addFx(p, 3.8, (o, dt, t) => {
        o.position.addScaledVector(o.userData.v, dt);
        o.userData.v.y -= 1.6 * dt;
        o.rotation.x += dt * 3; o.rotation.y += dt * 2;
        o.material.opacity = 1 - t * t;
        o.material.transparent = true;
      });
    }
  }
  function dust(px, pz, n) {
    for (let i = 0; i < (n || 18); i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(rnd(.3, .8), 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xb9c2cc, transparent: true, opacity: .55 }));
      p.position.set(px + rnd(-2, 2), rnd(0, 2), pz + rnd(-2, 2));
      p.userData.v = new THREE.Vector3(rnd(-1, 1), rnd(.6, 2.2), rnd(-1, 1));
      addFx(p, 1.6, (o, dt, t) => {
        o.position.addScaledVector(o.userData.v, dt);
        o.scale.setScalar(1 + t * 1.8);
        o.material.opacity = .55 * (1 - t);
      });
    }
  }
  function raiseCrane(px, pz, color) {
    const c = makeCrane(color);
    c.position.set(px, 0, pz);
    c.scale.setScalar(1.25);
    scene.add(c);
    cranes.push(c);
    setTimeout(() => {
      let t0 = performance.now();
      const tick = () => {
        const k = (performance.now() - t0) / 900;
        c.position.y = -6 * Math.max(0, 1 - k);
        c.rotation.y += .04;
        if (k < 1) requestAnimationFrame(tick);
        else {
          c.position.y = 0;
          setTimeout(() => {
            scene.remove(c);
            cranes = cranes.filter(x => x !== c);
          }, 3600);
        }
      };
      tick();
    }, 260);
  }
  function rainFx(seconds) {
    const count = 700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rnd(-70, 70); pos[i * 3 + 1] = rnd(0, 60); pos[i * 3 + 2] = rnd(-70, 70);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9ec8ff, size: .5, transparent: true, opacity: .55 });
    const pts = new THREE.Points(geo, mat);
    scene.add(pts);
    const speeds = new Float32Array(count).map(() => rnd(28, 46));
    let tAcc = 0;
    const obj = { pts, speeds, ttl: seconds };
    rainSystems.push(obj);
  }
  const rainSystems = [];
  function fireworks() {
    const cols = [0xffc85c, 0xff8fb1, 0x4fd9c4, 0x67a6e8, 0xffffff];
    for (let k = 0; k < 3; k++) {
      const px = rnd(-24, 24), pz = rnd(-24, 20);
      setTimeout(() => {
        for (let i = 0; i < 46; i++) {
          const a = Math.random() * TAU, b = Math.random() * Math.PI;
          const p = new THREE.Mesh(new THREE.SphereGeometry(.16, 5, 4), new THREE.MeshBasicMaterial({ color: cols[k % cols.length] }));
          p.position.set(px, 30, pz);
          const sp = rnd(6, 13);
          p.userData.v = new THREE.Vector3(Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp);
          addFx(p, 2.2, (o, dt, t) => {
            o.userData.v.multiplyScalar(1 - 1.9 * dt);
            o.userData.v.y -= 4 * dt;
            o.position.addScaledVector(o.userData.v, dt);
            o.material.opacity = 1 - t;
            o.material.transparent = true;
          });
        }
      }, k * 420);
    }
  }
  const pickets = [];
  function protest(on) {
    if (!on) {
      pickets.forEach(p => scene.remove(p.group));
      pickets.length = 0;
      return;
    }
    if (pickets.length) return;
    const cols = [0xff5b4b, 0xffc85c, 0xff8fb1];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const person = makePerson(cols[i % cols.length]);
      g.add(person);
      const sign = box(.9, .66, .06, new THREE.MeshStandardMaterial({ color: 0xff5b4b, side: THREE.DoubleSide }), 0, 1.5, .12);
      const stick = box(.05, 1, .05, MAT.dark, 0, 1.05, .12);
      g.add(sign); g.add(stick);
      const a = (i / 14) * TAU;
      g.position.set(Math.cos(a) * 19, .3, -17 + Math.sin(a) * 11);
      g.userData.phase = Math.random() * TAU;
      scene.add(g);
      pickets.push({ group: g });
    }
  }

  /* ── 라벨 ─────────────────────────────────────────────── */
  function buildLabels() {
    if (!labelsEl) return;
    sectors.forEach(s => {
      const el = document.createElement('div');
      el.className = 'tag3d';
      el.innerHTML = '<span class="tag-pill" style="color:' + s.color + '">' + s.name + '</span><span class="tag-amt">0.0조</span>';
      el.style.opacity = '0';
      el.dataset.sector = s.id;
      labelsEl.appendChild(el);
      labels[s.id] = { el, amt: el.querySelector('.tag-amt'), sector: s };
    });
  }

  /* ── 카메라 ───────────────────────────────────────────── */
  function updateCamera(dt) {
    if (cam.auto && performance.now() - lastInteract > 14000 && !tween) cam.tTheta += dt * 0.045;
    cam.theta += (cam.tTheta - cam.theta) * Math.min(1, dt * 4.5);
    cam.phi += (cam.tPhi - cam.phi) * Math.min(1, dt * 4.5);
    cam.dist += (cam.tDist - cam.dist) * Math.min(1, dt * 3.5);
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.dur);
      const e = ease(k);
      cam.tTarget.lerpVectors(tween.from, tween.to, e);
      if (k >= 1) tween = null;
    }
    cam.target.lerp(cam.tTarget, Math.min(1, dt * 5));
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    camera.position.set(
      cam.target.x + Math.sin(cam.theta) * sp * cam.dist,
      cam.target.y + cp * cam.dist,
      cam.target.z + Math.cos(cam.theta) * sp * cam.dist
    );
    camera.lookAt(cam.target);
    if (sky) sky.position.copy(camera.position);
  }

  function bindControls() {
    if (domListeners) return;
    domListeners = true;
    const el = canvasEl;
    const pts = new Map();

    el.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cam.drag = true; cam.moved = 0; cam.lx = e.clientX; cam.ly = e.clientY;
      lastInteract = performance.now();
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!cam.drag) return;
      const dx = e.clientX - cam.lx, dy = e.clientY - cam.ly;
      cam.lx = e.clientX; cam.ly = e.clientY;
      cam.moved += Math.abs(dx) + Math.abs(dy);
      cam.tTheta -= dx * 0.005;
      cam.tPhi = Math.max(0.35, Math.min(1.32, cam.tPhi - dy * 0.004));
      lastInteract = performance.now();
    });
    const up = e => {
      const moved = cam.moved;
      cam.drag = false;
      if (moved < 7 && e) pickAt(e.clientX, e.clientY);
      pts.delete(e ? e.pointerId : 0);
      lastInteract = performance.now();
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { cam.drag = false; });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      cam.tDist = Math.max(46, Math.min(150, cam.tDist + e.deltaY * 0.06));
      lastInteract = performance.now();
    }, { passive: false });

    // 터치 핀치
    el.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (cam.pinch) cam.tDist = Math.max(46, Math.min(150, cam.tDist + (cam.pinch - d) * 0.22));
        cam.pinch = d;
        lastInteract = performance.now();
      }
    }, { passive: true });
    el.addEventListener('touchend', () => { cam.pinch = 0; });
  }

  function pickAt(clientX, clientY) {
    if (!raycaster || !onPick) return;
    const r = canvasEl.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickPads, false);
    if (hits.length) onPick(hits[0].object.userData.sector);
  }

  /* ── 건물 높이 갱신 ──────────────────────────────────── */
  function levelFor(id, amount) {
    const s = sectors.find(x => x.id === id);
    const ref = (s.realShare / 100) * 10.0;
    const ratio = amount / Math.max(.15, ref);
    return Math.max(0, Math.min(5, ratio * 2.6));
  }

  function applyAllocation(alloc, animate) {
    allocShare = alloc;
    let total = 0;
    Object.keys(alloc).forEach(k => total += alloc[k]);
    districts.forEach((d, di) => {
      const id = d.sector.id;
      const amt = alloc[id] || 0;
      const lvl = levelFor(id, amt);
      d.towers.forEach((tw, i) => {
        const jitter = [1.0, .84, 1.12, .92, .76, 1.06][i % 6];
        const target = Math.max(.15, lvl * jitter);
        if (animate && Math.abs(target - tw.level) > .08) {
          tw.start = tw.level; tw.target = target; tw.t0 = performance.now();
          tw.dur = 900 + Math.random() * 500;
          if (target > tw.level && !tw.craneDone) {
            tw.craneDone = true;
            raiseCrane(d.cx + (tw.group.position.x), d.cz + (tw.group.position.z), d.sector.color);
            dust(d.cx + tw.group.position.x, d.cz + tw.group.position.z, 12);
          }
        } else {
          tw.level = target; tw.target = target;
        }
      });
      // 라벨 금액
      if (labels[id]) labels[id].amt.textContent = amt.toFixed(1) + '조';
    });
  }

  function updateTowers() {
    towers.forEach(tw => {
      if (tw.target !== undefined && tw.t0) {
        const k = Math.min(1, (performance.now() - tw.t0) / tw.dur);
        tw.level = tw.start + (tw.target - tw.start) * ease(k);
        if (k >= 1) { tw.t0 = 0; tw.start = tw.target; }
      }
      const h = 1.6 + tw.level * 1.55;
      const body = tw.group.userData.body;
      const cap = tw.group.userData.cap;
      body.scale.set(tw.w, h, tw.d);
      body.position.y = h / 2 + .3;
      cap.position.y = h + .55;
      cap.scale.set(tw.w * .55, .5, tw.d * .55);
      if (tw.group.userData.ant) tw.group.userData.ant.position.y = h + 1.6;
      if (tw.group.userData.boxUnit) tw.group.userData.boxUnit.position.y = h + .7;
    });
  }

  function updatePeople(dt, t) {
    const happy = mood / 100;
    people.forEach((p, i) => {
      const u = p.userData;
      u.phase += dt * u.speed;
      const r = u.radius;
      p.position.x = u.home.x + Math.cos(u.phase) * r;
      p.position.z = u.home.y + Math.sin(u.phase * .8) * r;
      p.position.y = .3 + Math.abs(Math.sin(t * 4 + i)) * .06;
      p.rotation.y = -u.phase + Math.PI / 2;
      const bodyMat = p.userData.body.material;
      if (bodyMat.userData.target === undefined) bodyMat.userData.target = 1;
      // 행복도 낮을 때 색·속도 변화
      const target = happy > .62 ? 1 : happy > .45 ? .75 : .5;
      u.speed = u.speed + (target * .55 - u.speed) * dt * .5;
    });
  }

  function updateCars(dt) {
    cars.forEach(c => {
      c.userData.t += c.userData.speed * dt;
      const a = c.userData.t;
      const r = c.userData.lane;
      c.position.set(Math.cos(a) * r, .06, Math.sin(a) * r);
      c.rotation.y = -a + (c.userData.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    });
  }

  let labelTick = 0, labelErr = null;
  function updateLabels() {
    if (!labelsEl) return;
    labelTick++;
    sectors.forEach(s => {
      const L = labels[s.id];
      if (!L) return;
      const d = districts.find(x => x.sector.id === s.id);
      if (!d) return;
      tmpV.set(d.cx, 15 + (d.towers[0] ? d.towers[0].level * 1.2 : 0), d.cz);
      tmpV.project(camera);
      const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
      const x = (tmpV.x * .5 + .5) * w, y = (-tmpV.y * .5 + .5) * h;
      const visible = tmpV.z < 1 && x > -60 && x < w + 60;
      L.el.style.transform = 'translate(-50%,-100%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      L.el.style.opacity = visible ? (cam.dist > 118 ? '.35' : '1') : '0';
      if (s.id === sectors[0].id) { labelErr = { z: +tmpV.z.toFixed(3), x: +x.toFixed(1), vis: visible, w: w }; }
    });
  }

  function updateFx(dt, t) {
    for (let i = FX.length - 1; i >= 0; i--) {
      const o = FX[i];
      o.userData.life -= dt;
      const prog = 1 - Math.max(0, o.userData.life) / o.userData.maxLife;
      if (o.userData.fn) o.userData.fn(o, dt, prog);
      if (o.userData.life <= 0) { fxGroup.remove(o); FX.splice(i, 1); }
    }
    // 비
    for (let i = rainSystems.length - 1; i >= 0; i--) {
      const rs = rainSystems[i];
      rs.ttl -= dt;
      const arr = rs.pts.geometry.attributes.position.array;
      for (let k = 0; k < arr.length; k += 3) {
        arr[k + 1] -= rs.speeds[k / 3] * dt;
        if (arr[k + 1] < 0) { arr[k + 1] = 55; arr[k] = rnd(-60, 60); arr[k + 2] = rnd(-60, 60); }
      }
      rs.pts.geometry.attributes.position.needsUpdate = true;
      if (rs.ttl <= 0) { scene.remove(rs.pts); rs.pts.geometry.dispose(); rainSystems.splice(i, 1); }
    }
    // 시위
    pickets.forEach(p => {
      p.group.userData.phase += dt * 2.4;
      p.group.position.y = .3 + Math.abs(Math.sin(p.group.userData.phase)) * .18;
      p.group.rotation.y += dt * .4;
    });
  }

  function loop() {
    const dt = Math.min(.05, clock.getDelta());
    const t = clock.elapsedTime;
    updateCamera(dt);
    updateTowers();
    updatePeople(dt, t);
    updateCars(dt);
    updateFx(dt, t);
    // 풍력·관람차·분수
    districts.forEach(d => {
      if (d.landmark.userData.turbine) d.landmark.userData.turbine.rotation.z += dt * 1.6;
      if (d.landmark.userData.wheel) d.landmark.userData.wheel.rotation.z += dt * .28;
      if (d.landmark.userData.beacon) {
        const b = d.landmark.userData.beacon;
        const k = (Math.sin(t * 4) + 1) / 2;
        b.material.color.setHSL(.5, .9, .55 + k * .2);
      }
    });
    // 물결
    if (water) {
      water.children.forEach((s, i) => {
        s.position.x = s.userData.base + Math.sin(t * s.userData.spark + i) * 1.6;
        s.material.opacity = .2 + Math.abs(Math.sin(t * 1.4 + i)) * .3;
      });
    }
    // 하늘 반응(행복도)
    if (sky) {
      const m = (mood - 50) / 60;
      sky.material.uniforms.glow.value = Math.max(0, .22 + m * .5);
      hemi.intensity = .85 + Math.max(0, m) * .25;
    }
    // 시위 여부
    protest(mood < 42);
    if (renderer) renderer.render(scene, camera);
    updateLabels();
    requestAnimationFrame(loop);
  }

  /* ── 공개 API ─────────────────────────────────────────── */
  City.init = function (opts) {
    canvasEl = opts.canvas;
    labelsEl = opts.labelsEl || null;
    sectors = opts.sectors.slice();
    onPick = opts.onPick || null;

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x081120, 1);
    webglKind = renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1';

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0d1d31, 150, 300);
    camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, .5, 700);
    camera.position.set(0, 60, 100);
    camera.lookAt(0, 0, 0);
    City.resize();

    buildMaterials();
    buildSky();
    buildLights();
    buildGround();
    buildCityHall();
    sectors.forEach((s, i) => buildDistrict(s, i));
    fxGroup = new THREE.Group();
    scene.add(fxGroup);
    spawnPeople();
    spawnCars();
    buildLabels();

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    bindControls();
    clock = new THREE.Clock();

    window.addEventListener('resize', City.resize);
    ready = true;
    loop();
  };

  City.resize = function () {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    // 데스크톱에서는 왼쪽 예산 패널을 피해 도시를 오른쪽으로 민다
    if (w > 900) camera.setViewOffset(w, h, -Math.round(188), 0, w, h);
    else camera.clearViewOffset();
    // 세로 화면(모바일)에서는 도시를 더 멀리, 더 위에서 본다
    if (w / h < .85) { cam.tDist = 168; cam.tPhi = .60; cam.tTarget.set(0, 0, 2); }
    else if (w > 900 && cam.tDist > 160) { cam.tDist = 122; }
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };

  City.setAllocation = function (alloc, animate) {
    applyAllocation(alloc, animate !== false);
  };

  City.setMood = function (v) { mood = Math.max(0, Math.min(100, v)); };

  City.setDebtRatio = function (v) {
    debtRatio = v;
    // 부채가 많으면 도시 조명이 차가워진다
    if (hemi) hemi.color.setHSL(.58, .45, .62 - Math.min(.2, v / 400));
  };

  City.playEffect = function (name) {
    switch (name) {
      case 'coins': burstCoins(); break;
      case 'confetti': burstConfetti(); break;
      case 'fireworks': fireworks(); break;
      case 'rain': rainFx(6); break;
      case 'protest': protest(true); break;
      case 'dust': dust(rnd(-10, 10), rnd(-10, 10), 20); break;
    }
  };

  City.focus = function (id) {
    const d = districts.find(x => x.sector.id === id);
    if (!d) return;
    tween = {
      t0: performance.now(), dur: 900,
      from: cam.tTarget.clone(),
      to: new THREE.Vector3(d.cx * .55, 6, d.cz * .55)
    };
    cam.tDist = 66;
    cam.auto = false;
    lastInteract = performance.now();
  };

  City.resetView = function () {
    tween = { t0: performance.now(), dur: 800, from: cam.tTarget.clone(), to: new THREE.Vector3(0, 3, 0) };
    cam.tDist = 96;
    cam.tPhi = .92;
    lastInteract = performance.now();
  };

  City.debug = function () {
    let probe = null;
    try {
      const d = districts[0];
      const v = new THREE.Vector3(d.cx, 15, d.cz).project(camera);
      probe = { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2),
                dist: +cam.dist.toFixed(1), camY: +camera.position.y.toFixed(1) };
    } catch (e) { probe = { err: String(e) }; }
    return {
      ready: ready, webgl: webglKind, probe: probe,
      towers: towers.length,
      people: people.length,
      cars: cars.length,
      districts: districts.length,
      labels: Object.keys(labels).length,
      labelTick: labelTick, labelInfo: labelErr,
      fx: FX.length,
      rallocs: allocShare,
      triangles: renderer ? renderer.info.render.triangles : 0,
      calls: renderer ? renderer.info.render.calls : 0,
      mood: mood
    };
  };

  global.City = City;
})(window);
