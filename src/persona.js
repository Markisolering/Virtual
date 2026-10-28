// Slumpad personlighet och bakgrund för varje person i rummet (på svenska eller engelska).

import { en } from './i18n.js';

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
// Engelska motsvarigheter (samma ordning som de svenska listorna)
const NAMES_EN = {
  kvinna: ['Emma', 'Olivia', 'Ava', 'Sophie', 'Grace', 'Chloe', 'Maya', 'Isla', 'Hannah', 'Zoe', 'Fatima', 'Amira', 'Sofia', 'Yasmin', 'Leila', 'Ruby', 'Clara', 'Elsa', 'Mei', 'Nadia', 'Margaret', 'Lucy', 'Ella', 'Freya'],
  man: ['James', 'Oliver', 'Liam', 'Noah', 'Ali', 'Omar', 'Lucas', 'Henry', 'Jack', 'Theo', 'Daniel', 'Samuel', 'Mohammed', 'Ethan', 'Leo', 'Owen', 'Erik', 'Jonas', 'Mateo', 'Kenji', 'David', 'Ivan', 'Elias', 'Ben'],
  ickebinär: ['Robin', 'Kim', 'Alex', 'Charlie', 'Sam', 'Jordan', 'Eli', 'Noa', 'Riley', 'Kai'],
};
const SURNAMES_EN = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Wilson', 'Clarke', 'Walker', 'Hughes', 'Wright', 'Green', 'Hall', 'Wood', 'Turner', 'Hassan', 'Yilmaz', 'Novak', 'García', 'Kowalski', 'Andersson', 'Murphy', 'Kelly', 'Evans', 'Baker', 'Hill'];
const JOBS_EN = [
  ['nurse', 'in the emergency room'], ['carpenter', 'with my own small business'], ['programmer', 'at a game studio'], ['teacher', 'at a primary school'],
  ['chef', 'at an Italian restaurant'], ['librarian', 'at the city library'], ['bus driver', 'on route 4'], ['architect', 'who designs schools'],
  ['hairdresser', 'in a salon by the square'], ['student', 'studying philosophy'], ['retiree', 'who used to be a sea captain'], ['musician', 'in a jazz band'],
  ['vet', 'who mostly works with cats'], ['journalist', 'at the local paper'], ['firefighter', 'at the station nearby'], ['artist', 'who paints watercolours'],
  ['baker', 'who starts work at four in the morning'], ['researcher', 'in marine biology'], ['electrician', 'at a construction company'], ['barista', 'at the café around the corner'],
];
const RETIRED_EN = ['who used to be a teacher', 'who used to be a sea captain', 'who used to work at the post office', 'who used to be an engineer'];
const TOWNS_EN = ['Gothenburg', 'Malmö', 'Umeå', 'Kiruna', 'Visby', 'Uppsala', 'Örebro', 'Luleå', 'Jönköping', 'Lund', 'Sundsvall', 'Karlstad', 'Tehran', 'Kraków', 'Sarajevo', 'Santiago', 'Osaka', 'Helsinki', 'Bergen', 'Kalmar'];
const HOBBIES_EN = ['birdwatching', 'climbing', 'baking sourdough bread', 'chess', 'playing the guitar', 'running', 'board games', 'knitting', 'photography', 'fishing', 'yoga', 'collecting vinyl records', 'foraging for mushrooms', 'dancing', 'building model trains', 'poetry', 'gardening', 'video games', 'winter swimming', 'cooking Korean food'];
const FOODS_EN = ['cinnamon buns', 'pizza', 'pancakes with jam', 'sushi', 'meatballs', 'falafel', 'shrimp sandwiches', 'pho', 'tacos', 'cabbage rolls', 'lasagne', 'ramen', 'hash with fried egg', 'baklava'];
const MUSIC_EN = ['jazz', 'old punk', 'ABBA', 'classical music', 'hip hop', 'dance bands', 'synthpop', 'folk music', 'metal', 'soul', 'indie pop', 'opera'];
const VISITS_EN = [
  'am waiting for a friend who is late', 'came to borrow a book', 'am here for a party and came a bit early', 'am going to help move a sofa',
  'have an appointment to view the flat', 'came to return a saucepan', 'am sheltering from the rain', 'heard there was coffee here',
  'am meeting an old classmate', 'came to water the plants', 'am a neighbour and wondered what the noise was',
];
const QUIRKS_EN = [
  'collect old keys', 'have never seen Star Wars', 'know every capital city in the world', 'am afraid of pigeons', 'have a tortoise called Bosse',
  'have cycled the length of Sweden', 'love talking about the weather', 'dream of opening a café', 'once won a darts competition',
  'believe in ghosts', 'learned Japanese last year', 'have a secret talent for juggling', 'was on a TV show once',
];
const PERSONALITIES_EN = {
  vänlig: { desc: 'warm, friendly and curious about others', style: 'speaks warmly and likes to ask questions back' },
  blyg: { desc: 'shy and a little reserved but kind', style: 'answers briefly, hesitates sometimes and says "um"' },
  sarkastisk: { desc: 'dryly humorous and a bit sarcastic', style: 'jokes dryly and ironically but means well' },
  entusiastisk: { desc: 'energetic, enthusiastic and chatty', style: 'uses exclamation marks and gets excited easily' },
  grinig: { desc: 'a bit grumpy and impatient but has a good heart', style: 'likes to complain and sigh, but is honest' },
  filosofisk: { desc: 'thoughtful and philosophical', style: 'thinks out loud and turns questions into big ideas' },
  charmig: { desc: 'charming, confident and a little flirty', style: 'gives compliments and likes to tell anecdotes' },
};

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
  // Studenter är unga; äldre får ett annat yrke. Index väljs så att svensk och engelsk variant hör ihop.
  const idx = (list) => Math.floor(Math.random() * list.length);
  let jobIndex = idx(JOBS);
  while (age > 32 && JOBS[jobIndex][0] === 'student') jobIndex = idx(JOBS);
  const retired = age > 67;
  const retiredIndex = idx(RETIRED_EN);
  const [job, jobDetail] = retired
    ? [en ? 'retiree' : 'pensionär', en ? RETIRED_EN[retiredIndex] : ['som har varit lärare', 'som har varit sjökapten', 'som har jobbat på posten', 'som har varit ingenjör'][retiredIndex]]
    : en
      ? JOBS_EN[jobIndex]
      : JOBS[jobIndex];
  const personality = pick(PERSONALITIES);
  const choose = (sv, english) => {
    const i = idx(sv);
    return en ? english[i] : sv[i];
  };
  return {
    gender,
    // Pronomenet används som nyckel (hon/han/hen); pronounText är det som skrivs ut
    pronoun: gender === 'kvinna' ? 'hon' : gender === 'man' ? 'han' : 'hen',
    pronounText: en ? (gender === 'kvinna' ? 'she' : gender === 'man' ? 'he' : 'they') : gender === 'kvinna' ? 'hon' : gender === 'man' ? 'han' : 'hen',
    firstName: pick((en ? NAMES_EN : NAMES)[gender]),
    lastName: pick(en ? SURNAMES_EN : SURNAMES),
    age,
    // jobKey är det svenska yrket, för logik som inte ska bero på språket
    jobKey: retired ? 'pensionär' : JOBS[jobIndex][0],
    job,
    jobDetail,
    hometown: choose(TOWNS, TOWNS_EN),
    hobby: choose(HOBBIES, HOBBIES_EN),
    food: choose(FOODS, FOODS_EN),
    music: choose(MUSIC, MUSIC_EN),
    visit: choose(VISITS, VISITS_EN),
    quirk: choose(QUIRKS, QUIRKS_EN),
    personality: en ? { ...personality, ...PERSONALITIES_EN[personality.id] } : personality,
    mood: rand(0.3, 0.9), // 0 = sur, 1 = strålande
  };
}
