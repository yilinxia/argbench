import type { Annotation, AnnotationComponent, ComponentType, Relation, RelationType, Stance, StanceType } from "./types"

/**
 * Parse BRAT format annotation text into structured Annotation object.
 * This makes it easy to paste in new LLM outputs.
 */
export function parseBrat(bratText: string): Annotation {
  const lines = bratText.trim().split("\n")
  const components: AnnotationComponent[] = []
  const stances: Stance[] = []
  const relations: Relation[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed.startsWith("T")) {
      // Entity: T1\tMajorClaim 391 490\ttext content
      // Note: some outputs use space instead of tab before text
      const match = trimmed.match(/^(T\d+)\t(\w+)\s+(\d+)\s+(\d+)[\t\s](.+)$/)
      if (match) {
        components.push({
          id: match[1],
          type: match[2] as ComponentType,
          start: parseInt(match[3]),
          end: parseInt(match[4]),
          text: match[5],
        })
      }
    } else if (trimmed.startsWith("A")) {
      // Attribute: A1\tStance T2 Against
      const match = trimmed.match(/^A\d+\tStance\s+(T\d+)\s+(\w+)$/)
      if (match) {
        stances.push({
          componentId: match[1],
          stance: match[2] as StanceType,
        })
      }
    } else if (trimmed.startsWith("R")) {
      // Relation: R1\tsupports Arg1:T3 Arg2:T1
      const match = trimmed.match(/^(R\d+)\t(\w+)\s+Arg1:(T\d+)\s+Arg2:(T\d+)$/)
      if (match) {
        relations.push({
          id: match[1],
          type: match[2] as RelationType,
          from: match[3],
          to: match[4],
        })
      }
    }
  }

  return { components, stances, relations }
}
