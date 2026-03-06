// file: src/components/SubscribedApp.tsx
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import Queue from "../_pages/Queue"
import Solutions from "../_pages/Solutions"
import { useToast } from "../contexts/toast"

interface SubscribedAppProps {
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}

const SubscribedApp: React.FC<SubscribedAppProps> = ({
  credits,
  currentLanguage,
  setLanguage
}) => {
  const queryClient = useQueryClient()
  const [view, setView] = useState<"queue" | "solutions" | "debug">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  // Let's ensure we reset queries etc. if some electron signals happen
  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(() => {
      queryClient.invalidateQueries({
        queryKey: ["screenshots"]
      })
      queryClient.invalidateQueries({
        queryKey: ["problem_statement"]
      })
      queryClient.invalidateQueries({
        queryKey: ["solution"]
      })
      queryClient.invalidateQueries({
        queryKey: ["new_solution"]
      })
      setView("queue")
    })

    return () => {
      cleanup()
    }
  }, [])

  // Dynamically update the window size
  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight || 600
      const width = containerRef.current.scrollWidth || 800
      window.electronAPI?.updateContentDimensions({ width, height })
    }

    // Force initial dimension update immediately
    updateDimensions()
    
    // Set a fallback timer to ensure dimensions are set even if content isn't fully loaded
    const fallbackTimer = setTimeout(() => {
      window.electronAPI?.updateContentDimensions({ width: 800, height: 600 })
    }, 500)

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.current)

    // Also watch DOM changes
    const mutationObserver = new MutationObserver(updateDimensions)
    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    // Do another update after a delay to catch any late-loading content
    const delayedUpdate = setTimeout(updateDimensions, 1000)

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      clearTimeout(fallbackTimer)
      clearTimeout(delayedUpdate)
    }
  }, [view])

  // Listen for events that might switch views or show errors
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
      }),
      window.electronAPI.onUnauthorized(() => {
        queryClient.removeQueries({
          queryKey: ["screenshots"]
        })
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["problem_statement"]
        })
        setView("queue")
      }),
      window.electronAPI.onResetView(() => {
        queryClient.removeQueries({
          queryKey: ["screenshots"]
        })
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["problem_statement"]
        })
        setView("queue")
      }),
      window.electronAPI.onResetView(() => {
        queryClient.setQueryData(["problem_statement"], null)
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        if (view === "queue") {
          queryClient.invalidateQueries({
            queryKey: ["problem_statement"]
          })
          queryClient.setQueryData(["problem_statement"], data)
        }
      }),
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Error", error, "error")
      })
    ]
    return () => cleanupFunctions.forEach((fn) => fn())
  }, [view])

  useEffect(() => {
    const isScrollable = (element: HTMLElement): boolean => {
      const style = window.getComputedStyle(element)
      const overflowY = style.overflowY
      const canScroll =
        (overflowY === "auto" || overflowY === "scroll") &&
        element.scrollHeight > element.clientHeight + 2
      return canScroll && element.clientHeight > 0
    }

    const resolveScrollTarget = (): HTMLElement | null => {
      const active = document.activeElement as HTMLElement | null
      let node = active
      while (node) {
        if (isScrollable(node)) return node
        node = node.parentElement
      }

      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(".overflow-auto, .overflow-y-auto")
      ).filter(isScrollable)

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.clientHeight - a.clientHeight)
        return candidates[0]
      }

      return null
    }

    const unsubscribe = window.electronAPI.onAnswerScroll(({ direction, amount = 140 }) => {
      if (view !== "solutions" && view !== "debug") return

      const delta = direction === "up" ? -Math.abs(amount) : Math.abs(amount)
      const target = resolveScrollTarget()
      if (target) {
        target.scrollBy({ top: delta, behavior: "auto" })
        return
      }

      window.scrollBy({ top: delta, behavior: "auto" })
    })

    return () => {
      unsubscribe()
    }
  }, [view])

  return (
    <div ref={containerRef} className="min-h-0">
      {view === "queue" ? (
        <Queue
          setView={setView}
          credits={credits}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : view === "solutions" ? (
        <Solutions
          setView={setView}
          credits={credits}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : null}
    </div>
  )
}

export default SubscribedApp
