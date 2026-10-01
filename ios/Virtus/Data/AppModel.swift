import Foundation
import Observation
import SwiftUI

enum Route: Hashable {
    case workout(Int)
    case exercise(workout: Int, index: Int)
    case history
    case exercises
    case exerciseInfo(Int)
    case settings
    case oneRM
}

struct ToastMessage: Identifiable, Equatable {
    enum Style { case info, error }
    let id = UUID()
    let title: String
    let message: String?
    let style: Style
}

/// A program exercise resolved against the exercise library, any swap saved in
/// workout progress, and the user's 1RMs.
struct ResolvedExercise: Hashable {
    let index: Int
    let base: ProgramExercise
    let name: String
    let notes: String
    /// Library id (the swapped-in exercise's id when swapped).
    let exerciseId: Int?
    let record: ExerciseRecord?
    let swappedFrom: String?
    let oneRM: Double?
    let calculatedWeight: Double?
}

/// App-wide state. Reads render instantly from an on-disk cache and revalidate
/// in the background; writes apply locally first and go through the durable
/// SyncQueue, so nothing on the logging path ever waits on the network.
@MainActor
@Observable
final class AppModel {
    var path: [Route] = []

    let api = APIClient()
    let sync = SyncQueue()

    private(set) var username: String
    private(set) var user: User?
    private(set) var programs: [Program] = []
    private(set) var exercises: [ExerciseRecord] = []
    private(set) var oneRMs: [Int: Double] = [:]
    private(set) var legacyOneRM: LegacyOneRM?
    private(set) var progress: [Int: WorkoutProgress] = [:]
    /// True once a full progress GET has succeeded this launch.
    private(set) var progressFetched = false
    private(set) var isRefreshing = false
    var toast: ToastMessage?

    @ObservationIgnored private var lastRefreshAt: Date = .distantPast
    /// Bumped on account or program/cycle switches; a refresh that started
    /// before one carries stale data and must not be applied.
    @ObservationIgnored private var generation = 0
    /// When a progress write for a workout last landed on the server. A GET that
    /// started before that can't include it, so it must not replace local state.
    @ObservationIgnored private var lastSyncedAt: [Int: Date] = [:]
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private let defaults = UserDefaults.standard

    static let defaultProgram = "Powerbuilding 4x"

    init() {
        username = UserDefaults.standard.string(forKey: "selected-username") ?? "swaraj"
        loadPrograms()
        loadCache()
        sync.performer = { [weak self] op in
            guard let self else { return }
            try await self.perform(op)
        }
        sync.onSynced = { [weak self] op in
            self?.lastSyncedAt[op.workout] = Date()
        }
        sync.onDropped = { [weak self] op, message in
            self?.showToast("Couldn't save \(op.label)", message, style: .error)
        }
        sync.kick()
    }

    // MARK: - Derived

    var selectedProgramName: String {
        user?.selectedProgram ?? defaults.string(forKey: "selected-program") ?? Self.defaultProgram
    }

    var currentProgram: Program? {
        programs.first { $0.name == selectedProgramName } ?? programs.first
    }

    var workouts: [Workout] { currentProgram?.workouts ?? [] }

    func workout(_ number: Int) -> Workout? {
        workouts.first { $0.workoutNumber == number }
    }

    func status(of workoutNumber: Int) -> WorkoutStatus {
        progress[workoutNumber]?.status ?? .notStarted
    }

    var nextWorkout: Workout? {
        workouts.first { status(of: $0.workoutNumber) == .notStarted }
    }

    func exerciseProgress(workout: Int, index: Int) -> ExerciseProgress? {
        progress[workout]?.exerciseProgress?["\(index)"]
    }

    func resolve(_ workout: Workout, index: Int) -> ResolvedExercise {
        let base = workout.exercises[index]
        var name = base.name
        var notes = base.notes
        var record: ExerciseRecord?
        var exerciseId: Int?
        var swappedFrom: String?

        if let swap = exerciseProgress(workout: workout.workoutNumber, index: index)?.swappedExercise {
            let swapped = exercises.first { $0.id == swap.exerciseId }
            name = swapped?.name ?? swap.name
            if let n = swapped?.notes, !n.isEmpty { notes = n }
            record = swapped
            exerciseId = swapped?.id ?? swap.exerciseId
            swappedFrom = swap.originalName.isEmpty ? base.name : swap.originalName
        } else {
            record = exercises.first { $0.name == base.name }
            exerciseId = record?.id
        }

        let oneRM = WorkoutMath.resolveOneRM(
            name: name,
            exerciseId: exerciseId,
            onermExerciseId: record?.onermExerciseId,
            oneRMs: oneRMs,
            exercises: exercises,
            legacy: legacyOneRM
        )
        return ResolvedExercise(
            index: index,
            base: base,
            name: name,
            notes: notes,
            exerciseId: exerciseId,
            record: record,
            swappedFrom: swappedFrom,
            oneRM: oneRM,
            calculatedWeight: WorkoutMath.calculatedWeight(oneRM: oneRM, loadPercentage: base.loadPercentage)
        )
    }

