// Public client configuration.
// The anon key is designed to be public: every table is protected by
// Row Level Security. The service-role key is NEVER placed in this repo;
// it lives only inside Supabase (Edge Function environment).
window.SAIYAN_CONFIG = {
  supabaseUrl: "https://oftgleobgcqdavnabfzr.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mdGdsZW9iZ2NxZGF2bmFiZnpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjkxODEsImV4cCI6MjEwNTk0NTE4MX0.ZeemjR_UXcfU6-fIPSVJEXiGQUO7rTshO09iAEfw8GY",
  gym: {
    name: "Saiyan Gym FITT",
    phone: "+385916022843",
    phoneDisplay: "+385 91 602 2843",
    instagram: "https://www.instagram.com/saiyan_gym_fitt/",
    address: "Ćira Carića 1, 20000 Dubrovnik",
    maps: "https://maps.app.goo.gl/xwTY1LLRRN4ZUdrj9",
  },
  consentVersion: "v1-2026-09",
};
