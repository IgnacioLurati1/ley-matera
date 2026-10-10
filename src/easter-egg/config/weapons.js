// Arsenal matero. Los valores imitan el rol de cada arma de Black Ops 1:
// el daño está pensado contra las vidas de zombie de ese juego (150 en la
// ronda 1, +100 por ronda hasta la 9 y luego x1,1 por ronda).
//
// kind: 'hitscan' | 'projectile' | 'chain' | 'freeze' | 'blast' | 'bolt' | 'stream' | 'tactical'
// elem (segunda mejora del Pack-a-Pava): 'fire' prende fuego, 'ice' congela
// y frena, 'electric' salta con un arco a los zombies de al lado. Los mates
// especiales (los de la caja que no se compran en pared) no la tienen.
// El modelo 3D de cada arma se arma en weapons/viewmodels.js con el mismo id.

export const WEAPONS = {
  porongo: {
    name: 'Mate Porongo',
    desc: 'El de toda la vida. Chico, confiable y siempre a mano.',
    kind: 'hitscan',
    auto: false,
    rpm: 450,
    mag: 8,
    reserve: 80,
    reload: 1.6,
    // más flojo que antes: la ronda 1 pide cuatro o cinco tiros al cuerpo
    damage: 28,
    headMult: 3.2,
    spread: 0.022,
    range: 60,
    pen: 1,
    // (el sintetizado de siempre, no el grabado de la pistola: core/weaponSfx.js ALIAS)
    sound: 'porongo',
    recoil: 0.05,
    chalk: 'tall',
    pap: {
      name: 'Porongo Explosivo',
      elem: 'fire',
      kind: 'projectile',
      projectile: { speed: 42, gravity: 9, radius: 3, damage: 650, color: 0xffa040, size: 0.09, trail: 0xffc070 },
      mag: 12,
      reserve: 60,
      damage: 650,
      rpm: 420,
      sound: 'launcher',
    },
  },
  // El premio del super easter egg (core/eggs.js): con los seis easter eggs
  // completos se arranca con este en vez del Porongo. Como un buen mate de
  // pared en la mano del principio: mucho mejor que el Porongo y lejos de los
  // mejores de la caja. No sale en la caja ni en las paredes.
  caballero: {
    name: 'Porongo del Caballero',
    desc: 'El premio del Caballero de la Luz: blanco perla, con filigrana de oro y el sol de las ánimas.',
    kind: 'hitscan',
    auto: false,
    rpm: 480,
    mag: 12,
    reserve: 120,
    reload: 1.5,
    damage: 95,
    headMult: 3.5,
    spread: 0.018,
    range: 85,
    pen: 2,
    sound: 'pistol',
    recoil: 0.05,
    chalk: 'tall',
    pap: {
      name: 'Porongo del Alba',
      elem: 'electric',
      kind: 'projectile',
      projectile: { speed: 55, gravity: 2, radius: 3, damage: 650, color: 0xfff0b0, size: 0.08, trail: 0xffe890 },
      mag: 14,
      reserve: 84,
      damage: 650,
      rpm: 420,
      sound: 'launcher',
    },
  },
  madera: {
    name: 'Mate de Palo Santo',
    desc: 'Madera perfumada tallada a mano. Un tiro, un problema menos.',
    kind: 'hitscan',
    auto: false,
    rpm: 520,
    mag: 8,
    reserve: 96,
    reload: 2.2,
    damage: 105,
    headMult: 3.5,
    spread: 0.02,
    range: 90,
    pen: 2,
    sound: 'rifle',
    recoil: 0.08,
    chalk: 'cyl',
    wall: 500,
    pap: { name: 'Mate de Quebracho', damage: 190, mag: 12, reserve: 144, auto: true, rpm: 600, elem: 'fire' },
  },
  plastico: {
    name: 'Mate de Plástico',
    desc: 'Mate malo, doble bombilla. Da vergüenza pero te salva.',
    kind: 'hitscan',
    auto: false,
    rpm: 300,
    mag: 2,
    reserve: 38,
    reload: 2.6,
    damage: 55,
    pellets: 8,
    headMult: 1.8,
    spread: 0.09,
    range: 22,
    pen: 1,
    sound: 'shotgun',
    recoil: 0.16,
    chalk: 'cup',
    chalkStraws: 2,
    wall: 500,
    pap: { name: 'Mate del Diablo', damage: 120, mag: 4, reserve: 60, burn: true, elem: 'fire' },
  },
  vidrio: {
    name: 'Mate de Vidrio',
    desc: 'Se ve la yerba adentro. Escupe agua caliente a lo loco.',
    kind: 'hitscan',
    auto: true,
    rpm: 800,
    mag: 30,
    reserve: 120,
    reload: 2.3,
    damage: 65,
    headMult: 3,
    spread: 0.035,
    range: 45,
    pen: 1,
    sound: 'smg',
    recoil: 0.025,
    chalk: 'cup',
    wall: 1000,
    pap: { name: 'Mate de Cristal Tallado', damage: 130, mag: 40, reserve: 200, rpm: 900, elem: 'ice' },
  },
  lata: {
    name: 'Mate de Lata',
    desc: 'Aluminio de camping, bombilla gruesa. Para abrir camino.',
    kind: 'hitscan',
    auto: false,
    rpm: 70,
    mag: 6,
    reserve: 54,
    reload: 0.55,
    shellReload: true,
    damage: 85,
    pellets: 8,
    headMult: 1.8,
    spread: 0.07,
    range: 26,
    pen: 2,
    sound: 'pump',
    recoil: 0.18,
    chalk: 'cyl',
    wall: 1500,
    pap: { name: 'Latón Fulminante', damage: 170, mag: 10, reserve: 80, rpm: 110, elem: 'electric' },
  },
  algarrobo: {
    name: 'Mate de Algarrobo',
    desc: 'Ráfaga corta y madera dura. Pega como patada de mula.',
    kind: 'hitscan',
    auto: true,
    rpm: 700,
    mag: 20,
    reserve: 160,
    reload: 2.4,
    damage: 95,
    headMult: 3,
    spread: 0.03,
    range: 55,
    pen: 1,
    sound: 'smg',
    recoil: 0.03,
    chalk: 'tall',
    wall: 1200,
    pap: { name: 'Algarrobo Milenario', damage: 170, mag: 40, reserve: 280, elem: 'fire' },
  },
  imperial: {
    name: 'Mate Imperial',
    desc: 'Calabaza con virola de alpaca cincelada. Elegancia automática.',
    kind: 'hitscan',
    auto: true,
    rpm: 720,
    mag: 30,
    reserve: 240,
    reload: 2.7,
    damage: 150,
    headMult: 3.2,
    spread: 0.025,
    range: 80,
    pen: 2,
    sound: 'rifle',
    recoil: 0.035,
    box: 10,
    pap: { name: 'Imperial de Oro y Plata', damage: 240, mag: 45, reserve: 360, rpm: 780, elem: 'electric' },
  },
  camionero: {
    name: 'Mate Camionero',
    desc: 'Para la ruta larga: forrado en cuero, entra medio kilo de yerba.',
    kind: 'hitscan',
    auto: true,
    rpm: 750,
    mag: 100,
    reserve: 400,
    reload: 4.4,
    damage: 130,
    headMult: 2.8,
    spread: 0.04,
    range: 75,
    pen: 3,
    sound: 'lmg',
    recoil: 0.04,
    moveMult: 0.88,
    box: 10,
    pap: { name: 'Camionero de Larga Distancia', damage: 210, mag: 150, reserve: 600, elem: 'ice' },
  },
  torpedo: {
    name: 'Mate Torpedo',
    desc: 'Calabaza alargada con mira. Un sorbo, una cabeza.',
    kind: 'hitscan',
    auto: false,
    rpm: 55,
    mag: 5,
    reserve: 50,
    reload: 3.1,
    damage: 800,
    headMult: 5,
    spread: 0.06,
    adsSpread: 0,
    range: 160,
    pen: 4,
    sound: 'sniper',
    recoil: 0.25,
    scope: true,
    adsFov: 22,
    box: 8,
    pap: {
      name: 'Torpedo Nuclear',
      elem: 'electric',
      damage: 1600,
      mag: 8,
      reserve: 64,
      explosive: { radius: 3, damage: 1000 },
    },
  },
  silicona: {
    name: 'Mate de Silicona',
    desc: 'Mate malo. Se dobla, se tuerce y apunta a cualquier lado.',
    kind: 'hitscan',
    auto: true,
    rpm: 950,
    mag: 40,
    reserve: 200,
    reload: 2.2,
    damage: 28,
    headMult: 2,
    spread: 0.075,
    range: 30,
    pen: 1,
    sound: 'bad',
    recoil: 0.02,
    wobble: true,
    box: 8,
    pap: { name: 'Silicona Industrial', damage: 75, mag: 60, reserve: 300, elem: 'ice' },
  },
  cocido: {
    name: 'Mate Cocido',
    desc: 'Esto ni siquiera es mate. Tira saquitos. Lo siento mucho.',
    kind: 'projectile',
    auto: false,
    rpm: 220,
    mag: 10,
    reserve: 60,
    reload: 2.0,
    damage: 70,
    headMult: 1.5,
    range: 40,
    sound: 'bad',
    recoil: 0.04,
    projectile: { speed: 22, gravity: 6, radius: 0, damage: 70, color: 0xd8c9a8, size: 0.07, teabag: true },
    box: 6,
    pap: {
      name: 'Mate Cocido con Leche',
      elem: 'ice',
      damage: 220,
      mag: 16,
      reserve: 96,
      projectile: { speed: 30, gravity: 4, radius: 1.4, damage: 220, color: 0xfff6e0, size: 0.08, teabag: true },
    },
  },
  bombillazo: {
    name: 'Bombillazo',
    desc: 'Dispara la bombilla. Se clava y explota. Sí, perdés la bombilla.',
    kind: 'bolt',
    auto: false,
    rpm: 60,
    mag: 1,
    reserve: 12,
    reload: 1.9,
    damage: 1200,
    headMult: 1,
    range: 80,
    sound: 'bolt',
    recoil: 0.12,
    bolt: { speed: 55, fuse: 1.6, radius: 3.2, damage: 1400 },
    box: 6,
    pap: {
      name: 'Bombillazo Mágico',
      elem: 'fire',
      reserve: 16,
      bolt: { speed: 65, fuse: 3.2, radius: 4, damage: 3000, lure: true },
    },
  },
  rayo: {
    name: 'Rayo Matero',
    desc: 'Tecnología del Abuelo: agua verde a 115 grados.',
    kind: 'projectile',
    auto: false,
    rpm: 190,
    mag: 20,
    reserve: 160,
    reload: 3.2,
    damage: 1000,
    headMult: 1,
    range: 120,
    sound: 'ray',
    recoil: 0.07,
    special: true,
    projectile: { speed: 60, gravity: 0, radius: 2.8, damage: 1000, splash: 320, color: 0x6dff7a, size: 0.16, glow: true, selfDamage: 25 },
    box: 3,
    pap: {
      name: 'Rayo Matero Mark II',
      mag: 40,
      reserve: 200,
      rpm: 260,
      projectile: { speed: 70, gravity: 0, radius: 3.2, damage: 1800, splash: 600, color: 0xff3a3a, size: 0.18, glow: true, selfDamage: 25 },
    },
  },
  wunder: {
    name: 'Wunder-Mate DG-2',
    desc: 'La bombilla es una bobina de Tesla. Electrocuta en cadena.',
    kind: 'chain',
    auto: false,
    rpm: 70,
    mag: 3,
    reserve: 6,
    reload: 3.6,
    damage: 100000,
    headMult: 1,
    range: 36,
    sound: 'tesla',
    recoil: 0.2,
    special: true,
    wonder: true,
    chain: { targets: 10, hop: 7 },
    box: 2,
    only: ['molino', 'penal'],
    pap: { name: 'Wunder-Mate DG-3 JZ', mag: 6, reserve: 12, chain: { targets: 24, hop: 9 } },
  },
  terere: {
    name: 'Tereré de Invierno',
    desc: 'Guampa con hielo y limón. Congela todo lo que toca.',
    kind: 'freeze',
    auto: false,
    rpm: 160,
    mag: 6,
    reserve: 18,
    reload: 2.8,
    damage: 100000,
    headMult: 1,
    range: 13,
    sound: 'ice',
    recoil: 0.1,
    special: true,
    wonder: true,
    // (2026-09-27: más ancho y el doble de muertos por tiro: contra una horda
    // congelaba a unos pocos y el resto seguía)
    cone: { angle: 0.4, targets: 12 },
    box: 2,
    only: ['granja', 'torre'],
    pap: { name: 'Tereré del Polo Sur', mag: 9, reserve: 27, range: 17, cone: { angle: 0.52, targets: 20 } },
  },
  tronador: {
    name: 'Mate Tronador',
    desc: 'Un soplido que manda zombies a Misiones.',
    kind: 'blast',
    auto: false,
    rpm: 60,
    mag: 2,
    reserve: 6,
    reload: 3.2,
    damage: 100000,
    headMult: 1,
    range: 11,
    sound: 'thunder',
    recoil: 0.45,
    special: true,
    wonder: true,
    cone: { angle: 0.55, targets: 30 },
    moveMult: 0.9,
    box: 2,
    // el molino lo necesita para el easter egg (el barbacuá)
    only: ['molino', 'torre'],
    pap: { name: 'Tronador Cero Absoluto', mag: 4, reserve: 12, range: 14 },
  },
  diablo: {
    name: 'La Bombilla del Diablo',
    desc: 'Escupe agua hirviendo en chorro. Atraviesa filas enteras de zombies.',
    kind: 'stream',
    auto: true,
    rpm: 600,
    mag: 40,
    reserve: 100,
    reload: 3.1,
    // (cada toque del chorro, diez por segundo. Era 100000: liquidaba filas
    // enteras al toque en cualquier ronda. Pedido del usuario 2026-10-07: mucho
    // menos. Ahora: 2 toques en la ronda 20, 5 en la 30, 12 en la 40)
    damage: 1500,
    headMult: 1,
    range: 11,
    sound: 'stream',
    recoil: 0.008,
    special: true,
    wonder: true,
    stream: { radius: 0.7 },
    box: 2,
    only: ['granja', 'penal'],
    pap: { name: 'La Bombilla de Belcebú', damage: 4000, mag: 60, reserve: 150, range: 15, stream: { radius: 0.95 } },
  },
  pava: {
    name: 'Pava Silbadora',
    desc: 'Tirala: silba, los zombies van a ver quién ceba y... ¡bum!',
    kind: 'tactical',
    count: 3,
    box: 5,
  },
  gemelos: {
    name: 'Mates Gemelos',
    desc: 'Uno en cada mano, de a uno por vez. Se recargan cambiando la yerba.',
    kind: 'hitscan',
    auto: true,
    akimbo: true,
    yerbaReload: true,
    rpm: 560,
    mag: 24,
    reserve: 216,
    reload: 2.6,
    damage: 68,
    headMult: 3.2,
    spread: 0.034,
    range: 55,
    pen: 1,
    sound: 'pistol',
    recoil: 0.035,
    box: 6,
    pap: { name: 'Gemelos Endiablados', damage: 150, mag: 40, reserve: 320, rpm: 680, elem: 'electric' },
  },
  luzmala: {
    name: 'Mate de la Luz Mala',
    desc: 'Se arma en el altillo. Suelta luces malas que buscan solas a los muertos y revientan. Para mejorarlo, primero dispárale a la Luz Mala.',
    kind: 'wisp',
    // el Pack-a-Pava no lo agarra hasta que le pegás a la Luz Mala con él y brilla
    papLuz: true,
    auto: false,
    rpm: 140,
    mag: 8,
    reserve: 64,
    reload: 2.2,
    damage: 2200,
    headMult: 1,
    range: 60,
    sound: 'luzmala',
    recoil: 0.06,
    special: true,
    wisp: { count: 3, speed: 12, turn: 5, radius: 2.8, damage: 2200, life: 4.5 },
    pap: { name: 'Mate de la Luz Mala Eterna', desc: 'Cinco luces malas que no perdonan: buscan a los muertos y revientan en verde.', mag: 12, reserve: 120, wisp: { count: 5, speed: 14, turn: 7, radius: 3.4, damage: 6500, life: 5.5 } },
  },
  // La caja de la granja: el mejor mate "normal" (sin poderes), de asta de toro.
  asta: {
    name: 'Mate de Asta de Toro',
    desc: 'Guampa de toro negro con virolas de plata. Pega fuerte, atraviesa y no se cansa.',
    kind: 'hitscan',
    auto: true,
    rpm: 640,
    mag: 36,
    reserve: 288,
    reload: 2.5,
    damage: 175,
    headMult: 3.5,
    spread: 0.022,
    range: 85,
    pen: 3,
    sound: 'rifle',
    recoil: 0.032,
    box: 9,
    only: 'granja',
    pap: { name: 'Asta del Toro Negro', damage: 290, mag: 50, reserve: 400, rpm: 700, elem: 'fire' },
  },
  // La caja del penal: el mejor mate "normal" de ese mapa, a lo AK-47.
  mate47: {
    name: 'Mate 47',
    desc: 'Calabaza con culata de madera y cargador curvo. Tosco, ruidoso y no se traba nunca.',
    kind: 'hitscan',
    auto: true,
    rpm: 600,
    mag: 30,
    reserve: 300,
    reload: 2.4,
    damage: 170,
    headMult: 3.3,
    spread: 0.026,
    range: 80,
    pen: 3,
    sound: 'rifle',
    recoil: 0.045,
    box: 9,
    only: 'penal',
    pap: { name: 'Mate 47 Fugitivo', damage: 285, mag: 45, reserve: 405, rpm: 660, elem: 'electric' },
  },
  // La caja de la torre: una ametralladora de bronce de campana con tambor.
  campanario: {
    name: 'Mate Campanario',
    desc: 'Bronce de campana y tambor de setenta y cinco. Tarda en cebar, pero cuando suena no para.',
    kind: 'hitscan',
    auto: true,
    rpm: 720,
    mag: 75,
    reserve: 375,
    reload: 3.6,
    damage: 155,
    headMult: 3,
    spread: 0.03,
    range: 80,
    pen: 3,
    sound: 'lmg',
    recoil: 0.03,
    box: 9,
    only: 'torre',
    pap: { name: 'Campanario del Remolino', damage: 265, mag: 100, reserve: 500, rpm: 780, elem: 'ice' },
  },
  // Los cuatro de la caja nuevos (el usuario, 2026-10-08). Modelos en
  // weapons/nuevosMates.js; trazos, cohete y chispas en weapons/nuevosFx.js;
  // tiros grabados (CC0) en core/weaponSfx.js.
  // La escopeta automática (la Haymaker 12 de Black Ops 3): 16 cartuchos,
  // 300 por minuto, de un tiro hasta la ronda 10 si entran todos los perdigones.
  labrador: {
    name: 'Mate Labrador',
    desc: 'Calabaza de chacra con pirograbado de trigo y un barrilito de perdigones. No para de escupir plomo.',
    kind: 'hitscan',
    auto: true,
    rpm: 300,
    mag: 16,
    reserve: 64,
    reload: 2.4,
    damage: 170,
    pellets: 6,
    headMult: 1.5,
    spread: 0.075,
    range: 24,
    pen: 2,
    sound: 'labrador',
    recoil: 0.1,
    box: 9,
    pap: { name: 'Labrador de Sol a Sol', damage: 380, mag: 25, reserve: 125, rpm: 330, elem: 'fire' },
  },
  // El lanzacohetes de cuatro (la L4 Siege de Black Ops 3): semiautomático,
  // cuatro cohetes y 60 de reserva. Revienta fuerte y te lastima si estás
  // cerca, salvo con la PhD Flopper (Player.damage: explosión).
  explosivo: {
    name: 'Mate Explosivo',
    desc: 'Cuatro bombillas cohete en una calabaza de pólvora. Revientan todo... a vos también si estás cerca.',
    kind: 'projectile',
    auto: false,
    rpm: 150,
    mag: 4,
    reserve: 60,
    reload: 3.4,
    damage: 1500,
    headMult: 1,
    range: 90,
    sound: 'cohete',
    recoil: 0.14,
    moveMult: 0.92,
    projectile: { speed: 36, gravity: 1.2, radius: 3.5, damage: 1500, color: 0xffa040, size: 0.07, rocket: true, selfDamage: 60 },
    box: 7,
    pap: {
      name: 'Circo Explosivo',
      elem: 'fire',
      damage: 3500,
      mag: 8,
      reserve: 80,
      projectile: { speed: 42, gravity: 1, radius: 4.5, damage: 3500, color: 0xffd060, size: 0.08, rocket: true, selfDamage: 75 },
    },
  },
  // Solo en la caja de Eclipse Matero: la ametralladora del caos (la Dingo de
  // Black Ops 3), un poco mejor que el Camionero.
  caotico: {
    name: 'Mate Caótico',
    desc: 'Calabaza partida por el desgarro, con el caos girando adentro. Escupe vacío sin parar.',
    kind: 'hitscan',
    auto: true,
    rpm: 760,
    mag: 100,
    reserve: 480,
    reload: 4.0,
    damage: 145,
    headMult: 3,
    spread: 0.036,
    range: 80,
    pen: 3,
    sound: 'caotico',
    recoil: 0.036,
    moveMult: 0.9,
    trail: 'caos',
    box: 10,
    only: 'eclipse',
    pap: { name: 'Lobizón del Caos', damage: 235, mag: 150, reserve: 720, rpm: 780, elem: 'electric' },
  },
  // Solo en la caja de Der Mateendrache: como el Imperial pero del dragón,
  // con más daño y más balas de reserva.
  llamarada: {
    name: 'Llamarada Matera',
    desc: 'Forjada en la boca del dragón: escamas de brasa, garras de hierro y cada tiro sale en llamas.',
    kind: 'hitscan',
    auto: true,
    rpm: 720,
    mag: 30,
    reserve: 330,
    reload: 2.7,
    damage: 185,
    headMult: 3.2,
    spread: 0.025,
    range: 80,
    pen: 2,
    sound: 'llamarada',
    recoil: 0.035,
    trail: 'fuego',
    box: 9,
    only: 'castillo',
    pap: { name: 'Llamarada del Dragón', damage: 300, mag: 45, reserve: 480, rpm: 780, elem: 'fire' },
  },
  // El Mate Meme: solo en el Challenge de la torre (la caja y la pared de la
  // casita escondida; `only: 'reto'` no es ningún mapa, así que en los demás no
  // sale: world/Interactables.js inBox). Pega como el Mate 47, más lento y con
  // más daño por tiro (cada tiro suena: core/audio.js memeShot). weapons/memeMate.js
  meme: {
    name: 'Mate Meme',
    desc: 'Una calabaza de arcoíris con anteojos pixelados. Cada tiro es un meme (y pega como un Mate 47).',
    kind: 'hitscan',
    auto: true,
    rpm: 360,
    mag: 24,
    reserve: 264,
    reload: 2.2,
    damage: 290,
    headMult: 3.2,
    spread: 0.022,
    range: 80,
    pen: 3,
    sound: 'meme',
    recoil: 0.05,
    box: 8,
    only: 'reto',
    meme: true,
    pap: { name: 'Momazo Supremo', desc: 'El Mate Meme después del Pack-a-Pava: cadena de oro y más momazo por tiro.', damage: 470, mag: 36, reserve: 360, rpm: 400, elem: 'electric' },
  },
  // La Hoz del easter egg de la granja: de cuerpo a cuerpo con el clic izquierdo.
  // Convertida en el Pack-a-Pava (con el ritual) es la Hoz de la Muerte: además
  // tira medialunas de muerte con el clic derecho.
  hoz: {
    name: 'La Hoz',
    desc: 'Hoja, mango y virola, atados con un ritual. Clic izquierdo: cortar.',
    kind: 'melee',
    auto: true,
    rpm: 115,
    mag: 0,
    reserve: 0,
    reload: 1.6,
    damage: 1600,
    headMult: 1,
    range: 2.7,
    sound: 'knife',
    recoil: 0.05,
    special: true,
    melee: { range: 2.7, cos: 0.45, targets: 4 },
    pap: {
      name: 'Hoz de la Muerte',
      desc: 'Clic izquierdo corta todo lo que toca. Clic derecho tira una medialuna de muerte.',
      damage: 100000,
      rpm: 130,
      mag: 8,
      reserve: 64,
      alt: true,
      melee: { range: 3.3, cos: 0.3, targets: 10 },
      crescent: { speed: 24, radius: 1.3, damage: 100000, life: 1.3 },
    },
  },
  // Máquina de Muerte: la bombilla gigante del potenciador (30 segundos).
  bombillon: {
    name: 'Máquina de Muerte',
    desc: 'Una bombilla gigante de seis caños. Dura poco: aprovechala.',
    kind: 'hitscan',
    auto: true,
    rpm: 1300,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 650,
    headMult: 2,
    spread: 0.045,
    range: 70,
    pen: 3,
    sound: 'lmg',
    recoil: 0.012,
    moveMult: 0.9,
    temp: true,
    // contra los jefes pega mucho menos (Zombies.damage; al Luisón, menos todavía)
    bossMult: 0.25,
  },
  // Admin Mate (el potenciador de la torre): un Mate Eagle de oro en cada mano.
  // Cada tiro atraviesa a todos los que hay en la línea; dura 12 segundos.
  adminmate: {
    name: 'Admin Mate',
    desc: 'Un Mate Eagle de oro en cada mano: cada tiro atraviesa a todos. Dura muy poco.',
    kind: 'hitscan',
    auto: true,
    akimbo: true,
    // (a 330 disparaba lentísimo para lo poco que dura: el usuario lo quiere a full)
    rpm: 900,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 6000,
    headMult: 4,
    spread: 0.008,
    range: 120,
    pen: 12,
    sound: 'sniper',
    recoil: 0.028,
    moveMult: 1,
    temp: true,
    bossMult: 0.05,
  },
  // Farol de las Ánimas (el potenciador del penal): mantené el clic y les
  // arranca el alma a los muertos que tenés adelante (weapons/Farol.js).
  farol: {
    name: 'Farol de las Ánimas',
    desc: 'Mantené el clic: les arranca el alma a los muertos que tenés adelante. Clic derecho: gaucho life para vos y los de al lado.',
    kind: 'farol',
    auto: true,
    rpm: 600,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 17,
    sound: 'silent',
    recoil: 0,
    moveMult: 1,
    special: true,
    temp: true,
    bossMult: 0.3,
    // cono (coseno del medio ángulo), cuántos a la vez, segundos hasta vaciar a
    // uno común, qué parte de la vida del jefe por segundo, y la explosión final
    // (vaciar a uno común: 0,45 s; era 0,8 y se sentía flojo)
    drain: { cos: 0.8, targets: 10, time: 0.45, boss: 0.03, burst: 9 },
  },
  // El penal: el trabuco de bombillas (sale de la caja solo ahí) y su versión con
  // el kit de ácido (se arma en la enfermería y se carga de almas en el encierro).
  gut: {
    name: 'Bombilla Gut',
    desc: 'Trabuco de bombillas de alpaca: tres o cuatro voltean a cualquiera, en cualquier ronda.',
    kind: 'hitscan',
    auto: false,
    rpm: 110,
    mag: 5,
    reserve: 60,
    reload: 2.4,
    damage: 650,
    // cada bombilla se lleva este pedazo de la vida del muerto (ver Weapons.hitscan)
    gutFrac: 0.3,
    pellets: 8,
    headMult: 1.5,
    spread: 0.07,
    range: 30,
    pen: 3,
    sound: 'gut',
    recoil: 0.3,
    // se tira de la cadera: no se apunta con la mira
    noAds: true,
    box: 4,
    only: 'penal',
    pap: { name: 'Bombilla Gut Barredora', damage: 1250, gutFrac: 0.5, mag: 8, reserve: 80, rpm: 130, pen: 5 },
  },
  gutacida: {
    name: 'Bombilla Ácida',
    desc: 'La Bombilla Gut con el kit de ácido: tira frascos que se pegan, llaman a los muertos como un mono y revientan al ratito.',
    kind: 'bolt',
    auto: false,
    rpm: 105,
    // (un frasco por carga; la mejorada, tres. Y un cuarto menos de recámara:
    // pedido del usuario 2026-10-07)
    mag: 1,
    reserve: 45,
    reload: 2.9,
    damage: 6000,
    headMult: 1,
    range: 60,
    sound: 'gut',
    recoil: 0.26,
    noAds: true,
    special: true,
    // (como el Magmagat: el frasco pegado llama a los muertos hasta que revienta)
    bolt: { speed: 36, fuse: 2.2, radius: 3.2, damage: 9000, count: 3, spread: 0.07, acid: true, lure: true },
    pap: { name: 'Bombilla Ácida Corrosiva', mag: 3, reserve: 68, bolt: { speed: 40, fuse: 2.4, radius: 3.8, damage: 22000, count: 4, spread: 0.08, acid: true, lure: true } },
  },
  // La otra versión de la Bombilla Gut: hecha Gatling del infierno (tambor de
  // seis caños, manivela y cinta de balas al rojo). No sale de la caja: se arma
  // con su búsqueda (entities/penalMaquina.js) y no le sirve al easter egg (no
  // es ácido: al Alcaide no le derrite el llavero). Medio pasada hasta la ronda
  // 30; sin mejorar se queda corta por la 30-35 (~14 tiros por muerto) y
  // mejorada por la 40-45. rapid: fogonazo suave; hell: balas del infierno
  // (trazo de fuego, chispas, el muerto queda carbonizado; sin quemadura que
  // siga pegando); spinUp: lo que tarda el tambor en tomar vuelta antes del
  // primer tiro (con el clic derecho se lo hace girar antes y tira al toque).
  // (2026-10-07, el usuario: cadencia baja y poca precisión: de 1000 a 1800
  // por minuto, dispersión 0,04 → 0,016 y casi sin subir la mira)
  gutmuerte: {
    name: 'Máquina de Muerte',
    desc: 'La Bombilla Gut hecha Gatling del infierno. Clic derecho: hacé girar el tambor y tirá al toque.',
    kind: 'hitscan',
    auto: true,
    rpm: 1800,
    mag: 240,
    reserve: 720,
    reload: 4.2,
    damage: 520,
    headMult: 1.5,
    spread: 0.016,
    range: 60,
    pen: 2,
    sound: 'gatling',
    recoil: 0.005,
    moveMult: 0.88,
    noAds: true,
    rapid: true,
    hell: true,
    spinUp: 0.35,
    // contra los jefes pega más que contra un muerto (x1,5): la Ácida limpia
    // hordas, la Máquina es la de los jefes (el usuario, 2026-10-07; era 0,4).
    // Al Gil, ~15% más que la Ácida del mismo nivel y no más (que no lo
    // desintegre): bossCap es el tope por tiro contra él (Zombies.damage,
    // info.cap). Tirándole 8 s parado: la Ácida ~5500 por segundo (mejorada
    // ~23300, con los charcos), esta ~6500 (mejorada ~27000)
    bossMult: 1.5,
    bossCap: 360,
    only: 'penal',
    pap: { name: 'Máquina de Muerte Segura', damage: 1250, mag: 320, reserve: 1280, rpm: 2000, pen: 3, spinUp: 0.22, bossCap: 1400 },
  },
  // La torre: el Rayo Matero Mark III (el Ray Gun Mark 3 de Gorod Krovi), un
  // par de mates gemelos del remolino. Clic izquierdo: un rayo que atraviesa
  // filas enteras. Clic derecho: un remolino que se traga a los muertos.
  mk3: {
    name: 'Rayo Matero Mark III',
    desc: 'Mates gemelos del remolino. Izquierdo: rayo que atraviesa todo. Derecho: remolino que traga muertos.',
    kind: 'mk3',
    auto: false,
    akimbo: true,
    alt: true,
    rpm: 330,
    mag: 30,
    reserve: 180,
    reload: 2.8,
    damage: 2600,
    headMult: 1.5,
    spread: 0.004,
    range: 90,
    pen: 6,
    sound: 'mk3',
    recoil: 0.045,
    special: true,
    chalk: 'tall',
    vortex: { cost: 6, speed: 11, radius: 5, life: 4, dps: 6000, fly: 1.2 },
    wall: 12000,
    box: 2,
    only: 'torre',
    pap: { name: 'Mark III Remolino Eterno', mag: 45, reserve: 270, damage: 5200, rpm: 380, vortex: { cost: 5, speed: 12, radius: 6.5, life: 5, dps: 12000, fly: 1.3 } },
  },
  // La Supernova Matera: la maravilla del Challenge de la torre (weapons/Supernova.js).
  // No sale de la caja ni de las paredes: vive en el altar de la cima
  // (entities/TowerChallenge.js). Rompe el juego a propósito (lo pidió el
  // usuario): el rayo atraviesa a todos y revienta en una nova con arcos, y el
  // Big Bang (clic derecho) deshace a todo el piso.
  supernova: {
    name: 'Supernova Matera',
    desc: 'Una estrella chiquita adentro de un mate de vidrio negro. Clic izquierdo: rayo estelar. Clic derecho: Big Bang.',
    kind: 'nova',
    special: true,
    auto: true,
    noAds: true,
    rpm: 300,
    mag: 40,
    reserve: 400,
    reload: 2,
    damage: 9000,
    headMult: 1.5,
    spread: 0,
    range: 120,
    sound: 'silent',
    recoil: 0.02,
    only: 'torre',
    nova: { radius: 3.4, blast: 7000, chain: 4, chainR: 8, chainDmg: 6000 },
    bang: { cost: 12, charge: 0.75, radius: 16, dy: 5, boss: 45000, cd: 4, wave: 0.55 },
    pap: {
      name: 'Big Bang Matero',
      desc: 'La Supernova después del Pack-a-Pava: magenta y oro, y todo más grande.',
      mag: 60,
      reserve: 600,
      rpm: 360,
      damage: 16000,
      nova: { radius: 4.6, blast: 14000, chain: 7, chainR: 10, chainDmg: 12000 },
      bang: { cost: 10, charge: 0.6, radius: 21, dy: 5, boss: 90000, cd: 3, wave: 0.6 },
    },
  },
  // El castillo del Mateendrache: los cuatro mates de la luz (weapons/Elementales.js).
  // No salen de la caja ni se compran: cada uno se gana con su vuelta y vive
  // en su altar (altar: true). La mejora no es del Pack-a-Pava sino el temple
  // en el altar: `pap` son los datos del mate templado, que suma el tiro cargado.
  pillan: {
    name: 'Pillán, el Mate del Fuego',
    desc: 'La leyenda del volcán: escupe bolas de fuego que revientan y prenden a los muertos.',
    kind: 'elemental',
    element: 'fuego',
    altar: true,
    special: true,
    auto: false,
    rpm: 120,
    mag: 10,
    reserve: 60,
    reload: 2.6,
    damage: 1500,
    headMult: 1,
    range: 90,
    sound: 'silent',
    recoil: 0.09,
    only: 'castillo',
    fireball: { speed: 34, gravity: 3, radius: 3.2, frac: 1.05, splash: 0.92 },
    pap: { name: 'Pillán Despierto', desc: 'Mantené el clic: el volcán entra en erupción donde pega.', mag: 14, reserve: 98, rpm: 150, fireball: { speed: 38, gravity: 3, radius: 4.2, frac: 1.3, splash: 1 }, charge: { time: 1.1, cost: 3 } },
  },
  zonda: {
    name: 'Zonda, el Mate del Viento',
    desc: 'El viento de la cordillera en un mate: un soplido que manda a volar a los muertos.',
    kind: 'elemental',
    element: 'viento',
    altar: true,
    special: true,
    auto: false,
    rpm: 95,
    mag: 8,
    reserve: 56,
    reload: 2.4,
    damage: 1500,
    headMult: 1,
    range: 14,
    sound: 'silent',
    recoil: 0.14,
    only: 'castillo',
    gust: { range: 13, angle: 0.46, targets: 9, kill: 8.5, frac: 1.2 },
    pap: { name: 'Zonda Desatado', desc: 'Mantené el clic: un remolino que se traga a los muertos.', mag: 12, reserve: 84, rpm: 110, gust: { range: 16, angle: 0.52, targets: 14, kill: 12, frac: 1.6 }, charge: { time: 1.1, cost: 3 } },
  },
  illapa: {
    name: 'Illapa, el Mate del Rayo',
    desc: 'El trueno de los Andes: un rayo que salta de muerto en muerto.',
    kind: 'elemental',
    element: 'rayo',
    altar: true,
    special: true,
    auto: false,
    rpm: 170,
    mag: 20,
    reserve: 120,
    reload: 2.2,
    damage: 1500,
    headMult: 1,
    range: 60,
    sound: 'silent',
    recoil: 0.06,
    only: 'castillo',
    spark: { chain: 3, hop: 5.5, frac: 1 },
    pap: { name: 'Tormenta de Illapa', desc: 'Mantené el clic: el ojo de la tormenta, una bola de rayos que fríe todo.', mag: 28, reserve: 168, rpm: 200, spark: { chain: 6, hop: 7, frac: 1.4 }, charge: { time: 1.1, cost: 3 } },
  },
  penitente: {
    name: 'Penitente, el Mate del Hielo',
    desc: 'El hielo eterno de la cumbre: agujas que atraviesan y congelan a los muertos.',
    kind: 'elemental',
    element: 'hielo',
    altar: true,
    special: true,
    auto: false,
    rpm: 150,
    mag: 14,
    reserve: 84,
    reload: 2.5,
    damage: 1500,
    headMult: 1,
    range: 80,
    sound: 'silent',
    recoil: 0.07,
    only: 'castillo',
    shard: { speed: 60, pierce: 3, frac: 0.85 },
    pap: { name: 'Penitente Eterno', desc: 'Mantené el clic: una ventisca que congela todo lo que agarra.', mag: 20, reserve: 120, rpm: 180, shard: { speed: 66, pierce: 6, frac: 1.2 }, charge: { time: 1.1, cost: 3 } },
  },
  oro: {
    name: 'Mate de Oro del Abuelo',
    desc: 'El premio del Abuelo. Convierte zombies en yerba.',
    kind: 'projectile',
    auto: true,
    rpm: 360,
    mag: 50,
    reserve: 500,
    reload: 2,
    damage: 5000,
    headMult: 1,
    range: 120,
    sound: 'oro',
    recoil: 0.05,
    special: true,
    projectile: { speed: 80, gravity: 0, radius: 2.4, damage: 5000, splash: 1500, color: 0xffd34a, size: 0.14, glow: true },
    pap: { name: 'Mate de Oro Macizo', mag: 80, reserve: 800 },
  },
  // Facón Relámpago (el potenciador de Mate no Numa): izquierdo, un tajo largo
  // en arco que corta a todos; derecho, un rayo que salta de muerto en muerto
  // (weapons/Facon.js). Los golpes y la estela son los de la hoz.
  facon: {
    name: 'Facón Relámpago',
    desc: 'Izquierdo: un tajo largo que corta a todos. Derecho: un rayo que salta de muerto en muerto.',
    kind: 'melee',
    auto: true,
    rpm: 150,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 4.8,
    sound: 'knife',
    recoil: 0.04,
    moveMult: 1,
    special: true,
    noAds: true,
    temp: true,
    bossMult: 0.3,
    // el tajo (alcance, coseno del medio ángulo, cuántos, golpe a los jefes) y
    // el rayo (alcance, coseno de la mira, saltos, distancia del salto, espera, jefes)
    slash: { range: 4.8, cos: 0.1, targets: 14, boss: 3000 },
    bolt: { range: 45, cos: 0.93, targets: 10, hop: 7, cd: 0.6, boss: 2500 },
  },
  // Piedra de Molino (el potenciador del molino): cada clic tira una piedra de
  // moler que rueda y aplasta todo lo que encuentra (weapons/Especiales.js).
  piedra: {
    name: 'Piedra de Molino',
    desc: 'Una piedra de moler entera: tirala rodando y que aplaste todo.',
    kind: 'especial',
    rpm: 70,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 60,
    sound: 'silent',
    recoil: 0.06,
    moveMult: 0.85,
    special: true,
    noAds: true,
    temp: true,
    bossMult: 0.3,
    // velocidad, radio de la piedra, cuánto dura rodando y el golpe a los jefes
    stone: { speed: 13, radius: 0.85, life: 3.2, boss: 3000 },
  },
  // Mate Dragón (el potenciador del castillo): mantené el clic y echa fuego;
  // con el derecho escupe una bola de fuego que revienta (weapons/Especiales.js).
  dragon: {
    name: 'Mate Dragón',
    desc: 'Mantené el clic: fuego de dragón. Derecho: una bola de fuego que revienta.',
    kind: 'especial',
    auto: true,
    rpm: 600,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 16,
    sound: 'silent',
    recoil: 0.004,
    moveMult: 1,
    special: true,
    noAds: true,
    temp: true,
    bossMult: 0.3,
    // el aliento: alcance, coseno del medio ángulo, golpes por segundo, parte de
    // la vida de un muerto común por golpe y golpe fijo a los jefes
    breath: { range: 16, cos: 0.87, rate: 12, frac: 0.5, min: 1000, boss: 560 },
    fireball: { speed: 32, gravity: 2, radius: 6, damage: 14000, cd: 0.7 },
  },
  // La Liquidificador (la maravilla de los esteros; sale del easter egg, no de
  // la caja): una pava tiznada que escupe bolas de agua hirviendo. Derrite a
  // los muertos del reventón y hace hervir el agua donde cae, que cocina a los
  // muertos que estén adentro (a los jugadores no). weapons/Liquidificador.js
  liquidificador: {
    name: 'Liquidificador',
    desc: 'Una pava tiznada que hierve sola. Derrite a los muertos y hace hervir el agua: los que estén adentro se cocinan.',
    kind: 'liquid',
    auto: false,
    rpm: 100,
    mag: 6,
    reserve: 36,
    reload: 3,
    damage: 100000,
    headMult: 1,
    range: 70,
    sound: 'silent',
    recoil: 0.12,
    special: true,
    wonder: true,
    // la bola (velocidad, caída), el reventón (radio y lo que quema al que la
    // tiró), el hervor (radio, segundos) y lo que quema el agua (vida por segundo)
    liquid: { speed: 34, gravity: 7, radius: 3, self: 20, boil: 3.5, secs: 6, heat: 30 },
    pap: {
      name: 'Liquidificador del Más Allá',
      mag: 9,
      reserve: 54,
      rpm: 120,
      // y cada reventón suelta tres gotas que revientan de nuevo
      liquid: { speed: 38, gravity: 7, radius: 3.8, self: 20, boil: 5, secs: 9, heat: 30, split: 3 },
    },
  },
  // El Mate Supremo: el otro premio del super easter egg (core/eggs.js,
  // weapons/Supremo.js). Sale en la caja en todos los mapas, pero solo para el
  // que completó los seis y lo tiene prendido en Opciones (`egg`); cuenta como
  // un especial de la caja. Rompe el juego a propósito (lo pidió el usuario):
  // `infinite`, la reserva no se gasta (el cargador sí, y se llena solo:
  // `regen`, balas por segundo después de `delay` sin tirar). `bossFrac`: el
  // pedazo de la vida de un jefe que se lleva cada golpe (si es más que el daño).
  // `sol`: donde termina el rayo; `juicio`: el clic derecho; `aura`: el que se
  // acerca con el mate en la mano.
  supremo: {
    name: 'Mate Supremo',
    desc: 'Izquierdo: rayo del sol. Derecho: el Juicio.',
    kind: 'supremo',
    special: true,
    wonder: true,
    egg: true,
    box: 2,
    auto: true,
    noAds: true,
    infinite: true,
    rpm: 600,
    mag: 60,
    reserve: 999,
    reload: 1.9,
    damage: 60000,
    headMult: 1.5,
    spread: 0,
    range: 200,
    sound: 'silent',
    recoil: 0.018,
    bossFrac: 0.03,
    regen: { rate: 6, delay: 0.35 },
    sol: { radius: 4.5, chain: 6, chainR: 13, chainDmg: 40000 },
    // (el Juicio barre todo el mapa: `all`; la ola tarda `wave` s en llegar al
    // más lejano; a cualquier jefe lo aniquila: Zombies.annihilate)
    juicio: { cost: 10, charge: 0.6, all: true, wave: 1.6, cd: 2.5, lead: 0.15, sigil: 7 },
    aura: { radius: 2.8, tick: 0.15, boss: 8000, bossFrac: 0.012 },
    pap: {
      name: 'Los Seis Soles',
      desc: 'Blanco prisma. Todo más grande.',
      mag: 99,
      reserve: 999,
      rpm: 720,
      damage: 150000,
      bossFrac: 0.05,
      regen: { rate: 12, delay: 0.25 },
      sol: { radius: 6, chain: 10, chainR: 16, chainDmg: 90000 },
      juicio: { cost: 8, charge: 0.5, all: true, wave: 1.4, cd: 1.6, lead: 0.12, sigil: 8.5 },
      aura: { radius: 3.6, tick: 0.12, boss: 16000, bossFrac: 0.02 },
    },
  },
  // El Sable Corvo de San Martín (la maravilla del Monumento al Mate): no sale
  // de la caja; se arma con tres piezas en la Llama Votiva (el mapa llama a
  // weapons.sable.give()). weapons/Sable.js
  //  · slash: el combo de tres tajos (alcance, coseno del medio ángulo, cuántos
  //    corta, hasta qué ronda mata de un tajo; a los jefes, la parte de su vida
  //    por golpe y lo mínimo)
  //  · throw: el tiro de boomerang (lejos, de costado, segundos de vuelo, radio
  //    del corte, espera; jefes como arriba)
  //  · wave (mejorado): la medialuna celeste de cada tajo
  //  · carga (mejorado): bajas para llenarla, largo, medio ancho del pasillo,
  //    velocidad del galope, cuánto se mantiene el derecho y a los jefes
  //  · mag/reserve: los tiros del derecho (el cargador se llena solo de la
  //    reserva cuando vuelve vacío; la Carga no gasta). Mata de un tajo hasta
  //    la ronda oneHit con un golpe de verdad, no infinito (el usuario, 2026-10-05)
  //  · el nerf (el usuario, 2026-10-07): de un tajo hasta la ronda 14 y el tiro
  //    (throw.oneHit) hasta la 20; el de San Lorenzo hasta la 24 y su tiro
  //    hasta la 30. Después, de a
  //    dos golpes las 10 rondas que siguen, de a tres las otras 10, y así
  //    (weapons/Sable.js dmg). La Carga sigue matando siempre a los comunes.
  //    Antes: 40 y 45.
  sable: {
    name: 'Sable Corvo',
    desc: 'Izquierdo: tajos. Derecho: tiralo, vuelve solo.',
    kind: 'sable',
    auto: true,
    rpm: 135,
    mag: 6,
    reserve: 30,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 3.6,
    sound: 'silent',
    recoil: 0.04,
    special: true,
    wonder: true,
    noAds: true,
    slash: { range: 3.6, cos: 0.25, targets: 5, oneHit: 14, boss: 0.03, bossMin: 1800 },
    throw: { reach: 13, side: 3.6, time: 1.35, radius: 1.25, cd: 3, oneHit: 20, boss: 0.06, bossMin: 3000 },
    pap: {
      name: 'Sable de San Lorenzo',
      desc: 'Cada tajo larga una medialuna. Con la carga llena, mantené el derecho.',
      rpm: 150,
      mag: 8,
      reserve: 48,
      slash: { range: 3.9, cos: 0.18, targets: 6, oneHit: 24, boss: 0.04, bossMin: 2600 },
      throw: { reach: 16, side: 4.4, time: 1.45, radius: 1.6, cd: 2.6, oneHit: 30, boss: 0.08, bossMin: 4500 },
      wave: { range: 12, speed: 30, half: 2.3, boss: 0.012 },
      carga: { kills: 25, len: 38, half: 4.2, speed: 17, hold: 0.45, boss: 0.3, bossMin: 12000 },
    },
  },
  // El Desgarrador Cósmico (la maravilla de Eclipse Matero): la guadaña violeta
  // y negra que desgarra el espacio-tiempo. No sale de la caja ni entra en el
  // Pack-a-Pava (noPap): la da el mapa (weapons.cosmic.give()) y la mejora es
  // la misión del temple (weapons.cosmic.upgrade()). weapons/Desgarrador.js
  // v3 (pedido del usuario 2026-10-06): la mejorada de antes es la común (con
  // la Furia); la mejorada nueva es poder divino (la ruptura, el pozo, la falla).
  //  · slash / finisher: los tres tajos del combo y el remate (alcance, coseno
  //    del medio ángulo, cuántos corta, hasta qué ronda mata de un golpe; a los
  //    jefes, la parte de su vida y lo mínimo: nunca de uno). wave: la onda del
  //    remate (radio, parte de un tajo, jefes, empujón)
  //  · rift: la grieta de cada tajo (segundos; cada cuánto pega y cada cuánto
  //    al mismo; frac: parte de un tajo; jefes)
  //  · throw: la guadaña espectral (lejos, de costado, segundos de vuelo, radio
  //    del corte, espera; frac y jefes como arriba). Gasta una carga. pull: de
  //    ida arrastra hacia ella (radio, m/s); burst: revienta al volver (como wave)
  //  · dash: la embestida (metros, segundos, espera, medio ancho del pasillo).
  //    crack: la raja que deja en el piso (segundos, parte de un tajo a quien la
  //    pisa); burst: el estallido del final (como wave)
  //  · spin: el giro de la R (segundos, radio del empujón, empujón, frac)
  //  · furia: bajas para llenarla, segundos, más rápida (rpm), más daño, más
  //    velocidad, vida por baja, el rayo (alcance, ancho, tick; a los jefes, por
  //    segundo y el tope por tick; ws: lo gordo del rayo) y la onda que sale de
  //    cada tajo (m/s, hasta dónde, parte de un tajo, jefes)
  //  · exec (la ejecutora del Cazador del Caos): segundos si no viene otro,
  //    espera de la embestida, Furia por baja, la nube rosa y la onda rosa
  //  · la mejorada (pap), lo nuevo: rift.swallow (la grieta se los traga);
  //    finisher.rupture (la ruptura: los traga en kill m, tumba a los de radius
  //    m, la burbuja que frena el tiempo y el rasgón de la pantalla); throw.trio
  //    (tres guadañas) y throw.well (el pozo de gravedad en la punta de la del
  //    medio: radio, segundos, m/s, el radio donde se los traga); dash.crack.fault
  //    (la falla en el piso: 6 s, corta todo lo que la cruza); furia.rain (la
  //    lluvia de guadañas: cada cuánto, cuántas, radio) y furia.dust (los
  //    ejecutados se vuelven polvo de estrellas que cura)
  desgarrador: {
    name: 'Desgarrador Cósmico',
    desc: 'Izquierdo: tajos. Derecho: guadaña. V: embestida. R: giro. Furia llena: H.',
    kind: 'cosmic',
    auto: true,
    rpm: 165,
    mag: 8,
    reserve: 56,
    reload: 1.1,
    damage: 0,
    headMult: 1,
    range: 4,
    sound: 'silent',
    recoil: 0.04,
    special: true,
    wonder: true,
    noAds: true,
    noPap: true,
    slash: { range: 4.5, cos: 0.15, targets: 8, oneHit: 55, boss: 0.05, bossMin: 3400 },
    finisher: { range: 5.2, cos: -0.45, targets: 14, oneHit: 55, boss: 0.08, bossMin: 5000, wave: { radius: 6, frac: 0.8, boss: 0.025, bossMin: 1600, push: 10 } },
    rift: { life: 1.8, tick: 0.2, again: 0.4, frac: 0.85, boss: 0.009, bossMin: 650 },
    throw: { reach: 18, side: 4.8, time: 1.5, radius: 1.9, cd: 0.75, frac: 1, boss: 0.09, bossMin: 5000, pull: { radius: 4.2, speed: 7.5 }, burst: { radius: 4, frac: 1.1, boss: 0.035, bossMin: 2200, push: 9 } },
    dash: { len: 8, time: 0.2, cd: 1.8, half: 1.6, frac: 1.25, boss: 0.06, bossMin: 4000, crack: { life: 2.6, frac: 0.6 }, burst: { radius: 4, frac: 1.2, boss: 0.035, bossMin: 2200, push: 10 } },
    spin: { time: 1, radius: 3.2, push: 9, dmg: 0.45 },
    furia: { kills: 30, time: 20, rate: 1.35, dmg: 1.5, move: 1.25, heal: 15, beam: { range: 36, width: 1.2, tick: 0.1, boss: 11000, cap: 1600, ws: 1 }, wave: { speed: 22, range: 12, frac: 1, boss: 0.012, bossMin: 700 } },
    // la ejecutora (el Cazador del Caos con la guadaña en la mano). v4: cada
    // tajo larga una onda de ruptura que ejecuta en línea (más larga y ancha),
    // abre el agujero negro, la Furia se llena sola (fill bajas por segundo) y
    // los ejecutados revientan en la nube
    exec: { time: 20, dashCd: 0, furia: 2, fill: 1.5, hole: true, cloud: { radius: 4.5, frac: 1.5 }, wave: { speed: 30, range: 22, frac: 50, boss: 0.03, bossMin: 2500, wide: 1.6 } },
    pap: {
      name: 'Desgarrador del Eclipse',
      desc: 'Rompe el espacio: se los traga. Furia llena: H.',
      rpm: 180,
      mag: 10,
      reserve: 90,
      // (v4: el tajo de un golpe hasta la ronda 80 y el remate hasta la 110; a
      // los jefes 8 y 10 % por golpe, nunca de uno)
      slash: { range: 5, cos: 0.08, targets: 12, oneHit: 80, boss: 0.08, bossMin: 5000 },
      finisher: { range: 6, cos: -0.6, targets: 20, oneHit: 110, boss: 0.1, bossMin: 7000, wave: { radius: 7, frac: 1, boss: 0.03, bossMin: 2400, push: 12 }, rupture: { at: 2.2, kill: 6.5, radius: 10, push: 13, reel: 1.1, boss: 0.035, bossMin: 3000, bubble: { radius: 8, time: 2.2, slow: 0.16 } } },
      rift: { life: 3.2, tick: 0.18, again: 0.35, frac: 1.3, boss: 0.012, bossMin: 900, swallow: true },
      // (v4) las dos de los costados orbitan el pozo mientras dura (orbit: vueltas por segundo en radianes)
      throw: { reach: 20, side: 5.2, time: 1.6, radius: 2.1, cd: 0.7, frac: 1.3, boss: 0.09, bossMin: 6000, pull: { radius: 4.6, speed: 8 }, burst: { radius: 4.4, frac: 1.3, boss: 0.04, bossMin: 2600, push: 10 }, trio: { lag: 0.08, orbit: 4.2 }, well: { at: 0.6, radius: 8.5, time: 1.5, pull: 11, core: 3.4, boss: 0.05, bossMin: 4000 } },
      dash: { len: 9.5, time: 0.2, cd: 1.4, half: 1.9, frac: 1.6, boss: 0.07, bossMin: 5000, crack: { life: 6, frac: 2, w: 0.36, fault: true }, burst: { radius: 4.6, frac: 1.4, boss: 0.04, bossMin: 2600, push: 11 } },
      spin: { time: 0.95, radius: 4.2, push: 11, dmg: 0.7 },
      // (v4) la Furia divina: el Eclipse. 20 s, la lluvia más tupida y todo lo
      // que entra a aura.radius m muere de a poco (aura.ticks golpes, uno cada
      // aura.every s; a los jefes, aura.boss por golpe)
      furia: { kills: 30, time: 20, rate: 1.45, dmg: 2, move: 1.3, heal: 20, beam: { range: 46, width: 1.8, tick: 0.08, boss: 16000, cap: 2400, ws: 1.35 }, wave: { speed: 26, range: 16, frac: 1.5, boss: 0.016, bossMin: 1000 }, rain: { every: 0.55, n: 6, radius: 18, frac: 3, boss: 0.025, bossMin: 2500 }, dust: true, eclipse: true, aura: { radius: 12, every: 0.45, ticks: 3, frac: 0.34, boss: 0.006, bossMin: 500 } },
      // (v4) el agujero negro de cada tajo (radio, segundos: se traga a los que mata)
      hole: { R: 0.26, life: 0.95 },
      // (v4) mantener el clic: el golpe cargado. hold: cuánto mantenido después
      // de un tajo para empezar a cargar; min / full: segundos; cd: espera. La
      // ruptura grande: traga en kill m, tumba en radius m, frena el tiempo en
      // la burbuja; a los jefes boss de su vida (nunca de uno)
      charge: { hold: 0.3, min: 0.35, full: 1.1, cd: 3, rupture: { at: 4, kill: 9, radius: 13, push: 15, reel: 1.4, boss: 0.09, bossMin: 9000, bubble: { radius: 10, time: 3.2, slow: 0.06 } } },
    },
  },  // El Cazador del Caos (el potenciador de Eclipse Matero: entities/Powerups
  // PERSONAL.caos; antes daba el farol del penal): una bruma violeta que gira
  // en la mano (weapons/Cazador.js; con el Desgarrador en la mano, en cambio,
  // la guadaña se vuelve la ejecutora). Sus modelos solo se arman en Eclipse.
  //  · mist: el izquierdo tira la bruma adelante (cono: largo, coseno del medio
  //    ángulo, segundos que dura, segundos adentro hasta sacarle el caos a uno
  //    común, espera, jefes: parte de la vida por segundo)
  //  · suck: el derecho le chupa el caos a los de alrededor (radio, cuántos,
  //    segundos hasta que llegan a la mano, espera, vida por cada uno, jefes)
  cazador: {
    name: 'Cazador del Caos',
    desc: 'Izquierdo: la bruma. Derecho: les chupa el caos.',
    kind: 'cazador',
    auto: true,
    rpm: 600,
    mag: 9999,
    reserve: 0,
    reload: 1,
    damage: 0,
    headMult: 1,
    range: 7,
    sound: 'silent',
    recoil: 0,
    // (v4: corre más con el Cazador en la mano)
    moveMult: 1.3,
    special: true,
    temp: true,
    bossMult: 0.3,
    mist: { range: 7.5, cos: 0.78, time: 1.5, kill: 0.3, cd: 1.1, boss: 0.05 },
    // (v4) la succión: un agujero negro adelante (at m) que arrastra todo lo de radius m
    suck: { radius: 14, targets: 30, time: 0.8, cd: 2.4, heal: 8, boss: 0.06, bossMin: 3000, at: 3, pull: 16 },
    // (v4) el izquierdo: un rayo de vacío que salta de muerto en muerto (jumps
    // saltos de hasta hop m) y los parte; cada muerto revienta en esquirlas
    // que lastiman a los de al lado (shards: radio, parte de la vida)
    chain: { range: 22, jumps: 6, hop: 7, cd: 0.42, boss: 0.035, bossMin: 1800 },
    shards: { radius: 3, frac: 0.7 },
  },
};

