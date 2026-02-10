"use client"

import { useState } from "react"
import type { Essay } from "@/lib/types"
import { AnnotatedText } from "./annotated-text"
import { ComponentTable } from "./component-table"
import { ArgumentGraph } from "./argument-graph"
import { VisualGraph } from "./visual-graph"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

interface EssayViewerProps {
  essay: Essay
}

export function EssayViewer({ essay }: EssayViewerProps) {
  const [selectedModel, setSelectedModel] = useState<string>("ground-truth")
  const [highlightedComponent, setHighlightedComponent] = useState<
    string | null
  >(null)
  const [viewTab, setViewTab] = useState<string>("annotated")

  const currentAnnotation =
    selectedModel === "ground-truth"
      ? essay.groundTruth
      : essay.modelResults.find((m) => m.modelId === selectedModel)
          ?.annotation ?? essay.groundTruth

  const currentModel = essay.modelResults.find(
    (m) => m.modelId === selectedModel
  )

  return (
    <div className="flex flex-col gap-6">
      {/* Model selector */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            Annotation Source
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedModel("ground-truth")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
              selectedModel === "ground-truth"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-card-foreground border-border hover:bg-muted"
            )}
          >
            Ground Truth
          </button>
          {essay.modelResults.map((model) => (
            <button
              key={model.modelId}
              type="button"
              onClick={() => setSelectedModel(model.modelId)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors border",
                selectedModel === model.modelId
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-card-foreground border-border hover:bg-muted"
              )}
            >
              {model.modelName}
            </button>
          ))}
        </div>
      </div>

      {/* Score display (when available) */}
      {currentModel?.scores &&
        Object.keys(currentModel.scores).length > 0 && (
          <div className="flex flex-wrap gap-3 p-3 bg-muted/50 rounded-lg border border-border">
            <span className="text-sm font-medium text-foreground">
              Evaluation Scores:
            </span>
            {Object.entries(currentModel.scores).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center gap-1.5 bg-card px-2.5 py-1 rounded-md border border-border"
              >
                <span className="text-xs text-muted-foreground">{key}</span>
                <span className="text-sm font-semibold text-foreground font-mono">
                  {typeof value === "number" ? value.toFixed(2) : value}
                </span>
              </div>
            ))}
          </div>
        )}

      {/* Stats bar */}
      <div className="flex flex-wrap gap-4">
        <StatBadge
          label="Major Claims"
          count={
            currentAnnotation.components.filter(
              (c) => c.type === "MajorClaim"
            ).length
          }
          color="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
        />
        <StatBadge
          label="Claims"
          count={
            currentAnnotation.components.filter((c) => c.type === "Claim")
              .length
          }
          color="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
        />
        <StatBadge
          label="Premises"
          count={
            currentAnnotation.components.filter((c) => c.type === "Premise")
              .length
          }
          color="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
        />
        <StatBadge
          label="Relations"
          count={currentAnnotation.relations.length}
          color="bg-secondary text-secondary-foreground"
        />
      </div>

      {/* View tabs */}
      <Tabs
        value={viewTab}
        onValueChange={setViewTab}
        className="w-full"
      >
        <TabsList className="bg-muted">
          <TabsTrigger value="annotated">Annotated Essay</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
          <TabsTrigger value="graph">Argument Structure</TabsTrigger>
          <TabsTrigger value="visual">Visual Graph</TabsTrigger>
        </TabsList>

        <TabsContent value="annotated" className="mt-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <AnnotatedText
              essayText={essay.text}
              annotation={currentAnnotation}
              highlightedComponent={highlightedComponent}
              onComponentHover={setHighlightedComponent}
            />
          </div>
        </TabsContent>

        <TabsContent value="components" className="mt-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <ComponentTable
              annotation={currentAnnotation}
              highlightedComponent={highlightedComponent}
              onComponentHover={setHighlightedComponent}
            />
          </div>
        </TabsContent>

        <TabsContent value="graph" className="mt-4">
          <div className="bg-card rounded-lg border border-border p-6">
            <ArgumentGraph
              annotation={currentAnnotation}
              highlightedComponent={highlightedComponent}
              onComponentHover={setHighlightedComponent}
            />
          </div>
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          <VisualGraph
            annotation={currentAnnotation}
            highlightedComponent={highlightedComponent}
            onComponentHover={setHighlightedComponent}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatBadge({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <div className={cn("px-3 py-1.5 rounded-md text-sm font-medium", color)}>
      {count} {label}
    </div>
  )
}
