// Widget extension entry point. It only contains the Live Activity.
import WidgetKit
import SwiftUI

@main
struct AloneTimeWidgetBundle: WidgetBundle {
    var body: some Widget {
        AloneTimeLiveActivity()
    }
}
