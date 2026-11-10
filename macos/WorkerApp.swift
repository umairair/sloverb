import AppKit
import UserNotifications
import Darwin

final class WorkerApp: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sloverb Worker")
    var item: NSStatusItem!
    var process: Process?
    var timer: Timer?
    var state: [String: Any] = [:]
    var lastStart = Date.distantPast
    var notifiedLow = false
    var notifiedReady = false
    var terminationSignal: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        signal(SIGTERM, SIG_IGN)
        terminationSignal = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        terminationSignal?.setEventHandler { [weak self] in self?.quitApp() }
        terminationSignal?.resume()
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "sloverb"
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        let resume = UNNotificationAction(identifier: "resume", title: "Resume", options: [])
        center.setNotificationCategories([UNNotificationCategory(identifier: "resume", actions: [resume], intentIdentifiers: [], options: [])])
        center.requestAuthorization(options: [.alert]) { _, _ in
            center.getNotificationSettings { settings in
                let data = try? JSONSerialization.data(withJSONObject: ["notification_authorization": settings.authorizationStatus.rawValue])
                try? data?.write(to: self.base.appendingPathComponent("ui-state.json"), options: .atomic)
            }
        }
        refresh()
        timer = Timer.scheduledTimer(timeInterval: 2, target: self, selector: #selector(refresh), userInfo: nil, repeats: true)
    }

    func read(_ name: String) -> [String: Any] {
        guard let data = try? Data(contentsOf: base.appendingPathComponent(name)),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }

    func startWorker() {
        if process?.isRunning == true || Date().timeIntervalSince(lastStart) < 10 { return }
        lastStart = Date()
        let runtime = base.appendingPathComponent("runtime")
        let child = Process()
        child.executableURL = runtime.appendingPathComponent(".venv/bin/python3")
        child.arguments = ["-m", "backend.worker", "--state-directory", base.path, "--parent-pid", String(ProcessInfo.processInfo.processIdentifier)]
        child.currentDirectoryURL = runtime
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = "\(runtime.path)/.venv/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env.removeValue(forKey: "WORKER_PUBLIC_KEY")
        child.environment = env
        let log = base.appendingPathComponent("worker.log")
        if let attrs = try? FileManager.default.attributesOfItem(atPath: log.path), let size = attrs[.size] as? Int, size > 524288 {
            try? FileManager.default.removeItem(at: base.appendingPathComponent("worker.previous.log"))
            try? FileManager.default.moveItem(at: log, to: base.appendingPathComponent("worker.previous.log"))
        }
        if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        if let output = try? FileHandle(forWritingTo: log) {
            output.seekToEndOfFile()
            child.standardOutput = output
            child.standardError = output
        }
        do { try child.run(); process = child } catch { state["status"] = "worker couldn't start" }
    }

    func notify(_ title: String, _ body: String, ready: Bool) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        if ready { content.categoryIdentifier = "resume" }
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            if ready && settings.authorizationStatus != .authorized && settings.authorizationStatus != .provisional {
                // Resume remains discoverable even if macOS banners are denied.
                DispatchQueue.main.async {
                    let alert = NSAlert()
                    alert.messageText = title
                    alert.informativeText = body
                    alert.addButton(withTitle: "Resume")
                    alert.addButton(withTitle: "Later")
                    NSApp.activate(ignoringOtherApps: true)
                    if alert.runModal() == .alertFirstButtonReturn { self.enable(true) }
                }
            } else {
                center.add(UNNotificationRequest(identifier: ready ? "sloverb-resume" : "sloverb-low-battery", content: content, trigger: nil)) { _ in }
            }
        }
    }

    @objc func refresh() {
        startWorker()
        state = read("state.json")
        let enabled = state["enabled"] as? Bool ?? false
        let reason = state["pause_reason"] as? String ?? ""
        let ready = state["resume_ready"] as? Bool ?? false
        if reason == "low_battery" {
            if ready && !notifiedReady {
                notify("Sloverb can resume", "Your Mac has enough power again. Resume downloads when you're ready.", ready: true)
                notifiedReady = true
            } else if !ready && !notifiedLow {
                notify("Sloverb paused at 10%", "Downloads stopped to save battery. Charge your Mac, then resume from the sloverb menu.", ready: false)
                notifiedLow = true
            }
        } else {
            notifiedLow = false
            notifiedReady = false
        }
        item.button?.title = enabled ? "sloverb" : "sloverb · paused"
        let menu = NSMenu()
        let status = state["status"] as? String ?? "starting"
        menu.addItem(NSMenuItem(title: status, action: nil, keyEquivalent: ""))
        if let battery = state["battery_percent"] as? Int { menu.addItem(NSMenuItem(title: "battery \(battery)%", action: nil, keyEquivalent: "")) }
        menu.addItem(.separator())
        let toggle = NSMenuItem(title: enabled ? "pause downloads" : "resume downloads", action: #selector(toggleWorker), keyEquivalent: "")
        toggle.target = self
        menu.addItem(toggle)
        let statusItem = NSMenuItem(title: "show status", action: #selector(showStatus), keyEquivalent: "")
        statusItem.target = self
        menu.addItem(statusItem)
        let open = NSMenuItem(title: "open sloverb", action: #selector(openSite), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "quit until next login", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        item.menu = menu
    }

    func enable(_ enabled: Bool) {
        if enabled && !(state["on_ac"] as? Bool ?? false) && (state["battery_percent"] as? Int ?? 0) <= 10 {
            let alert = NSAlert()
            alert.messageText = "Charge your Mac first"
            alert.informativeText = "Downloads stay paused at 10% or below while on battery."
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal()
            return
        }
        let data: [String: Any] = ["enabled": enabled, "reason": enabled ? "" : "manual"]
        if let bytes = try? JSONSerialization.data(withJSONObject: data) {
            let url = base.appendingPathComponent("control.json")
            try? bytes.write(to: url, options: .atomic)
            try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        }
        refresh()
    }

    @objc func toggleWorker() { enable(!(state["enabled"] as? Bool ?? false)) }
    @objc func openSite() { NSWorkspace.shared.open(URL(string: "https://sloverb.app")!) }
    @objc func showStatus() {
        let alert = NSAlert()
        alert.messageText = "sloverb worker"
        let relay = state["relay_online"] as? Bool == true ? "connected" : "connecting"
        alert.informativeText = "Status: \(state["status"] as? String ?? "starting")\nRelay: \(relay)\nCompleted this session: \(state["jobs_finished"] as? Int ?? 0)\n\nPauses at 10% battery. Resume is offered when charging or at 20%.\n\nNo inbound network port is opened. Screen lock is supported; actual sleep, a closed lid that causes sleep, logout, or shutdown stops service."
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
    @objc func quitApp() { NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) { process?.terminate() }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            if response.actionIdentifier == "resume" { self.enable(true) }
            completionHandler()
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list])
    }
}

let application = NSApplication.shared
let delegate = WorkerApp()
application.delegate = delegate
application.run()
