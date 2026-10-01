import Foundation

// Swift mirrors of shared/schema.ts. Field names match the server's JSON
// (camelCase from drizzle rows, snake_case in powerbuilding_data.json) so no
// server changes are needed.

// MARK: - Lossy decoding helpers

extension KeyedDecodingContainer {
    /// Decodes a JSON number as Int even if it was stored as a float (the web
    /// inputs use parseFloat, so e.g. `3.0` can appear in saved progress).
    func lossyInt(_ key: Key) -> Int? {
        if let i = try? decodeIfPresent(Int.self, forKey: key) { return i }
        if let d = try? decodeIfPresent(Double.self, forKey: key) { return Int(d.rounded()) }
        return nil
    }

    func lossyDouble(_ key: Key) -> Double? {
        try? decodeIfPresent(Double.self, forKey: key)
    }
}

// MARK: - Program structure (bundled powerbuilding_data.json)

struct ProgramsFile: Decodable {
    let programs: [Program]
}

struct Program: Decodable, Identifiable, Hashable {
    let name: String
    let workouts: [Workout]
    var id: String { name }
}

struct Workout: Decodable, Identifiable, Hashable {
    let workoutNumber: Int
    let weekNumber: Int
    let dayNumber: Int
    let workoutName: String
    let exercises: [ProgramExercise]

    var id: Int { workoutNumber }

    enum CodingKeys: String, CodingKey {
        case workoutNumber = "workout_number"
        case weekNumber = "week_number"
        case dayNumber = "day_number"
        case workoutName = "workout_name"
        case exercises
    }

    /// Indices of working (non-warm-up) exercises, in order.
    var workingIndices: [Int] {
        exercises.indices.filter { !exercises[$0].isWarmup }
    }
}

struct ProgramExercise: Decodable, Hashable {
    let name: String
    let supersetLabel: String?
    let typeOfSet: String
    let numberOfSets: Int
    let numberOfReps: Int?
    let isAmrap: Bool
    let loadPercentage: Double?
    let rpe: Double?
    let rirSet1: Int?
    let rirSet2: Int?
    let notes: String

    var isWarmup: Bool { typeOfSet == "warm-up" }
    var isWorking: Bool { typeOfSet == "working" }

    enum CodingKeys: String, CodingKey {
        case name
        case supersetLabel = "superset_label"
        case typeOfSet = "type_of_set"
        case numberOfSets = "number_of_sets"
        case numberOfReps = "number_of_reps"
        case isAmrap = "is_amrap"
        case loadPercentage = "load_percentage"
        case rpe
        case rirSet1 = "rir_set_1"
        case rirSet2 = "rir_set_2"
        case notes
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        name = try c.decode(String.self, forKey: .name)
        supersetLabel = try? c.decodeIfPresent(String.self, forKey: .supersetLabel)
        typeOfSet = (try? c.decodeIfPresent(String.self, forKey: .typeOfSet)) ?? "working"
        numberOfSets = c.lossyInt(.numberOfSets) ?? 1
        numberOfReps = c.lossyInt(.numberOfReps)
        isAmrap = (try? c.decodeIfPresent(Bool.self, forKey: .isAmrap)) ?? false
        loadPercentage = c.lossyDouble(.loadPercentage)
        rpe = c.lossyDouble(.rpe)
        rirSet1 = c.lossyInt(.rirSet1)
        rirSet2 = c.lossyInt(.rirSet2)
        notes = (try? c.decodeIfPresent(String.self, forKey: .notes)) ?? ""
    }

    /// "4 x 5", "3 x AMRAP", "3 x Hold"
    var prescription: String {
        let reps = numberOfReps.map(String.init) ?? (isAmrap ? "AMRAP" : "Hold")
        return "\(numberOfSets) x \(reps)"
    }
}

// MARK: - Workout progress

enum WorkoutStatus: String, Codable, Hashable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case completed

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = WorkoutStatus(rawValue: raw) ?? .notStarted
    }

    var rank: Int {
        switch self {
        case .notStarted: return 0
        case .inProgress: return 1
        case .completed: return 2
        }
    }
}

/// One logged set-group: N sets of M reps at a weight.
struct SetGroup: Codable, Hashable {
    var sets: Int
    var reps: Int
    var weight: Double?

