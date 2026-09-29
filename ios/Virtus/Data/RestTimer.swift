import Foundation
import Observation

/// Port of rest-timer.tsx: a count-up rest clock plus a "sets logged" counter,
/// shared across every exercise and persisted so it survives app suspension.
/// Elapsed time is always derived from the start timestamp, so it stays
/// accurate while the app is in the background.
@MainActor
@Observable
final class RestTimer {
    private(set) var startTime: Date?
    private(set) var setCounter: Int = 0

    var isRunning: Bool { startTime != nil }

    /// No legitimate rest runs this long; a timer this old is an abandoned
    /// session, so it resets along with the set counter.
    private let staleAfter: TimeInterval = 30 * 60
    private let storageKey = "restTimerState"

    private struct Stored: Codable {
        var startTime: Date?
        var setCounter: Int
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let stored = try? JSONDecoder().decode(Stored.self, from: data) {
            startTime = stored.startTime
            setCounter = stored.setCounter
        }
        discardIfStale()
    }

    func elapsed(at now: Date = Date()) -> Int {
        guard let startTime else { return 0 }
        return max(0, Int(now.timeIntervalSince(startTime)))
    }

    static func format(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    /// "Log Set": count the set and (re)start the rest clock.
    func logSet() {
        discardIfStale()
        setCounter += 1
        startTime = Date()
        persist()
    }

    func reset() {
        startTime = nil
        setCounter = 0
        persist()
    }

    /// Called on foreground: an abandoned timer from a previous workout
    /// shouldn't greet the next one.
    func discardIfStale() {
        guard let startTime else { return }
        let age = Date().timeIntervalSince(startTime)
        if age > staleAfter || age < 0 {
            self.startTime = nil
            setCounter = 0
            persist()
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(Stored(startTime: startTime, setCounter: setCounter)) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}
