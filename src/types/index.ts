export type WineType = 'red' | 'white' | 'rose' | 'sparkling' | 'fortified' | 'other'
export type Visibility = 'private' | 'link' | 'public'

export interface WineRecord {
  id: string
  user_id: string
  name: string
  vintage: number | null
  country: string | null
  region: string | null
  grapes: string[] | null
  producer: string | null
  type: WineType | null
  label_image_url: string | null
  location: string | null
  drunk_at: string
  price: number | null
  memo: string | null
  companions: string[] | null
  balance: number | null
  complexity: number | null
  value_score: number | null
  rating: number | null
  foods: FoodRecord[]
  visibility: Visibility
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

export interface LabelAnalysisResult {
  name: string | null
  vintage: number | null
  country: string | null
  region: string | null
  grapes: string[] | null
  producer: string | null
  type: WineType | null
  confidence: Record<string, 'high' | 'medium' | 'low'>
}