    init(sets: Int, reps: Int, weight: Double?) {
        self.sets = sets
        self.reps = reps
        self.weight = weight
    }

    enum CodingKeys: String, CodingKey { case sets, reps, weight }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sets = c.lossyInt(.sets) ?? 0
        reps = c.lossyInt(.reps) ?? 0
        weight = c.lossyDouble(.weight)
    }
}

struct SwappedExercise: Codable, Hashable {
    var name: String
    var originalName: String
    var exerciseId: Int
}

struct ExerciseProgress: Codable, Hashable {
    var sets: Int?
    var reps: Int?
    var weight: Double?
    var groups: [SetGroup]?
    var notes: String?
    var completed: Bool?
    var swappedExercise: SwappedExercise?

    init(sets: Int? = nil, reps: Int? = nil, weight: Double? = nil, groups: [SetGroup]? = nil,
         notes: String? = nil, completed: Bool? = nil, swappedExercise: SwappedExercise? = nil) {
        self.sets = sets
        self.reps = reps
        self.weight = weight
        self.groups = groups
        self.notes = notes
        self.completed = completed
        self.swappedExercise = swappedExercise
    }

    enum CodingKeys: String, CodingKey { case sets, reps, weight, groups, notes, completed, swappedExercise }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        sets = c.lossyInt(.sets)
        reps = c.lossyInt(.reps)
        weight = c.lossyDouble(.weight)
        groups = try? c.decodeIfPresent([SetGroup].self, forKey: .groups)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        completed = try? c.decodeIfPresent(Bool.self, forKey: .completed)
        swappedExercise = try? c.decodeIfPresent(SwappedExercise.self, forKey: .swappedExercise)
    }

    var isCompleted: Bool { completed ?? false }

    /// Mirrors getSetGroups(): prefer the explicit groups array, otherwise
    /// synthesize one group from the legacy top-level sets/reps/weight.
    var setGroups: [SetGroup] {
        if let groups, !groups.isEmpty { return groups }
        return [SetGroup(sets: sets ?? 0, reps: reps ?? 0, weight: weight)]
    }
}

extension Array where Element == SetGroup {
    /// Mirrors getTopSetGroup(): heaviest weight, tie-break first.
    var topSet: SetGroup {
        guard var top = first else { return SetGroup(sets: 0, reps: 0, weight: nil) }
        for g in self where (g.weight ?? 0) > (top.weight ?? 0) { top = g }
        return top
    }
}

struct WorkoutProgress: Codable, Hashable {
    var programName: String?
    var workoutNumber: Int
    var status: WorkoutStatus
    var startedAt: String?
    var completedAt: String?
    var exerciseProgress: [String: ExerciseProgress]?

    /// Port of storage.ts mergeWorkoutProgress(): status never moves backwards,
    /// completedAt travels with `completed`, exerciseProgress is a per-key
    /// union with `next` winning.
    static func merge(_ base: WorkoutProgress?, _ next: WorkoutProgress) -> WorkoutProgress {
        guard let base else { return next }
        let status = next.status.rank >= base.status.rank ? next.status : base.status
        let completedAt = status == .completed
            ? (next.completedAt ?? base.completedAt ?? ISODate.now())
            : nil
        var exerciseProgress = base.exerciseProgress ?? [:]
        for (key, value) in next.exerciseProgress ?? [:] { exerciseProgress[key] = value }
        return WorkoutProgress(
            programName: next.programName ?? base.programName,
            workoutNumber: next.workoutNumber,
            status: status,
            startedAt: next.startedAt ?? base.startedAt,
            completedAt: completedAt,
            exerciseProgress: exerciseProgress
        )
    }
}

// MARK: - Server records

struct User: Codable, Hashable, Identifiable {
    let id: Int
    let username: String
    let selectedProgram: String
    let currentProgramCycle: Int
}

struct ExerciseRecord: Codable, Hashable, Identifiable {
    let id: Int
    var name: String
    var notes: String?
    var youtubeLink: String?
    var usesBarbell: Bool
    var onermExerciseId: Int?

