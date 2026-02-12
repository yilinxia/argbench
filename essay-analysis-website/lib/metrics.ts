/**
 * Evaluation Metrics for Argument Mining
 * 
 * Implements three key metrics for comparing model annotations against ground truth:
 * 1. Exact Match Accuracy - strict boundary + label matching
 * 2. Krippendorff's αU (Unitized Alpha) - handles partial overlaps at character level
 * 3. F1 Score - precision/recall with exact and relaxed (IoU-based) matching
 */

import type { Annotation, AnnotationComponent } from "./types"

// =============================================================================
// Types
// =============================================================================

export interface ExactMatchResult {
  overall: { matched: number; total: number; accuracy: number }
  byType: Record<string, { matched: number; total: number; accuracy: number }>
}

export interface AlphaUResult {
  alpha: number
  observedAgreement: number
  perLabelAgreement: Record<string, number>
}

export interface F1Result {
  overall: { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }
  byType: Record<string, { precision: number; recall: number; f1: number; tp: number; fp: number; fn: number }>
}

export interface SegmentationMetrics {
  exactMatch: ExactMatchResult
  alphaU: AlphaUResult
  f1Exact: F1Result
  f1Relaxed50: F1Result  // IoU >= 0.50
  f1Relaxed75: F1Result  // IoU >= 0.75
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate Intersection over Union (IoU) for two spans.
 * IoU = intersection / union
 */
export function calculateIoU(
  start1: number, end1: number,
  start2: number, end2: number
): number {
  const intersectionStart = Math.max(start1, start2)
  const intersectionEnd = Math.min(end1, end2)
  const intersection = Math.max(0, intersectionEnd - intersectionStart)
  
  const union = (end1 - start1) + (end2 - start2) - intersection
  
  if (union === 0) return 0
  return intersection / union
}

/**
 * Calculate overlap percentage (how much of span1 is covered by span2).
 * This is directional: measures coverage of the first span.
 */
export function overlapPercentage(
  start1: number, end1: number,
  start2: number, end2: number
): number {
  const intersectionStart = Math.max(start1, start2)
  const intersectionEnd = Math.min(end1, end2)
  if (intersectionStart >= intersectionEnd) return 0
  
  const intersection = intersectionEnd - intersectionStart
  const span1Length = end1 - start1
  
  if (span1Length === 0) return 0
  return intersection / span1Length
}

/**
 * Check if two ranges overlap at all.
 */
export function rangesOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && start2 < end1
}

// =============================================================================
// METRIC 1: Exact Match Accuracy
// =============================================================================

/**
 * Calculate exact match accuracy.
 * 
 * A prediction matches ground truth if:
 * - Same start offset
 * - Same end offset  
 * - Same entity type (MajorClaim/Claim/Premise)
 * 
 * This is the strictest metric - even a 1-character boundary difference counts as wrong.
 * 
 * @example
 * Ground Truth: [0:27] "Students need more freedom" = Claim
 * Model Output: [0:27] "Students need more freedom" = Claim ✓ MATCH
 * Model Output: [0:28] "Students need more freedom." = Claim ✗ NO MATCH (boundary off by 1)
 */
export function exactMatchAccuracy(
  goldComponents: AnnotationComponent[],
  predComponents: AnnotationComponent[]
): ExactMatchResult {
  const types = ['MajorClaim', 'Claim', 'Premise']
  
  const result: ExactMatchResult = {
    overall: { matched: 0, total: 0, accuracy: 0 },
    byType: {}
  }
  
  // Initialize by-type results
  for (const type of types) {
    result.byType[type] = { matched: 0, total: 0, accuracy: 0 }
  }
  
  // Create lookup for predictions: (start, end, type) -> true
  const predLookup = new Set<string>()
  for (const pred of predComponents) {
    predLookup.add(`${pred.start}:${pred.end}:${pred.type}`)
  }
  
  // Check each ground truth component
  for (const gold of goldComponents) {
    const key = `${gold.start}:${gold.end}:${gold.type}`
    const matched = predLookup.has(key)
    
    result.overall.total++
    if (result.byType[gold.type]) {
      result.byType[gold.type].total++
    }
    
    if (matched) {
      result.overall.matched++
      if (result.byType[gold.type]) {
        result.byType[gold.type].matched++
      }
    }
  }
  
  // Calculate accuracies
  result.overall.accuracy = result.overall.total > 0 
    ? result.overall.matched / result.overall.total 
    : 0
  
  for (const type of types) {
    const t = result.byType[type]
    t.accuracy = t.total > 0 ? t.matched / t.total : 0
  }
  
  return result
}