// Pesos de la caja misteriosa (0 o ausente = no sale de la caja). `only`:
// sale solo en ese mapa (o en esos, si es una lista). `wonder`: los cuatro
// especiales de la caja (cada mapa tiene solo algunos, con poca reserva).
export const BOX_POOL = Object.entries(WEAPONS)
  .filter(([id, w]) => w.box || (w.wall && id !== 'porongo'))
  .map(([id, w]) => ({ id, weight: w.box || 7, only: w.only ? [].concat(w.only) : null }));

// La caja del molino, La Tapera y el penal salía demasiado buena (muchos mates
// fuertes): ahí los fuertes de caja pesan la mitad y los de pared un poco más
// (de ~28-36% a ~14-20% de fuertes; los de pared, de ~32% a ~45%; los wonder
// casi igual). Pedido del usuario 2026-09-27.
const BOX_TUNED = ['molino', 'granja', 'penal'];
const BOX_STRONG = ['imperial', 'camionero', 'torpedo', 'asta', 'mate47', 'gut', 'labrador'];
// Los especiales de la caja salen un poco más (de ~2% a ~3,4% cada uno), y en
// el molino el Tronador bastante más (~5,8%). Pedido del usuario 2026-09-30.
const WONDER_K = 1.75;
const WONDER_MAP = { molino: { tronador: 3 } };
export function boxWeight(w, map) {
  const W = WEAPONS[w.id];
  if (W.wonder && !W.egg) return w.weight * (WONDER_MAP[map]?.[w.id] ?? WONDER_K);
  if (!BOX_TUNED.includes(map)) return w.weight;
  if (BOX_STRONG.includes(w.id)) return w.weight * 0.5;
  if (W.wall && !W.box) return w.weight * 1.3;
  return w.weight;
}

