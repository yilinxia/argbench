"use client"

import { useState } from "react"
import type { Annotation, AnnotationComponent } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const typeColors: Record<string, { bg: string; border: string; text: string }> = {
  MajorClaim: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    border: "border-blue-400 dark:border-blue-500",
    text: "text-blue-900 dark:text-blue-100",
  },
  Claim: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    border: "border-emerald-400 dark:border-emerald-500",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  Premise: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    border: "border-amber-400 dark:border-amber-500",
    text: "text-amber-900 dark:text-amber-100",
  },
}

interface AnnotatedTextProps {
  essayText: string
  annotation: Annotation
  highlightedComponent: string | null
  onComponentHover: (id: string | null) => void
}

interface TextSegment {
  text: string
  component: AnnotationComponent | null
  start: number
  end: number
}

function buildSegments(
  text: string,
  components: AnnotationComponent[]
): TextSegment[] {
  // Sort components by start position
  const sorted = [...components].sort((a, b) => a.start - b.start)
  const segments: TextSegment[] = []
  let cursor = 0

  for (const comp of sorted) {
    // Add text before this component
    if (comp.start > cursor) {
      segments.push({
        text: text.slice(cursor, comp.start),
        component: null,
        start: cursor,
        end: comp.start,
      })
    }
    // Add the component text
    segments.push({
      text: text.slice(comp.start, comp.end),
      component: comp,
      start: comp.start,
      end: comp.end,
    })
    cursor = comp.end
  }

  // Add remaining text
  if (cursor < text.length) {
    segments.push({
      text: text.slice(cursor),
      component: null,
      start: cursor,
      end: text.length,
    })
  }

  return segments
}

export function AnnotatedText({
  essayText,
  annotation,
  highlightedComponent,
  onComponentHover,
}: AnnotatedTextProps) {
  const segments = buildSegments(essayText, annotation.components)

  // Find stance for a component
  const getStance = (compId: string) => {
    const stance = annotation.stances.find((s) => s.componentId === compId)
    return stance?.stance
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="leading-7 text-sm text-foreground">
        {segments.map((segment, i) => {
          if (!segment.component) {
            return <span key={i}>{segment.text}</span>
          }

          const comp = segment.component
          const colors = typeColors[comp.type]
          const stance = getStance(comp.id)
          const isHighlighted = highlightedComponent === comp.id

          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    "border-b-2 px-0.5 rounded-sm cursor-pointer transition-all duration-150",
                    colors.bg,
                    colors.border,
                    colors.text,
                    isHighlighted && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  )}
                  onMouseEnter={() => onComponentHover(comp.id)}
                  onMouseLeave={() => onComponentHover(null)}
                >
                  {segment.text}
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="bg-card text-card-foreground border-border max-w-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-xs font-medium",
                      colors.bg,
                      colors.text
                    )}
                  >
                    {comp.type}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {comp.id}
                  </span>
                  {stance && (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        stance === "For"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                      )}
                    >
                      {stance}
                    </span>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
