"use client"

import { useState, useEffect, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import { parseBrat } from "@/lib/parse-brat"
import { EssayViewer } from "@/components/essay-viewer"
import { ComparisonView } from "@/components/comparison-view"
import { 
  calculateSegmentationMetrics, 
  interpretAlphaU, 
  formatPercent,
  formatNumber 
} from "@/lib/metrics"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Essay, ModelResult } from "@/lib/types"

interface LogRun {
  model: string
  modelDisplayName: string
  timestamp: string
  folder: string
  displayName: string
  prompt: string | null
}

interface RunGroup {
  id: string
  name: string
  description: string
  runs: Record<string, string>
}

interface RunGroupsConfig {
  groups: RunGroup[]
}

interface EssayData {
  id: string
  name: string
  text: string
  goldAnnotation: string | null
}

// Helper to check if two ranges overlap
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1
}

// Calculate overlap percentage (how much of range1 is covered by range2)
function overlapPercentage(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  const overlapLength = Math.max(0, overlapEnd - overlapStart)
  const range1Length = end1 - start1
  return range1Length > 0 ? Math.round((overlapLength / range1Length) * 100) : 0
}

// Segmentation stats component - improved with proper metrics
function EssaySegmentationStats({ essay, overallF1Stats }: { 
  essay: Essay
  overallF1Stats?: Record<string, { f1: number; precision: number; recall: number; essayCount: number }>
}) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const gt = essay.groundTruth
  const models = essay.modelResults
  const textLength = essay.text.length

  // Calculate proper metrics for each model
  const modelMetrics = useMemo(() => {
    return models.map(model => {
      const metrics = calculateSegmentationMetrics(gt, model.annotation, textLength)
      return {
        name: model.modelName,
        modelId: model.modelId,
        total: model.annotation.components.length,
        metrics
      }
    })
  }, [models, gt, textLength])

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors",
              !isCollapsed 
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
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" 
              />
            </svg>
            Evaluation Metrics
          </button>
          <div className="text-sm text-muted-foreground">
            Ground Truth: <span className="font-mono font-medium">{gt.components.length}</span> components
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCollapsed && (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {modelMetrics.map(m => {
                const alpha = m.metrics.alphaU.alpha
                const interpretation = interpretAlphaU(alpha)
                return (
                  <span key={m.name} className="flex items-center gap-1">
                    <span className="font-medium">{m.name}:</span>
                    <span className={interpretation.color}>αU={formatNumber(alpha, 2)}</span>
                    <span className="text-muted-foreground">F1={formatPercent(m.metrics.f1Relaxed50.overall.f1, 0)}</span>
                  </span>
                )
              })}
            </div>
          )}
          {/* Help button */}
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
      </div>

      {/* Help panel - collapsible */}
      {showHelp && (
        <div className="mb-3 bg-muted/60 rounded-lg p-4 border border-border/50 space-y-3 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Exact Match:</span>{" "}
            Requires exact start/end boundaries AND correct type. Even 1 character off = no match. 
            This is the strictest metric.
          </div>
          <div>
            <span className="font-semibold text-foreground">αU (Krippendorff's Alpha Unitized):</span>{" "}
            Character-level agreement that tolerates partial overlaps. Think of the text as a sequence of characters, 
            and αU checks agreement at each position.
            
            <div className="mt-2 bg-card rounded p-3 border border-border space-y-2">
              <div className="font-medium text-foreground text-[11px]">Example:</div>
              <div className="font-mono text-[10px] leading-relaxed">
                <div>Text: <span className="text-foreground">"Students need more freedom because it builds independence"</span></div>
                <div className="mt-1.5">
                  <span className="text-muted-foreground">GT Label:    </span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="text-muted-foreground px-0.5">O</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-muted-foreground">Model Label: </span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-0.5">Claim</span>
                  <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-0.5">Claim</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-0.5">Prem</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-muted-foreground">Agreement:   </span>
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                  <span className="text-red-600 dark:text-red-400 ml-2.5">✗</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                  <span className="text-emerald-600 dark:text-emerald-400 ml-3">✓</span>
                </div>
              </div>
              <div className="text-[10px] mt-2 pt-2 border-t border-border/50">
                <span className="text-foreground font-medium">Result:</span> 7/8 positions agree → <span className="text-emerald-600 dark:text-emerald-400 font-medium">αU ≈ 0.87</span> (Good)
                <div className="mt-1 text-muted-foreground">
                  The model included "because" in the Claim (boundary error), but αU still shows high agreement 
                  because most characters match. Exact Match would be 0% for this component.
                </div>
              </div>
            </div>
            
            <div className="mt-2">Interpretation:</div>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><span className="text-emerald-600 dark:text-emerald-400">αU ≥ 0.80</span> — Excellent agreement</li>
              <li><span className="text-blue-600 dark:text-blue-400">0.67 ≤ αU &lt; 0.80</span> — Good agreement</li>
              <li><span className="text-amber-600 dark:text-amber-400">0.60 ≤ αU &lt; 0.67</span> — Moderate agreement</li>
              <li><span className="text-red-600 dark:text-red-400">αU &lt; 0.60</span> — Poor agreement</li>
            </ul>
          </div>
          <div>
            <span className="font-semibold text-foreground">F1 Score:</span>{" "}
            Harmonic mean of Precision and Recall. Balances correctness vs completeness.
            <div className="mt-2 bg-card rounded p-2 font-mono text-[10px] border border-border">
              F1 = 2 × (Precision × Recall) / (Precision + Recall)
            </div>
            <div className="mt-2">
              <strong>Exact F1:</strong> Requires exact boundary match. <strong>Relaxed F1:</strong> Allows partial overlap using IoU (Intersection over Union).
            </div>
            
            <div className="mt-2 bg-card rounded p-3 border border-border space-y-2">
              <div className="font-medium text-foreground text-[11px]">IoU (Intersection over Union):</div>
              <div className="font-mono text-[10px] bg-muted/50 rounded p-2">
                IoU = Intersection / Union = Intersection / (Span1 + Span2 - Intersection)
              </div>
              <div className="font-mono text-[10px] leading-relaxed mt-2">
                <div className="text-muted-foreground mb-1">Example:</div>
                <div>GT span:    <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1">[0-20]</span> "Students need freedom" (20 chars)</div>
                <div>Model span: <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[0-25]</span> "Students need freedom...." (25 chars)</div>
                <div className="mt-1.5 pt-1.5 border-t border-border/50">
                  <div>Intersection: <span className="font-medium text-foreground">20</span> chars (overlap)</div>
                  <div>Union: 20 + 25 - 20 = <span className="font-medium text-foreground">25</span> chars</div>
                  <div>IoU = 20 / 25 = <span className="text-emerald-600 dark:text-emerald-400 font-medium">0.80 (80%)</span></div>
                </div>
              </div>
              <div className="text-[10px] mt-2 pt-2 border-t border-border/50 text-muted-foreground">
                With <strong>IoU ≥ 50%</strong> threshold: This is a match ✓<br/>
                With <strong>IoU ≥ 75%</strong> threshold: This is a match ✓<br/>
                <strong>Exact Match:</strong> Not a match ✗ (boundaries differ)
              </div>
            </div>
          </div>
          <div>
            <span className="font-semibold text-foreground">TP/FP/FN (with Relaxed Matching):</span>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><span className="text-emerald-600 dark:text-emerald-400">TP (True Positives)</span> — Correctly identified (IoU ≥ threshold AND same type)</li>
              <li><span className="text-red-600 dark:text-red-400">FP (False Positives)</span> — Wrong prediction (IoU &lt; threshold OR wrong type OR no GT overlap)</li>
              <li><span className="text-amber-600 dark:text-amber-400">FN (False Negatives)</span> — Missed GT (no model prediction with IoU ≥ threshold AND same type)</li>
            </ul>
            
            <div className="mt-2 bg-card rounded p-3 border border-border space-y-2">
              <div className="font-medium text-foreground text-[11px]">Example (with IoU ≥ 50% threshold):</div>
              <div className="font-mono text-[10px] leading-relaxed">
                <div className="text-muted-foreground mb-1.5">Ground Truth (4 components):</div>
                <div className="ml-2 space-y-0.5">
                  <div><span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1">[0-20]</span> "Education is important" = <span className="font-semibold">Claim</span></div>
                  <div><span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1">[25-50]</span> "it improves job prospects" = <span className="font-semibold">Premise</span></div>
                  <div><span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1">[55-80]</span> "and builds critical thinking" = <span className="font-semibold">Premise</span></div>
                  <div><span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1">[85-110]</span> "skills are essential today" = <span className="font-semibold">Premise</span></div>
                </div>
                <div className="text-muted-foreground mt-2 mb-1.5">Model Output (5 predictions):</div>
                <div className="ml-2 space-y-0.5">
                  <div><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[0-20]</span> = <span className="font-semibold">Claim</span> <span className="text-emerald-600 dark:text-emerald-400">✓ TP</span> <span className="text-muted-foreground">(IoU=100%, type matches)</span></div>
                  <div><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[25-48]</span> = <span className="font-semibold">Premise</span> <span className="text-emerald-600 dark:text-emerald-400">✓ TP</span> <span className="text-muted-foreground">(IoU=92%, type matches)</span></div>
                  <div><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[55-60]</span> = <span className="font-semibold">Premise</span> <span className="text-red-600 dark:text-red-400">✗ FP</span> <span className="text-muted-foreground">(IoU=20% &lt; 50%)</span></div>
                  <div><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[85-110]</span> = <span className="font-semibold text-purple-600 dark:text-purple-400">Claim</span> <span className="text-red-600 dark:text-red-400">✗ FP</span> <span className="text-muted-foreground">(IoU=100% but <span className="text-purple-600 dark:text-purple-400">wrong type</span>: Claim ≠ Premise)</span></div>
                  <div><span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1">[120-140]</span> = <span className="font-semibold">Claim</span> <span className="text-red-600 dark:text-red-400">✗ FP</span> <span className="text-muted-foreground">(IoU=0%, hallucination)</span></div>
                </div>
                <div className="text-muted-foreground mt-2 mb-1.5">Unmatched GT:</div>
                <div className="ml-2 space-y-0.5">
                  <div><span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1">[55-80]</span> <span className="text-amber-600 dark:text-amber-400">✗ FN</span> <span className="text-muted-foreground">(model's [55-60] had IoU &lt; 50%)</span></div>
                  <div><span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1">[85-110]</span> <span className="text-amber-600 dark:text-amber-400">✗ FN</span> <span className="text-muted-foreground">(model predicted wrong type)</span></div>
                </div>
              </div>
              <div className="text-[10px] mt-2 pt-2 border-t border-border/50">
                <span className="text-foreground font-medium">Result:</span>{" "}
                <span className="text-emerald-600 dark:text-emerald-400">TP=2</span>{" / "}
                <span className="text-red-600 dark:text-red-400">FP=3</span>{" / "}
                <span className="text-amber-600 dark:text-amber-400">FN=2</span>
                <div className="mt-1 text-muted-foreground">
                  Precision = 2/(2+3) = 40% • Recall = 2/(2+2) = 50% • F1 = 44%
                </div>
                <div className="mt-1 text-muted-foreground italic">
                  A match requires BOTH: IoU ≥ 50% AND correct type. High IoU with wrong type still counts as FP + FN.
                </div>
              </div>
            </div>
          </div>
          <div>
            <span className="font-semibold text-foreground">Precision vs Recall:</span>
            <ul className="mt-1 ml-4 list-disc space-y-0.5">
              <li><strong>Precision</strong> = TP / (TP + FP) — "Of what the model found, how much was correct?"</li>
              <li><strong>Recall</strong> = TP / (TP + FN) — "Of what exists in GT, how much did the model find?"</li>
            </ul>
          </div>
        </div>
      )}
      
      {/* Model stats - collapsible */}
      {!isCollapsed && (
        <div className="space-y-3">
          {/* Quick summary cards */}
          <div className="p-3 bg-muted/60 rounded-lg border border-border">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${modelMetrics.length}, 1fr)` }}>
              {modelMetrics.map(({ name, modelId, total, metrics }) => {
                const alphaInterpretation = interpretAlphaU(metrics.alphaU.alpha)
                const overallF1 = overallF1Stats?.[modelId]
                
                return (
                  <div key={name} className="bg-card rounded-md px-3 py-2 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground text-sm">{name}</span>
                    </div>
                    
                    {/* Key metrics in a compact grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      {/* Exact Match */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>Exact Match:</span>
                        <span className={cn(
                          "font-mono font-medium",
                          metrics.exactMatch.overall.accuracy >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                          metrics.exactMatch.overall.accuracy >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {formatPercent(metrics.exactMatch.overall.accuracy, 0)}
                        </span>
                      </div>
                      
                      {/* Alpha U */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>αU:</span>
                        <span className={cn("font-mono font-medium", alphaInterpretation.color)}>
                          {formatNumber(metrics.alphaU.alpha, 3)}
                        </span>
                      </div>
                      
                      {/* F1 Exact */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>F1 (Exact):</span>
                        <span className={cn(
                          "font-mono font-medium",
                          metrics.f1Exact.overall.f1 >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                          metrics.f1Exact.overall.f1 >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {formatPercent(metrics.f1Exact.overall.f1, 0)}
                        </span>
                      </div>
                      
                      {/* F1 Relaxed 50% */}
                      <div className="flex justify-between text-muted-foreground">
                        <span>F1 (IoU≥50%):</span>
                        <span className={cn(
                          "font-mono font-medium",
                          metrics.f1Relaxed50.overall.f1 >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                          metrics.f1Relaxed50.overall.f1 >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {formatPercent(metrics.f1Relaxed50.overall.f1, 0)}
                        </span>
                      </div>
                      
                      {/* Precision/Recall */}
                      <div className="flex justify-between text-muted-foreground col-span-2 pt-1 border-t border-border/50">
                        <span>P/R (IoU≥50%):</span>
                        <span className="font-mono">
                          {formatPercent(metrics.f1Relaxed50.overall.precision, 0)} / {formatPercent(metrics.f1Relaxed50.overall.recall, 0)}
                        </span>
                      </div>
                      
                      {/* Component counts */}
                      <div className="flex justify-between text-muted-foreground col-span-2">
                        <span>TP/FP/FN:</span>
                        <span className="font-mono text-[10px]">
                          <span className="text-emerald-600 dark:text-emerald-400">{metrics.f1Relaxed50.overall.tp}</span>
                          {" / "}
                          <span className="text-red-600 dark:text-red-400">{metrics.f1Relaxed50.overall.fp}</span>
                          {" / "}
                          <span className="text-amber-600 dark:text-amber-400">{metrics.f1Relaxed50.overall.fn}</span>
                        </span>
                      </div>
                    </div>
                    
                    {/* Per-component type breakdown */}
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <div className="text-[10px] font-medium text-muted-foreground mb-1.5">Per Component Type (F1 IoU≥50%)</div>
                      <div className="grid grid-cols-3 gap-1">
                        {['MajorClaim', 'Claim', 'Premise'].map(type => {
                          const f1Data = metrics.f1Relaxed50.byType[type]
                          const exactData = metrics.exactMatch.byType[type]
                          return (
                            <div key={type} className="bg-muted/40 rounded px-1.5 py-1">
                              <div className="text-[9px] font-medium text-foreground truncate" title={type}>
                                {type === 'MajorClaim' ? 'Major' : type}
                              </div>
                              <div className={cn(
                                "text-sm font-bold",
                                (f1Data?.f1 ?? 0) >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                                (f1Data?.f1 ?? 0) >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                                "text-red-600 dark:text-red-400"
                              )}>
                                {formatPercent(f1Data?.f1 ?? 0, 0)}
                              </div>
                              <div className="text-[8px] text-muted-foreground">
                                {f1Data?.tp ?? 0}/{f1Data?.fp ?? 0}/{f1Data?.fn ?? 0}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [logRuns, setLogRuns] = useState<LogRun[]>([])
  const [essays, setEssays] = useState<EssayData[]>([])
  const [selectedEssayId, setSelectedEssayId] = useState<string>("")
  const [selectedRuns, setSelectedRuns] = useState<Record<string, string>>({}) // model -> folder
  const [modelAnnotations, setModelAnnotations] = useState<Record<string, string>>({}) // folder -> annotation
  const [essayStats, setEssayStats] = useState<Record<string, { maxF1: number; minF1: number | null }>>({})
  const [overallF1Stats, setOverallF1Stats] = useState<Record<string, { f1: number; precision: number; recall: number; essayCount: number }>>({})
  const [mainTab, setMainTab] = useState("explore")
  const [loading, setLoading] = useState(true)
  const [promptViewMode, setPromptViewMode] = useState<"raw" | "markdown">("markdown")
  const [essaySortOrder, setEssaySortOrder] = useState<"default" | "bestF1" | "worstF1">("default")
  const [comparisonMode, setComparisonMode] = useState<"cross-model" | "time-series">("cross-model")
  const [selectedModelForTimeSeries, setSelectedModelForTimeSeries] = useState<string>("")
  const [selectedTimestamps, setSelectedTimestamps] = useState<string[]>([]) // For time-series mode
  const [runGroups, setRunGroups] = useState<RunGroup[]>([]) // Predefined run groups

  // Group runs by model
  const runsByModel = logRuns.reduce((acc, run) => {
    if (!acc[run.model]) {
      acc[run.model] = []
    }
    acc[run.model].push(run)
    return acc
  }, {} as Record<string, LogRun[]>)

  const modelNames = Object.keys(runsByModel).sort()

  // Check if all selected runs have the same prompt
  const promptInfo = useMemo(() => {
    const prompts: { model: string; prompt: string | null }[] = []
    
    for (const model of modelNames) {
      const folder = selectedRuns[model]
      const run = logRuns.find(r => r.folder === folder)
      prompts.push({ model, prompt: run?.prompt || null })
    }
    
    const nonNullPrompts = prompts.filter(p => p.prompt !== null)
    
    if (nonNullPrompts.length === 0) {
      return { prompt: null, isConsistent: true, error: null }
    }
    
    const firstPrompt = nonNullPrompts[0].prompt
    const allSame = nonNullPrompts.every(p => p.prompt === firstPrompt)
    
    if (!allSame) {
      const differentModels = nonNullPrompts
        .filter(p => p.prompt !== firstPrompt)
        .map(p => p.model)
      return {
        prompt: firstPrompt,
        isConsistent: false,
        error: `Prompts differ across models: ${differentModels.join(", ")} have different prompts than ${nonNullPrompts[0].model}`
      }
    }
    
    return { prompt: firstPrompt, isConsistent: true, error: null }
  }, [modelNames, selectedRuns, logRuns])

  // Determine which group is currently selected
  const currentGroupId = useMemo(() => {
    if (runGroups.length === 0) return null
    
    // Check if current selectedRuns matches any group
    for (const group of runGroups) {
      const matches = Object.entries(group.runs).every(([model, folder]) => 
        selectedRuns[model] === folder
      )
      if (matches) return group.id
    }
    
    return null
  }, [runGroups, selectedRuns])

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/data")
        const data = await res.json()
        
        setLogRuns(data.runs || [])
        setEssays(data.essays || [])
        
        // Load run groups
        try {
          const groupsRes = await fetch("/config/run-groups.json")
          const groupsData: RunGroupsConfig = await groupsRes.json()
          setRunGroups(groupsData.groups || [])
        } catch (error) {
          console.error("Failed to load run groups:", error)
          // Continue without groups
        }
        
        // Set default selections
        if (data.essays?.length > 0) {
          setSelectedEssayId(data.essays[0].id)
        }
        
        // Set default run for each model (newest)
        const defaultRuns: Record<string, string> = {}
        const runsByModelTemp = (data.runs || []).reduce((acc: Record<string, LogRun[]>, run: LogRun) => {
          if (!acc[run.model]) {
            acc[run.model] = []
          }
          acc[run.model].push(run)
          return acc
        }, {})
        
        for (const model of Object.keys(runsByModelTemp)) {
          if (runsByModelTemp[model].length > 0) {
            defaultRuns[model] = runsByModelTemp[model][0].folder
          }
        }
        setSelectedRuns(defaultRuns)
        
      } catch (error) {
        console.error("Failed to load data:", error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Load annotations when essay or selected runs change
  useEffect(() => {
    if (!selectedEssayId) return
    
    // Determine which runs to load based on mode
    let runsToLoad: string[] = []
    
    if (comparisonMode === "cross-model") {
      if (Object.keys(selectedRuns).length === 0) return
      runsToLoad = Object.values(selectedRuns)
    } else {
      // Time series mode
      if (selectedTimestamps.length === 0) return
      runsToLoad = selectedTimestamps
    }
    
    // Clear previous annotations immediately when essay changes
    setModelAnnotations({})
    
    async function loadAnnotations() {
      const annotations: Record<string, string> = {}
      
      // Load all annotations in parallel
      const promises = runsToLoad.map(async (folder) => {
        try {
          const res = await fetch(`/api/data?action=annotation&logFolder=${folder}&essayId=${selectedEssayId}`)
          const data = await res.json()
          if (data.annotation) {
            annotations[folder] = data.annotation
          }
        } catch (error) {
          console.error(`Failed to load annotation for ${folder}:`, error)
        }
      })
      
      await Promise.all(promises)
      setModelAnnotations(annotations)
    }
    
    loadAnnotations()
  }, [selectedEssayId, selectedRuns, comparisonMode, selectedTimestamps])

  // Load stats for all essays when runs change
  useEffect(() => {
    // Determine which runs to use based on mode
    const runsToUse = comparisonMode === "cross-model" 
      ? selectedRuns 
      : selectedTimestamps.reduce((acc, folder) => {
          acc[folder] = folder
          return acc
        }, {} as Record<string, string>)
    
    if (Object.keys(runsToUse).length === 0) return
    
    async function loadStats() {
      try {
        const runsParam = encodeURIComponent(JSON.stringify(runsToUse))
        const res = await fetch(`/api/data?action=stats&runs=${runsParam}`)
        const data = await res.json()
        
        if (data.stats) {
          const statsMap: Record<string, { maxF1: number; minF1: number | null }> = {}
          for (const stat of data.stats) {
            statsMap[stat.essayId] = {
              maxF1: stat.maxF1,
              minF1: stat.minF1
            }
          }
          setEssayStats(statsMap)
        }
      } catch (error) {
        console.error("Failed to load stats:", error)
      }
    }
    
    loadStats()
  }, [selectedRuns, selectedTimestamps, comparisonMode])

  // Load overall F1 scores when runs change
  useEffect(() => {
    // Determine which runs to use based on mode
    const runsToUse = comparisonMode === "cross-model" 
      ? selectedRuns 
      : selectedTimestamps.reduce((acc, folder) => {
          acc[folder] = folder
          return acc
        }, {} as Record<string, string>)
    
    if (Object.keys(runsToUse).length === 0) return
    
    async function loadOverallF1() {
      try {
        const runsParam = encodeURIComponent(JSON.stringify(runsToUse))
        const keyByFolder = comparisonMode === "time-series"
        const res = await fetch(`/api/data?action=overallF1&runs=${runsParam}&keyByFolder=${keyByFolder}`)
        const data = await res.json()
        
        if (data.overallF1) {
          const f1Map: Record<string, { f1: number; precision: number; recall: number; essayCount: number }> = {}
          for (const stat of data.overallF1) {
            f1Map[stat.model] = {
              f1: stat.f1,
              precision: stat.precision,
              recall: stat.recall,
              essayCount: stat.essayCount
            }
          }
          setOverallF1Stats(f1Map)
        }
      } catch (error) {
        console.error("Failed to load overall F1:", error)
      }
    }
    
    loadOverallF1()
  }, [selectedRuns, selectedTimestamps, comparisonMode])

  // Filter essays based on what's available in selected runs
  const [availableEssayIds, setAvailableEssayIds] = useState<Set<string>>(new Set())
  
  // Load available essays when selected runs change
  useEffect(() => {
    if (Object.keys(selectedRuns).length === 0) return
    
    async function loadAvailableEssays() {
      const essayIds = new Set<string>()
      
      // Check which essays are available across all selected runs
      const promises = Object.entries(selectedRuns).map(async ([model, folder]) => {
        try {
          const res = await fetch(`/api/data?action=availableEssays&logFolder=${folder}`)
          const data = await res.json()
          if (data.essayIds) {
            return data.essayIds as string[]
          }
        } catch (error) {
          console.error(`Failed to load available essays for ${folder}:`, error)
        }
        return []
      })
      
      const results = await Promise.all(promises)
      
      // Find essays that are available in ALL selected runs
      if (results.length > 0 && results[0].length > 0) {
        // Start with essays from first model
        const firstModelEssays = new Set(results[0])
        
        // Keep only essays that exist in all other models
        for (let i = 1; i < results.length; i++) {
          const modelEssays = new Set(results[i])
          for (const essayId of firstModelEssays) {
            if (!modelEssays.has(essayId)) {
              firstModelEssays.delete(essayId)
            }
          }
        }
        
        setAvailableEssayIds(firstModelEssays)
      }
    }
    
    loadAvailableEssays()
  }, [selectedRuns])
  
  const filteredEssays = useMemo(() => {
    let filtered = essays
    
    // Filter by available essays
    if (availableEssayIds.size > 0) {
      filtered = filtered.filter(essay => availableEssayIds.has(essay.id))
    }
    
    // Sort by F1 score if requested
    if (essaySortOrder !== "default" && Object.keys(essayStats).length > 0) {
      filtered = [...filtered].sort((a, b) => {
        const statsA = essayStats[a.id]
        const statsB = essayStats[b.id]
        
        if (!statsA && !statsB) return 0
        if (!statsA) return 1
        if (!statsB) return -1
        
        if (essaySortOrder === "bestF1") {
          // Sort by best F1 descending (highest first)
          return statsB.maxF1 - statsA.maxF1
        } else if (essaySortOrder === "worstF1") {
          // Sort by worst F1 ascending (lowest first)
          // Put essays with null minF1 at the end
          if (statsA.minF1 === null && statsB.minF1 === null) return 0
          if (statsA.minF1 === null) return 1
          if (statsB.minF1 === null) return -1
          return statsA.minF1 - statsB.minF1
        }
        return 0
      })
    }
    
    return filtered
  }, [essays, availableEssayIds, essaySortOrder, essayStats])

  // Update selected essay when filtered essays change
  useEffect(() => {
    if (filteredEssays.length > 0 && !filteredEssays.find(e => e.id === selectedEssayId)) {
      // Current essay is not in filtered list, select the first available one
      setSelectedEssayId(filteredEssays[0].id)
    }
  }, [filteredEssays, selectedEssayId])

  // Select first essay when sort order changes
  useEffect(() => {
    if (essaySortOrder !== "default" && filteredEssays.length > 0) {
      setSelectedEssayId(filteredEssays[0].id)
    }
  }, [essaySortOrder, filteredEssays])

  // Build essay object for viewer
  const selectedEssayData = essays.find(e => e.id === selectedEssayId)
  
  const selectedEssay: Essay | null = selectedEssayData ? {
    id: selectedEssayData.id,
    title: selectedEssayData.name,
    text: selectedEssayData.text,
    groundTruth: selectedEssayData.goldAnnotation 
      ? parseBrat(selectedEssayData.goldAnnotation)
      : { components: [], stances: [], relations: [] },
    modelResults: (() => {
      if (comparisonMode === "cross-model") {
        return Object.entries(selectedRuns).map(([model, folder]) => {
          const annotation = modelAnnotations[folder]
          const run = logRuns.find(r => r.folder === folder)
          const displayName = run?.modelDisplayName || model.charAt(0).toUpperCase() + model.slice(1)
          return {
            modelName: displayName,
            modelId: model,
            annotation: annotation 
              ? parseBrat(annotation)
              : { components: [], stances: [], relations: [] }
          } as ModelResult
        })
      } else {
        // Time series mode - show timestamps as model names
        return selectedTimestamps.map(folder => {
          const annotation = modelAnnotations[folder]
          const run = logRuns.find(r => r.folder === folder)
          const timestamp = run?.timestamp || folder
          const formattedTime = `${timestamp.slice(4, 6)}/${timestamp.slice(6, 8)} ${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}`
          const isAllRun = folder.includes("_all_")
          const modelDisplayName = run?.modelDisplayName || run?.model || ""
          const displayName = `${modelDisplayName} - ${formattedTime}${isAllRun ? " (All)" : ""}`
          
          return {
            modelName: displayName,
            modelId: folder,
            annotation: annotation 
              ? parseBrat(annotation)
              : { components: [], stances: [], relations: [] }
          } as ModelResult
        })
      }
    })().filter(r => r.annotation.components.length > 0)
  } : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const essayCount = essays.length
  const filteredEssayCount = filteredEssays.length
  const totalRuns = logRuns.length

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card shrink-0">
        <div className="px-4 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">
              ArgBench Lab
            </h1>
            <p className="text-sm text-muted-foreground">
              Argument Mining Experiment Results
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="px-2.5 py-1 bg-muted rounded-md font-mono text-xs">
              {filteredEssayCount} / {essayCount} essay{essayCount !== 1 ? "s" : ""}
            </span>
            <span className="px-2.5 py-1 bg-muted rounded-md font-mono text-xs">
              {modelNames.length} models
            </span>
            <span className="px-2.5 py-1 bg-muted rounded-md font-mono text-xs">
              {totalRuns} total runs
            </span>
            <span className="text-xs">
              Data from{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">logs/</code>
              {" "}and{" "}
              <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">gold_arg/</code>
            </span>
          </div>
        </div>
      </header>

      {/* Main content - two panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - 30% */}
        <aside className="w-[30%] border-r border-border bg-card overflow-hidden flex flex-col">
          <div className="p-4 flex flex-col flex-1 min-h-0 gap-4">
            {/* Model Run Selection */}
            <div className="shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Model Runs
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setComparisonMode("cross-model")
                      setSelectedTimestamps([])
                    }}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded transition-colors",
                      comparisonMode === "cross-model"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    title="Compare different models"
                  >
                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                    Cross-Model
                  </button>
                  <button
                    onClick={() => {
                      setComparisonMode("time-series")
                      if (!selectedModelForTimeSeries && modelNames.length > 0) {
                        setSelectedModelForTimeSeries(modelNames[0])
                      }
                    }}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded transition-colors",
                      comparisonMode === "time-series"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                    title="Compare same model over time"
                  >
                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Time Series
                  </button>
                </div>
              </div>
              
              {comparisonMode === "cross-model" ? (
                <div className="space-y-3">
                  {/* Predefined run groups */}
                  {runGroups.length > 0 ? (
                    <div className="p-2 bg-muted/30 rounded-lg border border-border">
                      <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-2">
                        Select Predefined Group
                      </label>
                      <Select
                        value={currentGroupId || ""}
                        onValueChange={(groupId) => {
                          const group = runGroups.find(g => g.id === groupId)
                          if (group) {
                            setSelectedRuns(group.runs)
                          }
                        }}
                      >
                        <SelectTrigger className="select-trigger-custom w-full h-8 text-xs px-3 [&>span]:w-full [&>span]:text-left">
                          <SelectValue placeholder="Select a predefined group" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[400px]">
                          {runGroups.map(group => (
                            <SelectItem 
                              key={group.id} 
                              value={group.id} 
                              className="text-xs py-1.5 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
                            >
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      {/* Show current selections */}
                      <div className="mt-2 space-y-1">
                        {modelNames.map(model => {
                          const selectedFolder = selectedRuns[model]
                          const selectedRun = runsByModel[model]?.find(r => r.folder === selectedFolder)
                          const modelDisplayName = runsByModel[model]?.[0]?.modelDisplayName || model
                          
                          if (!selectedRun) return null
                          
                          const formattedTime = `${selectedRun.timestamp.slice(4, 6)}/${selectedRun.timestamp.slice(6, 8)} ${selectedRun.timestamp.slice(9, 11)}:${selectedRun.timestamp.slice(11, 13)}`
                          const isAllRun = selectedRun.folder.includes("_all_")
                          
                          return (
                            <div key={model} className="flex items-center justify-between text-[9px] text-muted-foreground">
                              <span className="font-medium">{modelDisplayName}:</span>
                              <span>{formattedTime}{isAllRun ? " (All)" : ""}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-2 bg-muted/30 rounded-lg border border-border text-center">
                      <p className="text-[10px] text-muted-foreground">
                        No run groups configured. Add groups to <code className="text-[9px] bg-muted px-1 py-0.5 rounded">/public/config/run-groups.json</code>
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Model selector for time series */}
                  <div>
                    <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                      Select Model
                    </label>
                    <Select
                      value={selectedModelForTimeSeries}
                      onValueChange={(model) => {
                        setSelectedModelForTimeSeries(model)
                        setSelectedTimestamps([]) // Clear timestamps when model changes
                      }}
                    >
                      <SelectTrigger className="w-full h-7 text-xs">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {modelNames.map(model => {
                          const displayName = runsByModel[model]?.[0]?.modelDisplayName || model
                          return (
                            <SelectItem key={model} value={model} className="text-xs">
                              {displayName}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {/* Timestamp selection */}
                  {selectedModelForTimeSeries && (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1">
                        Select Timestamps to Compare for {runsByModel[selectedModelForTimeSeries]?.[0]?.modelDisplayName || selectedModelForTimeSeries}
                      </label>
                      <div className="space-y-1 max-h-32 overflow-y-auto border border-border rounded p-2">
                        {runsByModel[selectedModelForTimeSeries]?.map(run => {
                          const formattedTime = `${run.timestamp.slice(4, 6)}/${run.timestamp.slice(6, 8)} ${run.timestamp.slice(9, 11)}:${run.timestamp.slice(11, 13)}`
                          const isAllRun = run.folder.includes("_all_")
                          const modelDisplayName = run.modelDisplayName || run.model
                          const label = `${modelDisplayName} - ${formattedTime}${isAllRun ? " (All)" : ""}`
                          const isSelected = selectedTimestamps.includes(run.folder)
                          
                          return (
                            <label key={run.folder} className="flex items-center gap-2 hover:bg-muted/50 p-1 rounded cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTimestamps([...selectedTimestamps, run.folder])
                                  } else {
                                    setSelectedTimestamps(selectedTimestamps.filter(f => f !== run.folder))
                                  }
                                }}
                                className="w-3 h-3"
                              />
                              <span className="text-xs">{label}</span>
                            </label>
                          )
                        })}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {selectedTimestamps.length} selected
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Overall F1 Scores */}
            {Object.keys(overallF1Stats).length > 0 && (
              <div className="shrink-0 mb-4">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">
                  Overall F1 (IoU≥50%)
                </h2>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {Object.entries(overallF1Stats).map(([modelId, stats]) => {
                    // Get display name from selected runs
                    const folder = comparisonMode === "cross-model" 
                      ? selectedRuns[modelId] 
                      : modelId
                    const run = logRuns.find(r => r.folder === folder)
                    
                    // For time-series mode, show timestamp; for cross-model, show model name
                    let displayName: string
                    if (comparisonMode === "time-series" && run) {
                      const timestamp = run.timestamp || folder
                      const formattedTime = `${timestamp.slice(4, 6)}/${timestamp.slice(6, 8)} ${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}`
                      const isAllRun = folder.includes("_all_")
                      displayName = `${formattedTime}${isAllRun ? " (All)" : ""}`
                    } else {
                      displayName = run?.modelDisplayName || modelId
                    }
                    
                    return (
                      <span 
                        key={modelId} 
                        className="whitespace-nowrap"
                        title={`P=${(stats.precision * 100).toFixed(0)}% R=${(stats.recall * 100).toFixed(0)}% across ${stats.essayCount} essays`}
                      >
                        <span className="text-muted-foreground">{displayName}: </span>
                        <span className={cn(
                          "font-mono font-medium",
                          stats.f1 >= 0.8 ? "text-emerald-600 dark:text-emerald-400" :
                          stats.f1 >= 0.5 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {(stats.f1 * 100).toFixed(0)}%
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Essay Selection */}
            <div className="shrink-0">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">
                Essay
              </h2>
              <span className="text-[10px] text-muted-foreground block mb-2">
                {(() => {
                  const v1Count = filteredEssays.filter(e => e.id.startsWith('v1_')).length
                  const v2Count = filteredEssays.filter(e => e.id.startsWith('v2_')).length
                  if (v1Count > 0 && v2Count > 0) {
                    return `${v1Count} V1 + ${v2Count} V2 = ${filteredEssays.length} available`
                  } else if (v1Count > 0) {
                    return `${v1Count} V1 essays available`
                  } else if (v2Count > 0) {
                    return `${v2Count} V2 essays available`
                  } else {
                    return `${filteredEssays.length} available`
                  }
                })()}
              </span>
              
              <div className="flex gap-2 mb-2">
                <Select
                  value={essaySortOrder}
                  onValueChange={(value: "default" | "bestF1" | "worstF1") => setEssaySortOrder(value)}
                >
                  <SelectTrigger className={cn(
                    "w-[140px] h-7 text-[10px]",
                    essaySortOrder !== "default" && "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700"
                  )}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default" className="text-xs">Default Order</SelectItem>
                    <SelectItem value="bestF1" className="text-xs">Rank by Best F1 ↓</SelectItem>
                    <SelectItem value="worstF1" className="text-xs">Rank by Worst F1 ↑</SelectItem>
                  </SelectContent>
                </Select>
                {essaySortOrder !== "default" && (
                  <button
                    onClick={() => setEssaySortOrder("default")}
                    className="px-2 h-7 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/40 transition-colors"
                  >
                    Reset
                  </button>
                )}
              </div>
              
              <Select
                value={selectedEssayId}
                onValueChange={setSelectedEssayId}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select an essay" />
                </SelectTrigger>
                <SelectContent 
                  position="popper" 
                  side="bottom" 
                  align="start" 
                  sideOffset={4} 
                  collisionPadding={10} 
                  avoidCollisions={false}
                  className="max-h-[300px]"
                >
                  {filteredEssays.map((essay) => {
                    const stats = essayStats[essay.id]
                    // Extract version and number from essay ID (e.g., v1_essay01 -> v1, 01)
                    const versionMatch = essay.id.match(/^(v\d+)_essay(\d+)$/)
                    const version = versionMatch ? versionMatch[1].toUpperCase() : ""
                    const essayNum = versionMatch ? versionMatch[2] : essay.id
                    
                    return (
                      <SelectItem key={essay.id} value={essay.id} className="text-xs essay-select-item">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-[10px] px-1 rounded bg-muted text-muted-foreground">
                            {version}
                          </span>
                          <span className="font-mono">{essayNum}</span>
                          <span className="truncate max-w-[150px]">
                            {essay.name.length > 25 ? essay.name.slice(0, 25) + "..." : essay.name}
                          </span>
                          {stats && (
                            <div className="flex items-center gap-1 ml-auto">
                              <span 
                                className={cn(
                                  "text-[9px] px-1 rounded font-mono",
                                  stats.maxF1 >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                  stats.maxF1 >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                )}
                                title="Best F1 (IoU≥50%) across models"
                              >
                                ↑{stats.maxF1}%
                              </span>
                              {stats.minF1 !== null ? (
                                <span 
                                  className={cn(
                                    "text-[9px] px-1 rounded font-mono",
                                    stats.minF1 >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                    stats.minF1 >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  )}
                                  title="Worst F1 (IoU≥50%) across models"
                                >
                                  ↓{stats.minF1}%
                                </span>
                              ) : (
                                <span 
                                  className="text-[9px] px-1 rounded font-mono bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                                  title="Worst F1 unavailable - essay missing from some runs"
                                >
                                  ↓N/A
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              
              {/* Legend for stats */}
              {Object.keys(essayStats).length > 0 && (
                <div className="mt-2 text-[9px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>↑best</span>
                  <span>↓worst F1 (IoU≥50%)</span>
                </div>
              )}
            </div>

            {/* Prompt Section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  LLM Prompt
                </h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPromptViewMode("markdown")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded transition-colors",
                      promptViewMode === "markdown"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Markdown
                  </button>
                  <button
                    onClick={() => setPromptViewMode("raw")}
                    className={cn(
                      "px-2 py-0.5 text-[10px] rounded transition-colors",
                      promptViewMode === "raw"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    Raw
                  </button>
                </div>
              </div>
              
              {/* Prompt Error Alert */}
              {!promptInfo.isConsistent && (
                <div className="mb-2 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-xs font-medium text-red-800 dark:text-red-200">
                        Prompt Mismatch
                      </p>
                      <p className="text-[10px] text-red-700 dark:text-red-300 mt-0.5">
                        {promptInfo.error}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {promptInfo.prompt ? (
                <div className="border border-border rounded-lg overflow-hidden flex-1 min-h-0">
                  {promptViewMode === "raw" ? (
                    <pre className="p-3 text-xs text-foreground bg-muted/30 overflow-auto whitespace-pre-wrap font-mono leading-relaxed h-full">
                      {promptInfo.prompt}
                    </pre>
                  ) : (
                    <div className="p-3 bg-muted/30 overflow-auto h-full prose prose-sm dark:prose-invert max-w-none 
                      prose-headings:text-foreground prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
                      prose-h1:text-base prose-h2:text-sm prose-h3:text-xs
                      prose-p:text-xs prose-p:text-foreground prose-p:my-2
                      prose-li:text-xs prose-li:text-foreground prose-li:my-0.5
                      prose-strong:text-foreground prose-strong:font-semibold
                      prose-code:text-[10px] prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                      prose-pre:bg-muted prose-pre:text-xs
                      prose-ul:my-1 prose-ol:my-1">
                      <ReactMarkdown>{promptInfo.prompt}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No prompt information available.
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Right Panel - 70% */}
        <main className="w-[70%] overflow-y-auto">
          <div className="p-6">
            {/* Selected essay view */}
            {selectedEssay && (
              <>
                <div className="mb-4">
                  {/* First line - Essay title and stats */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {(() => {
                      const versionMatch = selectedEssayId.match(/^(v\d+)_essay(\d+)$/)
                      const version = versionMatch ? versionMatch[1].toUpperCase() : ""
                      const essayNum = versionMatch ? versionMatch[2] : selectedEssayId
                      
                      return (
                        <>
                          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                            <span className="text-sm font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {version}
                            </span>
                            Essay {essayNum}: {selectedEssay.title}
                          </h3>
                        </>
                      )
                    })()}
                  </div>
                </div>

                <Tabs value={mainTab} onValueChange={setMainTab}>
                  <div className="flex items-center justify-between mb-4">
                    <TabsList className="bg-muted">
                      <TabsTrigger value="explore">Explore</TabsTrigger>
                      <TabsTrigger value="compare-segmentation">Compare Models (Segmentation)</TabsTrigger>
                      <TabsTrigger value="compare-visual">Compare Models (Visual)</TabsTrigger>
                    </TabsList>
                    
                    {/* Navigation buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const currentIndex = filteredEssays.findIndex(e => e.id === selectedEssayId)
                          if (currentIndex > 0) {
                            setSelectedEssayId(filteredEssays[currentIndex - 1].id)
                          }
                        }}
                        disabled={filteredEssays.findIndex(e => e.id === selectedEssayId) === 0}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors",
                          filteredEssays.findIndex(e => e.id === selectedEssayId) === 0
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        )}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Prev
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {filteredEssays.findIndex(e => e.id === selectedEssayId) + 1} / {filteredEssays.length}
                      </span>
                      <button
                        onClick={() => {
                          const currentIndex = filteredEssays.findIndex(e => e.id === selectedEssayId)
                          if (currentIndex < filteredEssays.length - 1) {
                            setSelectedEssayId(filteredEssays[currentIndex + 1].id)
                          }
                        }}
                        disabled={filteredEssays.findIndex(e => e.id === selectedEssayId) === filteredEssays.length - 1}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors",
                          filteredEssays.findIndex(e => e.id === selectedEssayId) === filteredEssays.length - 1
                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                            : "bg-muted hover:bg-muted/80 text-foreground"
                        )}
                      >
                        Next
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Segmentation Summary - below tabs but above content */}
                  {selectedEssay && selectedEssay.modelResults.length > 0 && mainTab === "compare-segmentation" && (
                    <EssaySegmentationStats essay={selectedEssay} overallF1Stats={overallF1Stats} />
                  )}

                  <TabsContent value="explore">
                    <EssayViewer essay={selectedEssay} />
                  </TabsContent>

                  <TabsContent value="compare-segmentation">
                    <div className="bg-card rounded-lg border border-border p-5">
                      <ComparisonView essay={selectedEssay} mode="segmentation" />
                    </div>
                  </TabsContent>

                  <TabsContent value="compare-visual">
                    <div className="bg-card rounded-lg border border-border p-5">
                      <ComparisonView essay={selectedEssay} mode="visual" />
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}

            {!selectedEssay && selectedEssayId && (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <p className="text-muted-foreground">
                  No annotations found for this essay. Make sure you have run the annotation script.
                </p>
              </div>
            )}

            {!selectedEssayId && (
              <div className="bg-card rounded-lg border border-border p-8 text-center">
                <p className="text-muted-foreground">
                  Select an essay from the left panel to view annotations.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
