import Toybox.Lang;

function foo(a as String?) as String {
  var foo = a != null ? foo(null) : "Hello";
  return foo + " " + (a != null ? a : "Goodbye");
}
