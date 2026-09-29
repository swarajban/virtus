import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var didInitialScroll = false

    var body: some View {
        let workouts = model.workouts
        let completed = workouts.filter { model.status(of: $0.workoutNumber) == .completed }.count
        let next = model.nextWorkout

        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    progressCard(completed: completed, total: workouts.count)
                    quickActions(next: next)

                    Text("All Workouts")
                        .font(.title3.weight(.bold))
                        .padding(.top, 4)

                    if workouts.isEmpty {
                        ContentUnavailableView("Program data unavailable",
                                               systemImage: "exclamationmark.triangle",
                                               description: Text("Pull to refresh once you're online."))
                    }

                    LazyVStack(spacing: 12) {
                        ForEach(workouts) { workout in
                            Button {
                                model.path.append(.workout(workout.workoutNumber))
                            } label: {
                                WorkoutCardView(workout: workout, progress: model.progress[workout.workoutNumber])
                            }
                            .buttonStyle(PressableStyle())
                            .id(workout.workoutNumber)
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .refreshable { await model.refresh(force: true) }
            .onAppear { scrollToNext(proxy, next: next, animated: false) }
            .onChange(of: next?.workoutNumber) { _, _ in scrollToNext(proxy, next: next, animated: true) }
        }
        .navigationTitle("Virtus")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    model.path.append(.exercises)
                } label: {
                    Image(systemName: "dumbbell")
                }
                .accessibilityLabel("Exercises")
                Button {
                    model.path.append(.settings)
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }
        }
    }

    private var header: some View {
        HStack(spacing: 6) {
            Text(model.selectedProgramName)
            if let cycle = model.user?.currentProgramCycle, cycle > 1 {
                Text("•")
                Text("Cycle \(cycle)")
            }
            if model.isRefreshing {
                ProgressView().controlSize(.mini).padding(.leading, 2)
            }
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(.secondary)
    }

    private func progressCard(completed: Int, total: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Theme.gradient.frame(height: 6)
            VStack(alignment: .leading, spacing: 10) {
                Text("Program Progress").font(.title3.weight(.bold))
                HStack {
                    Text("Workouts Completed").font(.subheadline.weight(.medium))
                    Spacer()
                    Text("\(completed) of \(total)").font(.subheadline.weight(.bold)).monospacedDigit()
                }
                ProgressView(value: Double(completed), total: Double(max(total, 1)))
                    .tint(Theme.green)
                    .scaleEffect(x: 1, y: 1.6, anchor: .center)
            }
            .padding(16)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func quickActions(next: Workout?) -> some View {
        HStack(spacing: 12) {
            Button {
                if let next { model.path.append(.workout(next.workoutNumber)) }
            } label: {
                VStack(spacing: 10) {
                    Image(systemName: "play.fill").font(.system(size: 30))
                    Text("Next Workout").font(.subheadline.weight(.semibold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 110)
                .background(Theme.gradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .opacity(next == nil ? 0.5 : 1)
            }
            .buttonStyle(PressableStyle())
            .disabled(next == nil)

            Button {
                model.path.append(.history)
            } label: {
                VStack(spacing: 10) {
                    Image(systemName: "waveform.path.ecg").font(.system(size: 30)).foregroundStyle(Theme.green)
                    Text("Exercise History").font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                }
                .frame(maxWidth: .infinity, minHeight: 110)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(PressableStyle())
        }
    }

    private func scrollToNext(_ proxy: ScrollViewProxy, next: Workout?, animated: Bool) {
        guard let number = next?.workoutNumber else { return }
        if !animated && didInitialScroll { return }
        didInitialScroll = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if animated {
                withAnimation { proxy.scrollTo(number, anchor: .center) }
            } else {
                proxy.scrollTo(number, anchor: .center)
            }
        }
    }
}

struct WorkoutCardView: View {
    let workout: Workout
    let progress: WorkoutProgress?

    var body: some View {
        let status = progress?.status ?? .notStarted
        VStack(alignment: .leading, spacing: 0) {
            Group {
                switch status {
                case .completed: Theme.gradient
                case .inProgress: LinearGradient(colors: [Color(hex: 0x2ECC71), Color(hex: 0x26D9A0)], startPoint: .leading, endPoint: .trailing)
                case .notStarted: Color(.systemGray5)
                }
            }
            .frame(height: 4)

            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        StatusBadge(status: status)
                        Text("Week \(workout.weekNumber) • Day \(workout.dayNumber)")
                            .font(.caption.weight(.medium))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Text(workout.workoutName)
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                    Text(statusText(status))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            }
            .padding(16)
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func statusText(_ status: WorkoutStatus) -> String {
        switch status {
        case .completed:
            if let completedAt = progress?.completedAt { return "Completed on \(Fmt.date(completedAt))" }
            return "Completed"
        case .inProgress:
            return startedText(progress?.startedAt)
        case .notStarted:
            return "Upcoming"
        }
    }
}

/// "Started 12 min ago", or the date once it's been a while.
func startedText(_ startedAt: String?) -> String {
    guard let started = ISODate.parse(startedAt) else { return "Ready to start" }
    let minutes = Int(Date().timeIntervalSince(started) / 60)
    if minutes < 120 { return "Started \(max(0, minutes)) min ago" }
    return "Started \(Fmt.date(startedAt))"
}
