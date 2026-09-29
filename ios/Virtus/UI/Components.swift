import SwiftUI

// MARK: - Cards & buttons

struct CardBackground: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardBackground(padding: padding)) }
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

struct FilledButtonStyle: ButtonStyle {
    var background: AnyShapeStyle = AnyShapeStyle(Theme.green)
    var foreground: Color = .white

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: 48)
            .padding(.horizontal, 12)
            .background(background, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Color(.separator)))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Status

struct StatusBadge: View {
    let status: WorkoutStatus

    var body: some View {
        HStack(spacing: 4) {
            switch status {
            case .completed: Image(systemName: "checkmark")
            case .inProgress: Image(systemName: "clock")
            case .notStarted: EmptyView()
            }
            Text(label)
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .foregroundStyle(status == .notStarted ? Color.secondary : Color.white)
        .background(background, in: Capsule())
    }

    private var label: String {
        switch status {
        case .completed: return "Completed"
        case .inProgress: return "In Progress"
        case .notStarted: return "Not Started"
        }
    }

    private var background: Color {
        switch status {
        case .completed: return Theme.green
        case .inProgress: return Color(hex: 0xEAB308)
        case .notStarted: return Color(.tertiarySystemFill)
        }
    }
}

struct Pill: View {
    let text: String
    var foreground: Color = .white
    var background: Color = Theme.green

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
    }
}

struct NoteCallout: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "info.circle")
            Text(text)
        }
        .font(.footnote)
        .foregroundStyle(Color.blue)
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

// MARK: - Flow layout (wrapping chips)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > maxWidth {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            x += size.width + spacing
            widest = max(widest, x - spacing)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: min(widest, maxWidth), height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, lineHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

// MARK: - Numeric stepper field (weight-input.tsx)

/// − [value] + with a typeable field. Empty is allowed while typing and
/// becomes 0 when editing ends.
struct StepperField: View {
    @Binding var value: Double
    var step: Double = 5
    var minimum: Double = 0
    var allowsDecimal: Bool = true

    @State private var text: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            stepButton("minus") { set(max(minimum, value - step)) }
            TextField("0", text: $text)
                .keyboardType(allowsDecimal ? .decimalPad : .numberPad)
                .multilineTextAlignment(.center)
                .font(.title3.weight(.semibold).monospacedDigit())
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .focused($focused)
                .onChange(of: text) { _, newValue in
                    guard focused, !newValue.isEmpty else { return }
                    let normalized = newValue.replacingOccurrences(of: ",", with: ".")
                    if let parsed = Double(normalized) { value = max(minimum, parsed) }
                }
                .onChange(of: focused) { _, isFocused in
                    if !isFocused { text = Fmt.num(value) }
                }
            stepButton("plus") { set(value + step) }
        }
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

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(PressableStyle(scale: 0.9))
        .foregroundStyle(.primary)
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
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
        .padding(.horizontal, 16)
    }
}

struct SyncBanner: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if !model.sync.isEmpty, model.sync.lastNetworkError != nil {
            HStack(spacing: 8) {
                Image(systemName: "icloud.slash")
                Text("Offline — \(model.sync.pendingCount) change\(model.sync.pendingCount == 1 ? "" : "s") waiting to sync")
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button("Retry") { model.sync.kick(resetBackoff: true) }
                    .font(.footnote.weight(.semibold))
            }
            .font(.footnote)
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.orange.gradient, in: Capsule())
            .padding(.horizontal, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
