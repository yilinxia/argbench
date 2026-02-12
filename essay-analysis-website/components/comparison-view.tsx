"use client"

import { useState } from "react"
import type { Essay, ArgumentComponent } from "@/lib/types"
import { cn } from "@/lib/utils"
import { VisualGraph } from "./visual-graph"
import { calculateIoU } from "@/lib/metrics"

interface ComparisonViewProps {
  essay: Essay
  mode: "segmentation" | "visual"
}

// Check if two ranges overlap
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1
}

// Calculate IoU (Intersection over Union) as percentage
function calculateIoUPercent(start1: number, end1: number, start2: number, end2: number): number {
  const iou = calculateIoU(start1, end1, start2, end2)
  return Math.round(iou * 100)
}

export function ComparisonView({ essay, mode }: ComparisonViewProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  
  const toggleTypeCollapse = (type: string) => {
    setCollapsedTypes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(type)) {
        newSet.delete(type)
      } else {
        newSet.add(type)
      }
      return newSet
    })
  }
  
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
  // Only keep matches with ≥50% IoU, treat <50% as "no match"
  const findOverlappingComponents = (gtComp: ArgumentComponent) => {
    return modelSources.map(source => {
      const overlapping = source.annotation.components
        .filter(comp => rangesOverlap(gtComp.start, gtComp.end, comp.start, comp.end))
        .map(comp => ({
          ...comp,
          iou: calculateIoUPercent(gtComp.start, gtComp.end, comp.start, comp.end)
        }))
        .filter(comp => comp.iou >= 50) // Only keep meaningful matches (IoU ≥50%)
        .sort((a, b) => b.iou - a.iou) // Sort by IoU descending
      
      return {
        modelName: source.name,
        components: overlapping
      }
    })
  }

  // Find model components that don't have meaningful IoU (≥50%) with ANY ground truth component
  const getModelOnlyComponentsByModel = () => {
    const result: Map<string, ArgumentComponent[]> = new Map()
    
    modelSources.forEach(source => {
      const modelOnlyComps = source.annotation.components.filter(modelComp => {
        // Check if this model component has ≥50% IoU with any GT component
        const hasMeaningfulOverlap = essay.groundTruth.components.some(gtComp => {
          if (!rangesOverlap(gtComp.start, gtComp.end, modelComp.start, modelComp.end)) {
            return false
          }
          const iou = calculateIoUPercent(gtComp.start, gtComp.end, modelComp.start, modelComp.end)
          return iou >= 50
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
          components: [{ ...referenceComp, iou: 100, isReference: true as const }]
        }
      }
      
      // Find overlapping model-only components from other models
      const otherModelComps = modelOnlyByModel.get(source.name) || []
      const overlapping = otherModelComps
        .filter(comp => rangesOverlap(referenceComp.start, referenceComp.end, comp.start, comp.end))
        .map(comp => ({
          ...comp,
          iou: calculateIoUPercent(referenceComp.start, referenceComp.end, comp.start, comp.end),
          isReference: false as const
        }))
        .sort((a, b) => b.iou - a.iou)
      
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

  // Check if all types are collapsed
  const allCollapsed = unifiedGroups.length > 0 && collapsedTypes.size === unifiedGroups.length

  return (
    <div className="space-y-4 w-full overflow-hidden">
      {/* Help toggle and explanation */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (allCollapsed) {
                setCollapsedTypes(new Set())
              } else {
                const allTypes = unifiedGroups.map(g => g.type)
                setCollapsedTypes(new Set(allTypes))
              }
            }}
            className="px-2 py-1 rounded-md text-xs transition-colors bg-muted text-muted-foreground hover:bg-muted/80 flex items-center gap-1"
          >
            <svg 
              className={cn(
                "w-3 h-3 transition-transform",
                allCollapsed ? "" : "rotate-90"
              )}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {allCollapsed ? "Expand All" : "Collapse All"}
          </button>
          {selectedRowId && (
            <button
              onClick={() => setSelectedRowId(null)}
              className="px-2 py-1 rounded-md text-xs transition-colors bg-primary/10 text-primary hover:bg-primary/20"
            >
              Clear Selection
            </button>
          )}
        </div>
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
        <div className="bg-muted/60 rounded-lg p-4 border border-border/50 space-y-3 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Table Structure:</span>{" "}
            Each row shows a Ground Truth component on the left, followed by any model components 
            that overlap with that text range (IoU ≥50%). Components are grouped by type (MajorClaim → Claim → Premise) 
            and sorted by their position in the text. Model-only components (no meaningful GT match) are also included 
            in the table with an empty GT cell. Click on type headers to expand/collapse sections. Click on any row to highlight it for easier tracking.
          </div>
          <div>
            <span className="font-semibold text-foreground">Match Threshold:</span>{" "}
            Only matches with IoU ≥50% are shown. Model components with IoU &lt;50% are treated as 
            "no match" and appear in the model-only section instead.
          </div>
          <div>
            <span className="font-semibold text-foreground">IoU Calculation (Intersection over Union):</span>{" "}
            IoU measures the overlap between two spans relative to their combined coverage. It's symmetric and penalizes both over-extension and under-coverage.
            <div className="mt-2 bg-card rounded p-2 font-mono text-[10px] border border-border">
              IoU = intersection / union = intersection / (span1 + span2 - intersection)
            </div>
          </div>
          <div>
            <span className="font-semibold text-foreground">Color Coding:</span>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><span className="text-emerald-600 dark:text-emerald-400">Green (IoU ≥80%)</span> — Strong match</li>
              <li><span className="text-amber-600 dark:text-amber-400">Amber (IoU 50-79%)</span> — Partial match</li>
              <li><span className="text-purple-600 dark:text-purple-400">Light Purple "type differs"</span> — Model classified the span as a different type</li>
              <li><span className="text-orange-600 dark:text-orange-400">Orange "no GT match"</span> — Model component with IoU &lt;50% with any Ground Truth</li>
            </ul>
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}>
        <div className="h-14 flex flex-col items-center justify-center px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg">
          <svg className="w-4 h-4 text-slate-600 dark:text-slate-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            Ground Truth
          </span>
        </div>
        {modelSources.map(source => (
          <div key={source.name} className="h-14 flex flex-col items-center justify-center px-3 py-2 bg-blue-100 dark:bg-blue-700 rounded-lg">
            <svg className="w-4 h-4 text-blue-600 dark:text-blue-200 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-bold text-blue-800 dark:text-white uppercase tracking-wider text-center">
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
            {/* Type header - clickable */}
            <button
              onClick={() => toggleTypeCollapse(group.type)}
              className="flex items-center gap-2 px-2 py-1 -mx-2 rounded hover:bg-muted/50 transition-colors w-full text-left"
            >
              <svg 
                className={cn(
                  "w-4 h-4 text-muted-foreground transition-transform",
                  collapsedTypes.has(group.type) ? "" : "rotate-90"
                )}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M9 5l7 7-7 7" 
                />
              </svg>
              <TypeBadge type={group.type} />
              <span className="text-xs text-muted-foreground">
                ({gtCount} GT{modelOnlyCount > 0 ? `, ${modelOnlyCount} model-only` : ""})
              </span>
            </button>

            {/* Rows - collapsible */}
            {!collapsedTypes.has(group.type) && (
              <div className="space-y-2">
                {group.rows.map((row) => {
                  if (row.rowType === 'gt') {
                const gtComp = row.gtComp
                const modelMatches = findOverlappingComponents(gtComp)
                
                return (
                  <div 
                    key={gtComp.id}
                    className={cn(
                      "grid gap-2 cursor-pointer transition-all duration-200 hover:opacity-90"
                    )}
                    style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}
                    onClick={() => setSelectedRowId(selectedRowId === gtComp.id ? null : gtComp.id)}
                  >
                    {/* Ground Truth component */}
                    <div className={cn(
                      "bg-card rounded-lg border p-3 min-w-0 overflow-hidden transition-colors",
                      selectedRowId === gtComp.id ? "border-2 border-slate-600 dark:border-slate-400" : "border-border"
                    )}>
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
                    {modelMatches.map(({ modelName, components }) => {
                      // Determine TP/FP/FN for this cell
                      // TP: at least one component with IoU >= 50% AND same type
                      // FP: components exist but don't qualify as TP (IoU < 50% OR wrong type)
                      // FN: GT component is not matched (no components OR no TP)
                      const hasTP = components.some(comp => comp.iou >= 50 && comp.type === gtComp.type)
                      const hasFP = components.length > 0 && !hasTP // Components exist but none are TP
                      const hasFN = !hasTP // GT not matched (either no components or no valid match)
                      
                      // Build label: can be "TP", "FN", or "FP+FN"
                      const cellLabel = hasTP ? "TP" : (hasFP ? "FP+FN" : "FN")
                      
                      return (
                        <div 
                          key={modelName}
                          className={cn(
                            "rounded-lg border p-3 min-w-0 overflow-hidden transition-colors relative",
                            components.length === 0 
                              ? "bg-gray-100 dark:bg-gray-800/30"
                              : "bg-card",
                            selectedRowId === gtComp.id 
                              ? "border-2 border-slate-600 dark:border-slate-400" 
                              : components.length === 0
                              ? "border-gray-200 dark:border-gray-700"
                              : "border-border"
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
                                      comp.iou >= 80 
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                        : comp.iou >= 50
                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                    )}
                                    title="IoU (Intersection over Union)"
                                  >
                                    {comp.iou}%
                                  </span>
                                </div>
                                <p className="text-xs text-foreground break-words">
                                  {comp.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Cell-level label in bottom right */}
                        {hasTP ? (
                          <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold text-emerald-600 dark:text-emerald-400">
                            TP
                          </span>
                        ) : hasFP ? (
                          <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold">
                            <span className="text-red-600 dark:text-red-400">FP</span>
                            <span className="text-muted-foreground">+</span>
                            <span className="text-amber-600 dark:text-amber-400">FN</span>
                          </span>
                        ) : (
                          <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold text-amber-600 dark:text-amber-400">
                            FN
                          </span>
                        )}
                      </div>
                    )})}
                  </div>
                )
              } else {
                // Model-only row - shows overlapping components from other models
                const { modelName, comp } = row
                const otherModelMatches = findOverlappingFromOtherModels(comp, modelName)
                
                return (
                  <div 
                    key={`model-only-${modelName}-${comp.id}`}
                    className={cn(
                      "grid gap-2 cursor-pointer transition-all duration-200 hover:opacity-90"
                    )}
                    style={{ gridTemplateColumns: `1fr repeat(${modelSources.length}, 1fr)` }}
                    onClick={() => setSelectedRowId(selectedRowId === `model-only-${modelName}-${comp.id}` ? null : `model-only-${modelName}-${comp.id}`)}
                  >
                    {/* Empty GT cell */}
                    <div className={cn(
                      "bg-gray-100 dark:bg-gray-800/30 rounded-lg border p-3 flex items-center justify-center min-w-0 transition-colors",
                      selectedRowId === `model-only-${modelName}-${comp.id}` 
                        ? "border-2 border-slate-600 dark:border-slate-400" 
                        : "border-gray-200 dark:border-gray-700"
                    )}>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        No GT match
                      </span>
                    </div>

                    {/* Model cells - show overlapping components from all models */}
                    {otherModelMatches.map(({ modelName: matchModelName, components }) => (
                      <div 
                        key={matchModelName}
                        className={cn(
                          "rounded-lg border p-3 min-w-0 overflow-hidden transition-colors relative",
                          components.length === 0 
                            ? "bg-gray-100 dark:bg-gray-800/30"
                            : "bg-card",
                          selectedRowId === `model-only-${modelName}-${comp.id}` 
                            ? "border-2 border-slate-600 dark:border-slate-400" 
                            : components.length === 0
                            ? "border-gray-200 dark:border-gray-700"
                            : "border-border"
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
                                </div>
                                <p className="text-xs text-foreground leading-relaxed break-words">
                                  {matchComp.text}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Cell-level FP label for model-only rows */}
                        {components.length > 0 && (
                          <span className="absolute bottom-1 right-1 text-[9px] px-1.5 py-0.5 rounded font-bold text-red-600 dark:text-red-400">
                            FP
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }
            })}
              </div>
            )}
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
