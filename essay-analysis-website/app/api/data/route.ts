import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const ROOT_DIR = path.join(process.cwd(), "..")
const STATIC_DATA_PATH = path.join(process.cwd(), "public", "data", "all-data.json")
const TEXT_DIR = path.join(ROOT_DIR, "data", "text")
const GOLD_DIR = path.join(ROOT_DIR, "data", "gold_arg")

// Check if we're using static data (production/Vercel) or filesystem (development)
const useStaticData = fs.existsSync(STATIC_DATA_PATH)

interface StaticData {
  runs: LogRun[]
  essays: EssayData[]
  annotations: Record<string, Record<string, string>>
}

let staticData: StaticData | null = null

function getStaticData(): StaticData {
  if (!staticData && useStaticData) {
    staticData = JSON.parse(fs.readFileSync(STATIC_DATA_PATH, "utf-8"))
  }
  return staticData!
}

interface LogRun {
  model: string
  modelDisplayName: string
  timestamp: string
  folder: string
  displayName: string
  prompt: string | null
}

// Map short model names to detailed display names
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  azure: "Azure GPT-5.2",
  claude: "Claude Opus 4.5",
  gemini: "Gemini 2.5 Flash",
}

interface EssayData {
  id: string
  name: string
  text: string
  goldAnnotation: string | null
}

function extractPromptFromSummary(summaryContent: string): string | null {
  // Find the prompt section in the summary file
  const promptMarker = "PROMPT USED"
  const promptIndex = summaryContent.indexOf(promptMarker)
  
  if (promptIndex === -1) {
    return null
  }
  
  // Skip past the marker and the separator line
  const afterMarker = summaryContent.slice(promptIndex + promptMarker.length)
  const lines = afterMarker.split("\n")
  
  // Skip empty lines and separator lines (===)
  let startIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line && !line.match(/^=+$/)) {
      startIndex = i
      break
    }
  }
  
  // Get the rest as the prompt
  return lines.slice(startIndex).join("\n").trim()
}

