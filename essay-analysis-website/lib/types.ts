// Argument Mining annotation types (BRAT format)

export type ComponentType = "MajorClaim" | "Claim" | "Premise"
export type StanceType = "For" | "Against"
export type RelationType = "supports" | "attacks"

export interface AnnotationComponent {
  id: string
  type: ComponentType
  start: number
  end: number
  text: string
}

// Alias for backward compatibility
export type ArgumentComponent = AnnotationComponent

export interface Stance {
  componentId: string
  stance: StanceType
}

export interface Relation {
  id: string
  type: RelationType
  from: string // component id (Arg1)
  to: string   // component id (Arg2)
}

export interface Annotation {
  components: AnnotationComponent[]
  stances: Stance[]
  relations: Relation[]
}

export interface ModelResult {
  modelName: string
  modelId: string
  annotation: Annotation
  // Evaluation scores - easy to add later
  scores?: Record<string, number | string>
}

export interface Essay {
  id: string
  title: string
  text: string
  groundTruth: Annotation
  modelResults: ModelResult[]
}

export interface Experiment {
  id: string
  name: string
  description: string
  method: string
  essays: Essay[]
}
