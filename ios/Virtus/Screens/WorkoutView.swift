import SwiftUI
import UIKit

struct WorkoutView: View {
    let workoutNumber: Int

    @Environment(AppModel.self) private var model
    @State private var confirmReset = false

    var body: some View {
        if let workout = model.workout(workoutNumber) {
            content(workout)
        } else {
            ContentUnavailableView {
                Label("Workout not found", systemImage: "questionmark.circle")
            } description: {
                Text("Workout #\(workoutNumber) isn't part of \(model.selectedProgramName).")
            } actions: {
                Button("Back to Home") { model.path = [] }
            }
        }
    }

    private func content(_ workout: Workout) -> some View {
        let progress = model.progress[workoutNumber]
        let status = progress?.status ?? .notStarted
        let working = workout.workingIndices
        let doneCount = working.filter { progress?.exerciseProgress?["\($0)"]?.isCompleted ?? false }.count
        let currentIndex = status == .inProgress
            ? working.first(where: { !(progress?.exerciseProgress?["\($0)"]?.isCompleted ?? false) })
            : nil

        return List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Week \(workout.weekNumber) · Day \(workout.dayNumber)")
                            .font(.footnote.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Spacer()
                        StatusBadge(status: status)
                    }
                    Text(workout.workoutName)
                        .font(.title2.weight(.bold))
                    HStack(spacing: 12) {
                        Label(statusText(progress), systemImage: status == .completed ? "calendar" : "clock")
                        if status != .notStarted {
                            Label("\(doneCount)/\(working.count)", systemImage: "checklist")
                                .monospacedDigit()
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    if status == .inProgress {
                        ProgressView(value: Double(doneCount), total: Double(max(working.count, 1)))
                            .tint(Theme.green)
                    }
                }
                .padding(.vertical, 4)

                primaryAction(workout: workout, status: status)
                    .listRowSeparator(.hidden)
            }

            Section("Exercises") {
                ForEach(working, id: \.self) { index in
                    let exercise = model.resolve(workout, index: index)
                    let entry = progress?.exerciseProgress?["\(index)"]
                    let rowStatus: ExerciseRowStatus = (entry?.isCompleted ?? false)
                        ? .completed
                        : (index == currentIndex ? .current : .upcoming)
                    NavigationLink(value: Route.exercise(workout: workoutNumber, index: index)) {
                        ExerciseRow(exercise: exercise, entry: entry, status: rowStatus)
                    }
                }
            }

            if status != .notStarted {
                Section {
                    Button(role: .destructive) {
                        confirmReset = true
                    } label: {
                        Label("Reset Workout", systemImage: "arrow.counterclockwise")
                    }
                } footer: {
                    Text("Clears this workout's progress and logged sets.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Week \(workout.weekNumber) · Day \(workout.dayNumber)")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh(force: true) }
        .toolbar {
            if status == .completed {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: summary(workout)) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share summary")
                }
            }
        }
        .confirmationDialog("Reset Workout?", isPresented: $confirmReset, titleVisibility: .visible) {
            Button("Reset", role: .destructive) {
                Haptics.warning()
                model.resetWorkout(workoutNumber)
            }
        } message: {
            Text("This will clear all progress and exercise history for this workout. This action cannot be undone.")
        }
    }

    @ViewBuilder
    private func primaryAction(workout: Workout, status: WorkoutStatus) -> some View {
        Group {
            switch status {
            case .notStarted:
                Button {
                    Haptics.tap()
                    model.startWorkout(workoutNumber)
                    if let first = workout.workingIndices.first {
                        model.path.append(.exercise(workout: workoutNumber, index: first))
                    }
                } label: {
                    Label("Start Workout", systemImage: "play.fill").frame(maxWidth: .infinity)
                }
                .prominentButtonStyle()
            case .inProgress:
                Button {
                    Haptics.commit()
                    model.completeWorkout(workoutNumber)
                } label: {
                    Label("Complete Workout", systemImage: "checkmark").frame(maxWidth: .infinity)
                }
                .prominentButtonStyle()
            case .completed:
                Button {
                    UIPasteboard.general.string = summary(workout)
                    Haptics.tap()
                    model.showToast("Copied to clipboard", "Workout summary copied!")
                } label: {
                    Label("Copy Summary", systemImage: "doc.on.doc").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }
        }
        .controlSize(.large)
        .font(.body.weight(.semibold))
    }

    private func statusText(_ progress: WorkoutProgress?) -> String {
        switch progress?.status ?? .notStarted {
        case .completed:
            return Fmt.date(progress?.completedAt)
        case .inProgress:
            return startedText(progress?.startedAt)
        case .notStarted:
            return "Ready to start"
        }
    }

    /// Plain-text log of completed working sets, e.g.
    /// "Back squat: 2 x 1 @ 315 lbs, 3 x 3 @ 275 lbs".
    private func summary(_ workout: Workout) -> String {
        let progress = model.progress[workoutNumber]
        var lines = [
            workout.workoutName,
            "Week \(workout.weekNumber) • Day \(workout.dayNumber)",
            progress?.completedAt.map { Fmt.date($0) } ?? Fmt.date(ISODate.now()),
            "",
        ]
        for index in workout.exercises.indices {
            guard let entry = progress?.exerciseProgress?["\(index)"], entry.isCompleted,
                  workout.exercises[index].isWorking else { continue }
            let exercise = model.resolve(workout, index: index)
            let groups = entry.setGroups.map { g in
                "\(g.sets) x \(g.reps) @ \(Fmt.num(g.weight ?? exercise.calculatedWeight)) lbs"
            }
            lines.append("\(exercise.name): \(groups.joined(separator: ", "))")
        }
        return lines.joined(separator: "\n")
    }
}

