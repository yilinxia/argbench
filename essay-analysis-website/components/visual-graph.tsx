"use client"

import React from "react"

import { useMemo, useState, useCallback, useRef, useEffect } from "react"
import type { Annotation } from "@/lib/types"
import { cn } from "@/lib/utils"

// Color mapping by component type
const nodeColors: Record<
  string,
  {
    fill: string
    stroke: string
    text: string
    label: string
    fillDark: string
    strokeDark: string
    textDark: string
  }
> = {
  MajorClaim: {
    fill: "#dbeafe",
    stroke: "#3b82f6",
    text: "#1e3a5f",
    label: "#2563eb",
    fillDark: "#1e3a5f",
    strokeDark: "#60a5fa",
    textDark: "#dbeafe",
  },
  Claim: {
    fill: "#d1fae5",
    stroke: "#10b981",
    text: "#064e3b",
    label: "#059669",
    fillDark: "#064e3b",
    strokeDark: "#34d399",
    textDark: "#d1fae5",
  },
  Premise: {
    fill: "#fef3c7",
    stroke: "#f59e0b",
    text: "#78350f",
    label: "#d97706",
    fillDark: "#78350f",
    strokeDark: "#fbbf24",
    textDark: "#fef3c7",
  },
}

// Dagre-like layout algorithm (simplified topological layering)
interface LayoutNode {
  id: string
  type: string
  text: string
  stance?: string
  x: number
  y: number
  width: number
  height: number
  layer: number
}

interface LayoutEdge {
  id: string
  from: string
  to: string
  type: string // supports or attacks
  fromX: number
  fromY: number
  toX: number
  toY: number
}

function computeLayout(annotation: Annotation): {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
} {
  const { components, stances, relations } = annotation

  // Assign layers: MajorClaim = 0, Claim = 1, Premise = 2
  const layerMap: Record<string, number> = {
    MajorClaim: 0,
    Claim: 1,
    Premise: 2,
  }

  const nodeWidth = 220
  const nodeHeight = 80
  const layerGapY = 120
  const nodeGapX = 30
  const paddingX = 40
  const paddingY = 40

  // Group by layer
  const layers: Record<number, typeof components> = {}
  for (const comp of components) {
    const layer = layerMap[comp.type] ?? 2
    if (!layers[layer]) layers[layer] = []
    layers[layer].push(comp)
  }

  // Sort by layer and compute positions
  const nodes: LayoutNode[] = []
  const nodePositions: Record<string, { x: number; y: number }> = {}

  let maxLayerWidth = 0

  for (const layerNum of [0, 1, 2]) {
    const layerComps = layers[layerNum] || []
    const layerWidth =
      layerComps.length * nodeWidth + (layerComps.length - 1) * nodeGapX
    if (layerWidth > maxLayerWidth) maxLayerWidth = layerWidth
  }

  const totalWidth = maxLayerWidth + paddingX * 2

  for (const layerNum of [0, 1, 2]) {
    const layerComps = layers[layerNum] || []
    const layerWidth =
      layerComps.length * nodeWidth + (layerComps.length - 1) * nodeGapX
    const startX = (totalWidth - layerWidth) / 2
    const y = paddingY + layerNum * (nodeHeight + layerGapY)

    layerComps.forEach((comp, i) => {
      const x = startX + i * (nodeWidth + nodeGapX)
      const stance = stances.find((s) => s.componentId === comp.id)?.stance

      nodes.push({
        id: comp.id,
        type: comp.type,
        text: comp.text,
        stance,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        layer: layerNum,
      })

      nodePositions[comp.id] = { x: x + nodeWidth / 2, y: y + nodeHeight / 2 }
    })
  }

  // Compute edges
  const edges: LayoutEdge[] = relations.map((rel) => {
    const fromPos = nodePositions[rel.from] || { x: 0, y: 0 }
    const toPos = nodePositions[rel.to] || { x: 0, y: 0 }

    const fromNode = nodes.find((n) => n.id === rel.from)
    const toNode = nodes.find((n) => n.id === rel.to)

    // Determine anchor points based on vertical positions
    let fromY = fromPos.y
    let toY = toPos.y

    if (fromNode && toNode) {
      if (fromNode.layer > toNode.layer) {
        // Source below target: arrow goes up
        fromY = fromNode.y
        toY = toNode.y + toNode.height
      } else if (fromNode.layer < toNode.layer) {
        // Source above target: arrow goes down
        fromY = fromNode.y + fromNode.height
        toY = toNode.y
      } else {
        // Same layer: use side connections
        if (fromPos.x < toPos.x) {
          return {
            id: rel.id,
            from: rel.from,
            to: rel.to,
            type: rel.type,
            fromX: fromNode.x + fromNode.width,
            fromY: fromPos.y,
            toX: toNode.x,
            toY: toPos.y,
          }
        }
        return {
          id: rel.id,
          from: rel.from,
          to: rel.to,
          type: rel.type,
          fromX: fromNode.x,
          fromY: fromPos.y,
          toX: toNode.x + toNode.width,
          toY: toPos.y,
        }
      }
    }

    return {
      id: rel.id,
      from: rel.from,
      to: rel.to,
      type: rel.type,
      fromX: fromPos.x,
      fromY,
      toX: toPos.x,
      toY,
    }
  })

  const totalHeight =
    paddingY * 2 +
    (Object.keys(layers).length - 1) * (nodeHeight + layerGapY) +
    nodeHeight

  return { nodes, edges, width: totalWidth, height: totalHeight }
}