// =============================================================================
// METRIC 2: Krippendorff's Alpha (Unitized)
// =============================================================================

/**
 * Convert span annotations to character-level labels.
 * 
 * Labels: 0=O (outside), 1=MajorClaim, 2=Claim, 3=Premise
 * 
 * This creates an array where each index represents a character position,
 * and the value represents the label at that position.
 */
function createCharacterLabels(
  components: AnnotationComponent[],
  textLength: number
): number[] {
  const labelMap: Record<string, number> = {
    'MajorClaim': 1,
    'Claim': 2,
    'Premise': 3
  }
  
  const labels = new Array(textLength).fill(0)
  
  for (const comp of components) {
    const label = labelMap[comp.type] ?? 0
    const start = Math.max(0, Math.min(comp.start, textLength))
    const end = Math.max(0, Math.min(comp.end, textLength))
    
    for (let i = start; i < end; i++) {
      labels[i] = label
    }
  }
  
  return labels
}

/**
 * Calculate Krippendorff's Alpha (Unitized) for span agreement.
 * 
 * αU measures agreement at the character/token level, accounting for
 * partial overlaps. It's more forgiving than exact match for minor
 * boundary differences.
 * 
 * Formula: αU = 1 - (observed disagreement / expected disagreement)
 * 
 * Interpretation:
 * - αU ≥ 0.80: Excellent - Model closely matches ground truth
 * - 0.67 ≤ αU < 0.80: Good - Acceptable, some boundary issues
 * - 0.60 ≤ αU < 0.67: Moderate - Needs improvement
 * - αU < 0.60: Poor - Model is unreliable
 * 
 * @example
 * Ground Truth: [0:20] "Students need freedom" = Claim
 * Model Output: [0:21] "Students need freedom." = Claim (includes period)
 * 
 * Exact Match: 0% (boundaries don't match exactly)
 * αU: ~0.95 (19/20 characters match, very high agreement)
 */
export function krippendorffAlphaU(
  goldComponents: AnnotationComponent[],
  predComponents: AnnotationComponent[],
  textLength: number
): AlphaUResult {
  if (textLength === 0) {
    return { alpha: 0, observedAgreement: 0, perLabelAgreement: {} }
  }
  
  const goldLabels = createCharacterLabels(goldComponents, textLength)
  const predLabels = createCharacterLabels(predComponents, textLength)
  
  // Calculate observed agreement (simple proportion)
  let agreements = 0
  for (let i = 0; i < textLength; i++) {
    if (goldLabels[i] === predLabels[i]) {
      agreements++
    }
  }
  const observedAgreement = agreements / textLength
  const observedDisagreement = 1 - observedAgreement
  
  // Calculate expected disagreement by chance
  // Based on marginal distributions of labels
  const allLabels = [...goldLabels, ...predLabels]
  const labelCounts = [0, 0, 0, 0] // O, MajorClaim, Claim, Premise
  for (const label of allLabels) {
    labelCounts[label]++
  }
  
  const total = allLabels.length
  if (total <= 1) {
    return { alpha: 0, observedAgreement, perLabelAgreement: {} }
  }
  
  // Expected agreement = sum(p_i^2) where p_i is proportion of label i
  let expectedAgreement = 0
  for (const count of labelCounts) {
    const proportion = count / total
    expectedAgreement += proportion * proportion
  }
  const expectedDisagreement = 1 - expectedAgreement
  
  // Alpha = 1 - (Do / De)
  let alpha: number
  if (expectedDisagreement === 0) {
    alpha = observedDisagreement === 0 ? 1 : 0
  } else {
    alpha = 1 - (observedDisagreement / expectedDisagreement)
  }
  
  // Per-label agreement (how much of each gold label was correctly predicted)
  const labelNames = ['O', 'MajorClaim', 'Claim', 'Premise']
  const perLabelAgreement: Record<string, number> = {}
  
  for (let labelIdx = 0; labelIdx < 4; labelIdx++) {
    const name = labelNames[labelIdx]
    let goldCount = 0
    let matchCount = 0
    
    for (let i = 0; i < textLength; i++) {
      if (goldLabels[i] === labelIdx) {
        goldCount++
        if (predLabels[i] === labelIdx) {
          matchCount++
        }
      }
    }
    
    if (goldCount > 0) {
      perLabelAgreement[name] = matchCount / goldCount
    }
  }
  
  return { alpha, observedAgreement, perLabelAgreement }
}

