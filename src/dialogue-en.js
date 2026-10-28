// Engelska versionen av den inbyggda samtalsmotorn och instruktionerna till Claude.
// Samma upplägg som de svenska i dialogue.js; personligheterna har samma id (vänlig, blyg …).

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const STYLE = {
  vänlig: { hi: ['Hi there!', 'Hello! Lovely to meet you.', 'Hey, hi!'], filler: ['', ' What about you?', ' What do you think?'], end: '.' },
  blyg: { hi: ['Um… hi.', 'Hi…', 'Oh, uh, hello.'], filler: ['', ' …sort of.', ' …I think.'], end: '…' },
  sarkastisk: { hi: ['Oh look, another human. Hi.', 'Hey. You look like you know what you are doing.', 'Hi. Nice room, right? If you like rooms.'], filler: ['', ' Shocking, I know.', ' Believe it or not.'], end: '.' },
  entusiastisk: { hi: ['HI! Oh, how fun!', 'Hello hello! What a day!', 'Hi! I love meeting new people!'], filler: ['!', ' Absolutely amazing!', ' Isn’t it great!'], end: '!' },
  grinig: { hi: ['Mm. Hi.', 'Right, bye. I mean, hi.', 'Hi. There’s a draught from the window, just so you know.'], filler: ['', ' Not that anyone asked.', ' Sigh.'], end: '.' },
  filosofisk: { hi: ['Hello. Isn’t it strange that our paths cross right here?', 'Hello, stranger. Or are we all strangers?', 'Hi. I was just thinking about time.'], filler: ['', ' But what does it really mean?', ' Everything is connected, somehow.'], end: '.' },
  charmig: { hi: ['Well, hello you! What a nice surprise.', 'Well hello! Nice top, by the way.', 'Hi! I was hoping someone interesting would turn up.'], filler: ['', ' But enough about me.', ' You seem to have good taste.'], end: '.' },
};

