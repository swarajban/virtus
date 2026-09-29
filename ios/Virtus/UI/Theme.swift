import SwiftUI
import UIKit

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// Colors from client/src/index.css.
enum Theme {
    static let green = Color(hex: 0x28AF60)          // hsl(145 63% 42%) — --primary
    static let greenEnd = Color(hex: 0x28BD8C)       // hsl(160 65% 45%)
    static let greenDeep = Color(hex: 0x1F9350)      // hsl(145 65% 35%)
    static let warning = Color(hex: 0xFAAB51)        // hsl(32 95% 65%)
    static let amber = Color(hex: 0xFBBF24)
    static let orange = Color(hex: 0xFB923C)

    static let gradient = LinearGradient(colors: [green, greenEnd], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let deepGradient = LinearGradient(colors: [greenDeep, Color(hex: 0x279A63)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let warmupGradient = LinearGradient(colors: [amber, orange], startPoint: .leading, endPoint: .trailing)
}

enum Haptics {
    /// Light tick for navigation (Next / Previous).
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Firm tick for the highest-value action (Complete).
    static func commit() {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }
}
