// The data a Live Activity shows. The SAME definition must exist in the widget extension
// (native/ios/AloneTimeWidget/AloneTimeActivityAttributes.swift); ActivityKit matches the two
// by type name and fields. A unit test (tests/unit/ios-native.test.js) checks they are identical.
import Foundation
#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
struct AloneTimeActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// When the session started. The timer counts UP from here, drawn by iOS itself,
        /// so it stays correct while the screen is locked or the app is closed.
        var startedAt: Date
        /// Planned time, only shown as text. It never ends the session.
        var targetSeconds: Int?
        var dogName: String
        var placeName: String
        /// Already translated by the app, e.g. "Charlie has been alone for" / "Charlie har varit ensam i".
        var aloneForLabel: String
        /// e.g. "Target 5:30" / "Mål 5:30", or "" when there is no target.
        var targetLabel: String
    }

    /// One Live Activity per training session.
    var sessionId: String
}
#endif
