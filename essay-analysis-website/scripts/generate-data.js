#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const ROOT_DIR = path.join(__dirname, "..", "..")
const OUTPUT_DIR = path.join(__dirname, "..", "public", "data")

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
    const match = folder.match(/^(\w+)_(\d{8}_\d{6})$/)
    if (match) {
      const [, model, timestamp] = match
      const formattedTime = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}`
      
      let prompt = null
      const summaryPath = path.join(logsDir, folder, "summary.txt")
      if (fs.existsSync(summaryPath)) {
        const summaryContent = fs.readFileSync(summaryPath, "utf-8")
        prompt = extractPromptFromSummary(summaryContent)
      }
      
      const modelDisplayName = MODEL_DISPLAY_NAMES[model] || model.charAt(0).toUpperCase() + model.slice(1)
      
      runs.push({
        model,
        modelDisplayName,
        timestamp,
        folder,
        displayName: `${modelDisplayName} (${formattedTime})`,
        prompt
      })
    }
  }
  
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  
  return runs
}

function getEssays() {
  const textDir = path.join(ROOT_DIR, "text")
  const goldDir = path.join(ROOT_DIR, "gold_arg")
  
  if (!fs.existsSync(textDir)) {
    return []
  }
  
  const textFiles = fs.readdirSync(textDir)
    .filter(f => f.endsWith(".txt"))
    .sort()
  
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
  
  for (const folder of folders) {
    const folderPath = path.join(logsDir, folder)
    const annFiles = fs.readdirSync(folderPath)
      .filter(f => f.endsWith(".ann"))
    
    for (const annFile of annFiles) {
      const essayId = annFile.replace(".ann", "")
      const annPath = path.join(folderPath, annFile)
      const content = fs.readFileSync(annPath, "utf-8")
      
      if (!annotations[folder]) {
        annotations[folder] = {}
      }
      annotations[folder][essayId] = content
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
