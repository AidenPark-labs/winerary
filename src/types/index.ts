export type Visibility = 'private' | 'link' | 'public'

export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'fortified' | 'other'

export interface WineRecord {
  id: string
  user_id: string
  name: string
  wine_name_original: string | null
  wine_vivino_url: string | null
  wine_type: WineType | null
  wine_vintage: number | null
  grape_variety: string | null
  wine_country: string | null
  wine_id: string | null
  pending_wine_id: string | null
  photos: string[]
  location: string | null
  place_name: string | null
  latitude: number | null
  longitude: number | null
  drunk_at: string
  companions: string[] | null
  memo: string | null
  pairing_score: number | null
  rating: number | null
  price: number | null
  price_type: 'market' | 'retail' | null
  price_unit: 'bottle' | 'glass' | null
  value_score: number | null
  repurchase_intent: 'yes' | 'maybe' | 'no' | null
  foods: FoodRecord[]
  tags: string[] | null
  visibility: Visibility
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface FoodRecord {
  name: string
  note?: string
}

export interface WineSession {
  id: string
  code: string
  host_id: string
  title: string | null
  wine_snapshot: Partial<WineRecord> | null
  is_active: boolean
  created_at: string
}

export interface SessionEvaluation {
  id: string
  session_id: string
  user_id: string | null
  nickname: string
  balance: number | null
  complexity: number | null
  value_score: number | null
  rating: number | null
  memo: string | null
  created_at: string
}

export interface SessionComment {
  id: string
  session_id: string
  user_id: string | null
  nickname: string
  content: string
  created_at: string
}

export interface WineSuggestion {
  wine_id?: string
  name: string
  name_ko: string
  producer: string
  country: string
  type: string
  grapes: string
  vintage_range: string
  vivino_url: string
}
