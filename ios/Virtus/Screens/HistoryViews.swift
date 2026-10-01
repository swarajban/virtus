import Charts
import SwiftUI

/// All-time history for one exercise: top-set chart + one row per session
/// (exercise-history-modal.tsx).
struct ExerciseHistorySheet: View {
    let exerciseName: String

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var sessions: [HistorySession] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var pendingDelete: HistorySession?
    @State private var deletingKey: String?

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && sessions.isEmpty {
                    ProgressView("Loading exercise history…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let loadError, sessions.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load history", systemImage: "wifi.exclamationmark")
                    } description: {
                        Text(loadError)
                    } actions: {
                        Button("Try Again") { Task { await load() } }
                    }
                } else if sessions.isEmpty {
                    ContentUnavailableView("No history yet", systemImage: "chart.xyaxis.line",
                                           description: Text("No history available for this exercise."))
                } else {
                    List {
                        Section {
                            chart
                                .frame(height: 200)
                                .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 16))
                        }
                        Section("Sessions") {
                            ForEach(sessions) { session in
                                sessionRow(session)
                                    .swipeActions {
                                        if !session.ids.isEmpty {
                                            Button("Delete", role: .destructive) { pendingDelete = session }
                                        }
                                    }
                            }
                        }
                    }
                }
            }
            .navigationTitle(exerciseName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog(
                deleteTitle,
                isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    if let session = pendingDelete { Task { await delete(session) } }
                }
            }
        }
        .task { await load() }
        .presentationDragIndicator(.visible)
    }

    private var deleteTitle: String {
        guard let session = pendingDelete else { return "Delete?" }
        return session.groups.count > 1
            ? "Delete all \(session.groups.count) set groups from \(Fmt.date(session.date))?"
            : "Delete this exercise record?"
    }

    private var chart: some View {
        let points = sessions.reversed()
        return Chart(Array(points)) { session in
            AreaMark(x: .value("Date", session.parsedDate), y: .value("Top set", session.topWeight))
                .foregroundStyle(Theme.green.opacity(0.12).gradient)
                .interpolationMethod(.monotone)
            LineMark(x: .value("Date", session.parsedDate), y: .value("Top set", session.topWeight))
                .foregroundStyle(Theme.green)
                .interpolationMethod(.monotone)
            PointMark(x: .value("Date", session.parsedDate), y: .value("Top set", session.topWeight))
                .foregroundStyle(Theme.green)
                .symbolSize(30)
        }
        .chartYAxis {
            AxisMarks { value in
                AxisGridLine()
                AxisValueLabel {
                    if let v = value.as(Double.self) { Text("\(Fmt.num(v)) lbs") }
                }
            }
        }
    }

    private func sessionRow(_ session: HistorySession) -> some View {
        let multi = session.groups.count > 1
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(Fmt.date(session.date)).font(.body.weight(.medium))
                Spacer()
                Text(multi ? "top \(Fmt.num(session.topWeight)) lbs" : "\(Fmt.num(session.topWeight)) lbs")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if deletingKey == session.key { ProgressView().controlSize(.small) }
            }
            ForEach(Array(session.groups.enumerated()), id: \.offset) { _, group in
                HStack(spacing: 4) {
                    Text("\(group.sets) x \(group.reps)")
                    if multi { Text("@ \(Fmt.num(group.weight)) lbs").foregroundStyle(.tertiary) }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            if let notes = session.notes {
                Text(notes).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let entries = try await model.api.history(model.username, exerciseName: exerciseName, all: true)
            sessions = HistorySession.group(entries)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Deletes a whole session's set-groups at once so a multi-group log can't
    /// be half-removed.
    private func delete(_ session: HistorySession) async {
        deletingKey = session.key
        defer { deletingKey = nil }
        do {
            try await model.api.deleteHistory(ids: session.ids, username: model.username)
            withAnimation { sessions.removeAll { $0.key == session.key } }
            await load()
        } catch {
            model.showToast("Failed to delete", error.localizedDescription, style: .error)
        }
    }
}

/// Every exercise the user has logged (exercise-history.tsx).
struct HistoryListView: View {
    @Environment(AppModel.self) private var model
    @State private var entries: [HistoryEntry] = []
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var search = ""
    @State private var selected: SelectedName?

    private struct SelectedName: Identifiable {
        let name: String
        var id: String { name }
    }

    private struct NameGroup: Identifiable {
        let name: String
        let sessions: Int
        let lastDate: String?
        var id: String { name }
    }

    private var groups: [NameGroup] {
        var byName: [String: (keys: Set<String>, last: String?)] = [:]
        for entry in entries {
            guard let name = entry.exerciseName else { continue }
            var bucket = byName[name] ?? (keys: [], last: nil)
            bucket.keys.insert(entry.sessionKey)
            // Entries arrive newest-first, so the first seen is the latest.
            if bucket.last == nil { bucket.last = entry.date }
            byName[name] = bucket
        }
        let all = byName.map { NameGroup(name: $0.key, sessions: $0.value.keys.count, lastDate: $0.value.last) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        let query = search.trimmingCharacters(in: .whitespaces)
        return query.isEmpty ? all : all.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        let groups = self.groups
        List {
            if isLoading && entries.isEmpty {
                HStack { Spacer(); ProgressView("Loading exercise history…"); Spacer() }
                    .listRowBackground(Color.clear)
            } else if let loadError, entries.isEmpty {
                ContentUnavailableView {
                    Label("Couldn't load history", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(loadError)
                } actions: {
                    Button("Try Again") { Task { await load() } }
                }
            } else if groups.isEmpty {
                ContentUnavailableView(
                    search.isEmpty ? "No exercise history yet" : "No matches",
                    systemImage: "waveform.path.ecg",
                    description: Text("Complete some working sets to see your history here.")
                )
            } else {
                ForEach(groups) { group in
                    Button {
                        selected = SelectedName(name: group.name)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(group.name).font(.body.weight(.semibold)).foregroundStyle(.primary)
                                HStack(spacing: 8) {
                                    Text("\(group.sessions) \(group.sessions == 1 ? "time" : "times") performed")
                                        .font(.caption)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(Color(.tertiarySystemFill), in: Capsule())
                                    if let last = group.lastDate {
                                        Text("Last: \(Fmt.shortDate(last))").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                                .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chart.xyaxis.line").foregroundStyle(.secondary)
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        if let record = model.exercises.first(where: { $0.name == group.name }) {
                            Button("Details") { model.path.append(.exerciseInfo(record.id)) }
                                .tint(.purple)
                        }
                    }
                }
            }
        }
        .navigationTitle("Exercise History")
        .searchable(text: $search, prompt: "Search exercises")
        .refreshable { await load() }
        .task { await load() }
        .sheet(item: $selected) { selection in
            ExerciseHistorySheet(exerciseName: selection.name)
        }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            entries = try await model.api.history(model.username, all: true)
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}

/// Pick a replacement from the exercise library. One tap swaps: an active
/// search field hides the navigation bar's buttons, so a separate Swap
/// button there could be out of reach. Swapping again undoes it.
struct SwapExerciseSheet: View {
    let current: ResolvedExercise
    let onSwap: (ExerciseRecord) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    /// Prefix matches first, then word-start matches, then the rest.
    private var candidates: [ExerciseRecord] {
        let query = search.trimmingCharacters(in: .whitespaces).lowercased()
        let pool = model.exercises.filter { $0.id != current.exerciseId }
        guard !query.isEmpty else { return pool }
        func rank(_ name: String) -> Int {
            let lower = name.lowercased()
            if lower.hasPrefix(query) { return 0 }
            if lower.split(whereSeparator: { !$0.isLetter && !$0.isNumber }).contains(where: { $0.hasPrefix(query) }) { return 1 }
            return 2
        }
        return pool
            .filter { $0.name.lowercased().contains(query) }
            .enumerated()
            .sorted { (rank($0.element.name), $0.offset) < (rank($1.element.name), $1.offset) }
            .map(\.element)
    }

    var body: some View {
        NavigationStack {
            List(candidates) { exercise in
                Button {
                    Haptics.commit()
                    onSwap(exercise)
                    dismiss()
                } label: {
                    HStack {
                        Text(exercise.name).foregroundStyle(.primary)
                        Spacer()
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.footnote)
                            .foregroundStyle(.tertiary)
                    }
                    .contentShape(Rectangle())
                }
            }
            .overlay {
                if candidates.isEmpty { ContentUnavailableView.search(text: search) }
            }
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search exercises")
            .navigationTitle("Swap Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .top) {
                Text("Tap an exercise to replace \"\(current.name)\"")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(.bar)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
