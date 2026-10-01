import Foundation

struct APIError: LocalizedError {
    /// nil when the server was never reached (offline, timeout, DNS…).
    let status: Int?
    let message: String

    /// Worth retrying indefinitely: the server was never reached, or a gateway
    /// answered for it (Fly proxy during a deploy or cold start, timeouts).
    var isTransient: Bool {
        guard let status else { return true }
        return [408, 429, 502, 503, 504].contains(status)
    }
    var errorDescription: String? { message }
}

/// Thin client for the Express API at virtus.fly.dev. Every call identifies the
/// user with the same `x-username` header the web app sends.
struct APIClient: Sendable {
    static let defaultBaseURL = URL(string: "https://virtus.fly.dev")!

    // Same budgets as fetch-with-timeout.ts: reads fail fast, writes get longer.
    static let readTimeout: TimeInterval = 10
    static let writeTimeout: TimeInterval = 30

    let baseURL: URL
    private let session: URLSession

    init(baseURL: URL = APIClient.defaultBaseURL) {
        self.baseURL = baseURL
        let config = URLSessionConfiguration.default
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    // MARK: Core

    private func makeRequest(_ method: String, _ path: String, query: [URLQueryItem], username: String?, body: Data?) -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query
            // URLComponents leaves "+" literal, which Express decodes as a space.
            components.percentEncodedQuery = components.percentEncodedQuery?
                .replacingOccurrences(of: "+", with: "%2B")
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.timeoutInterval = method == "GET" ? Self.readTimeout : Self.writeTimeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let username { request.setValue(username, forHTTPHeaderField: "x-username") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError(status: nil, message: error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError(status: nil, message: "No response from server")
        }
        guard (200..<300).contains(http.statusCode) else {
            let serverMessage = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw APIError(status: http.statusCode, message: serverMessage ?? "Server error \(http.statusCode)")
        }
        return data
    }

    func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], username: String?) async throws -> T {
        let data = try await perform(makeRequest("GET", path, query: query, username: username, body: nil))
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError(status: 200, message: "Unexpected response from \(path)")
        }
    }

    @discardableResult
    func send<B: Encodable>(_ method: String, _ path: String, body: B, username: String?) async throws -> Data {
        let encoded = try JSONEncoder().encode(body)
        return try await perform(makeRequest(method, path, query: [], username: username, body: encoded))
    }

    @discardableResult
    func send(_ method: String, _ path: String, username: String?) async throws -> Data {
        try await perform(makeRequest(method, path, query: [], username: username, body: nil))
    }

    // MARK: Endpoints

    func users() async throws -> [User] {
        try await get("api/users", username: nil)
    }

    func currentUser(_ username: String) async throws -> User {
        try await get("api/user/current", username: username)
    }

    func workoutProgress(_ username: String) async throws -> [Int: WorkoutProgress] {
        let raw: [String: WorkoutProgress] = try await get("api/workout-progress", username: username)
        var result: [Int: WorkoutProgress] = [:]
        for (key, value) in raw { if let n = Int(key) { result[n] = value } }
        return result
    }

    func saveWorkoutProgress(_ progress: WorkoutProgress, username: String) async throws {
        try await send("POST", "api/workout-progress/\(progress.workoutNumber)", body: progress, username: username)
    }

    func clearWorkoutProgress(_ workoutNumber: Int, username: String) async throws {
        try await send("DELETE", "api/workout-progress/\(workoutNumber)", username: username)
    }

    func exercises() async throws -> [ExerciseRecord] {
        try await get("api/exercises", username: nil)
    }

    struct NewExercise: Encodable {
        let name: String
        let notes: String?
        let youtubeLink: String?
        let usesBarbell: Bool
    }

    func createExercise(_ exercise: NewExercise) async throws -> ExerciseRecord {
        let data = try await send("POST", "api/exercises", body: exercise, username: nil)
        return try JSONDecoder().decode(ExerciseRecord.self, from: data)
    }

    struct ExerciseUpdate: Encodable {
        let notes: String
        let youtubeLink: String?
        let usesBarbell: Bool
        let onermExerciseId: Int?

        // Explicit nulls: the server applies the body as a partial update, so
        // clearing a field must send null rather than omit it.
        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(notes, forKey: .notes)
            try c.encode(youtubeLink, forKey: .youtubeLink)
            try c.encode(usesBarbell, forKey: .usesBarbell)
            try c.encode(onermExerciseId, forKey: .onermExerciseId)
        }

        enum CodingKeys: String, CodingKey { case notes, youtubeLink, usesBarbell, onermExerciseId }
    }

    func updateExercise(id: Int, _ update: ExerciseUpdate) async throws {
        try await send("PUT", "api/exercises/\(id)", body: update, username: nil)
    }

    func allOneRMs(_ username: String) async throws -> [OneRepMaxRecord] {
        try await get("api/one-rm/all", username: username)
    }

    func legacyOneRM(_ username: String) async throws -> LegacyOneRM {
        try await get("api/one-rm", username: username)
    }

    func saveOneRM(exerciseId: Int, weight: Double, username: String) async throws {
        try await send("POST", "api/one-rm/exercise/\(exerciseId)", body: ["weight": weight], username: username)
    }

    func deleteOneRM(exerciseId: Int, username: String) async throws {
        try await send("DELETE", "api/one-rm/exercise/\(exerciseId)", username: username)
    }

    /// Working-set history, newest first. The server time-boxes to ~3 months
    /// unless `all` is set.
    func history(_ username: String, exerciseName: String? = nil, all: Bool = false) async throws -> [HistoryEntry] {
        var query: [URLQueryItem] = []
        if let exerciseName { query.append(URLQueryItem(name: "exerciseName", value: exerciseName)) }
        if all { query.append(URLQueryItem(name: "all", value: "1")) }
        return try await get("api/exercise-history", query: query, username: username)
    }

    struct HistoryBatch: Encodable {
        let entries: [HistoryPayload]
        let workoutNumber: Int
    }

    func saveHistoryBatch(_ entries: [HistoryPayload], workoutNumber: Int, username: String) async throws {
        try await send("POST", "api/exercise-history/batch",
                       body: HistoryBatch(entries: entries, workoutNumber: workoutNumber), username: username)
    }

    func deleteHistory(ids: [Int], username: String) async throws {
        if ids.count == 1 {
            try await send("DELETE", "api/exercise-history/\(ids[0])", username: username)
        } else {
            try await send("POST", "api/exercise-history/delete-batch", body: ["entryIds": ids], username: username)
        }
    }

    func clearHistoryForWorkout(_ workoutNumber: Int, username: String) async throws {
        try await send("DELETE", "api/exercise-history/workout/\(workoutNumber)", username: username)
    }

    struct StartProgramResult: Decodable {
        let programName: String?
        let programCycle: Int?
    }

    func startNewProgram(_ programName: String, username: String) async throws -> StartProgramResult {
        let data = try await send("POST", "api/start-new-program", body: ["programName": programName], username: username)
        return (try? JSONDecoder().decode(StartProgramResult.self, from: data)) ?? StartProgramResult(programName: programName, programCycle: nil)
    }

    /// The same static program file the web app loads.
    func programsFile() async throws -> Data {
        var request = makeRequest("GET", "powerbuilding_data.json", query: [], username: nil, body: nil)
        request.timeoutInterval = 20
        return try await perform(request)
    }
}
