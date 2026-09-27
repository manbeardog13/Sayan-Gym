// Runs before first paint (blocking <script> in <head>): dark by default, light only when chosen.
try{if(localStorage.getItem('sg.theme')==='light'){document.documentElement.classList.remove('dark');document.querySelector('meta[name="theme-color"]').content='#e9ebee';}}catch(e){}
