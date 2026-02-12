"use client"

import { useMemo } from "react"
import type { Essay } from "@/lib/types"
import { 
  calculateSegmentationMetrics, 
  interpretAlphaU, 
  formatPercent, 
  formatNumber,
  type SegmentationMetrics 
} from "@/lib/metrics"
import { cn } from "@/lib/utils"

interface MetricsPanelProps {
  essay: Essay
}

export function MetricsPanel({ essay }: MetricsPanelProps) {
  // Calculate metrics for each model
  const modelMetrics = useMemo(() => {
    const textLength = essay.text.length
    
    return essay.modelResults.map(model => ({
      modelName: model.modelName,
      metrics: calculateSegmentationMetrics(
        essay.groundTruth,
        model.annotation,
        textLength
      )
    }))
  }, [essay])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Segmentation Metrics
        </h3>
        <span className="text-xs text-muted-foreground">
          Comparing {modelMetrics.length} model(s) against ground truth
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-4">
        {modelMetrics.map(({ modelName, metrics }) => (
          <ModelMetricsCard 
            key={modelName} 
            modelName={modelName} 
            metrics={metrics} 
          />
        ))}
      </div>

      {/* Legend / Help */}
      <MetricsLegend />
    </div>
  )
}

interface ModelMetricsCardProps {
  modelName: string
  metrics: SegmentationMetrics
}

function ModelMetricsCard({ modelName, metrics }: ModelMetricsCardProps) {
  const alphaInterpretation = interpretAlphaU(metrics.alphaU.alpha)

  return (
    <div className="bg-card rounded-lg border border-border p-4 space-y-4">
      {/* Model Name Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-semibold text-foreground">{modelName}</span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1: Exact Match */}
        <MetricBox
          title="Exact Match"
          subtitle="Strict boundary matching"
          mainValue={formatPercent(metrics.exactMatch.overall.accuracy)}
          mainLabel="Overall Accuracy"
          details={[
            { label: 'MajorClaim', value: formatPercent(metrics.exactMatch.byType.MajorClaim?.accuracy ?? 0) },
            { label: 'Claim', value: formatPercent(metrics.exactMatch.byType.Claim?.accuracy ?? 0) },
            { label: 'Premise', value: formatPercent(metrics.exactMatch.byType.Premise?.accuracy ?? 0) },
          ]}
          color="blue"
        />

        {/* Metric 2: Krippendorff's αU */}
        <MetricBox
          title="Krippendorff's αU"
          subtitle="Character-level agreement"
          mainValue={formatNumber(metrics.alphaU.alpha)}
          mainLabel={alphaInterpretation.level}
          mainLabelColor={alphaInterpretation.color}
          details={[
            { label: 'Observed Agreement', value: formatPercent(metrics.alphaU.observedAgreement) },
            { label: 'MajorClaim', value: formatPercent(metrics.alphaU.perLabelAgreement.MajorClaim ?? 0) },
            { label: 'Claim', value: formatPercent(metrics.alphaU.perLabelAgreement.Claim ?? 0) },
            { label: 'Premise', value: formatPercent(metrics.alphaU.perLabelAgreement.Premise ?? 0) },
          ]}
          color="purple"
        />

        {/* Metric 3: F1 Scores */}
        <MetricBox
          title="F1 Score"
          subtitle="Precision / Recall balance"
          mainValue={formatPercent(metrics.f1Relaxed50.overall.f1)}
          mainLabel="F1 (IoU≥50%)"
          details={[
            { 
              label: 'Exact F1', 
              value: formatPercent(metrics.f1Exact.overall.f1),
              subtext: `P:${formatPercent(metrics.f1Exact.overall.precision)} R:${formatPercent(metrics.f1Exact.overall.recall)}`
            },
            { 
              label: 'Relaxed F1 (50%)', 
              value: formatPercent(metrics.f1Relaxed50.overall.f1),
              subtext: `P:${formatPercent(metrics.f1Relaxed50.overall.precision)} R:${formatPercent(metrics.f1Relaxed50.overall.recall)}`
            },
            { 
              label: 'Relaxed F1 (75%)', 
              value: formatPercent(metrics.f1Relaxed75.overall.f1),
              subtext: `P:${formatPercent(metrics.f1Relaxed75.overall.precision)} R:${formatPercent(metrics.f1Relaxed75.overall.recall)}`
            },
          ]}
          color="emerald"
        />
      </div>

      {/* Detailed F1 by Type */}
      <div className="pt-2 border-t border-border">
        <div className="text-xs font-medium text-muted-foreground mb-2">F1 by Component Type (IoU≥50%)</div>
        <div className="grid grid-cols-3 gap-2">
          {['MajorClaim', 'Claim', 'Premise'].map(type => {
            const f1Data = metrics.f1Relaxed50.byType[type]
            return (
              <div key={type} className="bg-muted/30 rounded p-2">
                <div className="text-xs font-medium text-foreground">{type}</div>
                <div className="text-lg font-bold text-foreground">{formatPercent(f1Data?.f1 ?? 0)}</div>
                <div className="text-[10px] text-muted-foreground">
                  TP:{f1Data?.tp ?? 0} FP:{f1Data?.fp ?? 0} FN:{f1Data?.fn ?? 0}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface MetricBoxProps {
  title: string
  subtitle: string
  mainValue: string
  mainLabel: string
  mainLabelColor?: string
  details: Array<{ label: string; value: string; subtext?: string }>
  color: 'blue' | 'purple' | 'emerald'
}

function MetricBox({ title, subtitle, mainValue, mainLabel, mainLabelColor, details, color }: MetricBoxProps) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
  }

  const valueColorClasses = {
    blue: 'text-blue-700 dark:text-blue-300',
    purple: 'text-purple-700 dark:text-purple-300',
    emerald: 'text-emerald-700 dark:text-emerald-300',
  }

  return (
    <div className={cn("rounded-lg border p-3", colorClasses[color])}>
      <div className="mb-2">
        <div className="text-xs font-semibold text-foreground">{title}</div>
        <div className="text-[10px] text-muted-foreground">{subtitle}</div>
      </div>
      
      <div className="mb-3">
        <div className={cn("text-2xl font-bold", valueColorClasses[color])}>
          {mainValue}
        </div>
        <div className={cn("text-xs", mainLabelColor ?? "text-muted-foreground")}>
          {mainLabel}
        </div>
      </div>

      <div className="space-y-1.5">
        {details.map(({ label, value, subtext }) => (
          <div key={label} className="flex justify-between items-start text-xs">
            <span className="text-muted-foreground">{label}</span>
            <div className="text-right">
              <span className="font-medium text-foreground">{value}</span>
              {subtext && (
                <div className="text-[9px] text-muted-foreground">{subtext}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetricsLegend() {
  return (
    <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
      <div className="text-xs font-semibold text-foreground mb-3">Understanding the Metrics</div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
        <div>
          <div className="font-medium text-foreground mb-1">Exact Match</div>
          <p>
            Strictest metric. Requires exact start/end boundaries AND correct type. 
            Even 1 character off = no match.
          </p>
        </div>
        
        <div>
          <div className="font-medium text-foreground mb-1">Krippendorff's αU</div>
          <p>
            Character-level agreement. Tolerates partial overlaps. 
            αU ≥ 0.80 = excellent, 0.67-0.80 = good, &lt;0.60 = poor.
          </p>
        </div>
        
        <div>
          <div className="font-medium text-foreground mb-1">F1 Score</div>
          <p>
            Balance of precision (correctness) and recall (completeness). 
            Relaxed versions allow partial overlap (IoU threshold).
          </p>
        </div>
      </div>
    </div>
  )
}