    // MARK: - Loading

    private var appSupport: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private var programsCacheURL: URL { appSupport.appendingPathComponent("programs.json") }

    private func cacheURL(for username: String) -> URL {
        let safe = username.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "user"
        return appSupport.appendingPathComponent("cache-\(safe).json")
    }

    /// Program structure: the last copy fetched from the server if we have one,
    /// otherwise the file bundled with the app. Refreshed in the background.
    private func loadPrograms() {
        let decoder = JSONDecoder()
        if let data = try? Data(contentsOf: programsCacheURL),
           let file = try? decoder.decode(ProgramsFile.self, from: data), !file.programs.isEmpty {
            programs = file.programs
            return
        }
        if let url = Bundle.main.url(forResource: "powerbuilding_data", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let file = try? decoder.decode(ProgramsFile.self, from: data) {
            programs = file.programs
        }
    }

    private func refreshPrograms() async {
        guard let data = try? await api.programsFile() else { return }
        let decoded = await Task.detached(priority: .utility) {
            try? JSONDecoder().decode(ProgramsFile.self, from: data)
        }.value
        guard let file = decoded, !file.programs.isEmpty else { return }
        if file.programs != programs { programs = file.programs }
        try? data.write(to: programsCacheURL, options: .atomic)
    }

    private struct CacheSnapshot: Codable {
        var user: User?
        var exercises: [ExerciseRecord]
        var oneRMs: [Int: Double]
        var legacyOneRM: LegacyOneRM?
        var progress: [Int: WorkoutProgress]
    }

    private func loadCache() {
        guard let data = try? Data(contentsOf: cacheURL(for: username)),
              let snapshot = try? JSONDecoder().decode(CacheSnapshot.self, from: data) else { return }
        user = snapshot.user
        exercises = snapshot.exercises
        oneRMs = snapshot.oneRMs
        legacyOneRM = snapshot.legacyOneRM
        progress = snapshot.progress
    }

    private func saveCache() {
        let snapshot = CacheSnapshot(user: user, exercises: exercises, oneRMs: oneRMs,
                                     legacyOneRM: legacyOneRM, progress: progress)
        let url = cacheURL(for: username)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }

    /// Revalidate everything from the server. Throttled so foreground/appear
    /// bursts don't stampede the API.
    func refresh(force: Bool = false) async {
        if !force && Date().timeIntervalSince(lastRefreshAt) < 3 { return }
        lastRefreshAt = Date()
        isRefreshing = true
        defer { isRefreshing = false }

        let name = username
        let startGeneration = generation
        let fetchStart = Date()
        async let userResult = try? api.currentUser(name)
        async let progressResult = try? api.workoutProgress(name)
        async let exercisesResult = try? api.exercises()
        async let oneRMsResult = try? api.allOneRMs(name)
        async let legacyResult = try? api.legacyOneRM(name)
        async let programsDone: Void = refreshPrograms()

        let (fetchedUser, fetchedProgress, fetchedExercises, fetchedOneRMs, fetchedLegacy) =
            await (userResult, progressResult, exercisesResult, oneRMsResult, legacyResult)
        _ = await programsDone

        // The user switched accounts or programs while we were fetching; the
        // results describe the old state, so drop them.
        guard startGeneration == generation, name == username else { return }

        if let fetchedUser {
            user = fetchedUser
            defaults.set(fetchedUser.selectedProgram, forKey: "selected-program")
        }
        if let fetchedProgress { applyServerProgress(fetchedProgress, fetchStart: fetchStart) }
        if let fetchedExercises { exercises = fetchedExercises }
        if let fetchedOneRMs { oneRMs = Self.oneRMMap(fetchedOneRMs) }
        if let fetchedLegacy { legacyOneRM = fetchedLegacy }
        saveCache()
    }

    private static func oneRMMap(_ records: [OneRepMaxRecord]) -> [Int: Double] {
        Dictionary(records.map { ($0.exerciseId, $0.weight) }, uniquingKeysWith: { a, _ in a })
    }

    func refreshExercises() async {
        if let fetched = try? await api.exercises() {
            exercises = fetched
            saveCache()
        }
    }

    func refreshOneRMs() async {
        let name = username
        async let all = try? api.allOneRMs(name)
        async let legacy = try? api.legacyOneRM(name)
        let (fetchedAll, fetchedLegacy) = await (all, legacy)
        guard name == username else { return }
        if let fetchedAll { oneRMs = Self.oneRMMap(fetchedAll) }
        if let fetchedLegacy { legacyOneRM = fetchedLegacy }
        saveCache()
    }

    /// The server map replaces the cache wholesale (that's what keeps it honest
    /// across program/cycle switches) EXCEPT for workouts with local changes the
    /// server may not have seen yet; those merge monotonically so a completion
    /// can never be knocked back by an older server row.
    private func applyServerProgress(_ server: [Int: WorkoutProgress], fetchStart: Date) {
        var merged = server
        let touched = Set(progress.keys).union(sync.ops.filter { $0.username == username }.map(\.workout))
        for w in touched {
            let pending = sync.hasPendingProgress(workout: w, username: username)
            let landedDuringFetch = (lastSyncedAt[w] ?? .distantPast) >= fetchStart
            guard pending || landedDuringFetch else { continue }
            if let local = progress[w] {
                merged[w] = WorkoutProgress.merge(server[w], local)
            } else {
                merged[w] = nil // a reset is still on its way to the server
            }
        }
        progress = merged
        progressFetched = true
    }

    // MARK: - Writes

    private func queueProgress(_ workoutNumber: Int, _ snapshot: WorkoutProgress) {
        progress[workoutNumber] = WorkoutProgress.merge(progress[workoutNumber], snapshot)
        saveCache()
        sync.enqueue(.progress(workout: workoutNumber, snapshot: snapshot), username: username)
    }

    func startWorkout(_ workoutNumber: Int) {
        let existing = progress[workoutNumber]
        queueProgress(workoutNumber, WorkoutProgress(
            programName: selectedProgramName,
            workoutNumber: workoutNumber,
            status: .inProgress,
            startedAt: ISODate.now(),
            completedAt: nil,
            exerciseProgress: existing?.exerciseProgress ?? [:]
        ))
    }

    func completeWorkout(_ workoutNumber: Int) {
        let existing = progress[workoutNumber]
        queueProgress(workoutNumber, WorkoutProgress(
            programName: selectedProgramName,
            workoutNumber: workoutNumber,
            status: .completed,
            startedAt: existing?.startedAt ?? ISODate.now(),
            completedAt: ISODate.now(),
            exerciseProgress: existing?.exerciseProgress ?? [:]
        ))
    }

    /// Clears this workout's session history first (while the server can still
    /// find its session id), then its progress row. Scoped server-side to the
    /// current program + cycle.
    func resetWorkout(_ workoutNumber: Int) {
        progress[workoutNumber] = nil
        saveCache()
        sync.enqueue(.clearHistory(workout: workoutNumber), username: username)
        sync.enqueue(.clearProgress(workout: workoutNumber), username: username)
    }

    func completeExercise(workout workoutNumber: Int, exercise: ResolvedExercise, groups: [SetGroup], notes: String) {
        let key = "\(exercise.index)"
        let top = groups.topSet

        let current = progress[workoutNumber] ?? WorkoutProgress(
            programName: selectedProgramName,
            workoutNumber: workoutNumber,
            status: .inProgress,
            startedAt: ISODate.now(),
            completedAt: nil,
            exerciseProgress: [:]
        )
        var entry = current.exerciseProgress?[key] ?? ExerciseProgress()
        entry.sets = top.sets
        entry.reps = top.reps
        entry.weight = top.weight
        entry.groups = groups
        entry.notes = notes
        entry.completed = true
        // swappedExercise is preserved from the existing entry.

        var exerciseProgress = current.exerciseProgress ?? [:]
        exerciseProgress[key] = entry
        // Completing an exercise auto-starts the workout; never downgrade.
        let snapshot = WorkoutProgress(
            programName: current.programName ?? selectedProgramName,
            workoutNumber: workoutNumber,
            status: current.status == .notStarted ? .inProgress : current.status,
            startedAt: current.startedAt ?? ISODate.now(),
            completedAt: current.completedAt,
            exerciseProgress: exerciseProgress
        )
        // Progress first so the history write finds the session immediately.
        queueProgress(workoutNumber, snapshot)

        guard exercise.base.isWorking else { return }
        let date = ISODate.now()
        let entries: [HistoryPayload] = groups.enumerated().compactMap { idx, group in
            guard let weight = group.weight else { return nil }
            return HistoryPayload(
                programName: selectedProgramName,
                date: date,
                exerciseName: exercise.name,
                sets: group.sets,
                reps: group.reps,
                weight: weight,
                setGroup: idx,
                exerciseIndex: exercise.index,
                notes: notes,
                typeOfSet: exercise.base.typeOfSet
            )
        }
        if entries.isEmpty {
            showToast("No weight entered", "Exercise marked complete, but no history was saved.")
        } else {
            sync.enqueue(.historyBatch(workout: workoutNumber, entries: entries), username: username)
        }
    }

    func swapExercise(workout workoutNumber: Int, exercise: ResolvedExercise, to replacement: ExerciseRecord) {
        let key = "\(exercise.index)"
        let current = progress[workoutNumber] ?? WorkoutProgress(
            programName: selectedProgramName,
            workoutNumber: workoutNumber,
            status: .notStarted,
            startedAt: nil,
            completedAt: nil,
            exerciseProgress: [:]
        )
        var entry = current.exerciseProgress?[key] ?? ExerciseProgress()
        entry.completed = entry.completed ?? false
        entry.sets = entry.sets ?? 1
        entry.reps = entry.reps ?? 1
        entry.swappedExercise = SwappedExercise(
            name: replacement.name,
            originalName: exercise.swappedFrom ?? exercise.name,
            exerciseId: replacement.id
        )
        var exerciseProgress = current.exerciseProgress ?? [:]
        exerciseProgress[key] = entry
        queueProgress(workoutNumber, WorkoutProgress(
            programName: current.programName ?? selectedProgramName,
            workoutNumber: workoutNumber,
            status: current.status,
            startedAt: current.startedAt,
            completedAt: current.completedAt,
            exerciseProgress: exerciseProgress
        ))
    }

    private func perform(_ op: SyncQueue.Op) async throws {
        switch op.kind {
        case .progress(let workoutNumber, let snapshot):
            var body = snapshot
            if op.username == username {
                // Reset after this write was queued: the clear ops that follow
                // make it moot, and sending it would resurrect the workout.
                guard let latest = progress[workoutNumber] else { return }
                body = WorkoutProgress.merge(snapshot, latest)
            }
            try await api.saveWorkoutProgress(body, username: op.username)
        case .historyBatch(let workoutNumber, let entries):
            try await api.saveHistoryBatch(entries, workoutNumber: workoutNumber, username: op.username)
        case .clearHistory(let workoutNumber):
            try await api.clearHistoryForWorkout(workoutNumber, username: op.username)
        case .clearProgress(let workoutNumber):
            try await api.clearWorkoutProgress(workoutNumber, username: op.username)
        }
    }

    // MARK: - Account & program

    func switchUser(_ newUsername: String) async {
        guard newUsername != username else { return }
        saveCache()
        username = newUsername
        generation += 1
        defaults.set(newUsername, forKey: "selected-username")
        user = nil
        exercises = []
        oneRMs = [:]
        legacyOneRM = nil
        progress = [:]
        progressFetched = false
        lastSyncedAt = [:]
        path = []
        loadCache()
        await refresh(force: true)
    }

    /// Starts the next cycle of `programName` (or switches to it). Any queued
    /// writes are flushed first: the server files writes under the user's
    /// CURRENT program/cycle, so a straggler landing after the switch would be
    /// recorded against the wrong cycle.
    func startNewProgram(_ programName: String) async throws -> Int? {
        let name = username
        if sync.pendingCount(for: name) > 0 {
            let drained = await sync.waitUntilDrained(timeout: 20, username: name)
            if !drained {
                throw APIError(status: nil, message: "\(sync.pendingCount(for: name)) change(s) still waiting to sync. Try again when you're back online.")
            }
        }
        let result = try await api.startNewProgram(programName, username: name)
        guard name == username else { return result.programCycle }
        generation += 1
        defaults.set(programName, forKey: "selected-program")
        // selectedProgramName prefers the server user, so reflect the switch
        // locally rather than relying on the refresh below succeeding.
        if let current = user {
            user = User(id: current.id, username: current.username, selectedProgram: programName,
                        currentProgramCycle: result.programCycle ?? current.currentProgramCycle)
        }
        progress = [:]
        progressFetched = false
        lastSyncedAt = [:]
        path = []
        saveCache()
        await refresh(force: true)
        return result.programCycle
    }

    // MARK: - Toasts

    func showToast(_ title: String, _ message: String? = nil, style: ToastMessage.Style = .info) {
        toastTask?.cancel()
        withAnimation(.spring(duration: 0.3)) {
            toast = ToastMessage(title: title, message: message, style: style)
        }
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.25)) { self?.toast = nil }
        }
    }
}