// Wrap text into multiple lines
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    if ((currentLine + " " + word).trim().length > maxChars) {
      if (currentLine) lines.push(currentLine.trim())
      currentLine = word
    } else {
      currentLine = currentLine ? currentLine + " " + word : word
    }
  }
  if (currentLine) lines.push(currentLine.trim())

  // Limit to 2 lines with ellipsis
  if (lines.length > 2) {
    lines[1] = lines[1].substring(0, maxChars - 3) + "..."
    return lines.slice(0, 2)
  }
  return lines
}

interface VisualGraphProps {
  annotation: Annotation
  highlightedComponent: string | null
  onComponentHover: (id: string | null) => void
}

export function VisualGraph({
  annotation,
  highlightedComponent,
  onComponentHover,
}: VisualGraphProps) {
  const layout = useMemo(() => computeLayout(annotation), [annotation])
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    text: string
    type: string
    stance?: string
    id: string
  } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Pan and zoom state
  const [viewBox, setViewBox] = useState({
    x: 0,
    y: 0,
    w: layout.width,
    h: layout.height,
  })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 })

  useEffect(() => {
    setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height })
  }, [layout.width, layout.height])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const scaleFactor = e.deltaY > 0 ? 1.1 : 0.9
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const mx = ((e.clientX - rect.left) / rect.width) * viewBox.w + viewBox.x
      const my = ((e.clientY - rect.top) / rect.height) * viewBox.h + viewBox.y

      const newW = viewBox.w * scaleFactor
      const newH = viewBox.h * scaleFactor

      setViewBox({
        x: mx - ((mx - viewBox.x) / viewBox.w) * newW,
        y: my - ((my - viewBox.y) / viewBox.h) * newH,
        w: newW,
        h: newH,
      })
    },
    [viewBox]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      setIsPanning(true)
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        vx: viewBox.x,
        vy: viewBox.y,
      }
    },
    [viewBox.x, viewBox.y]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return
      const svg = svgRef.current
      if (!svg) return

      const rect = svg.getBoundingClientRect()
      const dx =
        ((e.clientX - panStart.current.x) / rect.width) * viewBox.w
      const dy =
        ((e.clientY - panStart.current.y) / rect.height) * viewBox.h

      setViewBox((prev) => ({
        ...prev,
        x: panStart.current.vx - dx,
        y: panStart.current.vy - dy,
      }))
    },
    [isPanning, viewBox.w, viewBox.h]
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  const resetView = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: layout.width, h: layout.height })
  }, [layout.width, layout.height])

  // Determine which edges connect to the highlighted component
  const relatedEdges = useMemo(() => {
    if (!highlightedComponent) return new Set<string>()
    return new Set(
      layout.edges
        .filter(
          (e) => e.from === highlightedComponent || e.to === highlightedComponent
        )
        .map((e) => e.id)
    )
  }, [highlightedComponent, layout.edges])

  const relatedNodes = useMemo(() => {
    if (!highlightedComponent) return new Set<string>()
    const s = new Set<string>([highlightedComponent])
    for (const e of layout.edges) {
      if (e.from === highlightedComponent) s.add(e.to)
      if (e.to === highlightedComponent) s.add(e.from)
    }
    return s
  }, [highlightedComponent, layout.edges])

  return (
    <div className="flex flex-col gap-2">
      {/* Graph */}
      <div
        ref={containerRef}
        className="relative bg-muted/20 rounded-lg border border-border overflow-hidden"
        style={{ height: Math.min(layout.height + 40, 600) }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className={cn("select-none", isPanning ? "cursor-grabbing" : "cursor-grab")}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            <marker
              id="arrow-supports"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-attacks"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
            <marker
              id="arrow-supports-dim"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" opacity="0.2" />
            </marker>
            <marker
              id="arrow-attacks-dim"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" opacity="0.2" />
            </marker>
            <filter id="node-shadow" x="-10%" y="-10%" width="120%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
            </filter>
            <filter id="node-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Edges */}
          {layout.edges.map((edge) => {
            const isHighlighted =
              highlightedComponent && relatedEdges.has(edge.id)
            const isDimmed =
              highlightedComponent && !relatedEdges.has(edge.id)
            const isHovered = hoveredEdge === edge.id
            const color = edge.type === "supports" ? "#10b981" : "#ef4444"
            const dashArray = edge.type === "attacks" ? undefined : undefined

            // Compute a curved path
            const midX = (edge.fromX + edge.toX) / 2
            const midY = (edge.fromY + edge.toY) / 2
            const dx = edge.toX - edge.fromX
            const offset = dx === 0 ? 30 : 0 // Curve parallel edges

            return (
              <g key={edge.id}>
                <path
                  d={`M ${edge.fromX} ${edge.fromY} Q ${midX + offset} ${midY} ${edge.toX} ${edge.toY}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHighlighted || isHovered ? 3 : 2}
                  strokeDasharray={dashArray}
                  opacity={isDimmed ? 0.15 : isHighlighted || isHovered ? 1 : 0.6}
                  markerEnd={
                    isDimmed
                      ? `url(#arrow-${edge.type}-dim)`
                      : `url(#arrow-${edge.type})`
                  }
                  className="transition-opacity duration-150"
                />
                {/* Invisible thicker path for hover target */}
                <path
                  d={`M ${edge.fromX} ${edge.fromY} Q ${midX + offset} ${midY} ${edge.toX} ${edge.toY}`}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="12"
                  onMouseEnter={() => setHoveredEdge(edge.id)}
                  onMouseLeave={() => setHoveredEdge(null)}
                  className="cursor-pointer"
                />
                {/* Edge label */}
                {(isHighlighted || isHovered) && (
                  <text
                    x={midX + offset / 2}
                    y={midY - 8}
                    textAnchor="middle"
                    className="text-[10px] font-medium fill-current pointer-events-none"
                    style={{ fill: color }}
                  >
                    {edge.from} {edge.type} {edge.to}
                  </text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {layout.nodes.map((node) => {
            const colors = nodeColors[node.type] || nodeColors.Premise
            const isHighlighted = highlightedComponent === node.id
            const isRelated =
              highlightedComponent && relatedNodes.has(node.id)
            const isDimmed =
              highlightedComponent &&
              !relatedNodes.has(node.id)
            const textLines = wrapText(node.text, 30)

            return (
              <g
                key={node.id}
                className="cursor-pointer"
                filter={
                  isHighlighted
                    ? "url(#node-glow)"
                    : "url(#node-shadow)"
                }
                opacity={isDimmed ? 0.3 : 1}
                onMouseEnter={() => {
                  onComponentHover(node.id)
                  const container = containerRef.current
                  if (container) {
                    const svgEl = svgRef.current
                    if (svgEl) {
                      const svgRect = svgEl.getBoundingClientRect()
                      const scaleX = svgRect.width / viewBox.w
                      const tipX = (node.x + node.width / 2 - viewBox.x) * scaleX
                      const tipY = (node.y - viewBox.y) * (svgRect.height / viewBox.h) - 10
                      setTooltip({
                        x: tipX,
                        y: tipY,
                        text: node.text,
                        type: node.type,
                        stance: node.stance,
                        id: node.id,
                      })
                    }
                  }
                }}
                onMouseLeave={() => {
                  onComponentHover(null)
                  setTooltip(null)
                }}
              >
                {/* Node body */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={8}
                  ry={8}
                  fill={colors.fill}
                  stroke={isHighlighted || isRelated ? colors.stroke : colors.stroke}
                  strokeWidth={isHighlighted ? 3 : isRelated ? 2.5 : 1.5}
                />

                {/* Node header bar */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={22}
                  rx={8}
                  ry={8}
                  fill={colors.stroke}
                  opacity={0.15}
                />
                <rect
                  x={node.x}
                  y={node.y + 14}
                  width={node.width}
                  height={8}
                  fill={colors.stroke}
                  opacity={0.15}
                />

                {/* Node ID + Type label */}
                <text
                  x={node.x + 10}
                  y={node.y + 15}
                  className="text-[10px] font-bold"
                  style={{ fill: colors.label }}
                >
                  {node.id} - {node.type}
                  {node.stance ? ` (${node.stance})` : ""}
                </text>

                {/* Truncated text */}
                {textLines.map((line, i) => (
                  <text
                    key={i}
                    x={node.x + 10}
                    y={node.y + 35 + i * 15}
                    className="text-[11px]"
                    style={{ fill: colors.text }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            )
          })}
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none max-w-xs"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-3 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-bold">{tooltip.id}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded font-medium",
                    tooltip.type === "MajorClaim" &&
                      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
                    tooltip.type === "Claim" &&
                      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
                    tooltip.type === "Premise" &&
                      "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                  )}
                >
                  {tooltip.type}
                </span>
                {tooltip.stance && (
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded font-medium",
                      tooltip.stance === "For"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
                    )}
                  >
                    {tooltip.stance}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {tooltip.text}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
