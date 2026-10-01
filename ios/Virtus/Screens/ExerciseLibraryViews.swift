import SwiftUI

/// The exercise library (exercises.tsx).
struct ExercisesView: View {
    @Environment(AppModel.self) private var model
    @State private var search = ""
    @State private var showAdd = false

    private var filtered: [ExerciseRecord] {
        let query = search.trimmingCharacters(in: .whitespaces)
        let sorted = model.exercises.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        return query.isEmpty ? sorted : sorted.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        List(filtered) { exercise in
            NavigationLink(value: Route.exerciseInfo(exercise.id)) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(exercise.name).font(.body.weight(.semibold))
                    if let notes = exercise.notes, !notes.isEmpty {
                        Text(notes).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    }
                    HStack(spacing: 6) {
                        if exercise.usesBarbell {
                            Pill(text: "Barbell", foreground: .secondary, background: Color(.tertiarySystemFill))
                        }
                        if let link = exercise.youtubeLink, !link.isEmpty {
                            Pill(text: "Has video", foreground: .red, background: Color.red.opacity(0.12))
                        }
                        if let oneRM = model.oneRMs[exercise.id] {
                            Pill(text: "1RM: \(Fmt.num(oneRM)) lbs", foreground: .blue, background: Color.blue.opacity(0.12))
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .overlay {
            if model.exercises.isEmpty {
                ProgressView("Loading exercises…")
            } else if filtered.isEmpty {
                ContentUnavailableView.search(text: search)
            }
        }
        .navigationTitle("Exercises")
        .searchable(text: $search, prompt: "Search exercises")
        .refreshable { await model.refreshExercises() }
        .task { await model.refreshExercises() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("Add Exercise")
            }
        }
        .sheet(isPresented: $showAdd) { AddExerciseSheet() }
    }
}

private struct AddExerciseSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var notes = ""
    @State private var youtubeLink = ""
    @State private var usesBarbell = true
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Form {
                TextField("Exercise name (e.g. Romanian deadlift)", text: $name)
                    .textInputAutocapitalization(.sentences)
                TextField("Notes — form tips, cues", text: $notes, axis: .vertical)
                TextField("YouTube link", text: $youtubeLink)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Toggle("Uses barbell", isOn: $usesBarbell)
            }
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await save() } }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
                }
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await model.api.createExercise(.init(
                name: name.trimmingCharacters(in: .whitespaces),
                notes: notes.isEmpty ? nil : notes,
                youtubeLink: youtubeLink.isEmpty ? nil : youtubeLink,
                usesBarbell: usesBarbell
            ))
            await model.refreshExercises()
            model.showToast("Exercise created")
            dismiss()
        } catch {
            model.showToast("Failed to create exercise", error.localizedDescription, style: .error)
        }
    }
}

/// Edit one exercise: notes, barbell flag, video link and 1RM (exercise-info.tsx).
struct ExerciseInfoView: View {
    let exerciseId: Int

    @Environment(AppModel.self) private var model
    @State private var notes = ""
    @State private var youtubeLink = ""
    @State private var usesBarbell = true
    @State private var oneRMText = ""
    @State private var onermExerciseId: Int?
    @State private var loaded = false
    @State private var isSaving = false
    @State private var sessionCount: Int?
    @State private var lastPerformed: String?
    @State private var showHistory = false

    private var exercise: ExerciseRecord? { model.exercises.first { $0.id == exerciseId } }

