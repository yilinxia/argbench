"use client"

import type { Annotation } from "@/lib/types"
import { cn } from "@/lib/utils"

const typeColors: Record<string, { bg: string; text: string }> = {
  MajorClaim: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-900 dark:text-blue-100",
  },
  Claim: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-900 dark:text-emerald-100",
  },
  Premise: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-900 dark:text-amber-100",
  },
}

interface ComponentTableProps {
  annotation: Annotation
  highlightedComponent: string | null
  onComponentHover: (id: string | null) => void
}

export function ComponentTable({
  annotation,
  highlightedComponent,
  onComponentHover,
}: ComponentTableProps) {
  const getStance = (compId: string) => {
    const stance = annotation.stances.find((s) => s.componentId === compId)
    return stance?.stance
  }

  const getRelations = (compId: string) => {
    return annotation.relations.filter(
      (r) => r.from === compId || r.to === compId
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              ID
            </th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              Type
            </th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              Stance
            </th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              Text
            </th>
            <th className="text-left py-2 px-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">
              Relations
            </th>
          </tr>
        </thead>
        <tbody>
          {annotation.components.map((comp) => {
            const colors = typeColors[comp.type]
            const stance = getStance(comp.id)
            const relations = getRelations(comp.id)
            const isHighlighted = highlightedComponent === comp.id

            return (
              <tr
                key={comp.id}
                className={cn(
                  "border-b border-border/50 transition-colors duration-150 cursor-pointer",
                  isHighlighted ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onMouseEnter={() => onComponentHover(comp.id)}
                onMouseLeave={() => onComponentHover(null)}
              >
                <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                  {comp.id}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      colors.bg,
                      colors.text
                    )}
                  >
                    {comp.type}
                  </span>
                </td>
                <td className="py-2 px-3">
                  {stance ? (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        stance === "For"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                      )}
                    >
                      {stance}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">--</span>
                  )}
                </td>
                <td className="py-2 px-3 max-w-md">
                  <span className="line-clamp-2 text-foreground">
                    {comp.text}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex flex-col gap-1">
                    {relations.map((rel) => {
                      const isFrom = rel.from === comp.id
                      return (
                        <span
                          key={rel.id}
                          className="text-xs text-muted-foreground"
                        >
                          {rel.type === "supports" ? (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {isFrom
                                ? `supports ${rel.to}`
                                : `supported by ${rel.from}`}
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400">
                              {isFrom
                                ? `attacks ${rel.to}`
                                : `attacked by ${rel.from}`}
                            </span>
                          )}
                        </span>
                      )
                    })}
                    {relations.length === 0 && (
                      <span className="text-muted-foreground text-xs">--</span>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
