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
                    navigate: { newIndex in index = newIndex },
                    finish: { dismiss() }
                )
                // Fresh input state per exercise (and after a swap).
                .id("\(workoutNumber)-\(index)-\(swapId ?? -1)")
                .navigationTitle(workout.workoutName)
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
            VStack(alignment: .leading, spacing: 0) {
                identity
                    .padding(16)
                setTypeBanner
                if let warmup = warmupInfo {
                    warmupReference(warmup)
                }
                VStack(spacing: 12) {
                    navigationRow
                    RestTimerBar()
                    completeButton
                }
                .padding(16)

                VStack(spacing: 16) {
                    if let calculated = exercise.calculatedWeight {
                        recommendedCard(calculated)
                    }
                    setGroupsCard
                    notesCard
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 32)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { hideKeyboard() }
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

    private var identity: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Exercise \(workingPosition.current) of \(workingPosition.total)")
                    .font(.subheadline.weight(.medium))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Spacer()
                if isCompleted {
                    Label("Completed", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(Theme.green, in: Capsule())
                }
            }

            Text(exercise.name)
                .font(.title2.weight(.bold))

            HStack(spacing: 8) {
                if let id = exercise.exerciseId {
                    iconButton("info.circle", label: "Exercise details") {
                        model.path.append(.exerciseInfo(id))
                    }
                }
                if !model.exercises.isEmpty {
                    iconButton("arrow.triangle.2.circlepath", label: "Swap exercise") { showSwap = true }
                }
                iconButton("clock.arrow.circlepath", label: "Exercise history") { showHistory = true }
                if let label = exercise.base.supersetLabel {
                    Pill(text: "Superset \(label)", background: Theme.greenDeep)
                }
            }

            Text(prescriptionLine).font(.subheadline).foregroundStyle(.secondary)

            let rirSets = WorkoutMath.rirSets(exercise.base)
            if !rirSets.isEmpty {
                HStack(spacing: 6) {
                    ForEach(rirSets, id: \.set) { rir in
                        Pill(text: "Set \(rir.set): \(rir.rir) RIR", foreground: Theme.greenDeep, background: Theme.green.opacity(0.15))
                    }
                    Button {
                        withAnimation(.snappy) { showRirHint.toggle() }
                    } label: {
                        Image(systemName: "info.circle").font(.footnote)
                    }
                    .accessibilityLabel("What is RIR?")
                }
                if showRirHint {
                    Text("RIR = reps in reserve: stop that many reps shy of failure (0 = go to failure).")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if let swappedFrom = exercise.swappedFrom {
                Label("Swapped from: \(swappedFrom)", systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption)
                    .foregroundStyle(Theme.green)
            }
        }
    }

    private var setTypeBanner: some View {
        let working = exercise.base.isWorking
        var text = "\(exercise.base.typeOfSet) set"
        if let label = exercise.base.supersetLabel { text += " • Part of Superset \(label)" }
        return Text(text.uppercased())
            .font(.subheadline.weight(.semibold))
            .tracking(0.5)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(working ? AnyShapeStyle(Theme.deepGradient) : AnyShapeStyle(Theme.warmupGradient))
    }

    private func warmupReference(_ warmup: ProgramExercise) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Button {
                withAnimation(.snappy) { warmupExpanded.toggle() }
            } label: {
                HStack {
                    Image(systemName: "info.circle").font(.caption).foregroundStyle(.secondary)
                    Text(warmupText(warmup))
                        .font(.caption.weight(.medium))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Image(systemName: "chevron.down")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(warmupExpanded ? 180 : 0))
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if warmupExpanded && !warmup.notes.isEmpty {
                Text(warmup.notes)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.leading, 20)
            }
            Divider()
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private var navigationRow: some View {
        HStack(spacing: 8) {
            Button("Workout") { finish() }
                .buttonStyle(OutlineButtonStyle())
            Button("Previous") {
                Haptics.tap()
                hideKeyboard()
                if previousIndex >= 0 { navigate(previousIndex) } else { finish() }
            }
            .buttonStyle(OutlineButtonStyle())
            .disabled(index == 0)
            .opacity(index == 0 ? 0.5 : 1)
            Button("Next") {
                Haptics.tap()
                hideKeyboard()
                if nextIndex < all.count { navigate(nextIndex) }
            }
            .buttonStyle(OutlineButtonStyle())
            .disabled(nextIndex >= all.count)
            .opacity(nextIndex >= all.count ? 0.5 : 1)
        }
        .disabled(isCompleting)
    }

    private var completeButton: some View {
        Button(action: complete) {
            Label(isCompleting ? "Set logged" : (isCompleted ? "Mark complete again" : "Complete exercise"),
                  systemImage: "checkmark")
                .symbolEffect(.bounce, value: isCompleting)
        }
        .buttonStyle(FilledButtonStyle(background: AnyShapeStyle(isCompleting || isCompleted ? Theme.greenDeep : Theme.green)))
        .scaleEffect(isCompleting && !reduceMotion ? 1.03 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isCompleting)
        .disabled(isCompleting)
    }

    private func recommendedCard(_ calculated: Double) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Recommended Weight").font(.body.weight(.medium))
                Spacer()
                Text("\(Fmt.num(calculated)) lbs").font(.title3.weight(.bold)).foregroundStyle(Theme.green)
            }
            HStack {
                Text("1RM: \(Fmt.num(exercise.oneRM)) lbs")
                Spacer()
                Text("Load: \(Fmt.num(exercise.base.loadPercentage))%")
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .card()
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color.yellow.opacity(0.35)))
    }

    private var setGroupsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Sets, reps, & weight").font(.headline)
                Spacer()
                if rows.count > 1 {
                    Text("\(rows.count) groups").font(.caption.weight(.medium)).foregroundStyle(.secondary)
                }
            }

            ForEach(Array(rows.enumerated()), id: \.element.id) { position, row in
                groupEditor(position: position, row: row)
            }

            Button {
                Haptics.tap()
                groupsDirty = true
                let previous = rows.last?.group ?? SetGroup(sets: 1, reps: 1, weight: 0)
                withAnimation(.snappy) { rows.append(EditableGroup(group: previous)) }
            } label: {
                Label("Add set group", systemImage: "plus")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.green)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [5, 4])).foregroundStyle(Color(.systemGray3)))
            }
            .buttonStyle(PressableStyle())

            if let oneRM = exercise.oneRM, oneRM > 0, topWeight > 0 {
                Text("Actual: \(WorkoutMath.actualPercentage(weight: topWeight, oneRM: oneRM)) of 1RM\(rows.count > 1 ? " (top set)" : "")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
            if topWeight > 0, exercise.record?.usesBarbell == true {
                PlateCalculatorView(weight: topWeight)
            }
        }
        .card()
    }

    @ViewBuilder
    private func groupEditor(position: Int, row: EditableGroup) -> some View {
        let multi = rows.count > 1
        VStack(alignment: .leading, spacing: 10) {
            if multi {
                HStack {
                    Text("\(position + 1)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Theme.greenDeep)
                        .frame(minWidth: 20, minHeight: 20)
                        .background(Theme.green.opacity(0.15), in: Capsule())
                    Text("Set group").font(.subheadline.weight(.semibold))
                    Spacer()
                    Button {
                        Haptics.tap()
                        groupsDirty = true
                        withAnimation(.snappy) { rows.removeAll { $0.id == row.id } }
                    } label: {
                        Image(systemName: "xmark").font(.subheadline).frame(width: 44, height: 36)
                    }
                    .foregroundStyle(.secondary)
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
        .padding(multi ? 12 : 0)
        .overlay {
            if multi {
                RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color(.separator))
            }
        }
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exercise Notes").font(.headline)
            if !exercise.notes.isEmpty {
                NoteCallout(text: exercise.notes)
            }
            TextField("Add your notes...", text: Binding(
                get: { notes },
                set: { notes = $0; notesDirty = true }
            ), axis: .vertical)
            .lineLimit(3...8)
            .padding(10)
            .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .card()
    }

    // MARK: Helpers

    private func iconButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body)
                .foregroundStyle(Theme.green)
                .frame(width: 36, height: 32)
                .background(Theme.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(PressableStyle(scale: 0.9))
        .accessibilityLabel(label)
    }

    private func labeled<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption.weight(.medium)).foregroundStyle(.secondary)
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
        var line = exercise.base.prescription
        if let pct = exercise.base.loadPercentage { line += " @ \(Fmt.num(pct))% 1RM" }
        if let rpe = exercise.base.rpe { line += " (RPE \(Fmt.num(rpe)))" }
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
        isCompleting = true
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
