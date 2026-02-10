"use client"

import { useState } from "react"
import type { Essay, ArgumentComponent } from "@/lib/types"
import { cn } from "@/lib/utils"
import { VisualGraph } from "./visual-graph"

interface ComparisonViewProps {
  essay: Essay
  mode: "segmentation" | "visual"
}

// Check if two ranges overlap
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1
}

// Calculate overlap percentage
function overlapPercentage(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  if (overlapStart >= overlapEnd) return 0
  const overlapLength = overlapEnd - overlapStart
  const gtLength = end1 - start1
  return Math.round((overlapLength / gtLength) * 100)
}

export function ComparisonView({ essay, mode }: ComparisonViewProps) {
  const [showHelp, setShowHelp] = useState(false)
  
  const modelSources = essay.modelResults.map((m) => ({
    name: m.modelName,
    annotation: m.annotation,
  }))

  if (mode === "visual") {
    return <VisualComparisonView essay={essay} modelSources={modelSources} />
  }

  // Sort ground truth components by type then position
  const typeOrder: Record<string, number> = { MajorClaim: 0, Claim: 1, Premise: 2 }
  
  const sortedGtComponents = [...essay.groundTruth.components].sort((a, b) => {
    const typeOrderA = typeOrder[a.type] ?? 3
    const typeOrderB = typeOrder[b.type] ?? 3
    if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB
    if (a.start !== b.start) return a.start - b.start
    return a.end - b.end
  })

  // Find overlapping components from models for a given ground truth component
  // Only keep matches with ≥50% overlap, treat <50% as "no match"
  const findOverlappingComponents = (gtComp: ArgumentComponent) => {
    return modelSources.map(source => {
      const overlapping = source.annotation.components
        .filter(comp => rangesOverlap(gtComp.start, gtComp.end, comp.start, comp.end))
        .map(comp => ({
          ...comp,
          overlap: overlapPercentage(gtComp.start, gtComp.end, comp.start, comp.end)
        }))
        .filter(comp => comp.overlap >= 50) // Only keep meaningful matches (≥50%)
        .sort((a, b) => b.overlap - a.overlap) // Sort by overlap percentage descending
      
      return {
        modelName: source.name,
        components: overlapping
      }
    })
  }

  // Find model components that don't have meaningful overlap (≥50%) with ANY ground truth component
  const getModelOnlyComponentsByModel = () => {
    const result: Map<string, ArgumentComponent[]> = new Map()
    
    modelSources.forEach(source => {
      const modelOnlyComps = source.annotation.components.filter(modelComp => {
        // Check if this model component has ≥50% overlap with any GT component
        const hasMeaningfulOverlap = essay.groundTruth.components.some(gtComp => {
          if (!rangesOverlap(gtComp.start, gtComp.end, modelComp.start, modelComp.end)) {
            return false
          }
          const overlap = overlapPercentage(gtComp.start, gtComp.end, modelComp.start, modelComp.end)
          return overlap >= 50
        })
        return !hasMeaningfulOverlap
      })
      result.set(source.name, modelOnlyComps)
    })
    
    return result
  }

  const modelOnlyByModel = getModelOnlyComponentsByModel()

  // Find overlapping components from OTHER models for a model-only component
  const findOverlappingFromOtherModels = (referenceComp: ArgumentComponent, referenceModelName: string) => {
    return modelSources.map(source => {
      if (source.name === referenceModelName) {
        // Return the reference component itself for the source model
        return {
          modelName: source.name,
          components: [{ ...referenceComp, overlap: 100, isReference: true as const }]
        }
      }
      
      // Find overlapping model-only components from other models
      const otherModelComps = modelOnlyByModel.get(source.name) || []
      const overlapping = otherModelComps
        .filter(comp => rangesOverlap(referenceComp.start, referenceComp.end, comp.start, comp.end))
        .map(comp => ({
          ...comp,
          overlap: overlapPercentage(referenceComp.start, referenceComp.end, comp.start, comp.end),
          isReference: false as const
        }))
        .sort((a, b) => b.overlap - a.overlap)
      
      return {
        modelName: source.name,
        components: overlapping
      }
    })
  }

  // Collect all model-only components
  const allModelOnlyComps: { modelName: string; comp: ArgumentComponent }[] = []
  modelOnlyByModel.forEach((comps, modelName) => {
    comps.forEach(comp => {
      allModelOnlyComps.push({ modelName, comp })
    })
  })

  // Sort by position
  allModelOnlyComps.sort((a, b) => a.comp.start - b.comp.start)

  // Deduplicate across models: group overlapping components from DIFFERENT models into one row
  // But components from the SAME model should NOT be combined
  const usedModelOnlyComps = new Set<string>() // key: "modelName:compId"
  const deduplicatedModelOnlyRows: { modelName: string; comp: ArgumentComponent }[] = []

  for (const { modelName, comp } of allModelOnlyComps) {
    const key = `${modelName}:${comp.id}`
    if (usedModelOnlyComps.has(key)) continue

    // Check if this component overlaps with any component from a DIFFERENT model in an already-added row
    let alreadyCoveredByOtherModel = false
    for (const existing of deduplicatedModelOnlyRows) {
      // Only skip if it's from a DIFFERENT model and overlaps
      if (existing.modelName !== modelName && 
          rangesOverlap(existing.comp.start, existing.comp.end, comp.start, comp.end)) {
        alreadyCoveredByOtherModel = true
        break
      }
    }

    if (!alreadyCoveredByOtherModel) {
      deduplicatedModelOnlyRows.push({ modelName, comp })
      usedModelOnlyComps.add(key)
      
      // Mark overlapping components from OTHER models as used (they'll appear in this row)
      for (const { modelName: otherModelName, comp: otherComp } of allModelOnlyComps) {
        if (otherModelName !== modelName && 
            rangesOverlap(comp.start, comp.end, otherComp.start, otherComp.end)) {
          usedModelOnlyComps.add(`${otherModelName}:${otherComp.id}`)
        }
      }
    }
  }

  // Create unified rows: GT components + deduplicated model-only components
  type UnifiedRow = 
    | { rowType: 'gt'; gtComp: ArgumentComponent; position: number }
    | { rowType: 'model-only'; modelName: string; comp: ArgumentComponent; position: number }

  const allRows: UnifiedRow[] = []

  // Add GT component rows
  sortedGtComponents.forEach(gtComp => {
    allRows.push({ rowType: 'gt', gtComp, position: gtComp.start })
  })

  // Add deduplicated model-only component rows
  deduplicatedModelOnlyRows.forEach(({ modelName, comp }) => {
    allRows.push({ rowType: 'model-only', modelName, comp, position: comp.start })
  })

  // Group by component type and sort by position within each group
  const typeOrderArray = ["MajorClaim", "Claim", "Premise"]
  const unifiedGroups: { type: string; rows: UnifiedRow[] }[] = []

  // Get all unique types from both GT and model-only components
  const allTypes = new Set<string>()
  allRows.forEach(row => {
    if (row.rowType === 'gt') {
      allTypes.add(row.gtComp.type)
    } else {
      allTypes.add(row.comp.type)
    }
  })

  // Sort types by predefined order
  const sortedTypes = Array.from(allTypes).sort((a, b) => {
    const aIdx = typeOrderArray.indexOf(a)
    const bIdx = typeOrderArray.indexOf(b)
    if (aIdx === -1 && bIdx === -1) return a.localeCompare(b)
    if (aIdx === -1) return 1
    if (bIdx === -1) return -1
    return aIdx - bIdx
  })

  sortedTypes.forEach(type => {
    const rowsOfType = allRows.filter(row => {
      if (row.rowType === 'gt') return row.gtComp.type === type
      return row.comp.type === type
    }).sort((a, b) => a.position - b.position)

    if (rowsOfType.length > 0) {
      unifiedGroups.push({ type, rows: rowsOfType })
    }
  })

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Help toggle and explanation */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowHelp(!showHelp)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
            showHelp 
              ? "bg-primary text-primary-foreground" 
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          <svg 
            className="w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
          How it works
        </button>
      </div>

      {/* Collapsible explanation */}
      {showHelp && (
        <div className="bg-muted/30 rounded-lg p-4 border border-border/50 space-y-3 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Table Structure:</span>{" "}
            Each row shows a Ground Truth component on the left, followed by any model components 
            that overlap with that text range (≥50% overlap). Components are grouped by type (MajorClaim → Claim → Premise) 
            and sorted by their position in the text. Model-only components (no meaningful GT match) are also included 
            in the table with an empty GT cell.
          </div>
          <div>
            <span className="font-semibold text-foreground">Match Threshold:</span>{" "}
            Only matches with ≥50% overlap are shown. Model components with &lt;50% overlap are treated as 
            "no match" and appear in the model-only section instead.
          </div>
          <div>
            <span className="font-semibold text-foreground">Overlap Calculation:</span>{" "}
            The overlap percentage measures how much of the Ground Truth span is covered by a model's component.
            <div className="mt-2 bg-card rounded p-2 font-mono text-[10px] border border-border">
              overlap% = (intersection length / ground truth length) × 100
            </div>
          </div>
          <div>
            <span className="font-semibold text-foreground">Color Coding:</span>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><span className="text-emerald-600 dark:text-emerald-400">Green (≥80%)</span> — Strong match</li>
              <li><span className="text-amber-600 dark:text-amber-400">Amber (50-79%)</span> — Partial match</li>
              <li><span className="text-purple-600 dark:text-purple-400">Purple "type differs"</span> — Model classified the span as a different type</li>
              <li><span className="text-orange-600 dark:text-orange-400">Orange "no GT match"</span> — Model component with no meaningful (&lt;50%) Ground Truth overlap</li>
            </ul>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}>
        <div className="px-3 py-2 bg-muted/50 rounded-lg border border-border min-w-0">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Ground Truth
          </span>
        </div>
        {modelSources.map(source => (
          <div key={source.name} className="px-3 py-2 bg-muted/50 rounded-lg border border-border min-w-0">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider truncate block">
              {source.name}
            </span>
          </div>
        ))}
      </div>

      {/* Components grouped by type */}
      {unifiedGroups.map((group) => {
        const gtCount = group.rows.filter(r => r.rowType === 'gt').length
        const modelOnlyCount = group.rows.filter(r => r.rowType === 'model-only').length
        
        return (
          <div key={group.type} className="space-y-2">
            {/* Type header */}
            <div className="flex items-center gap-2 px-2">
              <TypeBadge type={group.type} />
              <span className="text-xs text-muted-foreground">
                ({gtCount} GT{modelOnlyCount > 0 ? `, ${modelOnlyCount} model-only` : ""})
              </span>
            </div>

            {/* Rows */}
            {group.rows.map((row) => {
              if (row.rowType === 'gt') {
                const gtComp = row.gtComp
                const modelMatches = findOverlappingComponents(gtComp)
                
                return (
                  <div 
                    key={gtComp.id}
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}
                  >
                    {/* Ground Truth component */}
                    <div className="bg-card rounded-lg border border-border p-3 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                        <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                          {gtComp.id}
                        </span>
                        <TypeBadge type={gtComp.type} />
                        <span className="text-[10px] text-muted-foreground font-mono">
                          [{gtComp.start}-{gtComp.end}]
                        </span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed break-words">
                        {gtComp.text}
                      </p>
                    </div>

                    {/* Model matches */}
                    {modelMatches.map(({ modelName, components }) => (
                      <div 
                        key={modelName}
                        className={cn(
                          "rounded-lg border p-3 min-w-0 overflow-hidden",
                          components.length === 0 
                            ? "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700"
                            : "bg-card border-border"
                        )}
                      >
                        {components.length === 0 ? (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              No match found
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {components.map((comp, idx) => (
                              <div 
                                key={comp.id}
                                className={cn(
                                  idx > 0 && "pt-2 border-t border-border/50"
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    {comp.id}
                                  </span>
                                  <TypeBadge type={comp.type} />
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    [{comp.start}-{comp.end}]
                                  </span>
                                  <span 
                                    className={cn(
                                      "text-[9px] px-1 py-0.5 rounded font-medium",
                                      comp.overlap >= 80 
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : comp.overlap >= 50
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                    )}
                                  >
                                    {comp.overlap}%
                                  </span>
                                  {comp.type !== gtComp.type && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">
                                      type differs
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-foreground break-words">
                                  {comp.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              } else {
                // Model-only row - shows overlapping components from other models
                const { modelName, comp } = row
                const otherModelMatches = findOverlappingFromOtherModels(comp, modelName)
                
                return (
                  <div 
                    key={`model-only-${modelName}-${comp.id}`}
                    className="grid gap-2"
                    style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}
                  >
                    {/* Empty GT cell */}
                    <div className="bg-gray-100 dark:bg-gray-800/30 rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-center min-w-0">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        No GT match
                      </span>
                    </div>

                    {/* Model cells - show overlapping components from all models */}
                    {otherModelMatches.map(({ modelName: matchModelName, components }) => (
                      <div 
                        key={matchModelName}
                        className={cn(
                          "rounded-lg border p-3 min-w-0 overflow-hidden",
                          components.length === 0 
                            ? "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700"
                            : "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/50"
                        )}
                      >
                        {components.length === 0 ? (
                          <div className="flex items-center justify-center h-full">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              —
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {components.map((matchComp, idx) => (
                              <div 
                                key={matchComp.id}
                                className={cn(
                                  idx > 0 && "pt-2 border-t border-border/50"
                                )}
                              >
                                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                  <span className="font-mono text-[10px] text-muted-foreground font-semibold">
                                    {matchComp.id}
                                  </span>
                                  <TypeBadge type={matchComp.type} />
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    [{matchComp.start}-{matchComp.end}]
                                  </span>
                                  <span className="text-[9px] px-1 py-0.5 rounded bg-orange-200 text-orange-800 dark:bg-orange-800/50 dark:text-orange-200 font-medium">
                                    no GT
                                  </span>
                                  {!matchComp.isReference && matchComp.type !== comp.type && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-medium">
                                      type differs
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-foreground leading-relaxed break-words">
                                  {matchComp.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
            })}
          </div>
        )
      })}
    </div>
  )
}

// Visual comparison view with graphs side by side
function VisualComparisonView({ 
  essay, 
  modelSources 
}: { 
  essay: Essay
  modelSources: { name: string; annotation: typeof essay.groundTruth }[] 
}) {
  const [highlightedComponent, setHighlightedComponent] = useState<string | null>(null)
  const [selectedModelIndex, setSelectedModelIndex] = useState(0)

  const selectedModel = modelSources[selectedModelIndex]
  const comparisonSources = [
    { name: "Ground Truth", annotation: essay.groundTruth },
    selectedModel
  ]

  return (
    <div className="space-y-4">
      {/* Model selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Compare Ground Truth with:
        </span>
        <div className="flex gap-1">
          {modelSources.map((source, idx) => (
            <button
              key={source.name}
              onClick={() => setSelectedModelIndex(idx)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                selectedModelIndex === idx
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {source.name}
            </button>
          ))}
        </div>
      </div>

      {/* Side by side graphs */}
      <div className="grid grid-cols-2 gap-6">
        {comparisonSources.map((source) => (
          <div key={source.name} className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground text-center border-b border-border pb-2">
              {source.name}
            </h4>
            <VisualGraph
              annotation={source.annotation}
              highlightedComponent={highlightedComponent}
              onComponentHover={setHighlightedComponent}
            />
          </div>
        ))}
      </div>

      {/* Relations comparison - side by side */}
      <div className="pt-4 border-t border-border">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Relations Comparison
        </h4>
        <div className="grid grid-cols-2 gap-6">
          {comparisonSources.map((source) => (
            <div
              key={source.name}
              className="bg-muted/30 rounded-lg p-4 border border-border/50"
            >
              <div className="text-xs font-semibold text-foreground mb-3">
                {source.name}
                <span className="ml-2 font-normal text-muted-foreground">
                  ({source.annotation.relations.length} relations)
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                {source.annotation.relations.map((rel) => (
                  <span
                    key={rel.id}
                    className="text-xs text-muted-foreground"
                  >
                    <span className="font-mono">{rel.from}</span>
                    <span
                      className={cn(
                        "mx-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium",
                        rel.type === "supports"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      )}
                    >
                      {rel.type}
                    </span>
                    <span className="font-mono">{rel.to}</span>
                  </span>
                ))}
                {source.annotation.relations.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No relations</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    MajorClaim: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    Claim: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    Premise: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  }

  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", colors[type])}>
      {type}
    </span>
  )
}
