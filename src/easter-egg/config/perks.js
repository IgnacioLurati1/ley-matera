// Perks: máquinas con forma de paquete gigante de yerba. Cada una imita el
// paquete de una yerba mítica (colores y estilo), con una marca en joda.

export const PERKS = {
  jugg: {
    name: 'Juggernog',
    cost: 2500,
    color: '#c8202a',
    glyph: '♥',
    desc: 'Aguantás el doble de golpes.',
    label: {
      brand: 'Taragüerno',
      tagline: 'LA DEL PALO FUERTE · DESDE 1924',
      bg: '#b3151d',
      band: '#fbf3e4',
      bandText: '#b3151d',
      accent: '#f3c233',
      leaf: 'rgba(255,255,255,0.12)',
      text: '#fff7ea',
    },
  },
  revive: {
    name: 'Quick Revive',
    cost: 1500,
    soloCost: 500,
    color: '#39a8e0',
    glyph: '✚',
    desc: 'Si caés, te levantás solo (3 veces).',
    coopDesc: 'Levantás a tus compañeros al doble de rápido.',
    label: {
      brand: 'Rosamorte',
      tagline: 'SABOR FUERTE PARA VOLVER',
      bg: '#f0b52c',
      band: '#c1271d',
      bandText: '#fff5dc',
      accent: '#c1271d',
      leaf: 'rgba(120,40,10,0.18)',
      text: '#3a1a08',
      brandColor: '#c1271d',
      stroke: 'rgba(255,240,200,0.8)',
    },
  },
  speed: {
    name: 'Speed Cola',
    cost: 3000,
    color: '#3dbb3a',
    glyph: '»',
    desc: 'Recargás el doble de rápido.',
    label: {
      brand: 'Rapidito',
      tagline: 'SUAVE, RÁPIDA Y SIN VUELTAS',
      bg: '#f6ecd0',
      band: '#1e4f9c',
      bandText: '#ffe36b',
      accent: '#d4282c',
      leaf: 'rgba(30,79,156,0.12)',
      text: '#1e4f9c',
      brandColor: '#d4282c',
      stroke: 'rgba(255,255,255,0.9)',
    },
  },
  doubletap: {
    name: 'Double Tap',
    cost: 2000,
    color: '#e8a21c',
    glyph: '✠',
    desc: 'Disparás más rápido.',
    label: {
      brand: 'Doble Cruz',
      tagline: 'DOS CRUCES · EL DOBLE DE BALA',
      bg: '#1f6a3a',
      band: '#f2e9d2',
      bandText: '#b41f24',
      accent: '#b41f24',
      leaf: 'rgba(255,255,255,0.1)',
      text: '#fff4dc',
    },
  },
  mule: {
    name: 'Mule Kick',
    cost: 4000,
    color: '#6f9a3a',
    glyph: '⚑',
    desc: 'Podés llevar un tercer mate.',
    label: {
      brand: 'Mulanda',
      tagline: 'CON PALO, CON TODO Y CON UN MATE MÁS',
      bg: '#e9e1cf',
      band: '#6b3e1f',
      bandText: '#f7e7b0',
      accent: '#3d7a2c',
      leaf: 'rgba(61,122,44,0.25)',
      text: '#2f4a1c',
      brandColor: '#3d7a2c',
      stroke: 'rgba(255,255,255,0.8)',
    },
  },
  deadshot: {
    name: 'Deadshot Daiquiri',
    cost: 1500,
    color: '#1a1a1a',
    glyph: '☼',
    desc: 'Tiros a la cabeza +25%, al cuerpo +15%.',
    label: {
      brand: 'Nadarias',
      // (ahora sí hace algo: +25% a la cabeza, +15% al cuerpo, el usuario
      // 2026-10-05; en dos renglones para que entre en el cartel. Con
      // __mduNoLemaNuevo, el de antes: core/textures.js paintPerkLabel)
      tagline: 'LA YERBA URUGUAYA\nQUE AHORA SÍ HACE ALGO',
      taglineOld: 'LA YERBA URUGUAYA QUE NO HACE NADA',
      bg: '#f5cf1f',
      band: '#1b3f8f',
      bandText: '#ffffff',
      accent: '#d82320',
      leaf: 'rgba(216,35,32,0.18)',
      text: '#1b3f8f',
      brandColor: '#d82320',
      brandSize: 100,
      stroke: 'rgba(255,255,255,0.9)',
    },
  },
  // Solo en la torre (Revelaciones Materas): la PhD Flopper.
  phd: {
    name: 'PhD Flopper',
    cost: 2000,
    color: '#8a3ad8',
    glyph: '✹',
    desc: 'Las explosiones y las caídas no te hacen nada. Si caés de un piso, revienta todo alrededor.',
    label: {
      brand: 'Flopa Hermanos',
      tagline: 'SE TIRA DE CABEZA · DESDE 1961',
      bg: '#3a1a5e',
      band: '#f2c230',
      bandText: '#3a1a5e',
      accent: '#ff5ad0',
      leaf: 'rgba(255,90,208,0.16)',
      text: '#fbeaff',
      brandColor: '#f2c230',
      brandSize: 60,
      stroke: 'rgba(40,10,60,0.9)',
    },
  },
};

