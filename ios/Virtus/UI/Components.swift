import SwiftUI

// MARK: - Grouped sections (inset-grouped look outside of List)

struct CardBackground: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardBackground(padding: padding)) }

    /// Pins controls to the bottom edge. On iOS 26 this is a safe-area bar, which
    /// gives scrolling content the native edge blur under Liquid Glass buttons;
    /// earlier versions get a bar-material inset.
    @ViewBuilder
    func bottomActionBar<Bar: View>(@ViewBuilder _ bar: () -> Bar) -> some View {
        if #available(iOS 26.0, *) {
            safeAreaBar(edge: .bottom) { bar() }
        } else {
            safeAreaInset(edge: .bottom, spacing: 0) {
                bar().background(.bar)
            }
        }
    }

    /// Secondary control style: Liquid Glass on iOS 26, tinted otherwise.
    @ViewBuilder
    func secondaryButtonStyle() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.glass)
        } else {
            buttonStyle(.bordered)
        }
    }

    /// Primary call-to-action style: Liquid Glass on iOS 26, filled otherwise.
    @ViewBuilder
    func prominentButtonStyle() -> some View {
        if #available(iOS 26.0, *) {
            buttonStyle(.glassProminent)
        } else {
            buttonStyle(.borderedProminent)
        }
    }
}

/// A titled card that mirrors an inset-grouped List section, for screens that
/// need custom controls a List row would fight with.
struct GroupedSection<Content: View, Accessory: View>: View {
    let title: String?
    @ViewBuilder var accessory: Accessory
    @ViewBuilder var content: Content

    init(_ title: String? = nil, @ViewBuilder accessory: () -> Accessory, @ViewBuilder content: () -> Content) {
        self.title = title
        self.accessory = accessory()
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if title != nil || Accessory.self != EmptyView.self {
                HStack {
                    if let title {
                        Text(title)
                            .font(.footnote.weight(.semibold))
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    accessory
                }
                .padding(.horizontal, 16)
            }
            content.card()
        }
    }
}

extension GroupedSection where Accessory == EmptyView {
    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(title, accessory: { EmptyView() }, content: content)
    }
}

/// Instant scale-down press feedback (the web app's .press-card).
struct PressableStyle: ButtonStyle {
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Status

extension WorkoutStatus {
    var label: String {
        switch self {
        case .completed: return "Completed"
        case .inProgress: return "In Progress"
        case .notStarted: return "Not Started"
        }
    }

    var symbol: String {
        switch self {
        case .completed: return "checkmark.circle.fill"
        case .inProgress: return "circle.lefthalf.filled"
        case .notStarted: return "circle"
        }
    }

    var color: Color {
        switch self {
        case .completed: return Theme.green
        case .inProgress: return .orange
        case .notStarted: return Color(.tertiaryLabel)
        }
    }
}

struct StatusBadge: View {
    let status: WorkoutStatus

    var body: some View {
        Label(status.label, systemImage: status.symbol)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(status == .notStarted ? Color.secondary : status.color)
            .background((status == .notStarted ? Color(.tertiarySystemFill) : status.color.opacity(0.15)), in: Capsule())
    }
}

struct Pill: View {
    let text: String
    var foreground: Color = Theme.green
    var background: Color? = nil

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .foregroundStyle(foreground)
            .background(background ?? foreground.opacity(0.14), in: Capsule())
    }
}

struct NoteCallout: View {
    let text: String

    var body: some View {
        Label {
            Text(text)
        } icon: {
            Image(systemName: "lightbulb")
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Numeric stepper field (weight-input.tsx)

/// Big − value + control sized for gym use. The value is typeable; empty is
/// allowed while typing and becomes 0 when editing ends.
struct StepperField: View {
    @Binding var value: Double
    var step: Double = 5
    var minimum: Double = 0
    var allowsDecimal: Bool = true

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 8) {
            stepButton("minus", label: "Decrease") { set(max(minimum, value - step)) }
                .disabled(value <= minimum)
            TextField("0", text: $text)
                .keyboardType(allowsDecimal ? .decimalPad : .numberPad)
                .multilineTextAlignment(.center)
                .font(.system(.title2, design: .rounded).weight(.semibold).monospacedDigit())
                .frame(maxWidth: .infinity, minHeight: 44)
                .focused($focused)
                .onChange(of: text) { _, newValue in
                    guard focused, !newValue.isEmpty else { return }
                    let normalized = newValue.replacingOccurrences(of: ",", with: ".")
                    if let parsed = Double(normalized) { value = max(minimum, parsed) }
                }
                .onChange(of: focused) { _, isFocused in
                    if !isFocused { text = Fmt.num(value) }
                }
            stepButton("plus", label: "Increase") { set(value + step) }
        }
        .padding(4)
        .background(Color(.tertiarySystemFill), in: Capsule())
        .onAppear { text = Fmt.num(value) }
        .onChange(of: value) { _, newValue in
            if !focused { text = Fmt.num(newValue) }
        }
    }

    private func set(_ newValue: Double) {
        Haptics.selection()
        value = newValue
        text = Fmt.num(newValue)
    }

    private func stepButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body.weight(.bold))
                .frame(width: 44, height: 44)
                .background(Color(.secondarySystemGroupedBackground), in: Circle())
        }
        .buttonStyle(PressableStyle(scale: 0.88))
        .foregroundStyle(Theme.green)
        .accessibilityLabel(label)
    }
}

extension Binding where Value == Int {
    /// Adapts an Int binding for StepperField.
    var asDouble: Binding<Double> {
        Binding<Double>(
            get: { Double(wrappedValue) },
            set: { wrappedValue = Int($0.rounded()) }
        )
    }
}

// MARK: - Toast & sync banner

struct ToastView: View {
    let toast: ToastMessage

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: toast.style == .error ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .font(.title3)
                .foregroundStyle(toast.style == .error ? Color.red : Theme.green)
            VStack(alignment: .leading, spacing: 2) {
                Text(toast.title).font(.subheadline.weight(.semibold))
                if let message = toast.message {
                    Text(message).font(.footnote).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 16, y: 6)
        .padding(.horizontal, 16)
    }
}

struct SyncBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if !model.sync.isEmpty, model.sync.lastNetworkError != nil {
            Button {
                model.sync.kick(resetBackoff: true)
            } label: {
                Label("\(model.sync.pendingCount) change\(model.sync.pendingCount == 1 ? "" : "s") waiting to sync · Retry",
                      systemImage: "icloud.slash")
                    .font(.footnote.weight(.medium))
                    .lineLimit(1)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 9)
                    .foregroundStyle(.white)
                    .background(Color.orange, in: Capsule())
                    .shadow(color: .black.opacity(0.15), radius: 8, y: 3)
            }
            .buttonStyle(PressableStyle())
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