enum ExerciseRowStatus { case completed, current, upcoming }

private struct ExerciseRow: View {
    let exercise: ResolvedExercise
    let entry: ExerciseProgress?
    let status: ExerciseRowStatus

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            statusIcon
                .font(.title3)
                .frame(width: 24)
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(exercise.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(status == .completed ? Color.secondary : Color.primary)
                    if exercise.swappedFrom != nil {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.caption)
                            .foregroundStyle(.purple)
                            .accessibilityLabel("Swapped")
                    }
                }
                Text(detailLine)
                    .font(.subheadline)
                    .foregroundStyle(status == .completed ? Theme.green : Color.secondary)
                    .monospacedDigit()
                if exercise.base.supersetLabel != nil || !WorkoutMath.rirSets(exercise.base).isEmpty {
                    HStack(spacing: 6) {
                        if let label = exercise.base.supersetLabel {
                            Pill(text: "Superset \(label)", foreground: .purple)
                        }
                        ForEach(WorkoutMath.rirSets(exercise.base), id: \.set) { rir in
                            Pill(text: "S\(rir.set) · \(rir.rir) RIR", foreground: .secondary, background: Color(.tertiarySystemFill))
                        }
                    }
                }
                if !exercise.notes.isEmpty && status != .completed {
                    Text(exercise.notes)
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder private var statusIcon: some View {
        switch status {
        case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.green)
        case .current: Image(systemName: "arrow.right.circle.fill").foregroundStyle(.orange)
        case .upcoming: Image(systemName: "circle").foregroundStyle(Color(.tertiaryLabel))
        }
    }

    /// Prescription, or what was actually logged once complete
    /// ("2×1, 3×3 · top 315").
    private var detailLine: String {
        if status == .completed, let entry {
            let groups = entry.setGroups
            var text = groups.prefix(2).map { "\($0.sets)×\($0.reps)" }.joined(separator: ", ")
            if groups.count > 2 { text += " +\(groups.count - 2)" }
            if let top = groups.topSet.weight { text += " · \(groups.count > 1 ? "top " : "")\(Fmt.num(top)) lbs" }
            return text
        }
        var parts = [exercise.base.prescription.replacingOccurrences(of: " x ", with: " × ")]
        if let weight = exercise.calculatedWeight { parts.append("\(Fmt.num(weight)) lbs") }
        if let pct = exercise.base.loadPercentage { parts.append("\(Fmt.num(pct))%") }
        if let rpe = exercise.base.rpe { parts.append("RPE \(Fmt.num(rpe))") }
        return parts.joined(separator: " · ")
    }
}