// =============================================================================
// METRIC 3: F1 Score (Exact and Relaxed)
// =============================================================================

/**
 * Calculate F1 score with exact matching.
 * 
 * A prediction is a True Positive only if boundaries AND type match exactly.
 * 
 * Components:
 * - Precision: Of all predictions, how many were correct?
 * - Recall: Of all ground truth, how many did we find?
 * - F1: Harmonic mean of precision and recall
 * 
 * @example
 * Ground Truth (3 components):
 *   [0:10] "Education" = Claim
 *   [15:30] "improves lives" = Premise  
 *   [35:50] "reduces poverty" = Premise
 * 
 * Model Output (4 predictions):
 *   [0:10] "Education" = Claim ✓ TP
 *   [15:30] "improves lives" = Premise ✓ TP
 *   [35:48] "reduces pover" = Premise ✗ FP (boundary off)
 *   [55:65] "everywhere" = Premise ✗ FP (hallucination)
 * 
 * TP=2, FP=2, FN=1
 * Precision = 2/4 = 0.50
 * Recall = 2/3 = 0.67
 * F1 = 0.57
 */
export function f1ScoreExact(
  goldComponents: AnnotationComponent[],
  predComponents: AnnotationComponent[]
): F1Result {
  const types = ['MajorClaim', 'Claim', 'Premise']
  
  const result: F1Result = {
    overall: { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 },
    byType: {}
  }
  
  // Initialize by-type results
  for (const type of types) {
    result.byType[type] = { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 }
  }
  
  // Overall: match on (start, end, type)
  const goldSet = new Set(goldComponents.map(c => `${c.start}:${c.end}:${c.type}`))
  const predSet = new Set(predComponents.map(c => `${c.start}:${c.end}:${c.type}`))
  
  for (const key of predSet) {
    if (goldSet.has(key)) {
      result.overall.tp++
    } else {
      result.overall.fp++
    }
  }
  result.overall.fn = goldSet.size - result.overall.tp
  
  // By type: match on (start, end) within same type
  for (const type of types) {
    const goldOfType = new Set(
      goldComponents.filter(c => c.type === type).map(c => `${c.start}:${c.end}`)
    )
    const predOfType = new Set(
      predComponents.filter(c => c.type === type).map(c => `${c.start}:${c.end}`)
    )
    
    let tp = 0
    for (const key of predOfType) {
      if (goldOfType.has(key)) tp++
    }
    
    result.byType[type].tp = tp
    result.byType[type].fp = predOfType.size - tp
    result.byType[type].fn = goldOfType.size - tp
  }
  
  // Calculate precision, recall, F1
  const calcMetrics = (r: { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }) => {
    r.precision = (r.tp + r.fp) > 0 ? r.tp / (r.tp + r.fp) : 0
    r.recall = (r.tp + r.fn) > 0 ? r.tp / (r.tp + r.fn) : 0
    r.f1 = (r.precision + r.recall) > 0 
      ? 2 * r.precision * r.recall / (r.precision + r.recall) 
      : 0
  }
  
  calcMetrics(result.overall)
  for (const type of types) {
    calcMetrics(result.byType[type])
  }
  
  return result
}

/**
 * Calculate F1 score with relaxed (IoU-based) matching.
 * 
 * A prediction is a True Positive if:
 * - IoU with a gold entity >= threshold
 * - Entity types match
 * 
 * This is more forgiving of minor boundary differences.
 * 
 * @param iouThreshold - Minimum IoU required for a match (0.5 = 50% overlap)
 * 
 * @example
 * Ground Truth: [0:20] "Students need freedom" = Claim
 * Model Output: [0:21] "Students need freedom." = Claim
 * 
 * IoU = 20 / 21 ≈ 0.95
 * 
 * With threshold 0.50: ✓ Match (0.95 >= 0.50)
 * With threshold 0.75: ✓ Match (0.95 >= 0.75)
 */
