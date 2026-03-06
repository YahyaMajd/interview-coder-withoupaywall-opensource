import fs from "node:fs"
import path from "node:path"

const focusProbeLogPath = process.env.FOCUS_PROBE_LOG?.trim()
let probeLogInitialized = false
const focusProbeSessionId = `${process.pid}-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}`

export function isFocusProbeEnabled(): boolean {
  return Boolean(focusProbeLogPath)
}

function ensureProbeLogReady(): void {
  if (!focusProbeLogPath || probeLogInitialized) return
  fs.mkdirSync(path.dirname(focusProbeLogPath), { recursive: true })
  probeLogInitialized = true
}

export function logFocusProbe(
  source: string,
  event: string,
  payload: Record<string, unknown> = {}
): void {
  if (!focusProbeLogPath) return

  try {
    ensureProbeLogReady()
    fs.appendFileSync(
      focusProbeLogPath,
      `${JSON.stringify({
        ts: new Date().toISOString(),
        sessionId: focusProbeSessionId,
        pid: process.pid,
        ppid: process.ppid,
        source,
        event,
        payload
      })}\n`
    )
  } catch (error) {
    // Probe logging should never affect app behavior.
    console.error("Focus probe logging failed:", error)
  }
}
