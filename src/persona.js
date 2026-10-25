// Slumpad personlighet och bakgrund för varje person i rummet.

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;

// ---------------- Personlighet ----------------
const NAMES = {
  kvinna: ['Elsa', 'Maja', 'Alice', 'Wilma', 'Ebba', 'Saga', 'Astrid', 'Linnea', 'Ingrid', 'Karin', 'Fatima', 'Amira', 'Sofia', 'Yasmin', 'Leila', 'Hanna', 'Greta', 'Sigrid', 'Mei', 'Nadia', 'Birgitta', 'Agnes', 'Klara', 'Tove'],
  man: ['Erik', 'Oskar', 'Lars', 'Johan', 'Ali', 'Omar', 'Lucas', 'Hugo', 'Axel', 'Nils', 'Gustav', 'Karl', 'Mohammed', 'Arvid', 'Viktor', 'Björn', 'Sven', 'Jonas', 'Mateo', 'Kenji', 'Anders', 'Ivan', 'Elias', 'Ludvig'],
  ickebinär: ['Robin', 'Kim', 'Alex', 'Charlie', 'Sam', 'Love', 'Eli', 'Noa', 'Vide', 'Kai'],
};
const SURNAMES = ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Lindqvist', 'Berg', 'Holm', 'Sandberg', 'Ek', 'Lund', 'Strand', 'Nyström', 'Hassan', 'Yilmaz', 'Novak', 'García', 'Kowalski', 'Lindgren', 'Åberg', 'Öberg', 'Sjöberg', 'Wallin', 'Falk'];
const JOBS = [
  ['sjuksköterska', 'på akuten'], ['snickare', 'i ett eget litet företag'], ['programmerare', 'på ett spelbolag'], ['lärare', 'på en mellanstadieskola'],
  ['kock', 'på en italiensk restaurang'], ['bibliotekarie', 'på stadsbiblioteket'], ['busschaufför', 'på linje 4'], ['arkitekt', 'som ritar skolor'],
  ['frisör', 'i en salong vid torget'], ['student', 'som läser filosofi'], ['pensionär', 'som har varit sjökapten'], ['musiker', 'i ett jazzband'],
  ['veterinär', 'som mest jobbar med katter'], ['journalist', 'på lokaltidningen'], ['brandman', 'på stationen här intill'], ['konstnär', 'som målar akvareller'],
  ['bagare', 'som börjar jobba klockan fyra'], ['forskare', 'inom marinbiologi'], ['elektriker', 'på ett byggföretag'], ['barista', 'på kaféet runt hörnet'],
];
const TOWNS = ['Göteborg', 'Malmö', 'Umeå', 'Kiruna', 'Visby', 'Uppsala', 'Örebro', 'Luleå', 'Jönköping', 'Lund', 'Sundsvall', 'Karlstad', 'Teheran', 'Krakow', 'Sarajevo', 'Santiago', 'Osaka', 'Helsingfors', 'Bergen', 'Kalmar'];
const HOBBIES = ['fågelskådning', 'klättring', 'att baka surdegsbröd', 'schack', 'att spela gitarr', 'löpning', 'brädspel', 'att sticka', 'fotografering', 'fiske', 'yoga', 'att samla vinylskivor', 'svampplockning', 'dans', 'att bygga modelltåg', 'poesi', 'trädgårdsarbete', 'datorspel', 'vinterbad', 'att laga koreansk mat'];
const FOODS = ['kanelbullar', 'pizza', 'pannkakor med sylt', 'sushi', 'köttbullar', 'falafel', 'räksmörgås', 'pho', 'tacos', 'kåldolmar', 'lasagne', 'ramen', 'pytt i panna', 'baklava'];
const MUSIC = ['jazz', 'gammal punk', 'Abba', 'klassisk musik', 'hiphop', 'dansband', 'synthpop', 'folkmusik', 'metal', 'soul', 'indiepop', 'opera'];
const VISITS = [
  'väntar på en vän som är sen', 'kom för att låna en bok', 'är här på fest och kom lite för tidigt', 'ska hjälpa till att flytta en soffa',
  'har en tid för att titta på lägenheten', 'kom för att lämna tillbaka en kastrull', 'söker skydd från regnet', 'har hört att det finns kaffe här',
  'ska träffa en gammal klasskompis', 'kom för att vattna blommorna', 'är granne och undrade vad som lät',
];
const QUIRKS = [
  'samlar på gamla nycklar', 'har aldrig sett Star Wars', 'kan alla huvudstäder i världen', 'är rädd för duvor', 'har en sköldpadda som heter Bosse',
  'har cyklat från Ystad till Haparanda', 'pratar gärna om väder', 'drömmer om att öppna ett café', 'har vunnit en tävling i pilkastning',
  'tror på spöken', 'lärde sig japanska förra året', 'har en hemlig talang för jonglering', 'har varit med i ett tv-program en gång',
];
export const PERSONALITIES = [
  { id: 'vänlig', desc: 'varm, vänlig och nyfiken på andra', style: 'pratar varmt och ställer gärna motfrågor' },
  { id: 'blyg', desc: 'blyg och lite tillbakadragen men snäll', style: 'svarar kort, tvekar ibland och säger "ehm"' },
  { id: 'sarkastisk', desc: 'torrt humoristisk och lite sarkastisk', style: 'skämtar torrt och ironiskt men menar väl' },
  { id: 'entusiastisk', desc: 'energisk, entusiastisk och pratglad', style: 'använder utropstecken och blir lätt exalterad' },
  { id: 'grinig', desc: 'lite grinig och otålig men har ett gott hjärta', style: 'klagar gärna och suckar, men är ärlig' },
  { id: 'filosofisk', desc: 'eftertänksam och filosofisk', style: 'funderar högt och vänder frågor till stora tankar' },
  { id: 'charmig', desc: 'charmig, självsäker och lite flörtig', style: 'ger komplimanger och berättar gärna anekdoter' },
];

export function makePersona(gender) {
  const age = Math.round(chance(0.15) ? rand(56, 70) : rand(20, 55));
  // Studenter är unga; äldre får ett annat yrke
  const jobs = age > 32 ? JOBS.filter(([j]) => j !== 'student') : JOBS;
  const [job, jobDetail] = age > 67 ? ['pensionär', pick(['som har varit lärare', 'som har varit sjökapten', 'som har jobbat på posten', 'som har varit ingenjör'])] : pick(jobs);
  return {
    gender,
    pronoun: gender === 'kvinna' ? 'hon' : gender === 'man' ? 'han' : 'hen',
    firstName: pick(NAMES[gender]),
    lastName: pick(SURNAMES),
    age,
    job,
    jobDetail,
    hometown: pick(TOWNS),
    hobby: pick(HOBBIES),
    food: pick(FOODS),
    music: pick(MUSIC),
    visit: pick(VISITS),
    quirk: pick(QUIRKS),
    personality: pick(PERSONALITIES),
    mood: rand(0.3, 0.9), // 0 = sur, 1 = strålande
  };
}
