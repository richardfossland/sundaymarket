import { Resources, BuildingType, Role, MissionType } from '@/types/game'
import { BUILDINGS } from '@/lib/constants'

export function canAfford(resources: Resources, cost: Resources): boolean {
  return (
    resources.wood  >= cost.wood  &&
    resources.stone >= cost.stone &&
    resources.food  >= cost.food  &&
    resources.gold  >= cost.gold
  )
}

export function subtractResources(a: Resources, b: Resources): Resources {
  return {
    wood:  a.wood  - b.wood,
    stone: a.stone - b.stone,
    food:  a.food  - b.food,
    gold:  a.gold  - b.gold,
  }
}

export function addResources(a: Resources, b: Resources): Resources {
  return {
    wood:  a.wood  + b.wood,
    stone: a.stone + b.stone,
    food:  a.food  + b.food,
    gold:  a.gold  + b.gold,
  }
}

export function totalResources(r: Resources): number {
  return r.wood + r.stone + r.food + r.gold
}

export function generateSessionCode(): string {
  const words = ['OAK', 'IRON', 'CORN', 'GOLD', 'ROCK', 'PINE', 'WOOL', 'CLAY']
  const word = words[Math.floor(Math.random() * words.length)]
  const num  = Math.floor(Math.random() * 90) + 10
  return `${word}-${num}`
}

export function getBuildingDef(type: BuildingType) {
  return BUILDINGS.find(b => b.type === type)!
}

export function formatResources(r: Resources): string {
  const parts: string[] = []
  if (r.wood  > 0) parts.push(`${r.wood} Wood`)
  if (r.stone > 0) parts.push(`${r.stone} Stone`)
  if (r.food  > 0) parts.push(`${r.food} Food`)
  if (r.gold  > 0) parts.push(`${r.gold} Gold`)
  return parts.join(', ')
}

export function pickRandomMission(): MissionType {
  const missions: MissionType[] = ['architect', 'trader', 'castle_builder', 'philanthropist', 'guildmaster']
  return missions[Math.floor(Math.random() * missions.length)]
}

export function pickRandomRole(existingRoles: string[]): Role {
  const roles: Role[] = ['lumberjack', 'stonemason', 'farmer', 'goldminer']
  // Balance roles across players
  const counts = roles.map(r => existingRoles.filter(e => e === r).length)
  const minCount = Math.min(...counts)
  const balanced = roles.filter((_, i) => counts[i] === minCount)
  return balanced[Math.floor(Math.random() * balanced.length)]
}
