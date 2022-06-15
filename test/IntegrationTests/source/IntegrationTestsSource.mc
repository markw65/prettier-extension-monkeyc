import Toybox.Lang;

function foo(a as String?) as String {
  var foo = a != null ? foo(null) : "Hello";
  return foo + " " + (a != null ? a : "Goodbye");
}

function bar() as Number {
  try {
    foo("what");
  } catch (ex instanceof Lang.InvalidValueException) {
    return ex.getErrorMessage() == "Hello" ? 2 : 3;
  } catch (ex) {
    if (ex instanceof Lang.SerializationException) {
      return 1;
    }
    return 0;
  }
}
