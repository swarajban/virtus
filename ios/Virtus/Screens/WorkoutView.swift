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
        let currentIndex = status == .inProgress
            ? working.first(where: { !(progress?.exerciseProgress?["\($0)"]?.isCompleted ?? false) })
            : nil

        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Week \(workout.weekNumber) • Day \(workout.dayNumber)")
                            .font(.subheadline.weight(.medium))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Spacer()
                        StatusBadge(status: status)
                    }
                    Text(workout.workoutName).font(.title2.weight(.bold))
                    Text(statusText(progress)).font(.subheadline).foregroundStyle(.secondary)
                    if let cycle = model.user?.currentProgramCycle, cycle > 1 {
                        Text("Cycle \(cycle)").font(.caption).foregroundStyle(Theme.green)
                    }
                }

                actions(workout: workout, status: status)

                Text("Exercises").font(.headline).padding(.top, 4)

                VStack(spacing: 12) {
                    ForEach(working, id: \.self) { index in
                        let exercise = model.resolve(workout, index: index)
                        let entry = progress?.exerciseProgress?["\(index)"]
                        let rowStatus: ExerciseRowStatus = (entry?.isCompleted ?? false)
                            ? .completed
                            : (index == currentIndex ? .current : .upcoming)
                        Button {
                            model.path.append(.exercise(workout: workoutNumber, index: index))
                        } label: {
                            ExerciseRow(exercise: exercise, entry: entry, status: rowStatus)
                        }
                        .buttonStyle(PressableStyle())
                    }
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Workout")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refresh(force: true) }
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
    private func actions(workout: Workout, status: WorkoutStatus) -> some View {
        VStack(spacing: 10) {
            switch status {
            case .notStarted:
                Button {
                    Haptics.tap()
                    model.startWorkout(workoutNumber)
                } label: {
                    Label("Start Workout", systemImage: "play.fill")
                }
                .buttonStyle(FilledButtonStyle())
            case .inProgress:
                Button {
                    Haptics.commit()
                    model.completeWorkout(workoutNumber)
                } label: {
                    Label("Complete Workout", systemImage: "checkmark")
                }
                .buttonStyle(FilledButtonStyle())
            case .completed:
                Button {
                    UIPasteboard.general.string = summary(workout)
                    Haptics.tap()
                    model.showToast("Copied to clipboard", "Workout summary copied!")
                } label: {
                    Label("Export Summary", systemImage: "doc.on.doc")
                }
                .buttonStyle(FilledButtonStyle())
            }

            if status != .notStarted {
                Button(role: .destructive) {
                    confirmReset = true
                } label: {
                    Label("Reset Workout", systemImage: "arrow.counterclockwise")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .buttonStyle(.bordered)
                .tint(.red)
            }
        }
    }

    private func statusText(_ progress: WorkoutProgress?) -> String {
        switch progress?.status ?? .notStarted {
        case .completed:
            return "Completed on \(Fmt.date(progress?.completedAt))"
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
        HStack(spacing: 0) {
            Rectangle().fill(accent).frame(width: 4)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top) {
                    HStack(spacing: 6) {
                        Text(exercise.name).font(.headline).foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)
                        if exercise.swappedFrom != nil {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.caption)
                                .foregroundStyle(.purple)
                        }
                        if let label = exercise.base.supersetLabel {
                            Pill(text: "Superset \(label)", background: .purple)
                        }
                    }
                    Spacer()
                    statusIcon
                }

                FlowLayout(spacing: 12) {
                    Pill(text: exercise.base.typeOfSet, foreground: .primary, background: Color(.tertiarySystemFill))
                    if status == .completed, let entry {
                        Text(loggedSummary(entry)).fontWeight(.medium).foregroundStyle(.primary)
                    } else {
                        Text(exercise.base.prescription)
                        if let weight = exercise.calculatedWeight { Text("\(Fmt.num(weight)) lbs") }
                        if let pct = exercise.base.loadPercentage { Text("\(Fmt.num(pct))% 1RM") }
                        if let rpe = exercise.base.rpe { Text("RPE \(Fmt.num(rpe))") }
                        ForEach(WorkoutMath.rirSets(exercise.base), id: \.set) { rir in
                            Text("S\(rir.set): \(rir.rir) RIR")
                        }
                    }
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)

                if !exercise.notes.isEmpty {
                    NoteCallout(text: exercise.notes)
                }
            }
            .padding(14)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var accent: Color {
        switch status {
        case .completed: return Theme.green
        case .current: return Theme.warning
        case .upcoming: return Color(.systemGray4)
        }
    }

    @ViewBuilder private var statusIcon: some View {
        switch status {
        case .completed: Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.green)
        case .current: Image(systemName: "arrow.right").foregroundStyle(Theme.warning)
        case .upcoming: Image(systemName: "circle").foregroundStyle(Color(.systemGray3))
        }
    }

    /// "2×1, 3×3 · top 315" — first two groups plus a "+N" overflow.
    private func loggedSummary(_ entry: ExerciseProgress) -> String {
        let groups = entry.setGroups
        var text = groups.prefix(2).map { "\($0.sets)×\($0.reps)" }.joined(separator: ", ")
        if groups.count > 2 { text += " +\(groups.count - 2)" }
        if let top = groups.topSet.weight { text += " · top \(Fmt.num(top))" }
        return text
    }
}
