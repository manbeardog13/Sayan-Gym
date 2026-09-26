-- Saiyan Gym FITT — seed content (already loaded into the live project).
-- Prices marked null show "Na upit / On request" until the gym confirms them.
insert into public.membership_plans (code, kind, name_hr, name_en, description_hr, description_en, price_eur, duration_days, sort) values
('day',   'day',   'Dnevna karta',   'Day pass',     'Puni pristup teretani za jedan dan.', 'Full gym access for one day.', 18.00, 1, 1),
('towel', 'addon', 'Ručnik',          'Towel',        'Obavezan ručnik za trening.',          'Mandatory training towel.',    3.00, null, 2),
('multi', 'multi', 'Višednevni paket','Multi-day pack','Popust za turiste i kratke boravke.', 'Discounted for visitors and short stays.', null, null, 3),
('month', 'month', 'Mjesečna članarina','Monthly membership','Neograničen pristup, 30 dana.','Unlimited access, 30 days.', null, 30, 4),
('pt',    'addon', 'Personalni trening','Personal training','Trening 1-na-1 sa Zrinkom.','1-on-1 training with Zrinko.', null, null, 5);

insert into public.exercises (slug, name_hr, name_en, muscle_group, is_compound, increment_kg) values
('back-squat','Stražnji čučanj','Back squat','legs',true,2.5),
('belt-squat','Belt čučanj','Belt squat','legs',true,5),
('leg-press','Leg press','Leg press','legs',true,5),
('romanian-deadlift','Rumunjsko mrtvo dizanje','Romanian deadlift','hamstrings',true,2.5),
('deadlift','Mrtvo dizanje','Deadlift','back',true,5),
('bench-press','Potisak s klupe','Bench press','chest',true,2.5),
('incline-db-press','Kosi potisak bučicama','Incline DB press','chest',true,2),
('overhead-press','Potisak iznad glave','Overhead press','shoulders',true,2.5),
('lateral-raise','Lateralno odručenje','Lateral raise','shoulders',false,1),
('pull-up','Zgib','Pull-up','back',true,2.5),
('barbell-row','Veslanje šipkom','Barbell row','back',true,2.5),
('lat-pulldown','Lat povlačenje','Lat pulldown','back',false,2.5),
('hammer-row','Hammer Strength veslanje','Hammer Strength row','back',false,5),
('barbell-curl','Pregib sa šipkom','Barbell curl','arms',false,1),
('triceps-pushdown','Triceps potisak na sajli','Triceps pushdown','arms',false,2.5),
('dips','Propadanja','Dips','chest',true,2.5),
('hip-thrust','Hip thrust','Hip thrust','glutes',true,5),
('calf-raise','Podizanje na prste','Calf raise','legs',false,5);

insert into public.gym_facts (topic, content_hr, content_en) values
('address','Nalazimo se na adresi Ćira Carića 1, 20000 Dubrovnik (Lapad).','We are at Ćira Carića 1, 20000 Dubrovnik (Lapad area).'),
('hours','Radno vrijeme: ponedjeljak–subota 06:00–22:00, nedjelja 06:00–20:00.','Opening hours: Monday–Saturday 06:00–22:00, Sunday 06:00–20:00.'),
('contact','Telefon i WhatsApp: +385 91 602 2843. Instagram: @saiyan_gym_fitt.','Phone and WhatsApp: +385 91 602 2843. Instagram: @saiyan_gym_fitt.'),
('day_pass','Dnevna karta je 18 € plus obavezan ručnik 3 €. Višednevni paketi imaju popust.','A day pass is €18 plus a mandatory €3 towel. Multi-day packs are discounted.'),
('membership','Cijene mjesečnih članarina i personalnog treninga dogovaraju se na recepciji ili putem WhatsAppa.','Monthly membership and personal training prices are arranged at the desk or via WhatsApp.'),
('multisport','Primamo MultiSport kartice, uključujući International MultiSport.','We accept MultiSport cards, including International MultiSport.'),
('equipment','700 m² prostora: Hammer Strength, Nautilus i Life Fitness strojevi, olimpijske šipke, rackovi, belt squat i platforme za dizanje. Šipke se mogu opteretiti preko 300 kg.','700 m² floor: Hammer Strength, Nautilus and Life Fitness machines, Olympic bars, racks, a belt squat and lifting platforms. Bars load past 300 kg.'),
('facilities','Svlačionice s tuševima i sušilima za kosu, ormarići, klima, besplatan parking i parking za bicikle.','Locker rooms with showers and hairdryers, lockers, air conditioning, free parking and bike parking.'),
('coach','Vlasnik i glavni trener je Zrinko (FittbyZrinko) — personalni trening i savjeti o prehrani.','Owner and head coach Zrinko (FittbyZrinko) offers personal training and nutrition guidance.'),
('shop','Na recepciji: proteinski shakeovi za van, suplementi i sportska odjeća.','At the desk: protein shakes to go, supplements and sportswear.'),
('group','Grupni treninzi (pilates, joga, HIIT) rezerviraju se unaprijed.','Group sessions (Pilates, yoga, HIIT) must be booked in advance.');

insert into public.motivation (text_hr, text_en) values
('Objavi rat slabom tijelu.','Declare war on a weak body.'),
('Ti si svoja jedina granica.','You are your only limit.'),
('Jednostavno drugačija teretana.','Simply a different gym.'),
('Svaki set je korak do nove razine.','Every set is a step to the next level.'),
('Tvoja snaga raste kad drugi odustanu.','Your power grows when others quit.'),
('Punjenje je gotovo. Vrijeme je za probijanje granice.','Charging complete. Time to break the limit.'),
('Nisi ovdje da budeš prosječan.','You are not here to be average.'),
('Disciplina nadmašuje motivaciju. Svaki dan.','Discipline beats motivation. Every day.'),
('Znoj danas, snaga sutra.','Sweat today, power tomorrow.'),
('Budi promjena — svijet je već pun igrača.','Be a changer — the world is already full of players.');
