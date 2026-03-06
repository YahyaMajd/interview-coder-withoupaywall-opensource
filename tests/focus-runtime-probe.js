#!/usr/bin/env node

const { execFileSync, spawn } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

if (process.platform !== "darwin") {
  console.error("This runtime probe currently supports macOS only.")
  process.exit(1)
}

const DEFAULT_TARGET_BUNDLE_ID = "com.chunginlee.interviewcoder"
const DEFAULT_TARGET_NAME_REGEX = "^Interview Coder$"
const DEFAULT_INTERVAL_MS = 150
const DEFAULT_CORRELATION_MS = 2000
const DEFAULT_APP_LOG = path.join(os.tmpdir(), "interview-coder-focus-events.jsonl")
const DEFAULT_PID_FILE = path.join(os.tmpdir(), "interview-coder-focus-probe.pid")
const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "tests", "artifacts")

function parseArgs(argv) {
  const options = {
    intervalMs: DEFAULT_INTERVAL_MS,
    correlationMs: DEFAULT_CORRELATION_MS,
    durationMs: null,
    targetBundleId: DEFAULT_TARGET_BUNDLE_ID,
    targetNameRegex: DEFAULT_TARGET_NAME_REGEX,
    targetUnixId: null,
    appLogPath: process.env.FOCUS_PROBE_LOG || DEFAULT_APP_LOG,
    pidFilePath: process.env.FOCUS_PROBE_PID_FILE || DEFAULT_PID_FILE,
    outputPath: null,
    truncateAppLog: true,
    background: false,
    childMode: false,
    stop: false,
    status: false,
    quiet: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === "--interval" && next) {
      options.intervalMs = Math.max(50, Number(next))
      index += 1
      continue
    }
    if (arg === "--correlation-ms" && next) {
      options.correlationMs = Math.max(100, Number(next))
      index += 1
      continue
    }
    if (arg === "--duration" && next) {
      options.durationMs = Math.max(1, Number(next)) * 1000
      index += 1
      continue
    }
    if (arg === "--target-bundle" && next) {
      options.targetBundleId = next
      index += 1
      continue
    }
    if (arg === "--target-name-regex" && next) {
      options.targetNameRegex = next
      index += 1
      continue
    }
    if (arg === "--target-unix-id" && next) {
      const parsed = Number(next)
      options.targetUnixId = Number.isFinite(parsed) ? parsed : null
      index += 1
      continue
    }
    if (arg === "--app-log" && next) {
      options.appLogPath = next
      index += 1
      continue
    }
    if (arg === "--pid-file" && next) {
      options.pidFilePath = next
      index += 1
      continue
    }
    if (arg === "--out" && next) {
      options.outputPath = next
      index += 1
      continue
    }
    if (arg === "--keep-app-log") {
      options.truncateAppLog = false
      continue
    }
    if (arg === "--help") {
      printHelp()
      process.exit(0)
    }
    if (arg === "--background") {
      options.background = true
      continue
    }
    if (arg === "--child") {
      options.childMode = true
      continue
    }
    if (arg === "--stop") {
      options.stop = true
      continue
    }
    if (arg === "--status") {
      options.status = true
      continue
    }
    if (arg === "--quiet") {
      options.quiet = true
      continue
    }
  }

  if (!Number.isFinite(options.intervalMs)) options.intervalMs = DEFAULT_INTERVAL_MS
  if (!Number.isFinite(options.correlationMs)) options.correlationMs = DEFAULT_CORRELATION_MS
  if (options.durationMs !== null && !Number.isFinite(options.durationMs)) {
    options.durationMs = null
  }

  return options
}