const INTENTS = [
  ['bye', /\b(good ?bye|bye|see you|see ya|take care|have to go|gotta go|thanks for the chat|later)\b/],
  ['greet', /^(hi|hello|hey|hiya|howdy|good (morning|afternoon|evening)|yo)\b/],
  ['myname', /\b(my name is|i'?m called|call me|i am called)\s+([a-zé]+)/],
  ['name', /\b(what'?s your name|what is your name|your name|who are you)\b/],
  ['howareyou', /\b(how are you|how'?s it going|how do you feel|how are things|you ok|are you okay|how have you been)\b/],
  ['job', /\b(job|work|do for a living|occupation|profession|study|studying)\b/],
  ['age', /\b(how old|your age|born)\b/],
  ['from', /\b(where are you from|where do you live|grow up|grew up|home ?town|from here)\b/],
  ['hobby', /\b(hobby|hobbies|free time|spare time|like to do|interests|weekends?)\b/],
  ['food', /\b(food|eat|eating|hungry|favou?rite dish|dinner|lunch|breakfast|snack)\b/],
  ['music', /\b(music|song|band|listen|sing|artist)\b/],
  ['why', /\b(why are you here|what are you doing here|what are you doing|why did you come)\b/],
  ['secret', /\b(secret|tell me something|fun fact|about yourself|surprise me)\b/],
  ['weather', /\b(weather|rain|sunny|sun|cold|warm|snow)\b/],
  ['joke', /\b(joke|funny|make me laugh|laugh)\b/],
  ['room', /\b(room|flat|apartment|sofa|couch|furniture|painting|bookcase|bookshelf|kitchen)\b/],
  ['others', /\b(do you know|who is (she|he|that|they)|the others|people here)\b/],
  ['compliment', /\b(pretty|beautiful|handsome|nice|lovely|cute|funny|smart|like you|cool|great clothes)\b/],
  ['insult', /\b(stupid|boring|ugly|idiot|gross|annoying|shut up|be quiet)\b/],
  ['thanks', /\b(thanks|thank you|cheers)\b/],
  ['yes', /^(yes|yeah|yep|yup|sure|absolutely|of course|exactly|mm)\b/],
  ['no', /^(no|nope|nah|not really)\b/],
  ['question', /\?\s*$/],
];

const JOKES = [
  'What did one wall say to the other? I’ll meet you at the corner.',
  'Why don’t eggs tell jokes? They’d crack each other up.',
  'I tried to write a book about gravity. I couldn’t put it down.',
  'What do you call a bear with no teeth? A gummy bear.',
  'My friend is so lazy he has a remote control for his remote control.',
];

export class OfflineBrainEn {
  reply(ch, text, world) {
    const p = ch.persona;
    const st = STYLE[p.personality.id] || STYLE.vänlig;
    const t = text.toLowerCase().trim();
    let intent = 'other';
    let m = null;
    for (const [id, re] of INTENTS) {
      m = t.match(re);
      if (m) {
        intent = id;
        break;
      }
    }
    ch.memory.topics.add(intent);
    const you = ch.memory.playerName ? `, ${ch.memory.playerName}` : '';
    const mood = p.mood;
    const f = () => pick(st.filler);
    let out;
    switch (intent) {
      case 'greet':
        out = ch.memory.met ? `Hi again${you}! We were just talking${st.end}` : pick(st.hi);
        break;
      case 'myname': {
        const name = cap(m[2]);
        ch.memory.playerName = name;
        out = `${name}? Nice name. I’m ${p.firstName}${st.end}`;
        if (p.personality.id === 'sarkastisk') out = `${name}. I’ll try to remember that. I’m ${p.firstName}, by the way.`;
        break;
      }
      case 'name':
        out = pick([`I’m ${p.firstName} ${p.lastName}${st.end}`, `${p.firstName}. ${p.firstName} ${p.lastName}${st.end}${f()}`, `My name is ${p.firstName}${st.end} And yours?`]);
        break;
      case 'howareyou':
        out =
          mood > 0.7
            ? pick([`Really good, actually${st.end}${f()}`, `Great! It’s a good day${st.end}`])
            : mood > 0.4
              ? pick([`Not bad, thanks${st.end} Just a bit tired.`, `Getting by${st.end}${f()}`])
              : pick([`Not great, to be honest${st.end}`, `It’s been a long day${st.end}`]);
        break;
      case 'job':
        out = pick([`I’m a ${p.job} ${p.jobDetail}${st.end}${f()}`, `I work as a ${p.job}, ${p.jobDetail}${st.end}`]);
        if (p.jobKey === 'student') out = `I’m a student, studying philosophy${st.end} Mostly I study why I study philosophy.`;
        if (p.jobKey === 'pensionär') out = `I’m retired now, ${p.jobDetail}${st.end} Now I have all the time in the world.`;
        break;
      case 'age':
        out = p.personality.id === 'grinig' || p.personality.id === 'charmig' ? `You don’t ask that${st.end} But fine, ${p.age}.` : `I’m ${p.age}${st.end}${f()}`;
        break;
      case 'from':
        out = pick([`I’m from ${p.hometown}${st.end}${f()}`, `I grew up in ${p.hometown}, but I live here in town now${st.end}`]);
        break;
      case 'hobby':
        out = pick([`I’m really into ${p.hobby} right now${st.end}${f()}`, `${cap(p.hobby)}! That’s my thing${st.end}`, `In my free time it’s a lot of ${p.hobby}${st.end}`]);
        break;
      case 'food':
        out = pick([`I could eat ${p.food} every day${st.end}`, `Have you tried ${p.food}? Best thing I know${st.end}`]);
        break;
      case 'music':
        out = pick([`I mostly listen to ${p.music}${st.end}${f()}`, `${cap(p.music)}, definitely${st.end} What do you listen to?`]);
        break;
      case 'why':
        out = `I ${p.visit}${st.end}${f()}`;
        break;
      case 'secret':
        out = pick([`Okay, one thing about me: I ${p.quirk}${st.end}`, `Did you know I ${p.quirk}? Not many people know that${st.end}`]);
        break;
      case 'weather':
        out = pick([`It looks pretty nice out of the window, anyway${st.end}`, `Weather is weather${st.end}${f()}`, `I heard it’s going to rain later${st.end}`]);
        break;
      case 'joke':
        out = p.personality.id === 'grinig' ? `A joke? Fine. ${pick(JOKES)} …Nothing? No.` : `${pick(JOKES)}${p.personality.id === 'entusiastisk' ? ' Haha!' : ''}`;
        break;
      case 'room':
        out = pick([`Nice room, isn’t it? I like the sofa${st.end}`, `That painting on the wall is pretty nice${st.end}`, `Someone here has good taste in books${st.end}`]);
        break;
      case 'others': {
        const others = world.characters.filter((c) => c !== ch);
        out = others.length ? `I think ${pick(others).persona.firstName} is around somewhere, but we don’t know each other that well${st.end}` : `Looks like it’s just the two of us right now${st.end}`;
        break;
      }
      case 'compliment':
        p.mood = Math.min(1, p.mood + 0.15);
        out = pick([`Oh, thank you! That’s kind of you${st.end}`, `That’s sweet${st.end}`, p.personality.id === 'blyg' ? 'Um… thanks… *blushes*' : `Haha, thanks${you}${st.end}`]);
        break;
      case 'insult':
        p.mood = Math.max(0, p.mood - 0.25);
        out = pick(['Okay… that wasn’t very nice.', 'Ouch. Why would you say that?', 'Right. Now I know where I stand with you.']);
        break;
      case 'thanks':
        out = pick([`You’re welcome${st.end}`, `No problem${st.end}`, 'Don’t mention it.']);
        break;
      case 'bye':
        out = pick([`Bye${you}! Take care${st.end}`, `See you${st.end}`, `Look after yourself${st.end}`]);
        break;
      case 'yes':
        out = pick([`Exactly${st.end}`, `Good, then we agree${st.end}`, `I knew it${st.end}`]);
        break;
      case 'no':
        out = pick([`No? Okay${st.end}`, `Shame${st.end}`, `Oh, not that then${st.end}`]);
        break;
      case 'question':
        out = pick([`Good question. I honestly don’t know${st.end}`, `Hmm, I’ve never thought about that${st.end}`, `I suppose it depends how you look at it${st.end}${f()}`]);
        break;
      default:
        out = pick([
          `Interesting${st.end} What brings you here?`,
          `Really${st.end} By the way, do you like ${p.food}?`,
          `Mm${st.end} I’ve been thinking a lot about ${p.hobby} today.`,
          `Exciting${st.end} Have you been here before?`,
          `Yes, I can understand that${st.end}${f()}`,
          `Haha, okay${st.end} You’re funny.`,
        ]);
    }
    ch.memory.met = true;
    const rude = ['grinig', 'sarkastisk'].includes(p.personality.id);
    const emotion = {
      greet: 'happy',
      compliment: 'happy',
      thanks: 'happy',
      bye: 'happy',
      secret: 'happy',
      joke: 'laugh',
      insult: rude ? 'angry' : 'sad',
      question: 'thinking',
      howareyou: mood > 0.7 ? 'happy' : mood < 0.4 ? 'sad' : null,
    }[intent];
    return { text: out, leave: intent === 'bye', emotion };
  }
}

// ---------------- Claude ----------------

export function systemPromptEn(ch, motionGuide) {
  const p = ch.persona;
  return `You are playing a character in a first-person 3D game. The player has walked up to you in a furnished living room and is talking to you.

Your character:
- Name: ${p.firstName} ${p.lastName} (${p.pronounText}), ${p.age} years old
- Job: ${p.job} ${p.jobDetail}
- Grew up in ${p.hometown}
- Likes ${p.hobby}, loves eating ${p.food}, listens to ${p.music}
- Personality: ${p.personality.desc}. ${cap(p.personality.style)}.
- Something about you: you ${p.quirk.replace(/^am /, 'are ').replace(/^was /, 'were ')}
- Why you are here (in your own words): "I ${p.visit}"
- The room has a sofa, armchairs, a dining table, a kitchen, a bookcase, a record player, paintings and two windows facing the city.
- Where you are, your mood and who else is in the room are given in system messages during the conversation.

How you answer:
- Speak English, like a real person in an everyday conversation. Stay in character; you do not know that you are an AI or a game character.
- Keep it short, usually 1–3 sentences, so it fits a speech bubble on a phone screen. No markdown, no lists.
- Show your personality in how you phrase things. Feel free to invent small details about your life that fit the character.

Actions:
- You can move and do things in the room with the gor_handling tool: sit down, lie down (on the floor, on the sofa or on a table), sit up on a table, stand up, go to a place, come to the player, follow the player, stop, leave the room, or gestures such as waving, dancing, clapping, cheering, laughing, shrugging, stretching, yawning, crouching, taking a photo or thinking.
- When the player asks you to do something like that, do it, ideally with a comment in your personality’s style. Write a short line first, then call the tool.
- If the player says goodbye or asks you to leave, say goodbye and use the lamna_rummet action.
- If the player asks for a movement that is not in gor_handling (pointing, saluting, a karate kick, imitating an animal, showing how big the fish was …), create it yourself with skapa_rorelse. Be creative but realistic; movements that already exist are played with spela_rorelse. The tool parameters and joint names are in Swedish; use them exactly as documented, but give new movements a short English description (beskrivning).
- There are no limits to what the body can do: with skapa_rorelse and hela_kroppen you can jump, do somersaults and flips, cartwheels, handstands, roll around, lie down, sit on the floor, kneel, stretch out and much more. Make the movements smooth and human with the whole body (hips, chest, shoulders, head, hands), anticipation and follow-through, and with hall_kvar you stay in the pose as long as the player wants. Never say you cannot do a movement – try.
- If the player says a movement was bad, or asks you to redo it, create an improved version with skapa_rorelse and the same name. Take the player’s comment into account. If the player says it was almost right, keep what was good and only adjust what the player mentions.
- Do not claim to do anything you cannot do with the tools.${
    ch.hasFace ? '\n- The player sees your face in close-up. Show emotions with the visa_kansla tool when they clearly change, e.g. when you become happy, laugh, get sad, angry or surprised.' : ''
  }

${motionGuide}`;
}

export function situationEn(ch, world, first, { motionNames, lessons, lessonsSent }) {
  const p = ch.persona;
  const others = world.characters.filter((c) => c !== ch).map((c) => `${c.persona.firstName} (${c.persona.job})`);
  const SEATS = { soffan: 'the sofa', läsfåtöljen: 'the reading chair', fåtöljen: 'the armchair', matbordet: 'the dining table' };
  const POIS = { 'tv:n': 'the TV', köket: 'the kitchen', kylskåpet: 'the fridge', fönstret: 'the window', bokhyllan: 'the bookcase', skivspelaren: 'the record player', tavlan: 'the painting', dörren: 'the door', matbordet: 'the dining table' };
  const where = ch.following
    ? 'are following the player'
    : ch.seated
      ? `are sitting ${ch.seat.label === 'matbordet' ? 'at' : 'on'} ${SEATS[ch.seat.label] || ch.seat.label}`
      : ch.poi
        ? `are standing by ${POIS[ch.poi.label] || ch.poi.label}`
        : 'are standing in the room';
  const pose = ch.motion && ch.motion.releaseAt === undefined && ch.motion.def.hall_kvar ? ` and are currently holding the pose "${ch.motion.def.beskrivning || 'custom movement'}" (the next movement starts from there)` : '';
  const lines = [
    `You ${where}${pose}.`,
    `Mood: ${p.mood > 0.7 ? 'in a great mood' : p.mood > 0.4 ? 'fine' : 'a bit down'}.`,
    `Others in the room: ${others.length ? others.join(', ') : 'nobody else right now'}.`,
    `Movements available with spela_rorelse: ${motionNames.join(', ')}.`,
  ];
  if (first) lines.push(`When the player came up to you, you said: "${ch.greeting || 'Hi!'}"`);
  if (lessons.length && JSON.stringify(lessons) !== lessonsSent) lines.push(`New lessons about movements from the player’s ratings:\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  return lines.join('\n');
}
