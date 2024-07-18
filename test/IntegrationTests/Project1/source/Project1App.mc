import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class Project1App extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    // onStart() is called on application start up
    function onStart(state as Dictionary?) as Void {}

    // onStop() is called when your application is exiting
    function onStop(state as Dictionary?) as Void {}

    // Return the initial view of your application here
    function getInitialView() {
        return [new Project1View(), new Project1Delegate()];
    }
}

function getApp() as Project1App {
    return Application.getApp() as Project1App;
}