export const KNIFE = { damage: 150, range: 1.8, time: 0.55, lunge: 3 };
// Facón de Plata (el Bowie del original): de un tajo hasta la ronda 10, después pega x6.
export const BOWIE = { name: 'Facón de Plata', cost: 3000, oneHitUntil: 10, mult: 6 };
export const GRENADE = { damage: 400, radius: 5.5, fuse: 2.2, max: 4, perRound: 2, wall: 250 };

// Pack-a-Pava: la primera mejora cuesta 5000; la segunda (el elemento) 2500.
export const PAP_COST = [5000, 2500];
export const ELEM_INFO = {
  fire: { name: 'Brasa', desc: 'prende fuego', color: 0xff7a30 },
  ice: { name: 'Escarcha', desc: 'congela', color: 0x7ad8ff },
  electric: { name: 'Centella', desc: 'electrocuta', color: 0xffe25a },
};
// Nivel de mejora de un mate: 0 normal, 1 mejorado, 2 con elemento.
export const tierOf = (up) => (up === true ? 1 : up | 0);
// ¿Hasta qué nivel se puede mejorar?
export const maxTier = (id) => (!WEAPONS[id]?.pap ? 0 : WEAPONS[id].pap.elem ? 2 : 1);

// Arma efectiva: datos base mezclados con los del Pack-a-Pava si corresponde.
export function weaponStats(id, upgraded) {
  const base = WEAPONS[id];
  const tier = Math.min(tierOf(upgraded), maxTier(id));
  if (!tier) return { id, upgraded: false, tier: 0, ...base };
  const { pap } = base;
  const elem = tier >= 2 ? pap.elem : undefined;
  return {
    id,
    upgraded: true,
    tier,
    ...base,
    ...pap,
    elem,
    name: elem ? `${pap.name} · ${ELEM_INFO[elem].name}` : pap.name,
    projectile: pap.projectile || base.projectile,
    bolt: pap.bolt || base.bolt,
    chain: pap.chain || base.chain,
    cone: pap.cone || base.cone,
    stream: pap.stream || base.stream,
    melee: pap.melee || base.melee,
    reload: base.reload * 0.85,
  };
}
