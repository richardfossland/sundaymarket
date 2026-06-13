export type Role = 'lumberjack' | 'stonemason' | 'farmer' | 'goldminer'
export type Phase = 'lobby' | 'production' | 'trading' | 'building' | 'ended'
export type BuildingType = 'hut' | 'house' | 'market' | 'castle' | 'guild'
export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'expired'
export type MissionType = 'architect' | 'trader' | 'castle_builder' | 'philanthropist' | 'guildmaster'
export type WorldEventType = 'famine' | 'gold_rush' | 'storm' | 'harvest' | 'tax'

export interface Resources {
  wood: number
  stone: number
  food: number
  gold: number
}

export interface Player {
  id: string
  session_id: string
  name: string
  role: Role
  resources: Resources
  score: number
  trade_count: number
  mission: MissionType
  mission_completed: boolean
  is_online: boolean
  created_at: string
}

export interface Trade {
  id: string
  session_id: string
  initiator_id: string
  receiver_id: string
  offer: Resources
  request: Resources
  status: TradeStatus
  created_at: string
}

export interface Building {
  id: string
  session_id: string
  type: BuildingType
  built_by: string[]
  round: number
  points_awarded: number
  created_at: string
}

export interface WorldEvent {
  type: WorldEventType
  title: string
  description: string
  effect: Record<string, unknown>
}

export interface Session {
  id: string
  code: string
  host_id: string
  phase: Phase
  round: number
  max_rounds: number
  trade_seconds: number
  phase_started_at: string | null
  world_event: WorldEvent | null
  narration: string | null
  created_at: string
}
