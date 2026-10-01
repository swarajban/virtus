import SwiftUI

/// Rest clock + sets counter (RestTimerBar in rest-timer.tsx).
struct RestTimerBar: View {
    @Environment(RestTimer.self) private var timer

    var body: some View {
        VStack(spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Rest")
                        .font(.footnote.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        Text(RestTimer.format(timer.elapsed(at: context.date)))
                            .font(.system(size: 44, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(timer.isRunning ? Theme.green : Color.secondary)
                            .contentTransition(.numericText(countsDown: false))
                            .animation(.snappy, value: timer.elapsed(at: context.date))
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Sets")
                        .font(.footnote.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text("\(timer.setCounter)")
                        .font(.system(size: 44, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.snappy, value: timer.setCounter)
                }
            }

            HStack(spacing: 10) {
                Button {
                    Haptics.tap()
                    timer.reset()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                        .frame(maxWidth: .infinity)
                }
                .secondaryButtonStyle()
                .tint(Color.secondary)

                Button {
                    Haptics.tap()
                    timer.logSet()
                } label: {
                    Label("Log Set", systemImage: "timer")
                        .frame(maxWidth: .infinity)
                }
                .prominentButtonStyle()
            }
            .controlSize(.large)
            .font(.subheadline.weight(.semibold))
        }
        .card()
    }
}

/// Bar-loading diagram for a barbell weight (plate-calculator.tsx).
struct PlateCalculatorView: View {
    let weight: Double

    var body: some View {
        VStack(spacing: 8) {
            switch PlateMath.perSide(for: weight) {
            case .impossible:
                Label("Can't load \(Fmt.num(weight)) lbs with standard plates", systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            case .emptyBar:
                Text("Empty barbell")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
            case .plates(let side):
                HStack(spacing: 2) {
                    ForEach(Array(side.enumerated()), id: \.offset) { _, plate in bar(plate) }
                    Capsule()
                        .fill(Color(.systemGray3))
                        .frame(width: 56, height: 4)
                        .padding(.horizontal, 4)
                    ForEach(Array(side.reversed().enumerated()), id: \.offset) { _, plate in bar(plate) }
                }
                .frame(height: 34)
                .accessibilityHidden(true)
                Text("Per side: " + side.reversed().map { Fmt.num($0.weight) }.joined(separator: " + "))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func bar(_ plate: Plate) -> some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(plate.colorHex == 0x000000 ? Color.primary : Color(hex: plate.colorHex))
            // Every plate is drawn the size of a 45; color alone tells them apart.
            .frame(width: 6, height: 34)
    }
}
