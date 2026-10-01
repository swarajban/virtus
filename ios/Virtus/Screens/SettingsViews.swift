import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var users: [User] = []
    @State private var pendingProgram: String?
    @State private var showProgramSheet = false
    @State private var isSwitching = false

    var body: some View {
        Form {
            Section {
                Picker(selection: Binding(
                    get: { model.username },
                    set: { name in Task { await model.switchUser(name) } }
                )) {
                    if users.isEmpty {
                        Text(model.username).tag(model.username)
                    }
                    ForEach(users) { user in
                        Text(user.username).tag(user.username)
                    }
                } label: {
                    Label("User", systemImage: "person")
                }
            } header: {
                Text("User Account")
            }

            Section {
                Picker(selection: Binding(
                    get: { model.selectedProgramName },
                    set: { name in if name != model.selectedProgramName { pendingProgram = name } }
                )) {
                    ForEach(model.programs) { program in
                        Text(program.name).tag(program.name)
                    }
                } label: {
                    Label("Active Program", systemImage: "list.bullet.rectangle")
                }
                .disabled(isSwitching)

                LabeledContent("Workouts", value: "\(model.currentProgram?.workouts.count ?? 0)")
                if let cycle = model.user?.currentProgramCycle {
                    LabeledContent("Cycle", value: "\(cycle)")
                }

                Button {
                    showProgramSheet = true
                } label: {
                    HStack {
                        Label("Start New Program", systemImage: "arrow.clockwise")
                        if isSwitching { Spacer(); ProgressView() }
                    }
                }
                .disabled(isSwitching)
            } header: {
                Text("Program")
            } footer: {
                Text("Start a fresh cycle of your current program or switch to a different one. Your history is preserved.")
            }

            Section {
                NavigationLink(value: Route.oneRM) {
                    Label("1RM Settings", systemImage: "scalemass")
                }
            }

            Section {
                LabeledContent("Server", value: model.api.baseURL.host() ?? "")
                LabeledContent("Pending sync", value: "\(model.sync.pendingCount)")
                if model.sync.pendingCount > 0 {
                    Button("Sync Now") { model.sync.kick(resetBackoff: true) }
                }
                LabeledContent("Version", value: appVersion)
            } header: {
                Text("About")
            }
        }
        .navigationTitle("Settings")
        .task {
            if let fetched = try? await model.api.users() { users = fetched }
        }
        .confirmationDialog(
            "Switch to \"\(pendingProgram ?? "")\"?",
            isPresented: Binding(get: { pendingProgram != nil }, set: { if !$0 { pendingProgram = nil } }),
            titleVisibility: .visible
        ) {
            Button("Switch Program") {
                if let name = pendingProgram { start(name) }
            }
        } message: {
            Text("This will start a fresh cycle and reset your workout progress.")
        }
        .sheet(isPresented: $showProgramSheet) {
            ProgramPickerSheet { name in start(name) }
        }
    }

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    private func start(_ programName: String) {
        isSwitching = true
        Task {
            defer { isSwitching = false }
            do {
                let cycle = try await model.startNewProgram(programName)
                model.showToast("Started \(programName)", cycle.map { "Cycle \($0)" })
            } catch {
                model.showToast("Couldn't start program", error.localizedDescription, style: .error)
            }
        }
    }
}

struct ProgramPickerSheet: View {
    let onStart: (String) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var selection: String?

    var body: some View {
        NavigationStack {
            List(model.programs) { program in
                Button {
                    Haptics.selection()
                    selection = program.name
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                Text(program.name).font(.headline).foregroundStyle(.primary)
                                if program.name == model.selectedProgramName {
                                    Pill(text: "Current")
                                }
                            }
                            Text("\(program.workouts.count) workouts").font(.subheadline).foregroundStyle(.secondary)
                            if program.name == model.selectedProgramName {
                                Text("Selecting this will start the next cycle").font(.caption).foregroundStyle(Theme.green)
                            }
                        }
                        Spacer()
                        Image(systemName: selection == program.name ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(selection == program.name ? Theme.green : Color(.systemGray3))
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Start New Program")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        if let selection {
                            onStart(selection)
                            dismiss()
                        }
                    }
                    .disabled(selection == nil)
                }
            }
        }
    }
}

/// The four main lifts' 1RMs (one-rm.tsx).
struct OneRMView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private struct Lift: Identifiable {
        let name: String
        let fallback: Double
        var id: String { name }
    }

    private let lifts = [
        Lift(name: "Back squat", fallback: 135),
        Lift(name: "Barbell bench press", fallback: 95),
        Lift(name: "Deadlift", fallback: 185),
        Lift(name: "Overhead press", fallback: 65),
    ]

    @State private var values: [String: Double] = [:]
    @State private var isSaving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Your current max for each main lift. Working weights are calculated from these.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
                ForEach(lifts) { lift in
                    GroupedSection(lift.name) {
                        StepperField(value: Binding(
                            get: { values[lift.name] ?? lift.fallback },
                            set: { values[lift.name] = $0 }
                        ), step: 5, minimum: 0)
                    }
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .scrollDismissesKeyboard(.interactively)
        .bottomActionBar {
            Button {
                Task { await save() }
            } label: {
                Group {
                    if isSaving { ProgressView() } else { Text("Save Changes") }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
            }
            .prominentButtonStyle()
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .disabled(isSaving || model.exercises.isEmpty)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .navigationTitle("One Rep Max")
        .onAppear(perform: loadValues)
        .onChange(of: model.oneRMs) { _, _ in loadValues() }
    }

    private func loadValues() {
        for lift in lifts {
            if let id = model.exercises.first(where: { $0.name == lift.name })?.id, let weight = model.oneRMs[id] {
                values[lift.name] = weight
            } else if values[lift.name] == nil, let legacy = model.legacyOneRM, let key = WorkoutMath.mainLifts[lift.name] {
                values[lift.name] = legacy[keyPath: key]
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            try await withThrowingTaskGroup(of: Void.self) { group in
                for lift in lifts {
                    guard let id = model.exercises.first(where: { $0.name == lift.name })?.id else { continue }
                    let weight = values[lift.name] ?? lift.fallback
                    let username = model.username
                    let api = model.api
                    group.addTask { try await api.saveOneRM(exerciseId: id, weight: weight, username: username) }
                }
                try await group.waitForAll()
            }
            await model.refreshOneRMs()
            model.showToast("Saved", "1RM values have been saved.")
            dismiss()
        } catch {
            model.showToast("Failed to save 1RM values", error.localizedDescription, style: .error)
        }
    }
}