function getLogRuns(): LogRun[] {
  // Use static data if available (production)
  if (useStaticData) {
    return getStaticData().runs
  }
  
  // Fall back to filesystem (development)
  const logsDir = path.join(ROOT_DIR, "logs")
  
  if (!fs.existsSync(logsDir)) {
    return []
  }
  
  const folders = fs.readdirSync(logsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  
  const runs: LogRun[] = []
  
  for (const folder of folders) {
    // Parse folder name: model_timestamp or model_all_timestamp (e.g., gemini_20260209_143755 or gemini_all_20260210_111150)
    const match = folder.match(/^(\w+?)(?:_all)?_(\d{8}_\d{6})$/)
    if (match) {
      const [, baseModel, timestamp] = match
      // Extract just the base model name (azure, claude, gemini)
      const model = baseModel
      // Format timestamp for display: 20260209_143755 -> 2026-02-09 14:37:55
      const formattedTime = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}`
      
      // Try to read the prompt from summary.txt
      let prompt: string | null = null
      const summaryPath = path.join(logsDir, folder, "summary.txt")
      if (fs.existsSync(summaryPath)) {
        const summaryContent = fs.readFileSync(summaryPath, "utf-8")
        prompt = extractPromptFromSummary(summaryContent)
      }
      
      const modelDisplayName = MODEL_DISPLAY_NAMES[model] || model.charAt(0).toUpperCase() + model.slice(1)
      
      // Add indicator if this is an "all" run
      const isAllRun = folder.includes("_all_")
      const runType = isAllRun ? " (All)" : ""
      
      runs.push({
        model,
        modelDisplayName,
        timestamp,
        folder,
        displayName: `${modelDisplayName}${runType} (${formattedTime})`,
        prompt
      })
    }
  }
  
  // Sort by timestamp descending (newest first)
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  
  return runs
}

function getEssays(): EssayData[] {
  // Use static data if available (production)
  if (useStaticData) {
    return getStaticData().essays
  }
  
  // Fall back to filesystem (development)
  const textDir = TEXT_DIR
  const goldDir = GOLD_DIR
  
  if (!fs.existsSync(textDir)) {
    return []
  }
  
  const textFiles = fs.readdirSync(textDir)
    .filter(f => f.endsWith(".txt"))
    .sort((a, b) => {
      // Custom sort to ensure v1 comes before v2 and proper numeric ordering
      const aMatch = a.match(/^(v\d+)_essay(\d+)\.txt$/)
      const bMatch = b.match(/^(v\d+)_essay(\d+)\.txt$/)
      
      if (aMatch && bMatch) {
        // Compare versions first
        if (aMatch[1] !== bMatch[1]) {
          return aMatch[1].localeCompare(bMatch[1])
        }
        // Then compare essay numbers numerically
        return parseInt(aMatch[2]) - parseInt(bMatch[2])
      }
      
      // Fallback to regular sort
      return a.localeCompare(b)
    })
  
  const essays: EssayData[] = []
  
  for (const file of textFiles) {
    const id = file.replace(".txt", "")
    const textPath = path.join(textDir, file)
    const goldPath = path.join(goldDir, `${id}.ann`)
    
    const text = fs.readFileSync(textPath, "utf-8")
    const goldAnnotation = fs.existsSync(goldPath) 
      ? fs.readFileSync(goldPath, "utf-8")
      : null
    
    // Extract title from first line of essay
    const firstLine = text.split("\n")[0].trim()
    const name = firstLine.length > 60 ? firstLine.slice(0, 60) + "..." : firstLine
    
    essays.push({
      id,
      name,
      text,
      goldAnnotation
    })
  }
  
  return essays
}

function getAnnotation(logFolder: string, essayId: string): string | null {
  // Use static data if available (production)
  if (useStaticData) {
    const data = getStaticData()
    return data.annotations[logFolder]?.[essayId] || null
  }
  
  // Fall back to filesystem (development)
  // Try with full essay ID first (e.g., v1_essay01.ann)
  let annPath = path.join(ROOT_DIR, "logs", logFolder, `${essayId}.ann`)
  
  if (fs.existsSync(annPath)) {
    return fs.readFileSync(annPath, "utf-8")
  }
  
  // If not found and essayId has version prefix, try without it
  // This handles older logs that don't have version prefix in filenames
  const versionMatch = essayId.match(/^v\d+_(.+)$/)
  if (versionMatch) {
    const essayIdWithoutVersion = versionMatch[1]
    annPath = path.join(ROOT_DIR, "logs", logFolder, `${essayIdWithoutVersion}.ann`)
    
    if (fs.existsSync(annPath)) {
      return fs.readFileSync(annPath, "utf-8")
    }
  }
  
  return null
}

// Helper to parse brat annotation format
function parseBratComponents(annotation: string): { start: number; end: number; type: string }[] {
  const components: { start: number; end: number; type: string }[] = []
  const lines = annotation.split("\n")
  
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("T")) {
      // Match: T1<tab or space>MajorClaim 391 490<tab or space>text content
      const match = trimmed.match(/^T\d+[\t\s]+(\w+)\s+(\d+)\s+(\d+)/)
      if (match) {
        const type = match[1]
        const start = parseInt(match[2], 10)
        const end = parseInt(match[3], 10)
        if (!isNaN(start) && !isNaN(end)) {
          components.push({ start, end, type })
        }
      }
    }
  }
  
  return components
}

// Helper to check if two ranges overlap
function rangesOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
  return start1 < end2 && start2 < end1
}

// Calculate IoU (Intersection over Union)
function calculateIoU(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  const intersection = Math.max(0, overlapEnd - overlapStart)
  
  if (intersection === 0) return 0
  
  const span1 = end1 - start1
  const span2 = end2 - start2
  const union = span1 + span2 - intersection
  
  return union > 0 ? intersection / union : 0
}

// Calculate overlap percentage
function overlapPercentage(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2)
  const overlapEnd = Math.min(end1, end2)
  const overlapLength = Math.max(0, overlapEnd - overlapStart)
  const range1Length = end1 - start1
  return range1Length > 0 ? Math.round((overlapLength / range1Length) * 100) : 0
}

interface EssayStats {
  essayId: string
  gtCount: number
  models: {
    name: string
    total: number
    gtCoverage: number
    avgOverlap: number
    modelOnly: number
    f1: number
  }[]
  // Aggregate stats
  avgGtCoverage: number
  avgOverlap: number
  totalModelOnly: number
  // Min/max stats for essay selector
  maxGtCoverage: number
  minGtCoverage: number
  maxModelOnly: number
  // F1 stats for essay selector
  maxF1: number
  minF1: number | null  // null if essay is missing from some runs
}

function computeAllEssayStats(selectedRuns: Record<string, string>): EssayStats[] {
  const essays = getEssays()
  const stats: EssayStats[] = []
  const iouThreshold = 0.5
  
  for (const essay of essays) {
    if (!essay.goldAnnotation) continue
    
    const gtComps = parseBratComponents(essay.goldAnnotation)
    const modelStats: EssayStats["models"] = []
    
    for (const [model, folder] of Object.entries(selectedRuns)) {
      const annotation = getAnnotation(folder, essay.id)
      if (!annotation) continue
      
      const modelComps = parseBratComponents(annotation)
      
      // Calculate legacy stats (GT coverage, overlap)
      let gtMatched = 0
      let totalOverlap = 0
      let matchCount = 0
      
      for (const gtComp of gtComps) {
        const overlapping = modelComps.filter(mc => 
          rangesOverlap(gtComp.start, gtComp.end, mc.start, mc.end)
        )
        if (overlapping.length > 0) {
          gtMatched++
          const bestOverlap = Math.max(...overlapping.map(mc => 
            overlapPercentage(gtComp.start, gtComp.end, mc.start, mc.end)
          ))
          totalOverlap += bestOverlap
          matchCount++
        }
      }
      
      const modelOnly = modelComps.filter(mc => 
        !gtComps.some(gtComp => 
          rangesOverlap(gtComp.start, gtComp.end, mc.start, mc.end)
        )
      ).length
      
      const avgOverlap = matchCount > 0 ? Math.round(totalOverlap / matchCount) : 0
      const gtCoverage = gtComps.length > 0 ? Math.round((gtMatched / gtComps.length) * 100) : 0
      
      // Calculate F1 with IoU threshold and type matching
      const matchedGold = new Set<number>()
      let tp = 0
      
      for (const pred of modelComps) {
        let bestIoU = 0
        let bestGoldIdx: number | null = null
        
        for (let i = 0; i < gtComps.length; i++) {
          if (matchedGold.has(i)) continue
          
          const gold = gtComps[i]
          // Type must match
          if (pred.type !== gold.type) continue
          
          const iou = calculateIoU(pred.start, pred.end, gold.start, gold.end)
          if (iou > bestIoU) {
            bestIoU = iou
            bestGoldIdx = i
          }
        }
        
        if (bestIoU >= iouThreshold && bestGoldIdx !== null) {
          tp++
          matchedGold.add(bestGoldIdx)
        }
      }
      
      const fp = modelComps.length - tp
      const fn = gtComps.length - matchedGold.size
      const precision = (tp + fp) > 0 ? tp / (tp + fp) : 0
      const recall = (tp + fn) > 0 ? tp / (tp + fn) : 0
      const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0
      
      modelStats.push({
        name: model,
        total: modelComps.length,
        gtCoverage,
        avgOverlap,
        modelOnly,
        f1: Math.round(f1 * 100)
      })
    }
    
    // Compute aggregates
    const avgGtCoverage = modelStats.length > 0 
      ? Math.round(modelStats.reduce((sum, m) => sum + m.gtCoverage, 0) / modelStats.length)
      : 0
    const avgOverlap = modelStats.length > 0
      ? Math.round(modelStats.reduce((sum, m) => sum + m.avgOverlap, 0) / modelStats.length)
      : 0
    const totalModelOnly = modelStats.reduce((sum, m) => sum + m.modelOnly, 0)
    
    // Compute min/max for essay selector
    const gtCoverages = modelStats.map(m => m.gtCoverage)
    const maxGtCoverage = gtCoverages.length > 0 ? Math.max(...gtCoverages) : 0
    const minGtCoverage = gtCoverages.length > 0 ? Math.min(...gtCoverages) : 0
    const maxModelOnly = modelStats.length > 0 ? Math.max(...modelStats.map(m => m.modelOnly)) : 0
    
    // Compute F1 min/max
    // Only compute minF1 if all selected runs have this essay
    const f1Scores = modelStats.map(m => m.f1)
    const maxF1 = f1Scores.length > 0 ? Math.max(...f1Scores) : 0
    const numSelectedRuns = Object.keys(selectedRuns).length
    const hasAllRuns = modelStats.length === numSelectedRuns
    const minF1 = hasAllRuns && f1Scores.length > 0 ? Math.min(...f1Scores) : null
    
    stats.push({
      essayId: essay.id,
      gtCount: gtComps.length,
      models: modelStats,
      avgGtCoverage,
      avgOverlap,
      totalModelOnly,
      maxGtCoverage,
      minGtCoverage,
      maxModelOnly,
      maxF1,
      minF1
    })
  }
  
  return stats
}

// Compute overall F1 scores across all essays for each model
interface OverallF1Stats {
  model: string
  folder: string
  tp: number
  fp: number
  fn: number
  precision: number
  recall: number
  f1: number
  essayCount: number
}

function computeOverallF1(selectedRuns: Record<string, string>, iouThreshold: number = 0.5, keyByFolder: boolean = false): OverallF1Stats[] {
  const essays = getEssays()
  const modelStats: Record<string, { tp: number; fp: number; fn: number; essayCount: number; folder: string; model: string }> = {}
  
  // Initialize stats for each model/folder
  for (const [model, folder] of Object.entries(selectedRuns)) {
    const key = keyByFolder ? folder : model
    modelStats[key] = { tp: 0, fp: 0, fn: 0, essayCount: 0, folder, model }
  }
  
  for (const essay of essays) {
    if (!essay.goldAnnotation) continue
    
    const gtComps = parseBratComponents(essay.goldAnnotation)
    
    for (const [model, folder] of Object.entries(selectedRuns)) {
      const key = keyByFolder ? folder : model
      const annotation = getAnnotation(folder, essay.id)
      if (!annotation) continue
      
      const predComps = parseBratComponents(annotation)
      
      // Greedy matching with IoU threshold and type matching
      const matchedGold = new Set<number>()
      let tp = 0
      
      for (const pred of predComps) {
        let bestIoU = 0
        let bestGoldIdx: number | null = null
        
        for (let i = 0; i < gtComps.length; i++) {
          if (matchedGold.has(i)) continue
          
          const gold = gtComps[i]
          // Type must match
          if (pred.type !== gold.type) continue
          
          const iou = calculateIoU(pred.start, pred.end, gold.start, gold.end)
          if (iou > bestIoU) {
            bestIoU = iou
            bestGoldIdx = i
          }
        }
        
        if (bestIoU >= iouThreshold && bestGoldIdx !== null) {
          tp++
          matchedGold.add(bestGoldIdx)
        }
      }
      
      const fp = predComps.length - tp
      const fn = gtComps.length - matchedGold.size
      
      modelStats[key].tp += tp
      modelStats[key].fp += fp
      modelStats[key].fn += fn
      modelStats[key].essayCount++
    }
  }
  
  // Calculate precision, recall, F1 for each model
  const results: OverallF1Stats[] = []
  
  for (const [key, stats] of Object.entries(modelStats)) {
    const precision = (stats.tp + stats.fp) > 0 ? stats.tp / (stats.tp + stats.fp) : 0
    const recall = (stats.tp + stats.fn) > 0 ? stats.tp / (stats.tp + stats.fn) : 0
    const f1 = (precision + recall) > 0 ? 2 * precision * recall / (precision + recall) : 0
    
    results.push({
      model: key,
      folder: stats.folder,
      tp: stats.tp,
      fp: stats.fp,
      fn: stats.fn,
      precision,
      recall,
      f1,
      essayCount: stats.essayCount
    })
  }
  
  return results
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get("action")
  
  if (action === "runs") {
    // Get all available log runs
    const runs = getLogRuns()
    return NextResponse.json({ runs })
  }
  
  if (action === "essays") {
    // Get all essays with their text and gold annotations
    const essays = getEssays()
    return NextResponse.json({ essays })
  }
  
  if (action === "annotation") {
    // Get annotation for a specific essay from a specific log run
    const logFolder = searchParams.get("logFolder")
    const essayId = searchParams.get("essayId")
    
    if (!logFolder || !essayId) {
      return NextResponse.json({ error: "Missing logFolder or essayId" }, { status: 400 })
    }
    
    const annotation = getAnnotation(logFolder, essayId)
    return NextResponse.json({ annotation })
  }
  
  if (action === "availableEssays") {
    // Get list of essay IDs that have annotations in a specific log run
    const logFolder = searchParams.get("logFolder")
    
    if (!logFolder) {
      return NextResponse.json({ error: "Missing logFolder" }, { status: 400 })
    }
    
    const essayIds: string[] = []
    
    if (useStaticData) {
      const data = getStaticData()
      const folderAnnotations = data.annotations[logFolder]
      if (folderAnnotations) {
        essayIds.push(...Object.keys(folderAnnotations))
      }
    } else {
      // Check filesystem
      const logPath = path.join(ROOT_DIR, "logs", logFolder)
      if (fs.existsSync(logPath)) {
        const annFiles = fs.readdirSync(logPath)
          .filter(f => f.endsWith(".ann"))
        
        const essays = getEssays()
        const essayIdSet = new Set(essays.map(e => e.id))
        
        for (const annFile of annFiles) {
          const baseId = annFile.replace(".ann", "")
          
          // Check if this matches any essay ID directly
          if (essayIdSet.has(baseId)) {
            essayIds.push(baseId)
          } else {
            // Check if we need to add version prefix
            for (const essayId of essayIdSet) {
              const versionMatch = essayId.match(/^(v\d+)_(.+)$/)
              if (versionMatch && versionMatch[2] === baseId) {
                essayIds.push(essayId)
                break
              }
            }
          }
        }
      }
    }
    
    return NextResponse.json({ essayIds })
  }
  
  if (action === "stats") {
    // Get segmentation stats for all essays with the selected runs
    const runsParam = searchParams.get("runs")
    
    if (!runsParam) {
      return NextResponse.json({ error: "Missing runs parameter" }, { status: 400 })
    }
    
    try {
      const selectedRuns = JSON.parse(runsParam) as Record<string, string>
      const stats = computeAllEssayStats(selectedRuns)
      return NextResponse.json({ stats })
    } catch {
      return NextResponse.json({ error: "Invalid runs parameter" }, { status: 400 })
    }
  }
  
  if (action === "overallF1") {
    // Get overall F1 scores across all essays for each model
    const runsParam = searchParams.get("runs")
    const keyByFolder = searchParams.get("keyByFolder") === "true"
    
    if (!runsParam) {
      return NextResponse.json({ error: "Missing runs parameter" }, { status: 400 })
    }
    
    try {
      const selectedRuns = JSON.parse(runsParam) as Record<string, string>
      const overallF1 = computeOverallF1(selectedRuns, 0.5, keyByFolder)
      return NextResponse.json({ overallF1 })
    } catch {
      return NextResponse.json({ error: "Invalid runs parameter" }, { status: 400 })
    }
  }
  
  // Default: return all data for initial load
  const runs = getLogRuns()
  const essays = getEssays()
  
  return NextResponse.json({ runs, essays })
}
