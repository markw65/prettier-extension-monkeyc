import Toybox.Lang;
import Toybox.WatchUi;

class IntegrationTestsDelegate extends WatchUi.BehaviorDelegate {
  function initialize() {
    BehaviorDelegate.initialize();
  }

  function onMenu() as Boolean {
    WatchUi.pushView(
      new Rez.Menus.MainMenu(),
      new IntegrationTestsMenuDelegate(),
      WatchUi.SLIDE_UP
    );
    return true;
  }
}
