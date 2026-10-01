import SwiftUI

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