// Solo en el castillo (Der Mateendrache): el Aliento Dragónico (weapons/dragonBreath.js).
// La yerba: Baldo, la uruguaya famosa por lo fuerte.
PERKS.dragon = {
  name: 'Aliento Dragónico',
  cost: 4000,
  color: '#e0521a',
  glyph: '♨',
  desc: 'Si te pegan dos golpes seguidos, largás una llamarada que quema a todos los de alrededor (se enfría 10 s).',
  label: {
    brand: 'Baldragón',
    tagline: 'PURA FUERZA · SE TOMA CON RESPETO',
    bg: '#7a1208',
    band: '#f3c233',
    bandText: '#5a0c05',
    accent: '#ff7a1a',
    leaf: 'rgba(255,140,40,0.16)',
    text: '#ffe9c8',
    brandColor: '#ffb020',
    brandSize: 76,
    stroke: 'rgba(40,5,0,0.9)',
  },
};

// Solo en Mate no Numa (los esteros): el Acuanauta (entities/swim.js). La
// yerba: Playadito, la de Colonia Liebig, en Corrientes, a un paso del Iberá.
PERKS.aqua = {
  name: 'Acuanauta',
  cost: 2000,
  color: '#2a8fd8',
  glyph: '≈',
  desc: 'Nadás mucho más rápido, aguantás el aire más del doble y el agua casi no te frena.',
  label: {
    brand: 'Nadadito',
    tagline: 'LA QUE FLOTA · DESDE 1877',
    bg: '#f3efe2',
    band: '#1d5fae',
    bandText: '#fdf8ea',
    accent: '#d3262b',
    leaf: 'rgba(29,95,174,0.14)',
    text: '#1d5fae',
    brandColor: '#1d5fae',
    brandSize: 70,
    stroke: 'rgba(255,255,255,0.9)',
  },
};

// Solo en Mate of the Dead (el penal): Electric Cherry (weapons/electricCherry.js).
// La yerba: Piporé, la de Misiones, con una chispa ("Chisporé") y gusto a cereza.
PERKS.cherry = {
  name: 'Electric Cherry',
  cost: 2000,
  color: '#3a6fe8',
  glyph: 'ϟ',
  desc: 'Al recargar largás una descarga que electrocuta a los muertos de alrededor: cuanto más vacío el cargador, más fuerte.',
  label: {
    brand: 'Chisporé',
    tagline: 'CON GUSTO A CEREZA · PATEA COMO LA 220',
    bg: '#1b2a6b',
    band: '#d8233a',
    bandText: '#fff3f5',
    accent: '#56c8ff',
    leaf: 'rgba(86,200,255,0.16)',
    text: '#eef6ff',
    brandColor: '#ffd84a',
    brandSize: 88,
    stroke: 'rgba(10,15,50,0.9)',
  },
};

// Solo en el Challenge de la torre: Dying Wish (el de Black Ops 4,
// entities/dyingWish.js). El golpe que te iba a tirar no te tira: 5 segundos
// inmortal, con la adrenalina a mil; después tarda en volver.
// La yerba: Unión, la de Las Marías ("Extremaunión": los santos óleos del que se va).
PERKS.wish = {
  name: 'Dying Wish',
  cost: 4000,
  color: '#a3123a',
  glyph: '✟',
  desc: 'El golpe que te iba a tirar no te tira: 5 segundos inmortal. Tarda 3 minutos en volver.',
  label: {
    brand: 'Extremaunión',
    tagline: 'SUAVE HASTA EL ÚLTIMO MATE',
    bg: '#f4c21c',
    band: '#161214',
    bandText: '#f4c21c',
    accent: '#c8102e',
    leaf: 'rgba(200,16,46,0.14)',
    text: '#1d3c8f',
    brandColor: '#1d3c8f',
    brandSize: 62,
    stroke: 'rgba(255,248,220,0.9)',
  },
};

// Solo en La Tapera (y en el Challenge de la torre): el Maizaster
// (entities/maizaster.js). De vez en cuando, el muerto que tirás deja una mata
// de pasto alto y seco: adentro, los zombies no te ven.
// La yerba: Nobleza Gaucha, la del gaucho en el paquete ("Maleza Gaucha").
PERKS.maiz = {
  name: 'Maizaster',
  cost: 3000,
  color: '#b8923a',
  glyph: '⌇',
  desc: 'A veces, el que matás deja una mata de pasto alto y seco. Adentro, los zombies no te ven.',
  label: {
    brand: 'Maleza Gaucha',
    tagline: 'NI LOS MUERTOS TE VEN',
    bg: '#e3c566',
    band: '#4a3214',
    bandText: '#f3e2a0',
    accent: '#7a2a12',
    leaf: 'rgba(90,60,20,0.18)',
    text: '#3a2408',
    brandColor: '#7a2a12',
    brandSize: 56,
    stroke: 'rgba(255,245,210,0.9)',
  },
};

// En todos los mapas: Stamin-Up (el de Black Ops). Se anda y se corre un 25%
// más rápido y se aguanta el doble corriendo (entities/Player.js).
// La yerba: "Trotadora", como la cinta del gimnasio (la máquina es una).
PERKS.stamin = {
  name: 'Stamin-Up',
  cost: 2000,
  color: '#f9c823',
  glyph: '»',
  desc: 'Corrés un 25% más rápido y aguantás el doble corriendo.',
  label: {
    brand: 'Trotadora',
    tagline: 'LA DEL GALOPE LARGO · DESDE 1958',
    bg: '#ee7d18',
    band: '#2a1a10',
    bandText: '#ffd23a',
    accent: '#ffd23a',
    leaf: 'rgba(255,230,120,0.18)',
    text: '#2a1a10',
    brandColor: '#fff6e0',
    brandSize: 82,
    stroke: 'rgba(70,24,0,0.9)',
  },
};

export const PERK_ORDER = ['jugg', 'revive', 'speed', 'doubletap', 'mule', 'deadshot', 'stamin'];
