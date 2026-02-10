#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const ROOT_DIR = path.join(__dirname, "..", "..")
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data")
const TEXT_DIR = path.join(ROOT_DIR, "data", "text")
const GOLD_DIR = path.join(ROOT_DIR, "data", "gold_arg")

// Map short model names to detailed display names
const MODEL_DISPLAY_NAMES = {
  azure: "Azure GPT-5.2",
  claude: "Claude Opus 4.5",
  gemini: "Gemini 2.5 Flash",
}

function extractPromptFromSummary(summaryContent) {
  const promptMarker = "PROMPT USED"
  const promptIndex = summaryContent.indexOf(promptMarker)
  
  if (promptIndex === -1) {
    return null
  }
  
  const afterMarker = summaryContent.slice(promptIndex + promptMarker.length)
  const lines = afterMarker.split("\n")
  
  let startIndex = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line && !line.match(/^=+$/)) {
      startIndex = i
      break
    }
  }
  
  return lines.slice(startIndex).join("\n").trim()
}

function getLogRuns() {
  const logsDir = path.join(ROOT_DIR, "logs")
  
  if (!fs.existsSync(logsDir)) {
    return []
  }
  
  const folders = fs.readdirSync(logsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  
  const runs = []
  
  for (const folder of folders) {
    const match = folder.match(/^(\w+?)(?:_all)?_(\d{8}_\d{6})$/)
    if (match) {
      const [, baseModel, timestamp] = match
      // Extract just the base model name (azure, claude, gemini)
      const model = baseModel
      const formattedTime = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}`
      
      let prompt = null
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
  
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  
  return runs
}

function getEssays() {
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
  
  const essays = []
  
  for (const file of textFiles) {
    const id = file.replace(".txt", "")
    const textPath = path.join(textDir, file)
    const goldPath = path.join(goldDir, `${id}.ann`)
    
    const text = fs.readFileSync(textPath, "utf-8")
    const goldAnnotation = fs.existsSync(goldPath) 
      ? fs.readFileSync(goldPath, "utf-8")
      : null
    
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

function getAnnotations() {
  const logsDir = path.join(ROOT_DIR, "logs")
  const annotations = {}
  
  if (!fs.existsSync(logsDir)) {
    return annotations
  }
  
  const folders = fs.readdirSync(logsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  
  // Get all essay IDs from the essays
  const essays = getEssays()
  const essayIds = essays.map(e => e.id)
  
  for (const folder of folders) {
    const folderPath = path.join(logsDir, folder)
    const annFiles = fs.readdirSync(folderPath)
      .filter(f => f.endsWith(".ann"))
    
    annotations[folder] = {}
    
    // For each essay ID, try to find its annotation
    for (const essayId of essayIds) {
      // Try with full essay ID first (e.g., v1_essay01.ann)
      let annPath = path.join(folderPath, `${essayId}.ann`)
      
      if (fs.existsSync(annPath)) {
        annotations[folder][essayId] = fs.readFileSync(annPath, "utf-8")
      } else {
        // If not found and essayId has version prefix, try without it
        const versionMatch = essayId.match(/^v\d+_(.+)$/)
        if (versionMatch) {
          const essayIdWithoutVersion = versionMatch[1]
          annPath = path.join(folderPath, `${essayIdWithoutVersion}.ann`)
          
          if (fs.existsSync(annPath)) {
            annotations[folder][essayId] = fs.readFileSync(annPath, "utf-8")
          }
        }
      }
    }
  }
  
  return annotations
}

// Main
const OUTPUT_FILE = path.join(OUTPUT_DIR, "all-data.json")

// Check if data already exists and has content (for Vercel deployment)
if (fs.existsSync(OUTPUT_FILE)) {
  try {
    const existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"))
    if (existingData.essays && existingData.essays.length > 0) {
      console.log("Static data already exists with content, skipping generation.")
      console.log(`  - ${existingData.runs?.length || 0} log runs`)
      console.log(`  - ${existingData.essays?.length || 0} essays`)
      console.log(`  - ${Object.keys(existingData.annotations || {}).length} annotation folders`)
      process.exit(0)
    }
  } catch (e) {
    // File exists but is invalid, regenerate
  }
}

console.log("Generating static data for Vercel deployment...")

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

const runs = getLogRuns()
const essays = getEssays()
const annotations = getAnnotations()

const data = {
  runs,
  essays,
  annotations
}

fs.writeFileSync(
  path.join(OUTPUT_DIR, "all-data.json"),
  JSON.stringify(data, null, 2)
)

console.log(`Generated data:`)
console.log(`  - ${runs.length} log runs`)
console.log(`  - ${essays.length} essays`)
console.log(`  - ${Object.keys(annotations).length} annotation folders`)
console.log(`Output: ${path.join(OUTPUT_DIR, "all-data.json")}`)
