import SwiftUI

/// Rest clock + sets counter bar (RestTimerBar in rest-timer.tsx).
struct RestTimerBar: View {
    @Environment(RestTimer.self) private var timer

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 16) {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    readout("Rest Timer", RestTimer.format(timer.elapsed(at: context.date)))
                }
                Rectangle().fill(Color.white.opacity(0.2)).frame(width: 1, height: 40)
                readout("Sets", "\(timer.setCounter)")
            }
            Spacer(minLength: 0)
            Button("Reset") {
                Haptics.tap()
                timer.reset()
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 14)
            .frame(height: 42)
            .background(Color.white.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .buttonStyle(PressableStyle(scale: 0.94))

            Button("Log Set") {
                Haptics.tap()
                timer.logSet()
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(height: 42)
            .background(Theme.green, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .buttonStyle(PressableStyle(scale: 0.94))
        }
        .padding(12)
        .background(
            LinearGradient(colors: [Color(hex: 0x1F2937), Color(hex: 0x111827)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Color(hex: 0x374151)))
    }

    private func readout(_ label: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .medium))
                .tracking(0.5)
                .foregroundStyle(Color(hex: 0x9CA3AF))
            Text(value)
                .font(.system(size: 24, weight: .bold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(.white)
                .contentTransition(.numericText())
        }
    }
}

/// Bar-loading diagram for a barbell weight (plate-calculator.tsx).
struct PlateCalculatorView: View {
    let weight: Double

    var body: some View {
        VStack(spacing: 6) {
            Divider()
            switch PlateMath.perSide(for: weight) {
            case .impossible:
                Text("Can't load \(Fmt.num(weight)) lbs with standard plates")
                    .font(.caption)
                    .foregroundStyle(.red)
            case .emptyBar:
                Text("Plates: empty barbell")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .plates(let side):
                let left = side.map { Fmt.num($0.weight) }.joined(separator: " + ")
                let right = side.reversed().map { Fmt.num($0.weight) }.joined(separator: " + ")
                Text("\(left) | \(right)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
                HStack(spacing: 2) {
                    ForEach(Array(side.enumerated()), id: \.offset) { _, plate in bar(plate) }
                    Rectangle()
                        .fill(Color(.systemGray3))
                        .frame(width: 48, height: 3)
                        .padding(.horizontal, 4)
                    ForEach(Array(side.reversed().enumerated()), id: \.offset) { _, plate in bar(plate) }
                }
                .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
    }

    private func bar(_ plate: Plate) -> some View {
        RoundedRectangle(cornerRadius: 1.5)
            .fill(plate.colorHex == 0x000000 ? Color.primary : Color(hex: plate.colorHex))
            .frame(width: 5, height: plateHeight(plate.weight))
    }

    private func plateHeight(_ weight: Double) -> CGFloat {
        switch weight {
        case 45...: return 30
        case 35..<45: return 26
        case 25..<35: return 22
        case 10..<25: return 17
        case 5..<10: return 13
        default: return 10
        }
    }
}
