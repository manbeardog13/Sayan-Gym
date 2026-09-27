// Runs before first paint (blocking <script> in <head>): dark by default, light only when chosen.
try{if(localStorage.getItem('sg.theme')==='light'){document.documentElement.classList.remove('dark');document.querySelector('meta[name="theme-color"]').content='#e9ebee';}}catch(e){}
// Fonts load in the background: a stylesheet added from script doesn't block the first paint
// (the CSP forbids the old inline onload trick). Text shows in the fallback font until they arrive.
(function () {
  var l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&family=Sora:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(l);
})();