function printHelp() {
  console.log(`
Usage: node tests/focus-runtime-probe.js [options]

Options:
  --duration <seconds>         Auto-stop after N seconds (default: run until Ctrl+C)
  --interval <ms>              Poll interval for frontmost app (default: 150)
  --correlation-ms <ms>        Match window between focus changes and app events (default: 2000)
  --target-bundle <bundleId>   Target bundle id (default: com.chunginlee.interviewcoder)
  --target-name-regex <regex>  Target app name regex (default: ^Interview Coder$)
  --target-unix-id <pid>       Target frontmost unix process id (highest priority matcher)
  --app-log <path>             App probe log path (default: $FOCUS_PROBE_LOG or /tmp/interview-coder-focus-events.jsonl)
  --pid-file <path>            Background probe PID metadata file (default: /tmp/interview-coder-focus-probe.pid)
  --keep-app-log               Do not truncate app log at start
  --out <path>                 Output report JSON path
  --background                 Launch probe detached and return immediately
  --status                     Show background probe status from --pid-file and exit
  --stop                       Stop background probe from --pid-file and exit
  --quiet                      Reduce console output
  --help                       Show this help
`)
}

function computeOutputPath(options) {
  if (options.outputPath) return options.outputPath
  return path.join(
    DEFAULT_OUTPUT_DIR,
    `focus-runtime-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  )
}

function readPidFile(pidFilePath) {
  if (!fs.existsSync(pidFilePath)) return null

  try {
    const raw = fs.readFileSync(pidFilePath, "utf8").trim()
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Number.isFinite(parsed.pid)) return null
    return parsed
  } catch (error) {
    return null
  }
}

function writePidFile(pidFilePath, payload) {
  fs.mkdirSync(path.dirname(pidFilePath), { recursive: true })
  fs.writeFileSync(pidFilePath, `${JSON.stringify(payload, null, 2)}\n`)
}

function removePidFile(pidFilePath) {
  try {
    if (fs.existsSync(pidFilePath)) {
      fs.unlinkSync(pidFilePath)
    }
  } catch (error) {
    // Ignore cleanup errors.
  }
}

function removePidFileIfOwned(pidFilePath, pid) {
  const current = readPidFile(pidFilePath)
  if (!current) return
  if (current.pid !== pid) return
  removePidFile(pidFilePath)
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return false
  }
}

function printBackgroundStatus(options) {
  const metadata = readPidFile(options.pidFilePath)
  if (!metadata) {
    console.log("No background runtime focus probe is registered.")
    console.log(`- pid file: ${options.pidFilePath}`)
    return
  }

  const alive = isProcessAlive(metadata.pid)
  console.log("Runtime focus probe status:")
  console.log(`- pid: ${metadata.pid}`)
  console.log(`- alive: ${alive ? "yes" : "no"}`)
  console.log(`- started at: ${metadata.startedAt || "unknown"}`)
  console.log(`- report path: ${metadata.reportPath || "unknown"}`)
  console.log(`- app event log: ${metadata.appLogPath || "unknown"}`)
  console.log(`- pid file: ${options.pidFilePath}`)

  if (!alive) {
    console.log("- note: stale pid file detected, removing it")
    removePidFile(options.pidFilePath)
  }
}

function stopBackgroundChild(options) {
  const metadata = readPidFile(options.pidFilePath)
  if (!metadata) {
    console.log("No running background runtime focus probe found.")
    console.log(`- pid file: ${options.pidFilePath}`)
    return
  }

  if (!isProcessAlive(metadata.pid)) {
    console.log(`Background probe pid ${metadata.pid} is not running.`)
    removePidFile(options.pidFilePath)
    return
  }

  try {
    process.kill(metadata.pid, "SIGTERM")
    console.log(`Sent SIGTERM to background runtime focus probe pid ${metadata.pid}.`)
    console.log(`- expected report path: ${metadata.reportPath || "unknown"}`)
  } catch (error) {
    console.error(
      `Failed to stop background runtime focus probe pid ${metadata.pid}:`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

function launchBackgroundChild(options) {
  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true })
  const outputPath = computeOutputPath(options)
  const existing = readPidFile(options.pidFilePath)
  if (existing && isProcessAlive(existing.pid)) {
    console.error(
      `A background runtime focus probe is already running (pid ${existing.pid}).`
    )
    console.error(
      `Stop it first with: node tests/focus-runtime-probe.js --stop --pid-file ${options.pidFilePath}`
    )
    process.exitCode = 1
    return
  }

  const childArgs = [__filename, "--child", "--quiet", "--out", outputPath]
  if (options.durationMs !== null) {
    childArgs.push("--duration", String(Math.round(options.durationMs / 1000)))
  }
  childArgs.push("--interval", String(options.intervalMs))
  childArgs.push("--correlation-ms", String(options.correlationMs))
  childArgs.push("--target-bundle", options.targetBundleId)
  childArgs.push("--target-name-regex", options.targetNameRegex)
  if (options.targetUnixId !== null) {
    childArgs.push("--target-unix-id", String(options.targetUnixId))
  }
  childArgs.push("--app-log", options.appLogPath)
  childArgs.push("--pid-file", options.pidFilePath)
  if (!options.truncateAppLog) {
    childArgs.push("--keep-app-log")
  }

  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    env: process.env
  })
  child.unref()

  writePidFile(options.pidFilePath, {
    pid: child.pid,
    startedAt: new Date().toISOString(),
    reportPath: outputPath,
    appLogPath: options.appLogPath
  })

  console.log("Runtime focus probe launched in background.")
  console.log(`- pid: ${child.pid}`)
  console.log(`- report path: ${outputPath}`)
  console.log(`- app event log: ${options.appLogPath}`)
  console.log(`- pid file: ${options.pidFilePath}`)
  if (options.durationMs === null) {
    console.log("- duration: until manually stopped")
    console.log(
      `- stop: node tests/focus-runtime-probe.js --stop --pid-file ${options.pidFilePath}`
    )
  } else {
    console.log(`- duration: ${Math.round(options.durationMs / 1000)}s`)
    console.log(
      `- early stop: node tests/focus-runtime-probe.js --stop --pid-file ${options.pidFilePath}`
    )
  }
}

function getFrontmostProcess() {
  const raw = execFileSync(
    "osascript",
    [
      "-e",
      'tell application "System Events"',
      "-e",
      'set frontProc to first application process whose frontmost is true',
      "-e",
      'return (name of frontProc) & "||" & (bundle identifier of frontProc) & "||" & (unix id of frontProc)',
      "-e",
      "end tell"
    ],
    { encoding: "utf8" }
  ).trim()

  const [name, bundleId, unixIdRaw] = raw.split("||")
  const unixId = Number(unixIdRaw)
  return {
    name: name || "unknown",
    bundleId: bundleId || "",
    unixId: Number.isFinite(unixId) ? unixId : null
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toUnixMs(iso) {
  const value = Date.parse(iso)
  return Number.isFinite(value) ? value : null
}

function safeReadJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, "utf8").trim()
  if (!content) return []

  const events = []
  for (const line of content.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line)
      events.push(parsed)
    } catch (error) {
      events.push({ parseError: true, raw: line })
    }
  }
  return events
}

function collectAppEventSessions(appEvents) {
  const bySession = new Map()
  for (const event of appEvents) {
    const sessionId = event.sessionId || "unknown-session"
    const key = `${sessionId}:${event.pid ?? "unknown-pid"}`
    const entry = bySession.get(key) || {
      sessionId,
      pid: event.pid ?? null,
      ppid: event.ppid ?? null,
      count: 0,
      firstTs: event.ts,
      lastTs: event.ts
    }
    entry.count += 1
    if (event.ts < entry.firstTs) entry.firstTs = event.ts
    if (event.ts > entry.lastTs) entry.lastTs = event.ts
    bySession.set(key, entry)
  }
  return Array.from(bySession.values()).sort((a, b) => b.count - a.count)
}

function dedupeAdjacentEvents(events) {
  const deduped = []
  for (const event of events) {
    const last = deduped[deduped.length - 1]
    if (
      last &&
      last.ts === event.ts &&
      last.sessionId === event.sessionId &&
      last.pid === event.pid &&
      last.source === event.source &&
      last.event === event.event &&
      JSON.stringify(last.payload || {}) === JSON.stringify(event.payload || {})
    ) {
      continue
    }
    deduped.push(event)
  }
  return deduped
}

function deriveTargetUnixIds(options, appEventSessions) {
  if (Number.isFinite(options.targetUnixId)) {
    return new Set([Number(options.targetUnixId)])
  }

  const ids = appEventSessions
    .map((session) => session.pid)
    .filter((pid) => Number.isFinite(pid))

  return new Set(ids)
}

function isTargetProcess(proc, targetBundleId, targetNameRe, targetUnixIds) {
  if (!proc) return false
  if (targetUnixIds && targetUnixIds.size > 0 && targetUnixIds.has(proc.unixId)) {
    return true
  }
  if (targetBundleId && proc.bundleId === targetBundleId) return true
  return targetNameRe.test(proc.name)
}

function findLikelyCause(appEvents, focusChangeTsMs, correlationMs) {
  let bestBefore = null
  let bestAfter = null

  for (const event of appEvents) {
    const eventTsMs = toUnixMs(event.ts)
    if (!eventTsMs) continue
    const delta = focusChangeTsMs - eventTsMs

    if (delta >= 0 && delta <= correlationMs) {
      if (!bestBefore || delta < bestBefore.deltaMs) {
        bestBefore = { ...event, deltaMs: delta, relation: "before" }
      }
      continue
    }

    if (delta < 0 && Math.abs(delta) <= 300) {
      const absDelta = Math.abs(delta)
      if (!bestAfter || absDelta < bestAfter.deltaMs) {
        bestAfter = { ...event, deltaMs: absDelta, relation: "after" }
      }
    }
  }

  return bestBefore || bestAfter || null
}

function summarize(focusChanges, appEvents, options) {
  const rows = []
  for (const change of focusChanges) {
    const tsMs = toUnixMs(change.ts)
    const likelyCause =
      tsMs === null ? null : findLikelyCause(appEvents, tsMs, options.correlationMs)

    rows.push({
      ...change,
      likelyCause: likelyCause
        ? {
            ts: likelyCause.ts,
            source: likelyCause.source,
            event: likelyCause.event,
            relation: likelyCause.relation,
            deltaMs: likelyCause.deltaMs,
            payload: likelyCause.payload || {}
          }
        : null
    })
  }
  return rows
}

function printSummary(rows) {
  if (rows.length === 0) {
    console.log("\nNo focus transitions involving the target app were detected.")
    return
  }

  console.log("\nFocus transition summary:")
  for (const row of rows) {
    const direction = row.type === "focus-gained" ? "FOCUS_GAINED" : "FOCUS_LOST "
    const from = `${row.from.name} (${row.from.bundleId || "no-bundle-id"})`
    const to = `${row.to.name} (${row.to.bundleId || "no-bundle-id"})`
    const cause = row.likelyCause
      ? `${row.likelyCause.source}:${row.likelyCause.event} (${row.likelyCause.relation} ${row.likelyCause.deltaMs}ms)`
      : "no app event matched"

    console.log(`- ${row.ts}  ${direction}`)
    console.log(`  from: ${from}`)
    console.log(`  to:   ${to}`)
    console.log(`  likely cause: ${cause}`)
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))
  if (options.childMode) {
    process.on("exit", () => removePidFileIfOwned(options.pidFilePath, process.pid))
  }
  if (options.stop) {
    stopBackgroundChild(options)
    return
  }
  if (options.status) {
    printBackgroundStatus(options)
    return
  }
  if (options.background && !options.childMode) {
    launchBackgroundChild(options)
    return
  }

  const targetNameRe = new RegExp(options.targetNameRegex, "i")
  const startedAt = new Date()
  const startedAtMs = Date.now()
  const endAtMs =
    options.durationMs === null ? Number.POSITIVE_INFINITY : startedAtMs + options.durationMs

  if (options.truncateAppLog) {
    fs.mkdirSync(path.dirname(options.appLogPath), { recursive: true })
    fs.writeFileSync(options.appLogPath, "")
  }

  if (!options.quiet) {
    console.log("Runtime focus probe started.")
    console.log(`- target bundle id: ${options.targetBundleId}`)
    console.log(`- target name regex: ${options.targetNameRegex}`)
    console.log(`- poll interval: ${options.intervalMs}ms`)
    console.log(`- app event log: ${options.appLogPath}`)
    if (options.durationMs === null) {
      console.log("- duration: until Ctrl+C")
    } else {
      console.log(`- duration: ${Math.round(options.durationMs / 1000)}s`)
    }
    console.log("\nUse the app now. Press Ctrl+C when done.\n")
  }

  const transitions = []
  let sampleCount = 0
  let stopRequested = false
  let previous = null

  const requestStop = () => {
    stopRequested = true
  }
  process.on("SIGINT", requestStop)
  process.on("SIGTERM", requestStop)

  while (!stopRequested && Date.now() < endAtMs) {
    const ts = new Date().toISOString()
    let current = null
    try {
      current = getFrontmostProcess()
    } catch (error) {
      transitions.push({
        ts,
        type: "probe-error",
        message: error instanceof Error ? error.message : String(error)
      })
      await sleep(options.intervalMs)
      continue
    }

    sampleCount += 1

    if (
      !previous ||
      previous.name !== current.name ||
      previous.bundleId !== current.bundleId ||
      previous.unixId !== current.unixId
    ) {
      transitions.push({
        ts,
        type: "frontmost-changed",
        from: previous,
        to: current
      })
      previous = current
    }

    await sleep(options.intervalMs)
  }

  const appEvents = dedupeAdjacentEvents(
    safeReadJsonLines(options.appLogPath).filter(
      (event) => event && !event.parseError && event.ts
    )
  )
  const appEventSessions = collectAppEventSessions(appEvents)
  const targetUnixIds = deriveTargetUnixIds(options, appEventSessions)

  const focusChanges = transitions
    .filter((event) => event.type === "frontmost-changed" && event.from && event.to)
    .map((event) => {
      const wasTarget = isTargetProcess(
        event.from,
        options.targetBundleId,
        targetNameRe,
        targetUnixIds
      )
      const isTarget = isTargetProcess(
        event.to,
        options.targetBundleId,
        targetNameRe,
        targetUnixIds
      )

      if (wasTarget === isTarget) return null

      return {
        ts: event.ts,
        type: isTarget ? "focus-gained" : "focus-lost",
        from: event.from,
        to: event.to
      }
    })
    .filter(Boolean)

  const summary = summarize(focusChanges, appEvents, options)

  fs.mkdirSync(DEFAULT_OUTPUT_DIR, { recursive: true })
  const outputPath = computeOutputPath(options)

  const report = {
    meta: {
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      sampleCount,
      options: {
        intervalMs: options.intervalMs,
        correlationMs: options.correlationMs,
        targetBundleId: options.targetBundleId,
        targetNameRegex: options.targetNameRegex,
        targetUnixIds: Array.from(targetUnixIds),
        appLogPath: options.appLogPath
      },
      appEventSessions
    },
    summary,
    transitions,
    appEvents
  }

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))
  printSummary(summary)
  const probeErrors = transitions.filter((event) => event.type === "probe-error")
  if (probeErrors.length > 0) {
    console.log(
      `\nProbe encountered ${probeErrors.length} macOS automation error(s). If needed, allow Terminal access in System Settings -> Privacy & Security -> Automation/Accessibility.`
    )
  }
  if (appEvents.length === 0) {
    console.log(
      "\nNo app-side probe events were captured. Start the app with FOCUS_PROBE_LOG set to correlate focus changes with shortcuts/actions."
    )
  } else if (appEventSessions.length > 1) {
    console.log(
      `\nDetected multiple app probe sessions (${appEventSessions.length}). This usually means multiple app processes were writing to the same log.`
    )
  }
  console.log(`\nReport written to: ${outputPath}`)

  if (options.childMode) {
    removePidFileIfOwned(options.pidFilePath, process.pid)
  }
}

run().catch((error) => {
  console.error("Focus runtime probe failed:", error)
  process.exit(1)
})