    var body: some View {
        Group {
            if let exercise {
                form(exercise)
            } else {
                ProgressView("Loading exercise…")
            }
        }
        .navigationTitle(exercise?.name ?? "Exercise")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: loadFields)
        .onChange(of: exercise) { _, _ in loadFields() }
        .task { await loadHistorySummary() }
        .sheet(isPresented: $showHistory) {
            if let exercise { ExerciseHistorySheet(exerciseName: exercise.name) }
        }
    }

    private func form(_ exercise: ExerciseRecord) -> some View {
        Form {
            Section("Exercise History") {
                if let sessionCount, sessionCount > 0 {
                    LabeledContent("Total sessions", value: "\(sessionCount)")
                    if let lastPerformed {
                        LabeledContent("Last performed", value: Fmt.shortDate(lastPerformed))
                    }
                    Button("View Full History") { showHistory = true }
                } else if sessionCount == 0 {
                    Text("No history recorded yet").foregroundStyle(.secondary)
                } else {
                    ProgressView()
                }
            }

            Section("Exercise Notes") {
                TextField("Form, technique, preferences…", text: $notes, axis: .vertical)
                    .lineLimit(3...10)
            }

            Section {
                Toggle(isOn: $usesBarbell) {
                    Label("Uses Barbell", systemImage: "dumbbell")
                }
            }

            Section("Video Tutorial") {
                TextField("https://www.youtube.com/watch?v=…", text: $youtubeLink)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                if let url = videoURL {
                    Link(destination: url) {
                        Label("Watch on YouTube", systemImage: "play.rectangle.fill")
                    }
                }
            }

            Section {
                if let refId = onermExerciseId {
                    let refName = model.exercises.first { $0.id == refId }?.name ?? "another exercise"
                    LabeledContent("1RM", value: model.oneRMs[refId].map { "\(Fmt.num($0)) lbs" } ?? "Not set")
                    Text("Uses the 1RM from \(refName) for weight calculations.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else {
                    HStack {
                        Text("1RM")
                        TextField("Enter weight", text: $oneRMText)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                        Text("lbs").foregroundStyle(.secondary)
                    }
                }
                Picker("Use 1RM from", selection: $onermExerciseId) {
                    Text("None (use default)").tag(Int?.none)
                    ForEach(model.exercises.filter { $0.id != exerciseId }.sorted { $0.name < $1.name }) { other in
                        Text(other.name).tag(Int?.some(other.id))
                    }
                }
                .pickerStyle(.navigationLink)
            } header: {
                Text("1RM Configuration")
            } footer: {
                Text("Used to calculate working weights. Borrow another exercise's 1RM for variations.")
            }
        }
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save(exercise) } }
                    .disabled(isSaving)
            }
        }
    }

    /// Opens in the YouTube app when installed. Accepts watch, youtu.be and
    /// Shorts links.
    private var videoURL: URL? {
        let trimmed = youtubeLink.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, let url = URL(string: trimmed),
              let host = url.host()?.lowercased(),
              host.contains("youtube.com") || host.contains("youtu.be") else { return nil }
        return url
    }

    private func loadFields() {
        guard !loaded, let exercise else { return }
        loaded = true
        notes = exercise.notes ?? ""
        youtubeLink = exercise.youtubeLink ?? ""
        usesBarbell = exercise.usesBarbell
        onermExerciseId = exercise.onermExerciseId
        oneRMText = model.oneRMs[exerciseId].map { Fmt.num($0) } ?? ""
    }

    private func loadHistorySummary() async {
        guard let name = exercise?.name,
              let entries = try? await model.api.history(model.username, exerciseName: name, all: true) else { return }
        let sessions = HistorySession.group(entries)
        sessionCount = sessions.count
        lastPerformed = sessions.first?.date
    }

    private func save(_ exercise: ExerciseRecord) async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await model.api.updateExercise(id: exerciseId, .init(
                notes: notes,
                youtubeLink: youtubeLink.isEmpty ? nil : youtubeLink,
                usesBarbell: usesBarbell,
                onermExerciseId: onermExerciseId
            ))
            // Own 1RM only applies when not borrowing another exercise's.
            if onermExerciseId == nil {
                let text = oneRMText.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)
                if let weight = Double(text), weight > 0 {
                    try await model.api.saveOneRM(exerciseId: exerciseId, weight: weight, username: model.username)
                } else if text.isEmpty, model.oneRMs[exerciseId] != nil {
                    try await model.api.deleteOneRM(exerciseId: exerciseId, username: model.username)
                }
            }
            await model.refreshExercises()
            await model.refreshOneRMs()
            model.showToast("Exercise updated")
        } catch {
            model.showToast("Failed to update exercise", error.localizedDescription, style: .error)
        }
    }
}
