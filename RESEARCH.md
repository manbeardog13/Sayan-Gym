# Why Wave 1 looks the way it does

Research summary (September 2026) behind the engagement features. Evidence strength in brackets.

| Finding | Source | Feature |
|---|---|---|
| 4 visits in the first 4 weeks improves retention up to 12%; 28% of new members train <1×/week in month 1 [research data, secondary report] | [Bedford via What's New in Fitness](https://whatsnewinfitness.com.au/4-visits-per-month-the-key-to-membership-retention/) | "First 4 in 4" checklist |
| Being greeted by staff 1× / 4+× a month → 20% / 80% more likely to visit next month [same] | same | Desk: Greet today |
| Best of 54 gym interventions: a bonus for returning after a missed workout [peer-reviewed] | [Milkman et al., Nature 2021](https://www.nature.com/articles/s41586-021-04128-4) | Comeback XP |
| Goals with built-in slack keep people going after a miss [peer-reviewed]; streak freezes raise retention [industry] | [Sharif & Shu 2019](https://www.sciencedirect.com/science/article/abs/pii/S0749597818304187), [Duolingo](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals/) | Rest tokens (2/month) |
| Gamification effect is real but fades; volume-only rewards invite junk volume [peer-reviewed] | [Meta-analysis, 16 RCTs](https://pmc.ncbi.nlm.nih.gov/articles/PMC8767479/) | XP weighted to sessions and consistent weeks |
| Live PR moments are a core delight in strength apps [industry] | [Hevy](https://www.hevyapp.com/features/live-pr/) | PR celebration, bell, share card |
| Wake Lock works in iOS home-screen apps from 18.4; `navigator.audioSession` lets beeps play on silent [platform docs] | [caniuse](https://caniuse.com/wake-lock), [WebKit bug 237322](https://bugs.webkit.org/show_bug.cgi?id=237322) | Workout mode |
| iOS has no install prompt; push/wake lock need the home-screen app [platform docs] | [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Install coach |

Avoided on purpose: all-member leaderboards on absolute kilos, guilt-based streak messages, uploading
progress photos, Apple Wallet (paid developer account). Most peer-reviewed evidence is about steps, not
strength training, so applying it here is inference.
