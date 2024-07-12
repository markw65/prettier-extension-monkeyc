import Toybox.Lang;
import Toybox.WatchUi;

class Project1Delegate extends WatchUi.BehaviorDelegate {
    function initialize() {
        BehaviorDelegate.initialize();
    }

    function onMenu() as Boolean {
        WatchUi.pushView(
            new Rez.Menus.MainMenu(),
            new Project1MenuDelegate(),
            WatchUi.SLIDE_UP
        );
        return true;
    }
}
