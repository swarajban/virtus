import Foundation
import Observation
import UIKit

/// Durable, serialized outbox for every workout write.
///
/// The web app fires writes in the background with a few retries and keeps
/// them in memory; if the tab dies mid-retry the set is lost. Here each write is
/// persisted to disk the moment it's made and replayed in order until the server
/// accepts it — across flaky gym wifi, app suspension and relaunches.
///
/// Ordering matters and is preserved: a reset (clear history, then clear
/// progress) always lands after any completion queued before it, exactly like
/// the web's workoutProgressSaveChain.
@MainActor
@Observable
final class SyncQueue {
    enum Kind: Codable, Hashable {
        /// Snapshot is what the change looked like when made; at send time it
        /// is merged with the latest local state so the POST carries every
        /// completion made since (same as storage.ts saveWorkoutProgress).
        case progress(workout: Int, snapshot: WorkoutProgress)
        case historyBatch(workout: Int, entries: [HistoryPayload])
        case clearHistory(workout: Int)
        case clearProgress(workout: Int)
    }

    struct Op: Codable, Identifiable, Hashable {
        let id: UUID
        let username: String
        let kind: Kind
        var failures: Int

        var workout: Int {
            switch kind {
            case .progress(let w, _), .historyBatch(let w, _), .clearHistory(let w), .clearProgress(let w): return w
            }
        }

        var label: String {
            switch kind {
            case .progress: return "workout progress"
            case .historyBatch: return "logged sets"
            case .clearHistory, .clearProgress: return "workout reset"
            }
        }
    }

    private(set) var ops: [Op] = []
    /// Set while the head op keeps failing on the network; drives the banner.
    private(set) var lastNetworkError: String?

    var pendingCount: Int { ops.count }
    var isEmpty: Bool { ops.isEmpty }

    /// Performs one op against the server. Set by AppModel.
    @ObservationIgnored var performer: (@MainActor (Op) async throws -> Void)?
    /// Called after an op lands.
    @ObservationIgnored var onSynced: (@MainActor (Op) -> Void)?
    /// Called when the server rejected an op too many times and it was dropped.
    @ObservationIgnored var onDropped: (@MainActor (Op, String) -> Void)?

    @ObservationIgnored private var worker: Task<Void, Never>?
    @ObservationIgnored private var backoff: Double = 1
    @ObservationIgnored private var wakeup: CheckedContinuation<Void, Never>?
    @ObservationIgnored private var sleepToken = 0
    private let fileURL: URL

    /// Server-side rejections (4xx/5xx) are retried a few times then dropped so
    /// one bad row can't jam the queue forever. Network failures retry forever.
    private let maxServerFailures = 5

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("sync-queue.json")
        if let data = try? Data(contentsOf: fileURL),
           let saved = try? JSONDecoder().decode([Op].self, from: data) {
            ops = saved
        }
    }

    func hasPendingProgress(workout: Int, username: String) -> Bool {
        ops.contains { $0.username == username && $0.workout == workout }
    }

    func enqueue(_ kind: Kind, username: String) {
        ops.append(Op(id: UUID(), username: username, kind: kind, failures: 0))
        save()
        kick()
    }

    /// Start (or nudge) the worker. `resetBackoff` is used on app foreground so
    /// a long offline backoff doesn't delay the first retry after reconnecting.
    func kick(resetBackoff: Bool = false) {
        if resetBackoff { backoff = 1 }
        if let wakeup {
            self.wakeup = nil
            wakeup.resume()
        }
        guard worker == nil, !ops.isEmpty else { return }
        worker = Task { [weak self] in
            await self?.drain()
            self?.worker = nil
        }
    }

    /// Wait until everything queued so far has landed (or `timeout` passes).
    /// Returns true when the queue is empty.
    func waitUntilDrained(timeout: TimeInterval) async -> Bool {
        kick(resetBackoff: true)
        let deadline = Date().addingTimeInterval(timeout)
        while !ops.isEmpty && Date() < deadline {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
        return ops.isEmpty
    }

    /// Give in-flight writes a chance to finish when the app is backgrounded.
    func flushInBackground() {
        guard !ops.isEmpty else { return }
        var taskId: UIBackgroundTaskIdentifier = .invalid
        taskId = UIApplication.shared.beginBackgroundTask(withName: "virtus-sync") {
            UIApplication.shared.endBackgroundTask(taskId)
            taskId = .invalid
        }
        kick(resetBackoff: true)
        Task { [weak self] in
            _ = await self?.waitUntilDrained(timeout: 25)
            if taskId != .invalid { UIApplication.shared.endBackgroundTask(taskId) }
        }
    }

    // MARK: Worker

    private func drain() async {
        while let op = ops.first {
            if Task.isCancelled { return }
            guard let performer else { return }
            do {
                try await performer(op)
                remove(op.id)
                backoff = 1
                lastNetworkError = nil
                onSynced?(op)
            } catch let error as APIError where !error.isNetwork {
                guard let index = ops.firstIndex(where: { $0.id == op.id }) else { continue }
                ops[index].failures += 1
                save()
                if ops[index].failures >= maxServerFailures {
                    remove(op.id)
                    onDropped?(op, error.message)
                } else {
                    await sleep(seconds: backoff)
                    backoff = min(backoff * 2, 30)
                }
            } catch is CancellationError {
                return
            } catch {
                lastNetworkError = (error as? APIError)?.message ?? error.localizedDescription
                await sleep(seconds: backoff)
                backoff = min(backoff * 2, 30)
            }
        }
    }

    /// Sleeps for the backoff, but wakes early on kick().
    private func sleep(seconds: Double) async {
        sleepToken += 1
        let token = sleepToken
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            wakeup = continuation
            Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                // A kick() may have already resumed this sleep and a newer one
                // started; only wake the sleep this timer belongs to.
                guard let self, self.sleepToken == token, let pending = self.wakeup else { return }
                self.wakeup = nil
                pending.resume()
            }
        }
    }

    private func remove(_ id: UUID) {
        ops.removeAll { $0.id == id }
        save()
    }

    private func save() {
        do {
            let data = try JSONEncoder().encode(ops)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("SyncQueue: failed to persist queue: \(error)")
        }
    }
}
