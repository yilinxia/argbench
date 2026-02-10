"use client"

import type { Annotation } from "@/lib/types"
import { cn } from "@/lib/utils"

const typeStyles: Record<string, { bg: string; border: string; text: string }> =
  {
    MajorClaim: {
      bg: "bg-blue-50 dark:bg-blue-900/30",
      border: "border-blue-400 dark:border-blue-500",
      text: "text-blue-900 dark:text-blue-100",
    },
    Claim: {
      bg: "bg-emerald-50 dark:bg-emerald-900/30",
      border: "border-emerald-400 dark:border-emerald-500",
      text: "text-emerald-900 dark:text-emerald-100",
    },
    Premise: {
      bg: "bg-amber-50 dark:bg-amber-900/30",
      border: "border-amber-400 dark:border-amber-500",
      text: "text-amber-900 dark:text-amber-100",
    },
  }

interface ArgumentGraphProps {
  annotation: Annotation
  highlightedComponent: string | null
  onComponentHover: (id: string | null) => void
}

export function ArgumentGraph({
  annotation,
  highlightedComponent,
  onComponentHover,
}: ArgumentGraphProps) {
  const { components, stances, relations } = annotation

  // Build a tree structure: MajorClaim at top, Claims in middle, Premises at bottom
  const majorClaims = components.filter((c) => c.type === "MajorClaim")
  const claims = components.filter((c) => c.type === "Claim")
  const premises = components.filter((c) => c.type === "Premise")

  const getStance = (compId: string) => {
    const stance = stances.find((s) => s.componentId === compId)
    return stance?.stance
  }

  // Find what a component supports/attacks
  const getOutgoingRelations = (compId: string) => {
    return relations.filter((r) => r.from === compId)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Major Claims */}
      {majorClaims.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Major Claim
          </div>
          <div className="flex flex-wrap gap-3">
            {majorClaims.map((mc) => (
              <NodeCard
                key={mc.id}
                id={mc.id}
                type={mc.type}
                text={mc.text}
                stance={getStance(mc.id)}
                relations={getOutgoingRelations(mc.id)}
                isHighlighted={highlightedComponent === mc.id}
                onHover={onComponentHover}
              />
            ))}
          </div>
        </div>
      )}

      {/* Relation arrows indicator */}
      {majorClaims.length > 0 && claims.length > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground px-2">
          <div className="flex-1 border-t border-dashed border-border" />
          <span className="text-xs">supported / attacked by</span>
          <div className="flex-1 border-t border-dashed border-border" />
        </div>
      )}

      {/* Claims */}
      {claims.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Claims
          </div>
          <div className="flex flex-wrap gap-3">
            {claims.map((c) => (
              <NodeCard
                key={c.id}
                id={c.id}
                type={c.type}
                text={c.text}
                stance={getStance(c.id)}
                relations={getOutgoingRelations(c.id)}
                isHighlighted={highlightedComponent === c.id}
                onHover={onComponentHover}
              />
            ))}
          </div>
        </div>
      )}

      {/* Relation arrows indicator */}
      {claims.length > 0 && premises.length > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground px-2">
          <div className="flex-1 border-t border-dashed border-border" />
          <span className="text-xs">supported by</span>
          <div className="flex-1 border-t border-dashed border-border" />
        </div>
      )}

      {/* Premises */}
      {premises.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Premises
          </div>
          <div className="flex flex-wrap gap-3">
            {premises.map((p) => (
              <NodeCard
                key={p.id}
                id={p.id}
                type={p.type}
                text={p.text}
                stance={getStance(p.id)}
                relations={getOutgoingRelations(p.id)}
                isHighlighted={highlightedComponent === p.id}
                onHover={onComponentHover}
              />
            ))}
          </div>
        </div>
      )}

      {/* Relations Legend */}
      <div className="pt-2 border-t border-border">
        <div className="text-xs text-muted-foreground">
          <span className="font-medium block mb-2">Relations:</span>
          <div className="flex flex-wrap gap-2">
            {relations.map((r) => (
              <span key={r.id} className="flex items-center gap-1">
                <span className="font-mono">{r.from}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded font-medium",
                    r.type === "supports"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  )}
                >
                  {r.type}
                </span>
                <span className="font-mono">{r.to}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface NodeCardProps {
  id: string
  type: string
  text: string
  stance?: string
  relations: { id: string; type: string; from: string; to: string }[]
  isHighlighted: boolean
  onHover: (id: string | null) => void
}

function NodeCard({
  id,
  type,
  text,
  stance,
  relations,
  isHighlighted,
  onHover,
}: NodeCardProps) {
  const styles = typeStyles[type]

  return (
    <div
      className={cn(
        "flex-1 min-w-[240px] max-w-md rounded-lg border-2 p-3 transition-all duration-150 cursor-pointer",
        styles.bg,
        styles.border,
        isHighlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md"
      )}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-mono text-xs text-muted-foreground">{id}</span>
        <span
          className={cn("px-1.5 py-0.5 rounded text-xs font-semibold", styles.text)}
        >
          {type}
        </span>
        {stance && (
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium",
              stance === "For"
                ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-800/60 dark:text-emerald-200"
                : "bg-red-200 text-red-800 dark:bg-red-800/60 dark:text-red-200"
            )}
          >
            {stance}
          </span>
        )}
      </div>
      <p className={cn("text-xs leading-relaxed line-clamp-3", styles.text)}>
        {text}
      </p>
      {relations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {relations.map((r) => (
            <span
              key={r.id}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                r.type === "supports"
                  ? "bg-emerald-200/60 text-emerald-700 dark:bg-emerald-800/40 dark:text-emerald-300"
                  : "bg-red-200/60 text-red-700 dark:bg-red-800/40 dark:text-red-300"
              )}
            >
              {r.type} {r.to}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
