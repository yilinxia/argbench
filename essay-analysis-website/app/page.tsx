"use client"

import { useState, useEffect, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import { parseBrat } from "@/lib/parse-brat"
import { EssayViewer } from "@/components/essay-viewer"
import { ComparisonView } from "@/components/comparison-view"
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

// Segmentation stats component
function EssaySegmentationStats({ essay }: { essay: Essay }) {
  const gt = essay.groundTruth
  const models = essay.modelResults

  // Calculate stats for each model
  const modelStats = models.map(model => {
    const modelComps = model.annotation.components
    
    // GT components matched by this model (has overlap)
    let gtMatched = 0
    let totalOverlap = 0
    let matchCount = 0
    
    for (const gtComp of gt.components) {
      const overlapping = modelComps.filter(mc => 
        rangesOverlap(gtComp.start, gtComp.end, mc.start, mc.end)
      )
      if (overlapping.length > 0) {
        gtMatched++
        // Get best overlap
        const bestOverlap = Math.max(...overlapping.map(mc => 
          overlapPercentage(gtComp.start, gtComp.end, mc.start, mc.end)
        ))
        totalOverlap += bestOverlap
        matchCount++
      }
    }
    
    // Model-only components (no GT overlap)
    const modelOnly = modelComps.filter(mc => 
      !gt.components.some(gtComp => 
        rangesOverlap(gtComp.start, gtComp.end, mc.start, mc.end)
      )
    ).length
    
    const avgOverlap = matchCount > 0 ? Math.round(totalOverlap / matchCount) : 0
    const gtCoverage = gt.components.length > 0 ? Math.round((gtMatched / gt.components.length) * 100) : 0
    
    return {
      name: model.modelName,
      total: modelComps.length,
      gtMatched,
      modelOnly,
      avgOverlap,
      gtCoverage
    }
  })

  return (
    <div className="mb-4 p-3 bg-muted/30 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-foreground text-sm">Segmentation Summary</div>
        <div className="text-sm text-muted-foreground">
          Ground Truth: <span className="font-mono font-medium">{gt.components.length}</span> components
        </div>
      </div>
      
      {/* Model stats in horizontal layout */}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${modelStats.length}, 1fr)` }}>
        {modelStats.map(stat => (
          <div key={stat.name} className="bg-card rounded-md px-3 py-2 border border-border">
            <div className="font-medium text-foreground text-sm mb-1.5">{stat.name}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Components:</span>
                <span className="font-mono">{stat.total}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GT coverage:</span>
                <span className={cn(
                  "font-mono font-medium",
                  stat.gtCoverage >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                  stat.gtCoverage >= 50 ? "text-amber-600 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                )}>{stat.gtCoverage}%</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Avg overlap:</span>
                <span className={cn(
                  "font-mono font-medium",
                  stat.avgOverlap >= 80 ? "text-emerald-600 dark:text-emerald-400" :
                  stat.avgOverlap >= 50 ? "text-amber-600 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                )}>{stat.avgOverlap}%</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Model-only:</span>
                <span className={cn(
                  "font-mono font-medium",
                  stat.modelOnly === 0 ? "text-emerald-600 dark:text-emerald-400" :
                  stat.modelOnly <= 2 ? "text-amber-600 dark:text-amber-400" :
                  "text-orange-600 dark:text-orange-400"
                )}>{stat.modelOnly}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [logRuns, setLogRuns] = useState<LogRun[]>([])
  const [essays, setEssays] = useState<EssayData[]>([])
  const [selectedEssayId, setSelectedEssayId] = useState<string>("")
  const [selectedRuns, setSelectedRuns] = useState<Record<string, string>>({}) // model -> folder
  const [modelAnnotations, setModelAnnotations] = useState<Record<string, string>>({}) // folder -> annotation
  const [essayStats, setEssayStats] = useState<Record<string, { maxGtCoverage: number; minGtCoverage: number; maxModelOnly: number }>>({})
  const [mainTab, setMainTab] = useState("explore")
  const [loading, setLoading] = useState(true)
  const [promptViewMode, setPromptViewMode] = useState<"raw" | "markdown">("markdown")

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

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/data")
        const data = await res.json()
        
        setLogRuns(data.runs || [])
        setEssays(data.essays || [])
        
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
    if (!selectedEssayId || Object.keys(selectedRuns).length === 0) return
    
    // Clear previous annotations immediately when essay changes
    setModelAnnotations({})
    
    async function loadAnnotations() {
      const annotations: Record<string, string> = {}
      
      // Load all annotations in parallel
      const promises = Object.values(selectedRuns).map(async (folder) => {
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
  }, [selectedEssayId, selectedRuns])

  // Load stats for all essays when runs change
  useEffect(() => {
    if (Object.keys(selectedRuns).length === 0) return
    
    async function loadStats() {
      try {
        const runsParam = encodeURIComponent(JSON.stringify(selectedRuns))
        const res = await fetch(`/api/data?action=stats&runs=${runsParam}`)
        const data = await res.json()
        
        if (data.stats) {
          const statsMap: Record<string, { maxGtCoverage: number; minGtCoverage: number; maxModelOnly: number }> = {}
          for (const stat of data.stats) {
            statsMap[stat.essayId] = {
              maxGtCoverage: stat.maxGtCoverage,
              minGtCoverage: stat.minGtCoverage,
              maxModelOnly: stat.maxModelOnly
            }
          }
          setEssayStats(statsMap)
        }
      } catch (error) {
        console.error("Failed to load stats:", error)
      }
    }
    
    loadStats()
  }, [selectedRuns])

  // Build essay object for viewer
  const selectedEssayData = essays.find(e => e.id === selectedEssayId)
  
  const selectedEssay: Essay | null = selectedEssayData ? {
    id: selectedEssayData.id,
    title: selectedEssayData.name,
    text: selectedEssayData.text,
    groundTruth: selectedEssayData.goldAnnotation 
      ? parseBrat(selectedEssayData.goldAnnotation)
      : { components: [], stances: [], relations: [] },
    modelResults: Object.entries(selectedRuns).map(([model, folder]) => {
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
    }).filter(r => r.annotation.components.length > 0)
  } : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const essayCount = essays.length
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
              {essayCount} essay{essayCount !== 1 ? "s" : ""}
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
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">
                Model Runs
              </h2>
              
              <div className="grid grid-cols-3 gap-2">
                {modelNames.map(model => {
                  // Format selected run's timestamp for display
                  const selectedFolder = selectedRuns[model]
                  const selectedRun = runsByModel[model]?.find(r => r.folder === selectedFolder)
                  const selectedTime = selectedRun ? 
                    `${selectedRun.timestamp.slice(4, 6)}/${selectedRun.timestamp.slice(6, 8)} ${selectedRun.timestamp.slice(9, 11)}:${selectedRun.timestamp.slice(11, 13)}` 
                    : ""
                  // Get the display name from the first run of this model
                  const modelDisplayName = runsByModel[model]?.[0]?.modelDisplayName || model
                  
                  return (
                    <div key={model}>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase block mb-1" title={modelDisplayName}>
                        {modelDisplayName}
                      </label>
                      <Select
                        value={selectedRuns[model] || ""}
                        onValueChange={(value) => {
                          setSelectedRuns(prev => ({ ...prev, [model]: value }))
                        }}
                      >
                        <SelectTrigger className="w-full h-7 text-[10px]">
                          <SelectValue placeholder="Select">
                            {selectedTime}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {runsByModel[model]?.map(run => {
                            // Format: MM/DD HH:MM
                            const formattedTime = `${run.timestamp.slice(4, 6)}/${run.timestamp.slice(6, 8)} ${run.timestamp.slice(9, 11)}:${run.timestamp.slice(11, 13)}`
                            return (
                              <SelectItem key={run.folder} value={run.folder} className="text-xs">
                                {formattedTime}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Essay Selection */}
            <div className="shrink-0">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">
                Essay
              </h2>
              <span className="text-[10px] text-muted-foreground block mb-2">
                {essayCount} available
              </span>
              
              <Select
                value={selectedEssayId}
                onValueChange={setSelectedEssayId}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue placeholder="Select an essay" />
                </SelectTrigger>
                <SelectContent>
                  {essays.map((essay, index) => {
                    const stats = essayStats[essay.id]
                    return (
                      <SelectItem key={essay.id} value={essay.id} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{String(index + 1).padStart(2, '0')}.</span>
                          <span className="truncate max-w-[180px]">
                            {essay.name.length > 30 ? essay.name.slice(0, 30) + "..." : essay.name}
                          </span>
                          {stats && (
                            <div className="flex items-center gap-1 ml-auto">
                              <span 
                                className={cn(
                                  "text-[9px] px-1 rounded font-mono",
                                  stats.maxGtCoverage >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                  stats.maxGtCoverage >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                )}
                                title="Best GT coverage across models"
                              >
                                ↑{stats.maxGtCoverage}%
                              </span>
                              <span 
                                className={cn(
                                  "text-[9px] px-1 rounded font-mono",
                                  stats.minGtCoverage >= 80 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                                  stats.minGtCoverage >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                  "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                )}
                                title="Worst GT coverage across models"
                              >
                                ↓{stats.minGtCoverage}%
                              </span>
                              {stats.maxModelOnly > 0 && (
                                <span 
                                  className="text-[9px] px-1 rounded font-mono bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                                  title="Max model-only components"
                                >
                                  +{stats.maxModelOnly}
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
                  <span>↓worst GT coverage</span>
                  <span className="text-orange-600 dark:text-orange-400">+N max model-only</span>
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
                <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold text-foreground">
                      Essay {String(essays.findIndex(e => e.id === selectedEssayId) + 1).padStart(2, '0')}: {selectedEssay.title}
                    </h3>
                    <span className="text-xs text-muted-foreground font-mono px-2 py-1 bg-muted rounded">
                      {selectedEssay.text.length} chars
                    </span>
                    <span className="text-xs text-muted-foreground font-mono px-2 py-1 bg-muted rounded">
                      {selectedEssay.groundTruth.components.length} gold components
                    </span>
                  </div>
                  
                  {/* Navigation buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const currentIndex = essays.findIndex(e => e.id === selectedEssayId)
                        if (currentIndex > 0) {
                          setSelectedEssayId(essays[currentIndex - 1].id)
                        }
                      }}
                      disabled={essays.findIndex(e => e.id === selectedEssayId) === 0}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors",
                        essays.findIndex(e => e.id === selectedEssayId) === 0
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
                      {essays.findIndex(e => e.id === selectedEssayId) + 1} / {essays.length}
                    </span>
                    <button
                      onClick={() => {
                        const currentIndex = essays.findIndex(e => e.id === selectedEssayId)
                        if (currentIndex < essays.length - 1) {
                          setSelectedEssayId(essays[currentIndex + 1].id)
                        }
                      }}
                      disabled={essays.findIndex(e => e.id === selectedEssayId) === essays.length - 1}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-md flex items-center gap-1 transition-colors",
                        essays.findIndex(e => e.id === selectedEssayId) === essays.length - 1
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

                <Tabs value={mainTab} onValueChange={setMainTab}>
                  <TabsList className="bg-muted mb-4">
                    <TabsTrigger value="explore">Explore</TabsTrigger>
                    <TabsTrigger value="compare-segmentation">Compare Models (Segmentation)</TabsTrigger>
                    <TabsTrigger value="compare-visual">Compare Models (Visual)</TabsTrigger>
                  </TabsList>

                  <TabsContent value="explore">
                    <EssayViewer essay={selectedEssay} />
                  </TabsContent>

                  <TabsContent value="compare-segmentation">
                    <div className="bg-card rounded-lg border border-border p-5">
                      {/* Stats summary at the top */}
                      {selectedEssay.modelResults.length > 0 && (
                        <EssaySegmentationStats essay={selectedEssay} />
                      )}
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
