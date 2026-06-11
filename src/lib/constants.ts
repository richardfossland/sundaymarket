import { Resources, BuildingType, Role, MissionType, WorldEvent } from '@/types/game'

export const ROLE_PRODUCTION: Record<Role, Resources> = {
  lumberjack: { wood: 4, stone: 0, food: 0, gold: 0 },
  stonemason:  { wood: 0, stone: 4, food: 0, gold: 0 },
  farmer:      { wood: 0, stone: 0, food: 4, gold: 0 },
  goldminer:   { wood: 0, stone: 0, food: 0, gold: 2 },
}

export const ROLE_LABELS: Record<Role, string> = {
  lumberjack: 'Lumberjack',
  stonemason: 'Stonemason',
  farmer:     'Farmer',
  goldminer:  'Gold Miner',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  lumberjack: 'You chop wood every round. You have plenty of wood — but you need stone and food to build. Find a Stonemason and a Farmer.',
  stonemason: 'You quarry stone every round. Stone is needed for almost every building. Traders will come to you.',
  farmer:     'You grow food every round. Every building needs food. You are essential — use that.',
  goldminer:  'You mine gold every round. Gold is rare. Only Castles need it, but they reward big. Trade carefully.',
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
    label: 'Hut',
    cost: { wood: 2, stone: 0, food: 1, gold: 0 },
    points: 15,
    description: 'A simple shelter. Easy to build, low reward.',
  },
  {
    type: 'house',
    label: 'House',
    cost: { wood: 3, stone: 2, food: 1, gold: 0 },
    points: 40,
    description: 'A proper house. Lumberjacks get a bonus.',
  },
  {
    type: 'market',
    label: 'Market',
    cost: { wood: 2, stone: 2, food: 2, gold: 0 },
    points: 70,
    description: 'Earns +5 points per trade you make for the rest of the game. Stonemasons and Farmers get a bonus.',
  },
  {
    type: 'castle',
    label: 'Castle',
    cost: { wood: 3, stone: 3, food: 2, gold: 2 },
    points: 150,
    description: 'The biggest individual build. Needs gold. Gold Miners get a bonus.',
  },
  {
    type: 'guild',
    label: 'Guild Hall',
    cost: { wood: 4, stone: 4, food: 3, gold: 1 },
    points: 200,
    description: 'Requires 2–3 players to build together. Massive reward.',
  },
]

export const MISSIONS: Record<MissionType, { label: string; description: string; bonus: number }> = {
  architect:      { label: 'The Architect',      description: 'Build 3 Houses.',               bonus: 50 },
  trader:         { label: 'The Trader',          description: 'Complete 15 trades.',           bonus: 60 },
  castle_builder: { label: 'Castle Builder',      description: 'Build 1 Castle.',               bonus: 80 },
  philanthropist: { label: 'The Philanthropist',  description: 'Give more resources than you receive total.', bonus: 55 },
  guildmaster:    { label: 'The Guildmaster',     description: 'Complete a Guild Hall build.',  bonus: 70 },
}

export const WORLD_EVENTS: WorldEvent[] = [
  {
    type: 'famine',
    title: '🌵 Famine',
    description: 'Food is scarce. Food trades are worth double points this round.',
    effect: { resource: 'food', trade_multiplier: 2 },
  },
  {
    type: 'gold_rush',
    title: '⚙️ Gold Rush',
    description: 'Gold mines are booming. Gold Miners produce 4 gold this round.',
    effect: { role: 'goldminer', production_override: 4 },
  },
  {
    type: 'storm',
    title: '⛈️ Storm',
    description: 'A storm swept through. Everyone loses half their wood.',
    effect: { resource: 'wood', multiplier: 0.5 },
  },
  {
    type: 'harvest',
    title: '🌾 Great Harvest',
    description: 'Bumper crop. Farmers produce 6 food this round.',
    effect: { role: 'farmer', production_override: 6 },
  },
  {
    type: 'tax',
    title: '👑 Royal Tax',
    description: 'The king taxes the wealthy. The top-scoring player loses 1 of each resource.',
    effect: { target: 'leader', cost: { wood: 1, stone: 1, food: 1, gold: 1 } },
  },
]

export const RESOURCE_COLORS: Record<keyof Resources, string> = {
  wood:  '#7C5C3A',
  stone: '#8A9BB0',
  food:  '#4A8C5C',
  gold:  '#F0BB47',
}

export const RESOURCE_EMOJIS: Record<keyof Resources, string> = {
  wood:  '🪵',
  stone: '🪨',
  food:  '🌾',
  gold:  '⚙️',
}

export const EMPTY_RESOURCES: Resources = { wood: 0, stone: 0, food: 0, gold: 0 }
