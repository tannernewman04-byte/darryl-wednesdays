// Card IDs must match the CARDS list in index.html.
export const CARD_COUNT = 39;
export const GOLD_CARD = 25; // exists only as the Gold 1/1
export const POOL = Array.from({ length: CARD_COUNT }, (_, i) => i + 1).filter(n => n !== GOLD_CARD);
export const PER_PACK = 3;
export const HOBBY_SIZE = 15; // Hobby pack: earned for every 3 friends who join
// rarest first. p = chance per card slot. pts = leaderboard points.
export const PARS = [
  { k: "gold",   print: 1,  p: 1 / 4000, pts: 1000 },
  { k: "one",    print: 1,  p: 1 / 2000, pts: 500 },  // signed 1/1: exactly one per card
  { k: "redauto",    print: 5,  p: 1 / 250, pts: 100, auto: true },
  { k: "red",        print: 5,  p: 1 / 250, pts: 100 },
  { k: "orangeauto", print: 10, p: 1 / 120, pts: 40,  auto: true },
  { k: "orange",     print: 10, p: 1 / 120, pts: 40 },
  { k: "blueauto",   print: 25, p: 1 / 50,  pts: 15,  auto: true },
  { k: "blue",       print: 25, p: 1 / 50,  pts: 15 },
  { k: "greenauto",  print: 99, p: 1 / 20,  pts: 5,   auto: true },
  { k: "green",      print: 99, p: 1 / 20,  pts: 5 },
  { k: "base",   print: 0,  p: 0,        pts: 1 },
];
export const PAR = Object.fromEntries(PARS.map(p => [p.k, p]));
export const RANK = Object.fromEntries(PARS.map((p, i) => [p.k, PARS.length - i]));
export const FREE_PER_DAY = 1;
export const FREE_ON_WEDNESDAY = 3;
export const REFERRALS_PER_PACK = 3;
export const STREAK_DAYS_PER_PACK = 3;
export const TIMEZONE = "America/Toronto";
