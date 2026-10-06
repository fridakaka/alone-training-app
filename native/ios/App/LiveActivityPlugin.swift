// Small native bridge so the web app can start and end the iOS Live Activity.
// JS name: "LiveActivity" (see src/native.js). Registered in MainViewController.
import Foundation
import Capacitor
#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    /// { available: Bool } – false on iOS < 16.2 or when Live Activities are turned off in Settings.
    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["available": false])
    }

    /// Starts the Live Activity for a session, or updates it if this session already has one
    /// (e.g. after the app was reopened). Any other, older activity is ended first.
    /// Params: sessionId, startedAt (ms since 1970), targetSec?, dogName, placeName,
    /// aloneForLabel, targetLabel.
    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        guard #available(iOS 16.2, *) else {
            call.resolve(["started": false, "reason": "ios-version"])
            return
        }
        guard let startedAtMs = call.getDouble("startedAt") else {
            call.reject("startedAt is missing")
            return
        }
        let sessionId = call.getString("sessionId") ?? String(Int64(startedAtMs))
        let target = call.getInt("targetSec")
        let state = AloneTimeActivityAttributes.ContentState(
            startedAt: Date(timeIntervalSince1970: startedAtMs / 1000),
            targetSeconds: (target ?? 0) > 0 ? target : nil,
            dogName: call.getString("dogName") ?? "",
            placeName: call.getString("placeName") ?? "",
            aloneForLabel: call.getString("aloneForLabel") ?? "",
            targetLabel: call.getString("targetLabel") ?? ""
        )
        let content = ActivityContent(state: state, staleDate: nil)

        Task {
            var kept = false
            for activity in Activity<AloneTimeActivityAttributes>.activities {
                if activity.attributes.sessionId == sessionId && !kept {
                    await activity.update(content)
                    kept = true
                } else {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            if kept {
                call.resolve(["started": true, "existing": true])
                return
            }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["started": false, "reason": "disabled"])
                return
            }
            do {
                _ = try Activity.request(
                    attributes: AloneTimeActivityAttributes(sessionId: sessionId),
                    content: content,
                    pushType: nil
                )
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "reason": error.localizedDescription])
            }
        }
        #else
        call.resolve(["started": false, "reason": "unsupported"])
        #endif
    }

    /// Ends every Alone Time Live Activity (session ended, discarded, or no session running).
    @objc func end(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            Task {
                for activity in Activity<AloneTimeActivityAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
                call.resolve()
            }
            return
        }
        #endif
        call.resolve()
    }
}
