import { globalShortcut, app } from "electron"
import { IShortcutsHelperDeps } from "./main"
import { configHelper } from "./ConfigHelper"
import { logFocusProbe } from "./focusProbe"

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  private registerShortcut(
    accelerator: string,
    action: string,
    handler: () => void | Promise<void>
  ): void {
    const registered = globalShortcut.register(accelerator, async () => {
      logFocusProbe("shortcut", "shortcut-triggered", { accelerator, action })
      await handler()
    })

    if (!registered) {
      logFocusProbe("shortcut", "shortcut-register-failed", {
        accelerator,
        action
      })
      console.warn(`Failed to register global shortcut: ${accelerator} (${action})`)
    }
  }

  private adjustOpacity(delta: number): void {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;
    
    let currentOpacity = mainWindow.getOpacity();
    let newOpacity = Math.max(0.1, Math.min(1.0, currentOpacity + delta));
    console.log(`Adjusting opacity from ${currentOpacity} to ${newOpacity}`);
    
    mainWindow.setOpacity(newOpacity);
    
    // Save the opacity setting to config without re-initializing the client
    try {
      const config = configHelper.loadConfig();
      config.opacity = newOpacity;
      configHelper.saveConfig(config);
    } catch (error) {
      console.error('Error saving opacity to config:', error);
    }
    
    // If we're making the window visible, also make sure it's shown and interaction is enabled
    if (newOpacity > 0.1 && !this.deps.isVisible()) {
      this.deps.toggleMainWindow();
    }
  }

  public registerGlobalShortcuts(): void {
    this.registerShortcut("CommandOrControl+H", "take-screenshot", async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        console.log("Taking screenshot...")
        try {
          const screenshotPath = await this.deps.takeScreenshot()
          const preview = await this.deps.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
        }
      }
    })

    this.registerShortcut("CommandOrControl+Enter", "process-screenshots", async () => {
      await this.deps.processingHelper?.processScreenshots()
    })

    this.registerShortcut("CommandOrControl+R", "reset-view", () => {
      console.log(
        "Command + R pressed. Canceling requests and resetting queues..."
      )

      // Cancel ongoing API requests
      this.deps.processingHelper?.cancelOngoingRequests()

      // Clear both screenshot queues
      this.deps.clearQueues()

      console.log("Cleared queues.")

      // Update the view state to 'queue'
      this.deps.setView("queue")

      // Notify renderer process to switch view to 'queue'
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }
    })

    // New shortcuts for moving the window
    this.registerShortcut("CommandOrControl+Left", "move-window-left", () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    })

    this.registerShortcut("CommandOrControl+Right", "move-window-right", () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    })

    this.registerShortcut("CommandOrControl+Down", "move-window-down", () => {
      console.log("Command/Ctrl + down pressed. Moving window down.")
      this.deps.moveWindowDown()
    })

    this.registerShortcut("CommandOrControl+Up", "move-window-up", () => {
      console.log("Command/Ctrl + Up pressed. Moving window Up.")
      this.deps.moveWindowUp()
    })

    this.registerShortcut("CommandOrControl+Shift+Down", "scroll-answer-down", () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("answer-scroll", {
          direction: "down",
          amount: 120
        })
      }
    })

    this.registerShortcut("CommandOrControl+Shift+Up", "scroll-answer-up", () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("answer-scroll", {
          direction: "up",
          amount: 120
        })
      }
    })

    this.registerShortcut("CommandOrControl+B", "toggle-visibility", () => {
      console.log("Command/Ctrl + B pressed. Toggling window visibility.")
      this.deps.toggleMainWindow()
    })

    this.registerShortcut("CommandOrControl+M", "toggle-click-through", () => {
      console.log("Command/Ctrl + M pressed. Toggling click-through mode.")
      this.deps.toggleClickThroughMode()
    })

    this.registerShortcut("CommandOrControl+Q", "quit-app", () => {
      console.log("Command/Ctrl + Q pressed. Quitting application.")
      app.quit()
    })

    // Adjust opacity shortcuts
    this.registerShortcut("CommandOrControl+[", "decrease-opacity", () => {
      console.log("Command/Ctrl + [ pressed. Decreasing opacity.")
      this.adjustOpacity(-0.1)
    })

    this.registerShortcut("CommandOrControl+]", "increase-opacity", () => {
      console.log("Command/Ctrl + ] pressed. Increasing opacity.")
      this.adjustOpacity(0.1)
    })
    
    // Zoom controls
    this.registerShortcut("CommandOrControl+-", "zoom-out", () => {
      console.log("Command/Ctrl + - pressed. Zooming out.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom - 0.5)
      }
    })
    
    this.registerShortcut("CommandOrControl+0", "zoom-reset", () => {
      console.log("Command/Ctrl + 0 pressed. Resetting zoom.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(0)
      }
    })
    
    this.registerShortcut("CommandOrControl+=", "zoom-in", () => {
      console.log("Command/Ctrl + = pressed. Zooming in.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom + 0.5)
      }
    })
    
    // Delete last screenshot shortcut
    this.registerShortcut("CommandOrControl+L", "delete-last-screenshot", () => {
      console.log("Command/Ctrl + L pressed. Deleting last screenshot.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        // Send an event to the renderer to delete the last screenshot
        mainWindow.webContents.send("delete-last-screenshot")
      }
    })
    
    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
