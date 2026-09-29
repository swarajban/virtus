import SwiftUI
import UIKit

/// Hosts one workout's exercises. Next / Previous swap the exercise in place
/// (like the web route change) instead of pushing a new screen each time.
struct ExerciseScreen: View {
    let workoutNumber: Int

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var index: Int

    init(workoutNumber: Int, startIndex: Int) {
        self.workoutNumber = workoutNumber
        _index = State(initialValue: startIndex)
    }

    var body: some View {
        Group {
            if let workout = model.workout(workoutNumber), workout.exercises.indices.contains(index) {
                let exercise = model.resolve(workout, index: index)
                let swapId = model.exerciseProgress(workout: workoutNumber, index: index)?.swappedExercise?.exerciseId
                ExerciseContent(
                    workout: workout,
                    exercise: exercise,
                    navigate: { newIndex in
                        withAnimation(.snappy(duration: 0.25)) { index = newIndex }
                    },
                    finish: { dismiss() }
                )
                // Fresh input state per exercise (and after a swap).
                .id("\(workoutNumber)-\(index)-\(swapId ?? -1)")
                .transition(.opacity)
            } else {
                ContentUnavailableView("Exercise not found", systemImage: "questionmark.circle")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EditableGroup: Identifiable, Hashable {
    let id = UUID()
    var group: SetGroup
}

private enum SeedSource { case empty, calculated, history, saved }

struct ExerciseContent: View {
    let workout: Workout
    let exercise: ResolvedExercise
    let navigate: (Int) -> Void
    let finish: () -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var rows: [EditableGroup] = []
    @State private var notes = ""
    @State private var seed: SeedSource = .empty
    @State private var groupsDirty = false
    @State private var notesDirty = false
    @State private var isCompleting = false
    @State private var advanceTask: Task<Void, Never>?
    @State private var showHistory = false
    @State private var showSwap = false
    @State private var showRirHint = false
    @State private var warmupExpanded = false

    private var index: Int { exercise.index }
    private var all: [ProgramExercise] { workout.exercises }
    private var saved: ExerciseProgress? { model.exerciseProgress(workout: workout.workoutNumber, index: index) }
    private var isCompleted: Bool { saved?.isCompleted ?? false }
    private var previousIndex: Int { WorkoutMath.skipWarmups(all, from: index - 1, step: -1) }
    private var nextIndex: Int { WorkoutMath.skipWarmups(all, from: index + 1, step: 1) }
    private var topWeight: Double { rows.map(\.group).topSet.weight ?? 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                if let warmup = warmupInfo {
                    warmupCard(warmup)
                }
                if let calculated = exercise.calculatedWeight {
                    targetCard(calculated)
                }
                RestTimerBar()
                setGroupsSection
                notesSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom, spacing: 0) { actionBar }
        .navigationTitle("Exercise \(workingPosition.current) of \(workingPosition.total)")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showHistory = true } label: {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                }
                .accessibilityLabel("Exercise history")
                Menu {
                    if let id = exercise.exerciseId {
                        Button {
                            model.path.append(.exerciseInfo(id))
                        } label: {
                            Label("Exercise Details", systemImage: "info.circle")
                        }
                    }
                    Button {
                        showSwap = true
                    } label: {
                        Label("Swap Exercise", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .disabled(model.exercises.isEmpty)
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More")
            }
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }.fontWeight(.semibold)
            }
        }
        .onAppear(perform: seedInputs)
        .onDisappear { advanceTask?.cancel() }
        .onChange(of: exercise.calculatedWeight) { _, newValue in
            // 1RMs arrived after first paint: update an untouched auto-seed.
            guard let newValue, !groupsDirty, seed != .saved, rows.count == 1 else { return }
            rows[0].group = SetGroup(sets: exercise.base.numberOfSets, reps: exercise.base.numberOfReps ?? 1, weight: newValue)
            seed = .calculated
        }
        .onChange(of: isCompleted) { _, completed in
            // A refresh revealed this exercise was already logged.
            guard completed, !isCompleting, let saved else { return }
            if !groupsDirty {
                rows = saved.setGroups.map { EditableGroup(group: $0) }
                seed = .saved
            }
            if !notesDirty { notes = saved.notes ?? "" }
        }
        .task { await seedWeightFromHistory() }
        .sheet(isPresented: $showHistory) {
            ExerciseHistorySheet(exerciseName: exercise.name)
        }
        .sheet(isPresented: $showSwap) {
            SwapExerciseSheet(current: exercise) { replacement in
                model.swapExercise(workout: workout.workoutNumber, exercise: exercise, to: replacement)
            }
        }
    }

    // MARK: Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text(setTypeText)
                    .font(.footnote.weight(.bold))
                    .textCase(.uppercase)
                    .tracking(0.4)
                    .foregroundStyle(exercise.base.isWorking ? Theme.green : .orange)
                Spacer()
                if isCompleted {
                    Label("Logged", systemImage: "checkmark.circle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Theme.green)
                        .transition(.scale.combined(with: .opacity))
                }
            }

            Text(exercise.name)
                .font(.largeTitle.weight(.bold))
                .minimumScaleFactor(0.7)
                .lineLimit(2)

            Text(prescriptionLine)
                .font(.title3.weight(.medium))
                .foregroundStyle(.secondary)
                .monospacedDigit()

            let rirSets = WorkoutMath.rirSets(exercise.base)
            if !rirSets.isEmpty {
                HStack(spacing: 6) {
                    ForEach(rirSets, id: \.set) { rir in
                        Pill(text: "Set \(rir.set): \(rir.rir) RIR")
                    }
                    Button {
                        withAnimation(.snappy) { showRirHint.toggle() }
                    } label: {
                        Image(systemName: "questionmark.circle").font(.subheadline)
                    }
                    .accessibilityLabel("What is RIR?")
                }
                if showRirHint {
                    Text("RIR = reps in reserve: stop that many reps shy of failure (0 = go to failure).")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .transition(.opacity)
                }
            }

            if let swappedFrom = exercise.swappedFrom {
                Label("Swapped from \(swappedFrom)", systemImage: "arrow.triangle.2.circlepath")
                    .font(.footnote)
                    .foregroundStyle(.purple)
            }
        }
    }

    private func warmupCard(_ warmup: ProgramExercise) -> some View {
        DisclosureGroup(isExpanded: $warmupExpanded) {
            if !warmup.notes.isEmpty {
                Text(warmup.notes)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
            }
        } label: {
            Label(warmupText(warmup), systemImage: "flame")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.primary)
        }
        .tint(.orange)
        .card(padding: 14)
    }

    private func targetCard(_ calculated: Double) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Target")
                    .font(.footnote.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text("\(Fmt.num(calculated)) lbs")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(Theme.green)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Fmt.num(exercise.base.loadPercentage))% of 1RM")
                Text("1RM \(Fmt.num(exercise.oneRM)) lbs")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .card()
    }

    private var setGroupsSection: some View {
        GroupedSection("Sets, reps & weight") {
            if rows.count > 1 {
                Text("\(rows.count) groups").font(.footnote).foregroundStyle(.secondary)
            }
        } content: {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { position, row in
                    if position > 0 { Divider() }
                    groupEditor(position: position, row: row)
                }

                Button {
                    Haptics.tap()
                    groupsDirty = true
                    let previous = rows.last?.group ?? SetGroup(sets: 1, reps: 1, weight: 0)
                    withAnimation(.snappy) { rows.append(EditableGroup(group: previous)) }
                } label: {
                    Label("Add Set Group", systemImage: "plus.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderless)
                .tint(Theme.green)

                if (exercise.oneRM ?? 0) > 0 && topWeight > 0 || (topWeight > 0 && exercise.record?.usesBarbell == true) {
                    Divider()
                    VStack(spacing: 10) {
                        if let oneRM = exercise.oneRM, oneRM > 0, topWeight > 0 {
                            Text("\(WorkoutMath.actualPercentage(weight: topWeight, oneRM: oneRM)) of 1RM\(rows.count > 1 ? " (top set)" : "")")
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                        if topWeight > 0, exercise.record?.usesBarbell == true {
                            PlateCalculatorView(weight: topWeight)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    @ViewBuilder
    private func groupEditor(position: Int, row: EditableGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if rows.count > 1 {
                HStack {
                    Text("Group \(position + 1)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.green)
                    Spacer()
                    Button(role: .destructive) {
                        Haptics.tap()
                        groupsDirty = true
                        withAnimation(.snappy) { rows.removeAll { $0.id == row.id } }
                    } label: {
                        Image(systemName: "minus.circle.fill").font(.title3)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Remove set group \(position + 1)")
                }
            }
            HStack(spacing: 12) {
                labeled("Sets") {
                    StepperField(value: binding(row.id, \.sets).asDouble, step: 1, minimum: 1, allowsDecimal: false)
                }
                labeled("Reps") {
                    StepperField(value: binding(row.id, \.reps).asDouble, step: 1, minimum: 1, allowsDecimal: false)
                }
            }
            labeled("Weight (lbs)") {
                StepperField(value: weightBinding(row.id), step: 5, minimum: 0)
            }
        }
    }

    private var notesSection: some View {
        GroupedSection("Notes") {
            VStack(alignment: .leading, spacing: 12) {
                if !exercise.notes.isEmpty {
                    NoteCallout(text: exercise.notes)
                    Divider()
                }
                TextField("Add your notes…", text: Binding(
                    get: { notes },
                    set: { notes = $0; notesDirty = true }
                ), axis: .vertical)
                .lineLimit(2...8)
            }
        }
    }

    /// Previous · Complete · Next, pinned above the home indicator.
    private var actionBar: some View {
        HStack(spacing: 12) {
            Button {
                Haptics.tap()
                hideKeyboard()
                if previousIndex >= 0 { navigate(previousIndex) } else { finish() }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.headline)
                    .frame(width: 30, height: 30)
            }
            .secondaryButtonStyle()
            .buttonBorderShape(.circle)
            .disabled(index == 0)
            .accessibilityLabel("Previous exercise")

            Button(action: complete) {
                Label(completeTitle, systemImage: isCompleting ? "checkmark.circle.fill" : "checkmark")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .contentTransition(.symbolEffect(.replace))
            }
            .prominentButtonStyle()
            .buttonBorderShape(.capsule)
            .scaleEffect(isCompleting && !reduceMotion ? 1.04 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isCompleting)

            Button {
                Haptics.tap()
                hideKeyboard()
                if nextIndex < all.count { navigate(nextIndex) }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.headline)
                    .frame(width: 30, height: 30)
            }
            .secondaryButtonStyle()
            .buttonBorderShape(.circle)
            .disabled(nextIndex >= all.count)
            .accessibilityLabel("Next exercise")
        }
        .controlSize(.large)
        .disabled(isCompleting)
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background {
            if #available(iOS 26.0, *) {
                // Glass buttons float over content on iOS 26.
                Color.clear
            } else {
                Rectangle().fill(.bar).ignoresSafeArea(edges: .bottom)
            }
        }
    }

    // MARK: Helpers

    private var completeTitle: String {
        if isCompleting { return "Logged" }
        return isCompleted ? "Update Log" : "Complete"
    }

    private var setTypeText: String {
        var text = exercise.base.isWorking ? "Working set" : "Warm-up set"
        if let label = exercise.base.supersetLabel { text += " · Superset \(label)" }
        return text
    }

    private func labeled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary).padding(.leading, 4)
            content()
        }
    }

    private func binding(_ id: UUID, _ keyPath: WritableKeyPath<SetGroup, Int>) -> Binding<Int> {
        Binding(
            get: { rows.first { $0.id == id }?.group[keyPath: keyPath] ?? 0 },
            set: { newValue in
                guard let i = rows.firstIndex(where: { $0.id == id }) else { return }
                groupsDirty = true
                rows[i].group[keyPath: keyPath] = newValue
            }
        )
    }

    private func weightBinding(_ id: UUID) -> Binding<Double> {
        Binding(
            get: { rows.first { $0.id == id }?.group.weight ?? 0 },
            set: { newValue in
                guard let i = rows.firstIndex(where: { $0.id == id }) else { return }
                groupsDirty = true
                rows[i].group.weight = newValue
            }
        )
    }

    private var prescriptionLine: String {
        var line = exercise.base.prescription.replacingOccurrences(of: " x ", with: " × ")
        if let pct = exercise.base.loadPercentage { line += " @ \(Fmt.num(pct))%" }
        if let rpe = exercise.base.rpe { line += " · RPE \(Fmt.num(rpe))" }
        return line
    }

    /// "Exercise N of M" counts working sets only.
    private var workingPosition: (current: Int, total: Int) {
        let total = all.filter { !$0.isWarmup }.count
        let upToHere = all.prefix(index + 1).filter { !$0.isWarmup }.count
        let current = exercise.base.isWarmup ? min(upToHere + 1, total) : upToHere
        return (current, total)
    }

    /// The warm-up block directly preceding this working block of the same lift.
    private var warmupInfo: ProgramExercise? {
        guard exercise.base.isWorking else { return nil }
        var i = index - 1
        while i >= 0 {
            let previous = all[i]
            guard previous.name == exercise.base.name else { return nil }
            if previous.isWarmup { return previous }
            i -= 1
        }
        return nil
    }

    private func warmupText(_ warmup: ProgramExercise) -> String {
        var text = "Warm-up: \(warmup.numberOfSets) × \(warmup.numberOfReps.map(String.init) ?? "—")"
        if let pct = warmup.loadPercentage { text += " @ \(Fmt.num(pct))%" }
        if let rpe = warmup.rpe { text += ", RPE \(Fmt.num(rpe))" }
        return text
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }

    // MARK: Seeding & actions

    private func seedInputs() {
        guard rows.isEmpty else { return }
        if isCompleted, let saved {
            rows = saved.setGroups.map { EditableGroup(group: $0) }
            notes = saved.notes ?? ""
            seed = .saved
        } else {
            rows = [EditableGroup(group: SetGroup(
                sets: exercise.base.numberOfSets,
                reps: exercise.base.numberOfReps ?? 1,
                weight: exercise.calculatedWeight ?? 0
            ))]
            seed = exercise.calculatedWeight == nil ? .empty : .calculated
        }
    }

    /// No calculated weight: default to the top weight of the last session.
    private func seedWeightFromHistory() async {
        guard exercise.calculatedWeight == nil, !isCompleted else { return }
        let name = exercise.name
        guard let history = try? await model.api.history(model.username, exerciseName: name), !history.isEmpty else { return }
        let latest = history.max { (ISODate.parse($0.date) ?? .distantPast) < (ISODate.parse($1.date) ?? .distantPast) }
        guard let latest else { return }
        let sessionRows = history.filter { latest.sessionId != nil ? $0.sessionId == latest.sessionId : $0.id == latest.id }
        let weight = sessionRows.map(\.weight).max() ?? 0
        guard weight > 0, !groupsDirty, seed == .empty, rows.count == 1 else { return }
        rows[0].group.weight = weight
        seed = .history
    }

    private func complete() {
        guard !isCompleting else { return }
        hideKeyboard()
        Haptics.commit()
        withAnimation(.snappy) { isCompleting = true }
        model.completeExercise(
            workout: workout.workoutNumber,
            exercise: exercise,
            groups: rows.map(\.group),
            notes: notes
        )
        // Reward beat, then advance — independent of the network.
        let next = nextIndex
        let count = all.count
        advanceTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: reduceMotion ? 150_000_000 : 450_000_000)
            guard !Task.isCancelled else { return }
            if next < count { navigate(next) } else { finish() }
        }
    }
}
