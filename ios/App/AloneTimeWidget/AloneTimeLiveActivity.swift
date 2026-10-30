// Lock screen + Dynamic Island for a running session.
// The timer is drawn by iOS from the start time (Text(date, style: .timer)), so it counts up
// correctly while the phone is locked and the app is suspended. Nothing here ends a session:
// the planned time is only shown as text.
import ActivityKit
import WidgetKit
import SwiftUI

private let ink = Color(red: 0.12, green: 0.15, blue: 0.14)
private let ink2 = Color(red: 0.33, green: 0.38, blue: 0.36)
private let paper = Color(red: 0.98, green: 0.97, blue: 0.95)
private let accent = Color(red: 0.55, green: 0.78, blue: 0.73)

struct AloneTimeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AloneTimeActivityAttributes.self) { context in
            LockScreenView(state: context.state)
                .activityBackgroundTint(paper)
                .activitySystemActionForegroundColor(ink)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.state.dogName, systemImage: "door.left.hand.open")
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.placeName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.startedAt, style: .timer)
                        .font(.system(size: 40, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .multilineTextAlignment(.center)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.targetLabel.isEmpty {
                        Text(context.state.targetLabel)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            } compactLeading: {
                // The target next to the running time (only shown – it never ends the session).
                if let target = context.state.targetSeconds, target > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "flag.checkered")
                        Text(shortTime(target))
                            .monospacedDigit()
                    }
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .foregroundStyle(accent)
                } else {
                    Image(systemName: "door.left.hand.open")
                        .foregroundStyle(accent)
                }
            } compactTrailing: {
                Text(context.state.startedAt, style: .timer)
                    .monospacedDigit()
                    .frame(maxWidth: 56)
                    .foregroundStyle(accent)
            } minimal: {
                Image(systemName: "door.left.hand.open")
                    .foregroundStyle(accent)
            }
        }
    }
}

// "0:45", "1:30", "1:05:00" – the same format as in the app.
private func shortTime(_ seconds: Int) -> String {
    let h = seconds / 3600, m = (seconds % 3600) / 60, s = seconds % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}

private struct LockScreenView: View {
    let state: AloneTimeActivityAttributes.ContentState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(state.aloneForLabel)
                    .font(.subheadline)
                    .foregroundStyle(ink2)
                    .lineLimit(1)
                Spacer()
                Text(state.placeName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ink)
                    .lineLimit(1)
            }
            Text(state.startedAt, style: .timer)
                .font(.system(size: 44, weight: .light, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(ink)
            if !state.targetLabel.isEmpty {
                Text(state.targetLabel)
                    .font(.footnote)
                    .foregroundStyle(ink2)
            }
        }
        .padding(16)
    }
}