export function f1ScoreRelaxed(
  goldComponents: AnnotationComponent[],
  predComponents: AnnotationComponent[],
  iouThreshold: number = 0.5
): F1Result {
  const types = ['MajorClaim', 'Claim', 'Premise']
  
  const result: F1Result = {
    overall: { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 },
    byType: {}
  }
  
  // Initialize by-type results
  for (const type of types) {
    result.byType[type] = { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 }
  }
  
  // Helper: greedy matching for a list of gold and pred components
  const greedyMatch = (
    goldList: AnnotationComponent[],
    predList: AnnotationComponent[],
    requireTypeMatch: boolean
  ): { tp: number; fp: number; fn: number } => {
    const matchedGold = new Set<number>()
    let tp = 0
    
    for (const pred of predList) {
      let bestIoU = 0
      let bestGoldIdx: number | null = null
      
      for (let i = 0; i < goldList.length; i++) {
        if (matchedGold.has(i)) continue
        
        const gold = goldList[i]
        if (requireTypeMatch && pred.type !== gold.type) continue
        
        const iou = calculateIoU(pred.start, pred.end, gold.start, gold.end)
        if (iou > bestIoU) {
          bestIoU = iou
          bestGoldIdx = i
        }
      }
      
      if (bestIoU >= iouThreshold && bestGoldIdx !== null) {
        tp++
        matchedGold.add(bestGoldIdx)
      }
    }
    
    return {
      tp,
      fp: predList.length - tp,
      fn: goldList.length - tp
    }
  }
  
  // Overall matching (type must match)
  const overallResult = greedyMatch(goldComponents, predComponents, true)
  result.overall.tp = overallResult.tp
  result.overall.fp = overallResult.fp
  result.overall.fn = overallResult.fn
  
  // By-type matching
  for (const type of types) {
    const goldOfType = goldComponents.filter(c => c.type === type)
    const predOfType = predComponents.filter(c => c.type === type)
    
    const typeResult = greedyMatch(goldOfType, predOfType, false)
    result.byType[type].tp = typeResult.tp
    result.byType[type].fp = typeResult.fp
    result.byType[type].fn = typeResult.fn
  }
  
  // Calculate precision, recall, F1
  const calcMetrics = (r: { tp: number; fp: number; fn: number; precision: number; recall: number; f1: number }) => {
    r.precision = (r.tp + r.fp) > 0 ? r.tp / (r.tp + r.fp) : 0
    r.recall = (r.tp + r.fn) > 0 ? r.tp / (r.tp + r.fn) : 0
    r.f1 = (r.precision + r.recall) > 0 
      ? 2 * r.precision * r.recall / (r.precision + r.recall) 
      : 0
  }
  
  calcMetrics(result.overall)
  for (const type of types) {
    calcMetrics(result.byType[type])
  }
  
  return result
}

// =============================================================================
// Main Evaluation Function
// =============================================================================

/**
 * Calculate all segmentation metrics for comparing model output to ground truth.
 * 
 * @param groundTruth - Ground truth annotation
 * @param prediction - Model prediction annotation
 * @param textLength - Length of the essay text (for αU calculation)
 * @returns All metrics: exact match, αU, F1 (exact), F1 (relaxed 50%), F1 (relaxed 75%)
 */
export function calculateSegmentationMetrics(
  groundTruth: Annotation,
  prediction: Annotation,
  textLength: number
): SegmentationMetrics {
  return {
    exactMatch: exactMatchAccuracy(groundTruth.components, prediction.components),
    alphaU: krippendorffAlphaU(groundTruth.components, prediction.components, textLength),
    f1Exact: f1ScoreExact(groundTruth.components, prediction.components),
    f1Relaxed50: f1ScoreRelaxed(groundTruth.components, prediction.components, 0.5),
    f1Relaxed75: f1ScoreRelaxed(groundTruth.components, prediction.components, 0.75)
  }
}

/**
 * Get interpretation text for αU score.
 */
export function interpretAlphaU(alpha: number): { level: string; description: string; color: string } {
  if (alpha >= 0.80) {
    return { 
      level: 'Excellent', 
      description: 'Model closely matches ground truth',
      color: 'text-emerald-600 dark:text-emerald-400'
    }
  } else if (alpha >= 0.67) {
    return { 
      level: 'Good', 
      description: 'Acceptable, some boundary issues',
      color: 'text-blue-600 dark:text-blue-400'
    }
  } else if (alpha >= 0.60) {
    return { 
      level: 'Moderate', 
      description: 'Needs improvement',
      color: 'text-amber-600 dark:text-amber-400'
    }
  } else {
    return { 
      level: 'Poor', 
      description: 'Model is unreliable',
      color: 'text-red-600 dark:text-red-400'
    }
  }
}

/**
 * Format a number as a percentage string.
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Format a number with fixed decimals.
 */
export function formatNumber(value: number, decimals: number = 3): string {
  return value.toFixed(decimals)
}
