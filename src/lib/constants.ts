import { Resources, BuildingType, Role, MissionType, WorldEvent } from '@/types/game'

export const ROLE_PRODUCTION: Record<Role, Resources> = {
  lumberjack: { wood: 4, stone: 0, food: 0, gold: 0 },
  stonemason:  { wood: 0, stone: 4, food: 0, gold: 0 },
  farmer:      { wood: 0, stone: 0, food: 4, gold: 0 },
  goldminer:   { wood: 0, stone: 0, food: 0, gold: 2 },
}

export const ROLE_LABELS: Record<Role, string> = {
  lumberjack: 'Tømmerhogger',
  stonemason: 'Steinhogger',
  farmer:     'Bonde',
  goldminer:  'Gullgraver',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  lumberjack: 'Du hogger tømmer hver runde. Du har rikelig med tre — men du trenger stein og mat for å bygge. Finn en steinhogger og en bonde.',
  stonemason: 'Du bryter stein hver runde. Stein trengs til nesten alle bygg. Handelsfolk kommer til deg.',
  farmer:     'Du dyrker mat hver runde. Alle bygg trenger mat. Du er uunnværlig — bruk det.',
  goldminer:  'Du graver gull hver runde. Gull er sjeldent. Bare slott trenger det, men de gir mye poeng. Handle med omhu.',
}

export const ROLE_EMOJIS: Record<Role, string> = {
  lumberjack: '🪵',
  stonemason: '🪨',
  farmer:     '🌾',
  goldminer:  '⚙️',
}

export interface BuildingDef {
  type: BuildingType
  label: string
  cost: Resources
  points: number
  description: string
}

export const BUILDINGS: BuildingDef[] = [
  {
    type: 'hut',
    label: 'Hytte',
    cost: { wood: 2, stone: 0, food: 1, gold: 0 },
    points: 15,
    description: 'Et enkelt ly. Lett å bygge, lite poeng.',
  },
  {
    type: 'house',
    label: 'Hus',
    cost: { wood: 3, stone: 2, food: 1, gold: 0 },
    points: 40,
    description: 'Et skikkelig hus. Tømmerhoggere får bonus.',
  },
  {
    type: 'market',
    label: 'Marked',
    cost: { wood: 2, stone: 2, food: 2, gold: 0 },
    points: 70,
    description: 'Et stort handelsnav. Høy fast belønning. Steinhoggere og bønder får bonus.',
  },
  {
    type: 'castle',
    label: 'Slott',
    cost: { wood: 3, stone: 3, food: 2, gold: 2 },
    points: 150,
    description: 'Det største vanlige bygget. Krever gull. Gullgravere får bonus.',
  },
  {
    type: 'guild',
    label: 'Laugshall',
    cost: { wood: 4, stone: 4, food: 3, gold: 1 },
    points: 200,
    description: 'Det ypperste bygget — trenger litt av alt, gull inkludert. Gullgravere får bonus.',
  },
]

export const MISSIONS: Record<MissionType, { label: string; description: string; bonus: number }> = {
  architect:      { label: 'Arkitekten',      description: 'Bygg 3 hus.',               bonus: 50 },
  trader:         { label: 'Handelsmannen',   description: 'Fullfør 15 handler.',       bonus: 60 },
  castle_builder: { label: 'Slottsbyggeren',  description: 'Bygg 1 slott.',             bonus: 80 },
  philanthropist: { label: 'Velgjøreren',     description: 'Gi bort flere ressurser totalt enn du mottar (telles ved spillslutt).', bonus: 55 },
  guildmaster:    { label: 'Laugsmesteren',   description: 'Bygg en laugshall.',        bonus: 70 },
}

export const WORLD_EVENTS: WorldEvent[] = [
  {
    type: 'famine',
    title: '🌵 Hungersnød',
    description: 'Avlingene råtner over hele landet. Alle mister halvparten av maten sin denne runden.',
    effect: { resource: 'food', multiplier: 0.5 },
  },
  {
    type: 'gold_rush',
    title: '⚙️ Gullrush',
    description: 'Gullgruvene blomstrer. Gullgravere produserer 4 gull denne runden.',
    effect: { role: 'goldminer', production_override: 4 },
  },
  {
    type: 'storm',
    title: '⛈️ Storm',
    description: 'En storm feide gjennom. Alle mister halvparten av tømmeret sitt.',
    effect: { resource: 'wood', multiplier: 0.5 },
  },
  {
    type: 'harvest',
    title: '🌾 Storslått innhøsting',
    description: 'Rekordavling. Bønder produserer 6 mat denne runden.',
    effect: { role: 'farmer', production_override: 6 },
  },
  {
    type: 'tax',
    title: '👑 Kongelig skatt',
    description: 'Kongen skattlegger de rike. Spilleren med flest poeng mister 1 av hver ressurs.',
    effect: { target: 'leader', cost: { wood: 1, stone: 1, food: 1, gold: 1 } },
  },
]

export const RESOURCE_COLORS: Record<keyof Resources, string> = {
  wood:  '#7C5C3A',
  stone: '#8A9BB0',
  food:  '#4A8C5C',
  gold:  '#EBB84B',
}

export const RESOURCE_EMOJIS: Record<keyof Resources, string> = {
  wood:  '🪵',
  stone: '🪨',
  food:  '🌾',
  gold:  '⚙️',
}

export const EMPTY_RESOURCES: Resources = { wood: 0, stone: 0, food: 0, gold: 0 }

// Canonical resource order for the live market price ticker / hint.
export const RESOURCE_ORDER: (keyof Resources)[] = ['wood', 'stone', 'food', 'gold']

export const RESOURCE_LABELS: Record<keyof Resources, string> = {
  wood:  'Tre',
  stone: 'Stein',
  food:  'Mat',
  gold:  'Gull',
}

// Until a resource has its first price row, fall back to the schema default
// (Wood/Stone/Food anchored at 1.0, Gold at 2.0) so the ticker has something
// sensible to show before the first trade.
export const DEFAULT_PRICES: Record<keyof Resources, number> = {
  wood:  1.0,
  stone: 1.0,
  food:  1.0,
  gold:  2.0,
}
