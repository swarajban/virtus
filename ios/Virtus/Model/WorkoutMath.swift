import Foundation

// Ports of client/src/lib/workout-utils.ts, use-powerbuilding-data.ts and
// plate-calculator.tsx.

enum ISODate {
    private static let fractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Same shape as JS `new Date().toISOString()`.
    static func now() -> String { fractional.string(from: Date()) }

    static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        return fractional.date(from: string) ?? plain.date(from: string)
    }
}

enum Fmt {
    private static let mediumDate: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = "MMM d, yyyy"
        return f
    }()

    private static let shortDate: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .short
        f.timeStyle = .none
        return f
    }()

    /// "Jan 5, 2025" — matches formatDate() on the web.
    static func date(_ iso: String?) -> String {
        guard let d = ISODate.parse(iso) else { return "" }
        return mediumDate.string(from: d)
    }

    static func shortDate(_ iso: String?) -> String {
        guard let d = ISODate.parse(iso) else { return "" }
        return shortDate.string(from: d)
    }

    /// 315 → "315", 2.5 → "2.5", 7.25 → "7.25"
    static func num(_ value: Double?) -> String {
        guard let value else { return "—" }
        if value.rounded() == value { return String(Int(value)) }
        var s = String(format: "%.2f", value)
        while s.hasSuffix("0") { s.removeLast() }
        if s.hasSuffix(".") { s.removeLast() }
        return s
    }
}

enum WorkoutMath {
    /// Which 1RM a variation borrows when it has none of its own.
    static let fallbackExercises: [String: String] = [
        "Back squat": "Back squat",
        "Barbell bench press": "Barbell bench press",
        "Deadlift": "Deadlift",
        "Overhead press": "Overhead press",
        "Front squat": "Back squat",
        "Box squat": "Back squat",
        "Pause squat": "Back squat",
        "Close grip bench press": "Barbell bench press",
        "Incline bench press": "Barbell bench press",
        "Romanian deadlift": "Deadlift",
        "Sumo deadlift": "Deadlift",
        "Push press": "Overhead press",
        "Strict press": "Overhead press",
    ]

    static let mainLifts: [String: KeyPath<LegacyOneRM, Double>] = [
        "Back squat": \.backSquat,
        "Barbell bench press": \.benchPress,
        "Deadlift": \.deadlift,
        "Overhead press": \.overheadPress,
    ]

    /// The 1RM a calculated weight is based on, following calculateWeight()'s
    /// priority order. Zero counts as missing, same as the JS truthiness check.
    static func resolveOneRM(
        name: String,
        exerciseId: Int?,
        onermExerciseId: Int?,
        oneRMs: [Int: Double],
        exercises: [ExerciseRecord],
        legacy: LegacyOneRM?
    ) -> Double? {
        func valid(_ v: Double?) -> Double? { (v ?? 0) > 0 ? v : nil }
        if let id = exerciseId, let v = valid(oneRMs[id]) { return v }
        if let id = onermExerciseId, let v = valid(oneRMs[id]) { return v }
        if let fallback = fallbackExercises[name],
           let fb = exercises.first(where: { $0.name == fallback }),
           let v = valid(oneRMs[fb.id]) {
            return v
        }
        if let legacy, let key = mainLifts[name], let v = valid(legacy[keyPath: key]) { return v }
        return nil
    }

    /// load% of the 1RM, rounded UP to the nearest 5 lbs.
    static func calculatedWeight(oneRM: Double?, loadPercentage: Double?) -> Double? {
        guard let oneRM, let pct = loadPercentage, pct > 0 else { return nil }
        return (oneRM * pct / 100 / 5).rounded(.up) * 5
    }

    /// Per-set RIR prescriptions. 0 is meaningful ("to failure").
    struct RIRSet: Hashable {
        let set: Int
        let rir: Int
    }

    static func rirSets(_ exercise: ProgramExercise) -> [RIRSet] {
        [exercise.rirSet1, exercise.rirSet2].enumerated().compactMap { i, rir in
            rir.map { RIRSet(set: i + 1, rir: $0) }
        }
    }

    /// Walk from `from` in direction `step`, skipping warm-ups. May return an
    /// out-of-bounds index; callers check the bound.
    static func skipWarmups(_ exercises: [ProgramExercise], from: Int, step: Int) -> Int {
        var i = from
        while i >= 0 && i < exercises.count && exercises[i].isWarmup { i += step }
        return i
    }

    static func actualPercentage(weight: Double, oneRM: Double) -> String {
        String(format: "%.1f%%", weight / oneRM * 100)
    }
}

// MARK: - Plate calculator

struct Plate: Hashable {
    let weight: Double
    let colorHex: UInt32
}

enum PlateMath {
    static let barbell: Double = 45
    static let available: [Plate] = [
        Plate(weight: 45, colorHex: 0x2563EB),  // blue
        Plate(weight: 35, colorHex: 0xFACC15),  // yellow
        Plate(weight: 25, colorHex: 0x16A34A),  // green
        Plate(weight: 10, colorHex: 0x000000),  // black
        Plate(weight: 5, colorHex: 0xEC4899),   // pink
        Plate(weight: 2.5, colorHex: 0xF97316), // orange
    ]

    enum Result: Equatable {
        case emptyBar
        case plates([Plate]) // one side, lightest (outside) first
        case impossible
    }

    static func perSide(for weight: Double) -> Result {
        if weight < barbell { return .impossible }
        if weight == barbell { return .emptyBar }
        let target = weight - barbell
        guard target.truncatingRemainder(dividingBy: 2.5) == 0 else { return .impossible }
        var remaining = target / 2
        var side: [Plate] = []
        for plate in available {
            while remaining >= plate.weight {
                side.append(plate)
                remaining -= plate.weight
            }
        }
        if remaining > 0.01 { return .impossible }
        return .plates(side.sorted { $0.weight < $1.weight })
    }
}
