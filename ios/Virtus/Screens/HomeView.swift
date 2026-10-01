import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    /// Finished weeks start collapsed; these are the ones opened by hand.
    @State private var expandedWeeks: Set<Int> = []
    @State private var lastScrolledTo: Int?

    var body: some View {
        let workouts = model.workouts
        let completed = workouts.filter { model.status(of: $0.workoutNumber) == .completed }.count
        let next = model.nextWorkout
        let weeks = Dictionary(grouping: workouts, by: \.weekNumber).sorted { $0.key < $1.key }

        ScrollViewReader { proxy in
            List {
                Section {
                    ProgramHeader(
                        programName: model.selectedProgramName,
                        cycle: model.user?.currentProgramCycle,
                        completed: completed,
                        total: workouts.count,
                        isRefreshing: model.isRefreshing
                    )
                }

                if let next {
                    Section("Up Next") {
                        Button {
                            Haptics.tap()
                            model.path.append(.workout(next.workoutNumber))
                        } label: {
                            UpNextRow(workout: next, status: model.status(of: next.workoutNumber))
                        }
                        .buttonStyle(PressableStyle(scale: 0.98))
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                    }
                }

                Section {
                    NavigationLink(value: Route.history) {
                        Label("Exercise History", systemImage: "chart.line.uptrend.xyaxis")
                    }
                    NavigationLink(value: Route.exercises) {
                        Label("Exercise Library", systemImage: "dumbbell")
                    }
                }

                if workouts.isEmpty {
                    ContentUnavailableView("Program data unavailable",
                                           systemImage: "exclamationmark.triangle",
                                           description: Text("Pull to refresh once you're online."))
                }

                ForEach(weeks, id: \.key) { entry in
                    let week = entry.key
                    let items = entry.value
                    let done = items.filter { model.status(of: $0.workoutNumber) == .completed }.count
                    let finished = done == items.count
                    let expanded = !finished || expandedWeeks.contains(week)
                    Section {
                        if finished {
                            Button {
                                Haptics.tap()
                                withAnimation(.snappy) {
                                    if expandedWeeks.contains(week) { expandedWeeks.remove(week) } else { expandedWeeks.insert(week) }
                                }
                            } label: {
                                HStack {
                                    Label("\(items.count) workouts completed", systemImage: "checkmark.seal.fill")
                                        .foregroundStyle(Theme.green)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(.tertiary)
                                        .rotationEffect(.degrees(expanded ? 90 : 0))
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityHint(expanded ? "Hides this week's workouts" : "Shows this week's workouts")
                        }
                        if expanded {
                            ForEach(items) { workout in
                                NavigationLink(value: Route.workout(workout.workoutNumber)) {
                                    WorkoutRow(workout: workout,
                                               progress: model.progress[workout.workoutNumber],
                                               isNext: workout.workoutNumber == next?.workoutNumber)
                                }
                                .id(workout.workoutNumber)
                            }
                        }
                    } header: {
                        HStack {
                            Text("Week \(week)")
                            Spacer()
                            if !finished {
                                Text("\(done)/\(items.count)").monospacedDigit()
                            }
                        }
                    }
                    .id("week-\(week)")
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await model.refresh(force: true) }
            .onAppear { scrollToNext(proxy, next: next) }
            .onChange(of: next?.workoutNumber) { _, _ in scrollToNext(proxy, next: next) }
        }
        .navigationTitle("Virtus")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink(value: Route.settings) {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
        }
    }

    /// Bring the upcoming workout into view on launch and whenever it changes
    /// (e.g. after finishing a workout), but not on every return to Home, so a
    /// list you scrolled yourself stays put.
    private func scrollToNext(_ proxy: ScrollViewProxy, next: Workout?) {
        guard let number = next?.workoutNumber, number != lastScrolledTo else { return }
        lastScrolledTo = number
        // Near the top of the program the list already shows it; scrolling
        // would only hide the Up Next card.
        guard (model.workouts.firstIndex { $0.workoutNumber == number } ?? 0) > 2 else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.snappy) { proxy.scrollTo(number, anchor: .center) }
        }
    }
}

private struct ProgramHeader: View {
    let programName: String
    let cycle: Int?
    let completed: Int
    let total: Int
    let isRefreshing: Bool

    var body: some View {
        HStack(spacing: 16) {
            Gauge(value: Double(completed), in: 0...Double(max(total, 1))) {
                EmptyView()
            } currentValueLabel: {
                Text(total > 0 ? "\(Int((Double(completed) / Double(total) * 100).rounded()))%" : "–")
                    .font(.system(.footnote, design: .rounded).weight(.bold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(Theme.green)
            .scaleEffect(1.15)
            .padding(4)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(programName).font(.headline)
                    if isRefreshing { ProgressView().controlSize(.mini) }
                }
                if let cycle, cycle > 1 {
                    Text("Cycle \(cycle)").font(.subheadline.weight(.medium)).foregroundStyle(Theme.green)
                }
                Text("\(completed) of \(total) workouts completed")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 6)
    }
}

private struct UpNextRow: View {
    let workout: Workout
    let status: WorkoutStatus

    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Week \(workout.weekNumber) · Day \(workout.dayNumber)")
                    .font(.caption.weight(.semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.85))
                Text(workout.workoutName)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                Text("\(workout.workingIndices.count) exercises")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
            Spacer(minLength: 8)
            Image(systemName: "play.fill")
                .font(.title2)
                .foregroundStyle(Theme.green)
                .frame(width: 52, height: 52)
                .background(.white, in: Circle())
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.gradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct WorkoutRow: View {
    let workout: Workout
    let progress: WorkoutProgress?
    var isNext: Bool = false

    var body: some View {
        let status = progress?.status ?? .notStarted
        HStack(spacing: 12) {
            Image(systemName: isNext && status == .notStarted ? "arrow.right.circle.fill" : status.symbol)
                .font(.title2)
                .foregroundStyle(isNext && status == .notStarted ? Theme.green : status.color)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.workoutName)
                    .font(.body.weight(status == .completed ? .regular : .semibold))
                    .foregroundStyle(status == .completed ? Color.secondary : Color.primary)
                Text(subtitle(status))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func subtitle(_ status: WorkoutStatus) -> String {
        let day = "Day \(workout.dayNumber)"
        switch status {
        case .completed:
            return progress?.completedAt.map { "\(day) · \(Fmt.date($0))" } ?? day
        case .inProgress:
            return "\(day) · \(startedText(progress?.startedAt))"
        case .notStarted:
            return day
        }
    }
}

/// "Started 12 min ago", or the date once it's been a while.
func startedText(_ startedAt: String?) -> String {
    guard let started = ISODate.parse(startedAt) else { return "In progress" }
    let minutes = Int(Date().timeIntervalSince(started) / 60)
    if minutes < 120 { return "Started \(max(0, minutes)) min ago" }
    return "Started \(Fmt.date(startedAt))"
}