    enum CodingKeys: String, CodingKey { case id, name, notes, youtubeLink, usesBarbell, onermExerciseId }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(Int.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        youtubeLink = try? c.decodeIfPresent(String.self, forKey: .youtubeLink)
        usesBarbell = (try? c.decodeIfPresent(Bool.self, forKey: .usesBarbell)) ?? true
        onermExerciseId = try? c.decodeIfPresent(Int.self, forKey: .onermExerciseId)
    }
}

struct OneRepMaxRecord: Codable, Hashable {
    let exerciseId: Int
    let weight: Double
}

/// Legacy aggregate from GET /api/one-rm (defaults 135/95/185/65 when unset).
struct LegacyOneRM: Codable, Hashable {
    var backSquat: Double
    var benchPress: Double
    var deadlift: Double
    var overheadPress: Double
}

struct HistoryEntry: Codable, Hashable, Identifiable {
    let dbId: Int?
    let date: String
    let exerciseName: String?
    let sets: Int
    let reps: Int
    let weight: Double
    let sessionId: String?
    let setGroup: Int?
    let exerciseIndex: Int?
    let notes: String?
    let typeOfSet: String?

    var id: String { dbId.map { "id:\($0)" } ?? "\(date)|\(exerciseName ?? "")|\(setGroup ?? 0)" }

    enum CodingKeys: String, CodingKey {
        case dbId = "id"
        case date, exerciseName, sets, reps, weight, sessionId, setGroup, exerciseIndex, notes, typeOfSet
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        dbId = try? c.decodeIfPresent(Int.self, forKey: .dbId)
        date = (try? c.decodeIfPresent(String.self, forKey: .date)) ?? ""
        exerciseName = try? c.decodeIfPresent(String.self, forKey: .exerciseName)
        sets = c.lossyInt(.sets) ?? 0
        reps = c.lossyInt(.reps) ?? 0
        weight = c.lossyDouble(.weight) ?? 0
        sessionId = try? c.decodeIfPresent(String.self, forKey: .sessionId)
        setGroup = c.lossyInt(.setGroup)
        exerciseIndex = c.lossyInt(.exerciseIndex)
        notes = try? c.decodeIfPresent(String.self, forKey: .notes)
        typeOfSet = try? c.decodeIfPresent(String.self, forKey: .typeOfSet)
    }

    /// Rows logged in one workout share a session; legacy rows stand alone.
    var sessionKey: String { sessionId.map { "s:\($0)" } ?? "r:\(dbId.map(String.init) ?? id)" }
}

/// Body row for POST /api/exercise-history/batch.
struct HistoryPayload: Codable, Hashable {
    var programName: String
    var date: String
    var exerciseName: String
    var sets: Int
    var reps: Int
    var weight: Double
    var setGroup: Int
    var exerciseIndex: Int
    var notes: String
    var typeOfSet: String
}

// MARK: - History sessions (exercise-history-modal.tsx groupBySession)

struct HistorySession: Identifiable, Hashable {
    let key: String
    let date: String
    let ids: [Int]
    let groups: [SetGroup]
    let topWeight: Double
    let notes: String?

    var id: String { key }
    var parsedDate: Date { ISODate.parse(date) ?? .distantPast }

    static func group(_ entries: [HistoryEntry]) -> [HistorySession] {
        var buckets: [String: [HistoryEntry]] = [:]
        var order: [String] = []
        for entry in entries {
            let key = entry.sessionKey
            if buckets[key] == nil { order.append(key) }
            buckets[key, default: []].append(entry)
        }
        return order.compactMap { key in
            guard let rows = buckets[key] else { return nil }
            let ordered = rows.sorted {
                (($0.exerciseIndex ?? 0), ($0.setGroup ?? 0)) < (($1.exerciseIndex ?? 0), ($1.setGroup ?? 0))
            }
            return HistorySession(
                key: key,
                date: ordered[0].date,
                ids: ordered.compactMap(\.dbId),
                groups: ordered.map { SetGroup(sets: $0.sets, reps: $0.reps, weight: $0.weight) },
                topWeight: max(0, ordered.map(\.weight).max() ?? 0),
                notes: ordered.first(where: { !($0.notes ?? "").isEmpty })?.notes
            )
        }
        .sorted { $0.parsedDate > $1.parsedDate }
    }
}
