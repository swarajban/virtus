import SwiftUI
import UIKit

@main
struct VirtusApp: App {
    @State private var model = AppModel()
    @State private var timer = RestTimer()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .environment(timer)
                .tint(Theme.green)
                .task { await model.refresh(force: true) }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        // Revalidate on every return to the app: a snapshot from
                        // before a program/cycle switch made elsewhere must not
                        // keep routing (or writing) the old cycle.
                        timer.discardIfStale()
                        model.sync.kick(resetBackoff: true)
                        Task { await model.refresh() }
                    case .background:
                        model.sync.flushInBackground()
                    default:
                        break
                    }
                }
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(RestTimer.self) private var timer
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage(KeepAwake.settingKey) private var keepAwakeEnabled = true

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .workout(let number):
                        WorkoutView(workoutNumber: number)
                    case .exercise(let workout, let index):
                        ExerciseScreen(workoutNumber: workout, startIndex: index)
                    case .history:
                        HistoryListView()
                    case .exercises:
                        ExercisesView()
                    case .exerciseInfo(let id):
                        ExerciseInfoView(exerciseId: id)
                    case .settings:
                        SettingsView()
                    case .oneRM:
                        OneRMView()
                    }
                }
        }
        #if DEBUG
        .task { openLaunchRoute() }
        #endif
        // Re-evaluated every 30s so a rest timer left running eventually lets
        // the phone lock again.
        .task(id: keepAwakeInputs) {
            while !Task.isCancelled {
                KeepAwake.apply(shouldKeepAwake)
                try? await Task.sleep(nanoseconds: 30_000_000_000)
            }
        }
        .overlay(alignment: .top) {
            if let toast = model.toast {
                ToastView(toast: toast)
                    .padding(.top, 4)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { model.toast = nil }
                    .id(toast.id)
            }
        }
        .overlay(alignment: .bottom) {
            // Floats above the exercise screen's action bar.
            SyncBanner()
                .padding(.bottom, 76)
                .animation(.spring(duration: 0.3), value: model.sync.lastNetworkError != nil)
        }
    }

    /// Inputs that change the keep-awake decision immediately.
    private var keepAwakeInputs: [AnyHashable] {
        [keepAwakeEnabled, onExerciseScreen, timer.startTime, scenePhase == .active]
    }

    private var onExerciseScreen: Bool {
        model.path.contains { if case .exercise = $0 { return true } else { return false } }
    }

    /// Mid-workout the screen stays on: on an exercise, or resting between
    /// sets anywhere in the app. A rest clock left running past 15 minutes
    /// stops counting, so a forgotten timer doesn't keep the phone awake.
    private var shouldKeepAwake: Bool {
        guard keepAwakeEnabled, scenePhase == .active else { return false }
        return onExerciseScreen || (timer.isRunning && timer.elapsed() < 15 * 60)
    }

    #if DEBUG
    /// CI screenshots: `-uiRoute workout:1`, `exercise:1`, `history`, … opens
    /// that screen on launch. Debug builds only.
    private func openLaunchRoute() {
        guard let raw = UserDefaults.standard.string(forKey: "uiRoute") else { return }
        let parts = raw.split(separator: ":").map(String.init)
        let number = parts.count > 1 ? Int(parts[1]) : nil
        switch parts.first {
        case "workout":
            if let number { model.path = [.workout(number)] }
        case "exercise":
            if let number, let workout = model.workout(number) {
                let index = parts.count > 2 ? Int(parts[2]) : workout.workingIndices.first
                if let index { model.path = [.workout(number), .exercise(workout: number, index: index)] }
            }
        case "history": model.path = [.history]
        case "exercises": model.path = [.exercises]
        case "settings": model.path = [.settings]
        case "onerm": model.path = [.settings, .oneRM]
        default: break
        }
    }
    #endif
}

/// Disables auto-lock while a workout is happening (UIApplication's idle
/// timer). iOS only honors this while the app is in the foreground.
enum KeepAwake {
    static let settingKey = "keepScreenAwake"

    @MainActor
    static func apply(_ on: Bool) {
        if UIApplication.shared.isIdleTimerDisabled != on {
            UIApplication.shared.isIdleTimerDisabled = on
        }
    }
}
