import * as THREE from 'three';

// Egna rörelser som beskrivs med nyckelbilder: vinklar i grader för huvud, överkropp, armar och ben.
// Claude kan skapa nya rörelser med verktyget skapa_rorelse, och de sparas så att personerna kan göra dem igen.
//
// Alla vinklar räknas från en neutral stående pose (armarna hänger, benen raka) och i personens egna
// riktningar, så att "lyft armen framåt 90" betyder samma sak oavsett skelettets inre axlar.

const HAND_FORMS = ['oppen', 'knytnave', 'peka', 'tumme_upp', 'fridstecken'];

// Ledernas namn i nyckelbilderna och vad de betyder (används även i verktygsbeskrivningen)
export const JOINT_HELP = {
  huvud_nick: 'positivt = nicka ner, negativt = titta upp',
  huvud_vrid: 'positivt = vrid huvudet åt vänster',
  huvud_luta: 'positivt = luta huvudet mot höger axel',
  overkropp_framat: 'positivt = böj överkroppen framåt (buga), negativt = luta bakåt',
  overkropp_vrid: 'positivt = vrid överkroppen åt vänster',
  overkropp_luta: 'positivt = luta åt höger',
  brost_framat: 'bara bröstkorgen/övre ryggen: positivt = kuta, krypa ihop; negativt = sträcka på bröstet',
  brost_vrid: 'bara bröstkorgen: positivt = vrid åt vänster',
  brost_luta: 'bara bröstkorgen: positivt = luta åt höger',
  hoft_framat: 'bäckenet (höfterna och benen följer med, överkroppen står kvar): positivt = tippa bäckenet framåt, negativt = skjuta fram höften',
  hoft_vrid: 'bäckenet: positivt = vrid höfterna åt vänster (överkroppen står kvar)',
  hoft_luta: 'bäckenet: positivt = höger höft upp (vikt på vänster ben, som när man står avslappnat)',
  h_arm_framat: 'höger arm: lyft framåt från hängande (90 = rakt fram, 180 = rakt upp)',
  h_arm_utat: 'höger arm: lyft ut åt sidan (90 = vågrätt ut, 170 = upp över huvudet)',
  h_arm_vrid: 'höger arm: vrid runt armens egen axel; positivt = inåt (underarmen mot magen), negativt = utåt (underarmen uppåt när armen hålls ut åt sidan)',
  h_armbage: 'höger armbåge: böj (0 = rak, 140 = helt böjd)',
  h_underarm_vrid: 'höger underarm: vrid handen; positivt = handflatan vänds nedåt/bakåt, negativt = uppåt',
  h_handled: 'höger handled: böj mot tumsidan (positivt) eller lillfingersidan',
  h_handled_sida: 'höger handled: böj mot handflatan (positivt) eller handryggen',
  h_fingrar: 'höger hand: böj alla fyra fingrar (0 = raka, 90 = knutna), läggs till handformen',
  h_tumme: 'höger tumme: böj (0 = rak, 60 = in mot handflatan)',
  h_hand: `höger hand: ${HAND_FORMS.join(', ')}`,
  v_arm_framat: 'vänster arm, som höger',
  v_arm_utat: 'vänster arm, som höger',
  v_arm_vrid: 'vänster arm, som höger',
  v_armbage: 'vänster armbåge, som höger',
  v_underarm_vrid: 'vänster underarm, som höger',
  v_handled: 'vänster handled, som höger',
  v_handled_sida: 'vänster handled, som höger',
  v_fingrar: 'vänster hand, som höger',
  v_tumme: 'vänster tumme, som höger',
  v_hand: `vänster hand: ${HAND_FORMS.join(', ')}`,
  h_ben_framat: 'höger ben: lyft framåt från höften',
  h_ben_utat: 'höger ben: lyft ut åt sidan',
  h_ben_vrid: 'höger ben: vrid runt benets axel; positivt = tårna inåt',
  h_kna: 'höger knä: böj (0 = rakt)',
  v_ben_framat: 'vänster ben, som höger',
  v_ben_utat: 'vänster ben, som höger',
  v_ben_vrid: 'vänster ben, som höger',
  v_kna: 'vänster knä, som höger',
  h_axel: 'höger axel: dra upp axeln (positivt), t.ex. 20 för att rycka på axlarna',
  v_axel: 'vänster axel, som höger',
  h_axel_framat: 'höger axel/skulderblad: dra fram axeln (positivt) eller bak (negativt)',
  v_axel_framat: 'vänster axel, som höger',
  h_fot: 'höger fotled: positivt = tårna uppåt, negativt = sträck foten (tå ner)',
  v_fot: 'vänster fotled, som höger',
  h_fot_sida: 'höger fotled: vinkla foten inåt (positivt, sulan mot andra foten) eller utåt',
  v_fot_sida: 'vänster fotled, som höger',
  h_tar: 'höger tår: böj uppåt (positivt), t.ex. 30 när man står på tå eller tar sats',
  v_tar: 'vänster tår, som höger',
  hojd: 'flytta hela kroppen upp/ner i centimeter. Kroppen hålls automatiskt kvar på golvet eller möbeln den är på, så höjden behöver bara vara ungefärlig när man sitter, ligger eller sitter på huk. För att lämna golvet (hopp, volt) används luft.',
  luft: 'helkroppsrörelser: 0 = kroppen dras ner mot golvet/möbeln (normalt), 1 = i luften (hopp, volt). Övergången tonas, t.ex. 0 vid satsen, 1 i luften, 0 vid landningen',
  kropp_framat: 'flytta hela kroppen framåt (positivt) eller bakåt i centimeter',
  kropp_sidled: 'flytta hela kroppen åt höger (positivt) eller vänster i centimeter',
  kropp_lutning: 'luta HELA kroppen runt fötterna: 90 = falla framåt och ligga på magen, -90 = ligga på rygg (lägg till hojd ca 12 så att kroppen ligger ovanpå golvet)',
  kropp_sida: 'luta hela kroppen åt sidan runt fötterna: 90 = ligga på höger sida, -90 = på vänster sida',
  snurra: 'vrid hela kroppen runt sin egen axel i grader (360 = ett varv)',
  volt: 'rotera hela kroppen framåt runt höften: 360 = kullerbytta/volt framåt, -360 = bakåt, -90 = luta sig bakåt och lägga sig (från sittande)',
  hjulning: 'rotera hela kroppen åt sidan runt höften (som när man hjular): 360 = ett hjul åt höger',
  rulla: 'rotera hela kroppen runt sin egen längdaxel genom höften: när man ligger = rulla runt på golvet (360 = ett varv)',
};
const NUMERIC = Object.keys(JOINT_HELP).filter((k) => !k.endsWith('_hand'));
// Rotationer av hela kroppen som kan gå flera varv
export const ROTATIONS = ['snurra', 'volt', 'hjulning', 'rulla'];

// ---------------- Färdiga rörelser ----------------
// Fungerar utan AI och fungerar som exempel för Claude.
export const PRESETS = {
  peka: {
    beskrivning: 'pekar rakt fram med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 85, h_arm_utat: 10, h_armbage: 10, h_hand: 'peka', huvud_nick: -5 },
      { tid: 2.2, h_arm_framat: 85, h_arm_utat: 10, h_armbage: 10, h_hand: 'peka' },
    ],
  },
  tumme_upp: {
    beskrivning: 'gör tummen upp med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 45, h_armbage: 80, h_hand: 'tumme_upp', huvud_nick: 5 },
      { tid: 2.0, h_arm_framat: 45, h_armbage: 85, h_hand: 'tumme_upp' },
    ],
  },
  buga: {
    beskrivning: 'bugar djupt',
    nyckelbilder: [
      { tid: 0.6, overkropp_framat: 45, huvud_nick: 15, h_arm_framat: 10, v_arm_framat: 10 },
      { tid: 1.4, overkropp_framat: 45, huvud_nick: 15, h_arm_framat: 10, v_arm_framat: 10 },
      { tid: 2.0, overkropp_framat: 0, huvud_nick: 0, h_arm_framat: 0, v_arm_framat: 0 },
    ],
  },
  nicka: {
    beskrivning: 'nickar instämmande',
    nyckelbilder: [
      { tid: 0.25, huvud_nick: 18 },
      { tid: 0.5, huvud_nick: -4 },
      { tid: 0.75, huvud_nick: 18 },
      { tid: 1.0, huvud_nick: -4 },
      { tid: 1.3, huvud_nick: 0 },
    ],
  },
  skaka_pa_huvudet: {
    beskrivning: 'skakar på huvudet',
    nyckelbilder: [
      { tid: 0.2, huvud_vrid: 25 },
      { tid: 0.45, huvud_vrid: -25 },
      { tid: 0.7, huvud_vrid: 25 },
      { tid: 0.95, huvud_vrid: -25 },
      { tid: 1.2, huvud_vrid: 0 },
    ],
  },
  armarna_i_kors: {
    beskrivning: 'står med armarna i kors',
    nyckelbilder: [
      { tid: 0.6, h_arm_framat: 35, h_arm_utat: 20, h_arm_vrid: 60, h_armbage: 120, v_arm_framat: 40, v_arm_utat: 20, v_arm_vrid: 60, v_armbage: 115 },
      { tid: 4, h_arm_framat: 35, h_arm_utat: 20, h_arm_vrid: 60, h_armbage: 120, v_arm_framat: 40, v_arm_utat: 20, v_arm_vrid: 60, v_armbage: 115 },
    ],
  },
  handerna_pa_hoften: {
    beskrivning: 'står med händerna på höfterna',
    nyckelbilder: [
      { tid: 0.5, h_arm_utat: 40, h_arm_framat: -10, h_armbage: 100, h_arm_vrid: 40, v_arm_utat: 40, v_arm_framat: -10, v_armbage: 100, v_arm_vrid: 40 },
      { tid: 3.5, h_arm_utat: 40, h_arm_framat: -10, h_armbage: 100, h_arm_vrid: 40, v_arm_utat: 40, v_arm_framat: -10, v_armbage: 100, v_arm_vrid: 40 },
    ],
  },
  hoppa: {
    beskrivning: 'hoppar jämfota med armarna upp',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.3, hojd: -14, h_kna: 60, v_kna: 60, h_ben_framat: 40, v_ben_framat: 40, overkropp_framat: 25, h_arm_framat: -45, v_arm_framat: -45, h_armbage: 15, v_armbage: 15, h_fot: 22, v_fot: 22, huvud_nick: -5 },
      { tid: 0.45, hojd: 6, luft: 1, h_kna: 4, v_kna: 4, h_ben_framat: 0, v_ben_framat: 0, overkropp_framat: -5, h_arm_framat: 150, v_arm_framat: 150, h_armbage: 10, v_armbage: 10, h_fot: -40, v_fot: -40, h_tar: 30, v_tar: 30, huvud_nick: -10 },
      { tid: 0.66, hojd: 42, luft: 1, h_kna: 25, v_kna: 25, h_ben_framat: 18, v_ben_framat: 18, overkropp_framat: 0, h_arm_framat: 165, v_arm_framat: 165, h_fot: -25, v_fot: -25, h_tar: 0, v_tar: 0 },
      { tid: 0.86, hojd: 12, luft: 1, h_kna: 12, v_kna: 12, h_ben_framat: 10, v_ben_framat: 10, h_arm_framat: 100, v_arm_framat: 100, h_fot: -25, v_fot: -25 },
      { tid: 1.0, hojd: -14, luft: 0, h_kna: 65, v_kna: 65, h_ben_framat: 42, v_ben_framat: 42, overkropp_framat: 28, h_arm_framat: 45, v_arm_framat: 45, h_armbage: 25, v_armbage: 25, h_fot: 25, v_fot: 25, huvud_nick: 10 },
      { tid: 1.35, hojd: -3, h_kna: 15, v_kna: 15, h_ben_framat: 10, v_ben_framat: 10, overkropp_framat: 6, h_arm_framat: 10, v_arm_framat: 10, h_armbage: 10, v_armbage: 10, h_fot: 5, v_fot: 5, huvud_nick: 0 },
      { tid: 1.7, hojd: 0, h_kna: 0, v_kna: 0, h_ben_framat: 0, v_ben_framat: 0, overkropp_framat: 0, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 0, v_armbage: 0, h_fot: 0, v_fot: 0 },
    ],
  },
  kullerbytta: {
    beskrivning: 'slår en kullerbytta framåt',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.35, hojd: -40, h_kna: 110, v_kna: 110, h_ben_framat: 95, v_ben_framat: 95, overkropp_framat: 45, huvud_nick: 30, h_arm_framat: 75, v_arm_framat: 75, h_armbage: 10, v_armbage: 10, h_fot: 25, v_fot: 25 },
      { tid: 0.65, volt: 40, kropp_framat: 15, h_kna: 125, v_kna: 125, h_ben_framat: 110, v_ben_framat: 110, overkropp_framat: 60, huvud_nick: 60, h_arm_framat: 50, v_arm_framat: 50, h_armbage: 30, v_armbage: 30 },
      { tid: 0.95, volt: 140, kropp_framat: 45, h_kna: 140, v_kna: 140, h_ben_framat: 125, v_ben_framat: 125, overkropp_framat: 70, h_arm_framat: 30, v_arm_framat: 30, h_armbage: 100, v_armbage: 100, h_fot: -20, v_fot: -20 },
      { tid: 1.25, volt: 250, kropp_framat: 80 },
      { tid: 1.55, volt: 335, kropp_framat: 110, h_kna: 130, v_kna: 130, h_ben_framat: 115, v_ben_framat: 115, overkropp_framat: 55, huvud_nick: 30, h_arm_framat: 90, v_arm_framat: 90, h_armbage: 10, v_armbage: 10, h_fot: 15, v_fot: 15 },
      { tid: 1.8, volt: 360, kropp_framat: 120, h_kna: 110, v_kna: 110, h_ben_framat: 95, v_ben_framat: 95, overkropp_framat: 40, huvud_nick: 10, h_arm_framat: 70, v_arm_framat: 70, h_fot: 25, v_fot: 25 },
      { tid: 2.4, volt: 360, kropp_framat: 120, hojd: 0, h_kna: 0, v_kna: 0, h_ben_framat: 0, v_ben_framat: 0, overkropp_framat: 0, huvud_nick: 0, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 0, v_armbage: 0, h_fot: 0, v_fot: 0 },
    ],
  },
  bakatvolt: {
    beskrivning: 'gör en volt bakåt i luften',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.3, hojd: -20, h_kna: 70, v_kna: 70, h_ben_framat: 50, v_ben_framat: 50, overkropp_framat: 30, h_arm_framat: -50, v_arm_framat: -50, h_fot: 25, v_fot: 25 },
      { tid: 0.48, hojd: 20, luft: 1, volt: -30, h_kna: 5, v_kna: 5, h_ben_framat: 0, v_ben_framat: 0, overkropp_framat: -15, h_arm_framat: 170, v_arm_framat: 170, h_fot: -40, v_fot: -40, huvud_nick: -20 },
      { tid: 0.68, hojd: 75, luft: 1, volt: -140, h_kna: 120, v_kna: 120, h_ben_framat: 110, v_ben_framat: 110, overkropp_framat: 30, h_arm_framat: 60, v_arm_framat: 60, h_armbage: 90, v_armbage: 90, huvud_nick: -30 },
      { tid: 0.86, hojd: 65, luft: 1, volt: -260 },
      { tid: 1.03, hojd: 25, luft: 1, volt: -345, h_kna: 30, v_kna: 30, h_ben_framat: 30, v_ben_framat: 30, overkropp_framat: 10, h_arm_framat: 120, v_arm_framat: 120, h_armbage: 10, v_armbage: 10, huvud_nick: 0 },
      { tid: 1.16, hojd: -15, luft: 0, volt: -360, h_kna: 70, v_kna: 70, h_ben_framat: 55, v_ben_framat: 55, overkropp_framat: 30, h_arm_framat: 70, v_arm_framat: 70, h_fot: 25, v_fot: 25 },
      { tid: 1.6, hojd: 0, volt: -360, h_kna: 0, v_kna: 0, h_ben_framat: 0, v_ben_framat: 0, overkropp_framat: 0, h_arm_framat: 0, v_arm_framat: 0, h_fot: 0, v_fot: 0 },
    ],
  },
  hjula: {
    beskrivning: 'hjular åt sidan',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.35, h_arm_utat: 160, v_arm_utat: 160, h_ben_utat: 12, v_ben_utat: 12, overkropp_luta: 12, h_kna: 15, v_kna: 15 },
      { tid: 0.65, hjulning: 90, kropp_sidled: 40, h_arm_utat: 170, v_arm_utat: 170, h_ben_utat: 45, v_ben_utat: 45, overkropp_luta: 0, h_kna: 0, v_kna: 0, h_fot: -30, v_fot: -30 },
      { tid: 0.9, hjulning: 180, kropp_sidled: 75 },
      { tid: 1.15, hjulning: 270, kropp_sidled: 115 },
      { tid: 1.45, hjulning: 360, kropp_sidled: 150, h_ben_utat: 12, v_ben_utat: 12, h_arm_utat: 150, v_arm_utat: 150, h_kna: 15, v_kna: 15, h_fot: 0, v_fot: 0 },
      { tid: 1.9, hjulning: 360, kropp_sidled: 150, h_ben_utat: 0, v_ben_utat: 0, h_arm_utat: 0, v_arm_utat: 0, h_kna: 0, v_kna: 0 },
    ],
  },
  sta_pa_handerna: {
    beskrivning: 'står på händerna en stund',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 175, v_arm_framat: 175, v_ben_framat: 30, v_kna: 20, huvud_nick: -10 },
      { tid: 0.85, volt: 70, kropp_framat: 25, h_arm_framat: 175, v_arm_framat: 175, h_ben_framat: -25, v_ben_framat: 45, v_kna: 30, huvud_nick: -20 },
      { tid: 1.35, volt: 180, kropp_framat: 45, h_ben_framat: 0, v_ben_framat: 0, v_kna: 0, h_fot: -40, v_fot: -40, h_arm_framat: 178, v_arm_framat: 178, huvud_nick: -35 },
      { tid: 2.2, volt: 183, kropp_framat: 45, h_ben_framat: 6, v_ben_framat: -4 },
      { tid: 3.0, volt: 178, kropp_framat: 45, h_ben_framat: -4, v_ben_framat: 6 },
      { tid: 3.5, volt: 90, kropp_framat: 60, v_ben_framat: 70, h_ben_framat: -10, v_kna: 20, h_fot: 0, v_fot: 0 },
      { tid: 3.95, volt: 20, kropp_framat: 75, h_ben_framat: 20, v_ben_framat: 30, h_kna: 20, v_kna: 20, h_arm_framat: 120, v_arm_framat: 120, huvud_nick: 0 },
      { tid: 4.5, volt: 0, kropp_framat: 80, h_ben_framat: 0, v_ben_framat: 0, h_kna: 0, v_kna: 0, h_arm_framat: 0, v_arm_framat: 0 },
    ],
  },
  rulla_runt: {
    beskrivning: 'lägger sig och rullar runt på golvet',
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: [
      { tid: 0.5, hojd: -45, h_ben_framat: 70, v_ben_framat: 70, h_kna: 100, v_kna: 100, overkropp_framat: 25, h_arm_framat: 30, v_arm_framat: 30, h_fot: 20, v_fot: 20 },
      { tid: 1.0, hojd: -85, h_ben_framat: 85, v_ben_framat: 85, h_kna: 20, v_kna: 20, overkropp_framat: 5, h_arm_framat: -30, v_arm_framat: -30, h_armbage: 10, v_armbage: 10, h_fot: 0, v_fot: 0 },
      { tid: 1.6, volt: -90, h_ben_framat: 0, v_ben_framat: 0, h_kna: 0, v_kna: 0, overkropp_framat: 0, h_arm_framat: 170, v_arm_framat: 170, h_fot: -25, v_fot: -25 },
      { tid: 2.0, rulla: 0, kropp_sidled: 0 },
      { tid: 2.9, rulla: 180, kropp_sidled: -40 },
      { tid: 3.8, rulla: 360, kropp_sidled: -80 },
      { tid: 4.7, rulla: 540, kropp_sidled: -120 },
      { tid: 5.6, rulla: 720, kropp_sidled: -160 },
      { tid: 6.2, h_arm_framat: 10, v_arm_framat: 10, h_arm_utat: 15, v_arm_utat: 15 },
    ],
  },
  snurra: {
    beskrivning: 'snurrar ett varv med armarna ut',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.3, h_arm_utat: 70, v_arm_utat: 70, snurra: 0 },
      { tid: 1.5, h_arm_utat: 70, v_arm_utat: 70, snurra: 360 },
      { tid: 1.8, h_arm_utat: 0, v_arm_utat: 0, snurra: 360 },
    ],
  },
  visa_musklerna: {
    beskrivning: 'spänner armmusklerna',
    nyckelbilder: [
      { tid: 0.5, h_arm_utat: 90, h_armbage: 120, h_arm_vrid: -70, h_hand: 'knytnave', v_arm_utat: 90, v_armbage: 120, v_arm_vrid: -70, v_hand: 'knytnave' },
      { tid: 2.5, h_arm_utat: 90, h_armbage: 130, h_arm_vrid: -70, h_hand: 'knytnave', v_arm_utat: 90, v_armbage: 130, v_arm_vrid: -70, v_hand: 'knytnave' },
    ],
  },
  sitta_pa_golvet: {
    beskrivning: 'sätter sig på golvet med benen framåt',
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: [
      { tid: 0.5, hojd: -45, h_ben_framat: 70, v_ben_framat: 70, h_kna: 105, v_kna: 105, overkropp_framat: 30, h_arm_framat: 35, v_arm_framat: 35, h_fot: 20, v_fot: 20 },
      { tid: 1.0, hojd: -78, h_ben_framat: 80, v_ben_framat: 80, h_kna: 70, v_kna: 70, overkropp_framat: 12, h_arm_framat: -30, v_arm_framat: -30, h_armbage: 15, v_armbage: 15 },
      { tid: 1.6, hojd: -86, h_ben_framat: 85, v_ben_framat: 85, h_kna: 25, v_kna: 25, overkropp_framat: -4, h_arm_framat: -28, v_arm_framat: -28, h_armbage: 8, v_armbage: 8, h_fot: -15, v_fot: -15, h_ben_utat: 6, v_ben_utat: 6 },
    ],
  },
  ligga_pa_rygg: {
    beskrivning: 'lägger sig på rygg på golvet',
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: [
      { tid: 0.45, hojd: -45, h_ben_framat: 70, v_ben_framat: 70, h_kna: 100, v_kna: 100, overkropp_framat: 30, h_arm_framat: 30, v_arm_framat: 30, h_fot: 20, v_fot: 20 },
      { tid: 0.95, hojd: -80, h_ben_framat: 80, v_ben_framat: 80, h_kna: 60, v_kna: 60, overkropp_framat: 10, h_arm_framat: -35, v_arm_framat: -35, h_armbage: 15, v_armbage: 15, h_fot: 0, v_fot: 0 },
      { tid: 1.4, hojd: -86, h_ben_framat: 80, v_ben_framat: 80, h_kna: 30, v_kna: 30, overkropp_framat: 0, h_arm_framat: -40, v_arm_framat: -40 },
      { tid: 1.9, volt: -60, h_ben_framat: 55, v_ben_framat: 55, h_kna: 15, v_kna: 15, overkropp_framat: 15, h_arm_framat: -10, v_arm_framat: -10, h_armbage: 90, v_armbage: 90, huvud_nick: 15 },
      { tid: 2.5, volt: -90, h_ben_framat: 0, v_ben_framat: 0, h_kna: 5, v_kna: 5, overkropp_framat: 0, h_arm_framat: 0, v_arm_framat: 0, h_arm_utat: 15, v_arm_utat: 15, h_armbage: 15, v_armbage: 15, huvud_nick: 0, h_fot: -25, v_fot: -25, h_ben_vrid: -10, v_ben_vrid: -10 },
    ],
  },
  ligga_pa_magen: {
    beskrivning: 'lägger sig på mage på golvet',
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: [
      { tid: 0.5, hojd: -45, h_kna: 90, v_kna: 90, h_ben_framat: 20, v_ben_framat: 20, overkropp_framat: 20, h_arm_framat: 30, v_arm_framat: 30, h_fot: -40, v_fot: -40, h_tar: 40, v_tar: 40 },
      { tid: 1.05, volt: 90, h_ben_framat: 90, v_ben_framat: 90, h_kna: 90, v_kna: 90, overkropp_framat: 0, h_arm_framat: 90, v_arm_framat: 90, huvud_nick: -40, h_fot: -40, v_fot: -40 },
      { tid: 1.6, volt: 90, h_ben_framat: 30, v_ben_framat: 30, h_kna: 45, v_kna: 45, h_arm_framat: 120, v_arm_framat: 120, h_armbage: 80, v_armbage: 80, huvud_nick: -35 },
      { tid: 2.2, volt: 90, h_ben_framat: 0, v_ben_framat: 0, h_kna: 0, v_kna: 0, h_ben_utat: 8, v_ben_utat: 8, h_arm_framat: 160, v_arm_framat: 160, h_armbage: 80, v_armbage: 80, huvud_nick: -30, h_fot: -60, v_fot: -60, h_tar: 0, v_tar: 0 },
    ],
  },
  sta_pa_kna: {
    beskrivning: 'ställer sig på knä',
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: [
      { tid: 0.5, hojd: -20, v_ben_framat: 40, v_kna: 50, h_kna: 30, overkropp_framat: 10 },
      { tid: 1.0, hojd: -45, h_kna: 90, h_ben_framat: 0, v_ben_framat: 85, v_kna: 90, h_fot: -50, h_tar: 40, overkropp_framat: 5 },
      { tid: 1.6, hojd: -48, h_kna: 90, v_kna: 90, h_ben_framat: 0, v_ben_framat: 0, h_fot: -50, v_fot: -50, h_tar: 40, v_tar: 40, overkropp_framat: 0 },
    ],
  },
  resa_sig: {
    beskrivning: 'reser sig upp från golvet',
    hela_kroppen: true,
    nyckelbilder: [
      { tid: 0.6, volt: 0, kropp_lutning: 0, kropp_sida: 0, rulla: 0, hjulning: 0, hojd: -82, h_ben_framat: 80, v_ben_framat: 80, h_kna: 70, v_kna: 70, overkropp_framat: 25, h_arm_framat: -30, v_arm_framat: -30, h_armbage: 10, v_armbage: 10, huvud_nick: 0 },
      { tid: 1.15, hojd: -45, h_ben_framat: 105, v_ben_framat: 105, h_kna: 125, v_kna: 125, overkropp_framat: 45, h_arm_framat: 60, v_arm_framat: 60, h_armbage: 20, v_armbage: 20, h_fot: 25, v_fot: 25, kropp_framat: 25 },
      { tid: 1.85, hojd: 0, h_ben_framat: 0, v_ben_framat: 0, h_kna: 0, v_kna: 0, overkropp_framat: 0, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 0, v_armbage: 0, h_fot: 0, v_fot: 0, kropp_framat: 25 },
    ],
  },
  fridstecken: {
    beskrivning: 'gör fredstecken med höger hand',
    nyckelbilder: [
      { tid: 0.4, h_arm_framat: 60, h_arm_utat: 25, h_armbage: 70, h_hand: 'fridstecken', huvud_luta: 8 },
      { tid: 2.2, h_arm_framat: 60, h_arm_utat: 25, h_armbage: 75, h_hand: 'fridstecken', huvud_luta: 8 },
    ],
  },
};

// ---------------- Ligga och sitta på möbler ----------------
// Personen står vid kanten med ryggen mot möbeln (bed från rummet: kantens avstånd, längd och höjd).
// Kontakten med underlaget gör att kroppen hamnar på bordsskivan eller sitsen.
function sitKeys(bed) {
  const sitH = Math.round(bed.top * 100 - 85);
  const back = -Math.round(bed.edge * 100 + (bed.sideways ? 22 : 14));
  return {
    sitH,
    back,
    keys: [
      { tid: 0.5, hojd: -10, h_kna: 25, v_kna: 25, h_ben_framat: 20, v_ben_framat: 20, overkropp_framat: 15, h_arm_framat: -35, v_arm_framat: -35, h_armbage: 15, v_armbage: 15 },
      { tid: 1.1, hojd: sitH, kropp_framat: back, h_ben_framat: 85, v_ben_framat: 85, h_kna: 85, v_kna: 85, overkropp_framat: 5, h_arm_framat: -25, v_arm_framat: -25, h_armbage: 10, v_armbage: 10 },
    ],
  };
}

function offKeys(sitH, back, start = 0) {
  return [
    { tid: start + 0.6, hojd: sitH, kropp_framat: back, volt: 0, snurra: 0, h_ben_framat: 85, v_ben_framat: 85, h_kna: 85, v_kna: 85, overkropp_framat: 10, h_arm_framat: -25, v_arm_framat: -25, h_armbage: 10, v_armbage: 10, huvud_nick: 0 },
    { tid: start + 1.2, hojd: -15, kropp_framat: 0, h_ben_framat: 20, v_ben_framat: 20, h_kna: 30, v_kna: 30, overkropp_framat: 15, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 0, v_armbage: 0 },
    { tid: start + 1.7, hojd: 0, h_ben_framat: 0, v_ben_framat: 0, h_kna: 0, v_kna: 0, overkropp_framat: 0 },
  ];
}

export function sitOnMotion(bed) {
  const { sitH, back, keys } = sitKeys(bed);
  keys.push({ tid: 1.6, h_arm_framat: -15, v_arm_framat: -15, h_kna: 80, v_kna: 80, overkropp_framat: 8 });
  return { beskrivning: `sitter på ${bed.label}`, hela_kroppen: true, hall_kvar: true, nyckelbilder: keys, resa_sig: offKeys(sitH, back) };
}

export function lieOnMotion(bed) {
  const { sitH, back, keys } = sitKeys(bed);
  if (bed.sideways) {
    // Soffan: vänd sig och lägg upp benen, lägg sig sedan längs med den
    keys.push(
      { tid: 1.8, snurra: 90, h_ben_framat: 85, v_ben_framat: 85, h_kna: 60, v_kna: 60, h_arm_framat: -20, v_arm_framat: -20 },
      { tid: 2.5, snurra: 90, volt: -60, h_ben_framat: 60, v_ben_framat: 60, h_kna: 40, v_kna: 40, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 70, v_armbage: 70, huvud_nick: 20 },
      { tid: 3.1, snurra: 90, volt: -88, h_ben_framat: 5, v_ben_framat: 10, h_kna: 15, v_kna: 30, h_armbage: 40, v_armbage: 100, v_arm_framat: 30, huvud_nick: 25, h_fot: -25, v_fot: -25 },
    );
    return { beskrivning: `ligger i ${bed.label}`, hela_kroppen: true, hall_kvar: true, nyckelbilder: keys, resa_sig: [{ tid: 0.6, snurra: 90, volt: -10, hojd: sitH, kropp_framat: back, h_ben_framat: 85, v_ben_framat: 85, h_kna: 60, v_kna: 60, h_armbage: 10, v_armbage: 10, v_arm_framat: 0, huvud_nick: 0 }, ...offKeys(sitH, back, 0.6)] };
  }
  // Bord: luta sig bakåt på armbågarna, glid upp och sträck ut benen (eller låt dem hänga över kanten)
  const long = bed.length >= 1.55;
  const inside = -Math.round(bed.edge * 100 + (long ? 95 : 45));
  keys.push(
    { tid: 1.7, volt: -55, kropp_framat: back - 15, h_ben_framat: 70, v_ben_framat: 70, h_kna: 110, v_kna: 110, h_arm_framat: -20, v_arm_framat: -20, h_armbage: 80, v_armbage: 80, huvud_nick: 20 },
    { tid: 2.4, volt: -90, kropp_framat: Math.round((back + inside) / 2), h_ben_framat: 60, v_ben_framat: 60, h_kna: 110, v_kna: 110, h_arm_framat: 0, v_arm_framat: 0, h_armbage: 30, v_armbage: 30, huvud_nick: 5 },
    { tid: 3.1, volt: -90, kropp_framat: inside, h_ben_framat: long ? 0 : 0, v_ben_framat: long ? 5 : 0, h_kna: long ? 5 : 90, v_kna: long ? 15 : 90, h_arm_utat: 12, v_arm_utat: 12, h_armbage: 15, v_armbage: 15, huvud_nick: 0, h_fot: -25, v_fot: -25 },
  );
  return {
    beskrivning: `ligger på ${bed.label}`,
    hela_kroppen: true,
    hall_kvar: true,
    nyckelbilder: keys,
    resa_sig: [
      { tid: 0.6, volt: -90, kropp_framat: back - 15, h_ben_framat: 70, v_ben_framat: 70, h_kna: 110, v_kna: 110, h_arm_utat: 0, v_arm_utat: 0, h_arm_framat: -20, v_arm_framat: -20, h_armbage: 80, v_armbage: 80 },
      ...offKeys(sitH, back, 0.6),
    ],
  };
}

// ---------------- Sparade rörelser ----------------
const STORE = 'virtual-room-motions';
export function savedMotions() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}
export function saveMotion(name, def) {
  const all = savedMotions();
  all[name] = def;
  try {
    localStorage.setItem(STORE, JSON.stringify(all));
  } catch {
    // Lagringen är full eller blockerad; rörelsen fungerar ändå just nu
  }
}
export function findMotion(name) {
  const key = String(name || '').toLowerCase().trim();
  return savedMotions()[key] || PRESETS[key] || null;
}
// Läsbara namn på de färdiga rörelserna (de interna namnen saknar å, ä och ö)
const TITLES = {
  skaka_pa_huvudet: 'skaka på huvudet',
  handerna_pa_hoften: 'händerna på höfterna',
  tumme_upp: 'tumme upp',
  armarna_i_kors: 'armarna i kors',
  visa_musklerna: 'visa musklerna',
  fridstecken: 'fredstecken',
  sitta_pa_golvet: 'sitta på golvet',
  ligga_pa_rygg: 'ligga på rygg',
  ligga_pa_magen: 'ligga på magen',
  sta_pa_kna: 'stå på knä',
  bakatvolt: 'bakåtvolt',
  sta_pa_handerna: 'stå på händerna',
  rulla_runt: 'rulla runt',
  resa_sig: 'resa sig',
};
export function motionTitle(name) {
  return TITLES[name] || String(name).replace(/_/g, ' ');
}

export function motionNames() {
  return [...new Set([...Object.keys(PRESETS), ...Object.keys(savedMotions())])];
}

// Kontrollera och städa en rörelse från Claude (eller lagringen) innan den spelas
export function cleanMotion(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.nyckelbilder)) return null;
  const keys = [];
  for (const k of input.nyckelbilder.slice(0, 120)) {
    if (!k || typeof k !== 'object') continue;
    const tid = Number(k.tid);
    if (!Number.isFinite(tid) || tid < 0 || tid > 600) continue;
    const key = { tid };
    for (const j of NUMERIC) {
      if (k[j] === undefined) continue;
      const v = Number(k[j]);
      if (!Number.isFinite(v)) continue;
      const lim = ROTATIONS.includes(j) ? 3600 : ['hojd', 'kropp_framat', 'kropp_sidled'].includes(j) ? 300 : j === 'luft' ? 1 : 360;
      key[j] = Math.max(j === 'luft' ? 0 : -lim, Math.min(lim, v));
    }
    for (const side of ['h', 'v']) if (HAND_FORMS.includes(k[`${side}_hand`])) key[`${side}_hand`] = k[`${side}_hand`];
    keys.push(key);
  }
  if (!keys.length) return null;
  keys.sort((a, b) => a.tid - b.tid);
  return {
    beskrivning: String(input.beskrivning || '').slice(0, 120),
    loop: !!input.loop,
    hela_kroppen: !!input.hela_kroppen,
    hall_kvar: !!input.hall_kvar,
    nyckelbilder: keys,
  };
}

// Nyckelbilder där leder som inte nämns behåller sitt värde från förra bilden.
// Rörelsen börjar i den pose personen redan har (from). En helkroppsrörelse beskriver hela posen,
// så leder den inte nämner går mot neutral; en rörelse för bara t.ex. armarna läggs ovanpå posen
// personen redan har (vinka liggande på golvet).
function expand(def, from = {}) {
  const out = [{ ...from, tid: 0 }];
  let prev = def.hela_kroppen ? {} : { ...from };
  for (const k of def.nyckelbilder) {
    const full = { ...prev, ...k };
    out.push(full);
    prev = full;
  }
  if (def.nyckelbilder[0].tid === 0) out.shift();
  return out;
}

const ease = (t) => t * t * (3 - 2 * t);
const slope = (p0, p1, t0, t1) => (t1 > t0 ? (p1 - p0) / (t1 - t0) : 0);
// Lutningen genom en nyckelbild: medelvärde av lutningarna på båda sidor, men 0 vid vändpunkter
// och pauser, så att kurvan aldrig skjuter över det som står i nyckelbilderna
const tangent = (d0, d1) => (d0 * d1 > 0 ? (2 * d0 * d1) / (d0 + d1) : 0);

// Värdena i rörelsen vid tiden t. En mjuk kurva (monoton kubisk Hermite) går genom nyckelbilderna:
// farten ändras jämnt genom varje bild i stället för att stanna upp, som i en riktig rörelse.
export function sampleMotion(frames, t) {
  let i = 0;
  while (i < frames.length - 1 && frames[i + 1].tid <= t) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const z = frames[Math.max(i - 1, 0)];
  const c = frames[Math.min(i + 2, frames.length - 1)];
  const span = b.tid - a.tid;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a.tid) / span)) : 1;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const pose = {};
  for (const j of NUMERIC) {
    const pa = a[j] ?? 0;
    const pb = b[j] ?? 0;
    if (!pa && !pb) continue;
    const d = slope(pa, pb, a.tid, b.tid);
    const ma = z === a ? 0 : tangent(slope(z[j] ?? 0, pa, z.tid, a.tid), d);
    const mb = c === b ? 0 : tangent(d, slope(pb, c[j] ?? 0, b.tid, c.tid));
    pose[j] = h00 * pa + h10 * span * ma + h01 * pb + h11 * span * mb;
  }
  // Handformerna tonas över i fingrarnas böjning (_f0–_f4: tumme till lillfinger)
  const f = ease(u);
  for (const side of ['h', 'v']) {
    const fa = a[`${side}_hand`];
    const fb = b[`${side}_hand`];
    if (!fa && !fb) continue;
    const A = FORMS[fa] || FORMS.oppen;
    const B = FORMS[fb] || FORMS.oppen;
    for (let k = 0; k < 5; k++) pose[`${side}_f${k}`] = A[k] + (B[k] - A[k]) * f;
    pose[`${side}_hand`] = (f < 0.5 ? fa : fb) || fa || fb;
  }
  return pose;
}

// Gör en rörelse redo att spelas på en viss rigg
// prev = rörelsen som pågår just nu; den nya börjar då från dess pose så att övergången blir mjuk
export function prepareMotion(def, rig, prev = null) {
  const from = prev?.pose || {};
  const frames = expand(def, from);
  const duration = frames[frames.length - 1].tid;
  const used = rig.usedBones(def);
  if (prev) for (const b of prev.used) used.add(b);
  const usesHead = def.nyckelbilder.some((k) => Object.keys(k).some((j) => j.startsWith('huvud'))) || !!prev?.usesHead;
  return { def, frames, duration, used, usesHead, wholeBody: !!def.hela_kroppen || !!prev?.wholeBody };
}

// ---------------- Rigg ----------------
// Personens riktningar i modellens grundläge (tittar längs +z)
const RIGHT = new THREE.Vector3(-1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _ax = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _piv = new THREE.Vector3();
const _qF = new THREE.Quaternion();
const _qE = new THREE.Quaternion();
const _eu = new THREE.Euler();
const DEG = Math.PI / 180;

// Underlagets höjd vid (x, z) för en punkt på höjden y: golvet eller en möbel (sätts av spelet)
let support = () => 0;
export function setSupport(fn) {
  support = fn;
}

// Fingrarnas böjning i grader för varje handform: [tumme, pekfinger, långfinger, ringfinger, lillfinger]
const FORMS = {
  oppen: [0, 0, 0, 0, 0],
  knytnave: [40, 85, 90, 90, 90],
  peka: [35, 0, 90, 90, 90],
  tumme_upp: [-10, 90, 95, 95, 95],
  fridstecken: [40, 0, 0, 90, 90],
};

export class MotionRig {
  // nodes: modellens noder efter namn. Anropas när modellen står i neutral pose med roten utan rotation.
  constructor(model, nodes) {
    this.model = model;
    const get = (n) => nodes[n];
    const side = (s) => ({
      clavicle: get(`Bip01_${s}_Clavicle`),
      upper: get(`Bip01_${s}_UpperArm`),
      fore: get(`Bip01_${s}_Forearm`),
      hand: get(`Bip01_${s}_Hand`),
      thigh: get(`Bip01_${s}_Thigh`),
      calf: get(`Bip01_${s}_Calf`),
      foot: get(`Bip01_${s}_Foot`),
      toe: get(`Bip01_${s}_Toe0`),
      fingers: [0, 1, 2, 3, 4].map((f) => [get(`Bip01_${s}_Finger${f}`), get(`Bip01_${s}_Finger${f}1`), get(`Bip01_${s}_Finger${f}2`)].filter(Boolean)),
    });
    this.b = {
      root: get('Bip01'),
      pelvis: get('Bip01_Pelvis'),
      spine: [get('Bip01_Spine'), get('Bip01_Spine1'), get('Bip01_Spine2')].filter(Boolean),
      neck: get('Bip01_Neck'),
      head: get('Bip01_Head'),
      R: side('R'),
      L: side('L'),
    };
    // Hela kroppen vrids i ordningen snurr, lutning framåt/bakåt, lutning åt sidan
    model.rotation.order = 'YXZ';
    model.updateMatrixWorld(true);
    // Neutral lokal rotation och "personens riktningar" uttryckta i varje bens koordinater
    this.neutral = new Map();
    this.invWorld = new Map();
    const all = [this.b.root, this.b.pelvis, ...this.b.spine, this.b.neck, this.b.head];
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      all.push(x.clavicle, x.upper, x.fore, x.hand, x.thigh, x.calf, x.foot, x.toe, ...x.fingers.flat());
    }
    for (const bone of all.filter(Boolean)) {
      this.neutral.set(bone, bone.quaternion.clone());
      this.invWorld.set(bone, bone.getWorldQuaternion(new THREE.Quaternion()).invert());
    }
    // Fingrarnas böjningsaxel: tvärs över handflatan, mätt i neutral pose (handen hänger med handflatan inåt)
    this.fingerAxis = {};
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      const f1 = x.fingers[1]?.[0];
      const f4 = x.fingers[4]?.[0];
      if (f1 && f4 && x.hand) {
        // Axeln går från lillfingret till pekfingret
        const across = f1.getWorldPosition(new THREE.Vector3()).sub(f4.getWorldPosition(new THREE.Vector3())).normalize();
        this.fingerAxis[s] = across;
      }
    }
    // Höftens läge i modellen (vridpunkt för volt, hjulning och rulla) och hur högt fotleden och tårna
    // sitter över golvet när personen står (kroppens "tjocklek" där, för kontakten med golvet)
    this.rootRest = this.b.root?.position.clone();
    // I Biped-skelettet sitter benen på nedersta ryggkotan. Den hör då till "höften", och överkroppen
    // böjs bara med kotorna ovanför, annars skulle benen följa med när man bugar.
    const legBase = this.b.R.thigh?.parent;
    this.hipBone = this.b.spine.includes(legBase) ? legBase : this.b.pelvis;
    this.torso = this.b.spine.filter((b, i) => i > this.b.spine.indexOf(this.hipBone));
    if (!this.torso.length) this.torso = this.b.spine;
    const rootY = model.parent ? model.parent.getWorldPosition(new THREE.Vector3()).y : 0;
    this.hip = model.worldToLocal(this.b.pelvis.getWorldPosition(new THREE.Vector3()));
    this.hip.x = 0;
    this.footR = {};
    this.toeR = {};
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      this.footR[s] = x.foot ? x.foot.getWorldPosition(new THREE.Vector3()).y - rootY : 0.08;
      this.toeR[s] = x.toe ? Math.max(0.015, x.toe.getWorldPosition(new THREE.Vector3()).y - rootY) : 0.02;
    }
  }

  // En personriktning (i neutral pose) uttryckt i världen enligt hur benet `frame` är vridet just nu
  axis(frame, dir) {
    frame.getWorldQuaternion(_q).multiply(this.invWorld.get(frame));
    return _ax.copy(dir).applyQuaternion(_q).normalize();
  }

  rotate(bone, axis, deg) {
    if (!bone || !deg) return;
    bone.parent.getWorldQuaternion(_q2);
    bone.getWorldQuaternion(_q);
    _q.premultiply(_qa.setFromAxisAngle(axis, deg * DEG));
    bone.quaternion.copy(_q2.invert().multiply(_q));
    bone.updateMatrixWorld(true);
  }

  // Vilka ben en rörelse styr (resten följer den vanliga animationen)
  usedBones(def) {
    const used = new Set();
    const keys = new Set(def.nyckelbilder.flatMap((k) => Object.keys(k)));
    const has = (re) => [...keys].some((k) => re.test(k));
    if (has(/^(overkropp|brost)/)) this.b.spine.forEach((b) => used.add(b));
    if (has(/^hoft/)) [this.hipBone, this.torso[0]].forEach((b) => used.add(b));
    if (has(/^huvud/)) [this.b.neck, this.b.head].forEach((b) => used.add(b));
    for (const [p, s] of [['h', 'R'], ['v', 'L']]) {
      const x = this.b[s];
      if (has(new RegExp(`^${p}_(arm|armbage|handled|underarm)`))) [x.upper, x.fore, x.hand].forEach((b) => used.add(b));
      if (has(new RegExp(`^${p}_(hand|fingrar|tumme)$`))) x.fingers.flat().forEach((b) => used.add(b));
      if (def.hela_kroppen || has(new RegExp(`^${p}_(ben|kna)`))) [x.thigh, x.calf].forEach((b) => used.add(b));
    }
    for (const [p, s] of [['h', 'R'], ['v', 'L']]) {
      const x = this.b[s];
      if (has(new RegExp(`^${p}_axel`))) used.add(x.clavicle);
      if (has(new RegExp(`^${p}_fot`))) used.add(x.foot);
      if (has(new RegExp(`^${p}_tar`))) used.add(x.toe);
    }
    // Helkroppsrörelser styr hela skelettet, så att inget av den vanliga animationen ligger kvar
    if (def.hela_kroppen) {
      [this.b.root, this.b.pelvis, ...this.b.spine, this.b.neck, this.b.head].forEach((b) => used.add(b));
      for (const s of ['R', 'L']) {
        const x = this.b[s];
        [x.clavicle, x.upper, x.fore, x.hand, x.thigh, x.calf, x.foot, x.toe].forEach((b) => used.add(b));
      }
    }
    used.delete(undefined);
    return used;
  }

  // Lägg rörelsens pose ovanpå animationen. w = 0..1 (för mjuk in- och uttoning).
  // contact = 0..1: håll kroppen mot golvet och möblerna (helkroppsrörelser)
  apply(pose, used, w, contact = 0) {
    if (w <= 0) return;
    // 1. Tona de använda benen mot neutral pose
    for (const bone of used) bone.quaternion.slerp(this.neutral.get(bone), w);
    if (this.rootRest && used.has(this.b.root)) this.b.root.position.lerp(this.rootRest, w);
    this.model.updateMatrixWorld(true);
    const v = (k) => (pose[k] || 0) * w;
    const { pelvis, spine, neck, head } = this.b;

    // 2. Höften (bäckenet med benen) vrids och överkroppen vrids tillbaka lika mycket, så att bara
    // höfterna och benen rör sig
    const hip = this.hipBone;
    const torso = this.torso;
    if (hip && (pose.hoft_framat || pose.hoft_vrid || pose.hoft_luta)) {
      const frame = hip.parent || hip;
      for (const [dir, val] of [[RIGHT, -v('hoft_framat')], [UP, v('hoft_vrid')], [FWD, -v('hoft_luta')]]) {
        if (!val) continue;
        const ax = this.axis(frame, dir).clone();
        this.rotate(hip, ax, val);
        if (torso[0] && torso[0] !== hip) this.rotate(torso[0], ax, -val);
      }
    }

    // 3. Överkropp (fördelad på ryggkotorna ovanför höften), bröstkorg (översta kotan mest) och huvud
    // (nacke 40 %, huvud 60 %)
    const base = torso[0] || pelvis;
    const torsoR = this.axis(base, RIGHT).clone();
    const torsoU = this.axis(base, UP).clone();
    const torsoF = this.axis(base, FWD).clone();
    torso.forEach((s, i) => {
      const chest = torso.length === 1 ? 1 : i === torso.length - 1 ? 0.65 : 0.35;
      this.rotate(s, torsoR, -(v('overkropp_framat') / torso.length + v('brost_framat') * chest));
      this.rotate(s, torsoU, v('overkropp_vrid') / torso.length + v('brost_vrid') * chest);
      this.rotate(s, torsoF, v('overkropp_luta') / torso.length + v('brost_luta') * chest);
    });
    const top = spine[spine.length - 1] || pelvis;
    for (const [bone, share] of [[neck, 0.4], [head, 0.6]]) {
      if (!bone) continue;
      this.rotate(bone, this.axis(top, RIGHT), -v('huvud_nick') * share);
      this.rotate(bone, this.axis(top, UP), v('huvud_vrid') * share);
      this.rotate(bone, this.axis(top, FWD), v('huvud_luta') * share);
    }

    // 4. Armar och ben, i förhållande till överkroppen respektive bäckenet
    for (const [p, s, sign] of [['h', 'R', -1], ['v', 'L', 1]]) {
      const x = this.b[s];
      if (x.clavicle) {
        this.rotate(x.clavicle, this.axis(top, FWD), sign * v(`${p}_axel`));
        this.rotate(x.clavicle, this.axis(top, UP), -sign * v(`${p}_axel_framat`));
      }
      if (x.upper) {
        this.rotate(x.upper, this.axis(top, FWD), sign * v(`${p}_arm_utat`));
        this.rotate(x.upper, this.axis(top, RIGHT), v(`${p}_arm_framat`));
        const twist = v(`${p}_arm_vrid`);
        if (twist && x.fore) {
          const dir = x.fore.getWorldPosition(_p1).sub(x.upper.getWorldPosition(_p2)).normalize();
          this.rotate(x.upper, dir, sign * twist);
        }
      }
      if (x.fore) this.rotate(x.fore, this.axis(x.upper, RIGHT), v(`${p}_armbage`));
      if (x.hand) {
        const pron = v(`${p}_underarm_vrid`);
        if (pron && x.fore) {
          const dir = x.hand.getWorldPosition(_p1).sub(x.fore.getWorldPosition(_p2)).normalize();
          this.rotate(x.hand, dir, sign * pron);
        }
        this.rotate(x.hand, this.axis(x.fore, RIGHT), v(`${p}_handled`));
        this.rotate(x.hand, this.axis(x.fore, FWD), -sign * v(`${p}_handled_sida`));
      }
      if (x.thigh) {
        this.rotate(x.thigh, this.axis(hip, FWD), sign * v(`${p}_ben_utat`));
        this.rotate(x.thigh, this.axis(hip, RIGHT), v(`${p}_ben_framat`));
        const twist = v(`${p}_ben_vrid`);
        if (twist && x.calf) {
          const dir = x.calf.getWorldPosition(_p1).sub(x.thigh.getWorldPosition(_p2)).normalize();
          this.rotate(x.thigh, dir, sign * twist);
        }
      }
      if (x.calf) this.rotate(x.calf, this.axis(x.thigh, RIGHT), -v(`${p}_kna`));
      if (x.foot) {
        this.rotate(x.foot, this.axis(x.calf, RIGHT), v(`${p}_fot`));
        this.rotate(x.foot, this.axis(x.calf, FWD), -sign * v(`${p}_fot_sida`));
      }
      if (x.toe) this.rotate(x.toe, this.axis(x.foot, RIGHT), v(`${p}_tar`));

      // Fingrar: böj varje led runt axeln tvärs över handflatan (handform plus fingrar/tumme)
      const curls = pose[`${p}_f0`] !== undefined ? [0, 1, 2, 3, 4].map((k) => pose[`${p}_f${k}`]) : FORMS[pose[`${p}_hand`]];
      const extraF = v(`${p}_fingrar`);
      const extraT = v(`${p}_tumme`);
      const across = this.fingerAxis[s];
      if ((curls || extraF || extraT) && across && x.hand) {
        x.fingers.forEach((chain, fi) => {
          const bend = (curls ? curls[fi] : 0) * w + (fi === 0 ? extraT : extraF);
          if (!bend) return;
          for (const bone of chain) {
            const ax = this.axis(x.hand, across).clone();
            this.rotate(bone, ax, (s === 'R' ? 1 : -1) * bend * (fi === 0 ? 0.5 : 1));
          }
        });
      }
    }

    // 5. Hela kroppen. Snurr och lutning sker runt fötterna; volt, hjulning och rulla runt höften.
    // Personen tittar längs +z; höger är -x.
    _pos.set(-v('kropp_sidled') / 100, v('hojd') / 100, v('kropp_framat') / 100);
    _qF.setFromEuler(_eu.set(v('kropp_lutning') * DEG, v('snurra') * DEG, v('kropp_sida') * DEG, 'YXZ'));
    _qE.setFromEuler(_eu.set(v('volt') * DEG, v('rulla') * DEG, v('hjulning') * DEG, 'XZY'));
    _piv.copy(this.hip).multiplyScalar(this.model.scale.x);
    _p1.copy(_piv).applyQuaternion(_qE);
    _pos.add(_piv.sub(_p1).applyQuaternion(_qF));
    this.model.position.copy(_pos);
    this.model.quaternion.copy(_qF).multiply(_qE);

    // 6. Kontakt: ingen del av kroppen får gå igenom golvet eller en möbel, och står, sitter eller
    // ligger personen (inte i luften) dras kroppen ner tills den vilar mot underlaget
    if (contact > 0) this.ground(pose, contact);
  }

  // Punkter på kroppen och ungefär hur tjock kroppen är där (meter)
  contactPoints() {
    if (this._points) return this._points;
    const { pelvis, spine, neck, head } = this.b;
    const pts = [
      [pelvis, 0.11],
      [spine[1], 0.12],
      [spine[spine.length - 1], 0.12],
      [neck, 0.06],
      [head, 0.1, 0.09],
    ];
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      pts.push([x.upper, 0.065], [x.fore, 0.05], [x.hand, 0.035], [x.fingers[2]?.[1], 0.02], [x.thigh, 0.09], [x.calf, 0.06], [x.foot, this.footR[s]], [x.toe, this.toeR[s]]);
    }
    this._points = pts.filter(([b]) => b);
    return this._points;
  }

  ground(pose, contact) {
    this.model.updateMatrixWorld(true);
    let min = Infinity;
    let under = 0;
    for (const [bone, r, up] of this.contactPoints()) {
      bone.getWorldPosition(_p1);
      // Huvudets mitt ligger en bit ovanför huvudbenet (i huvudets egen riktning uppåt)
      if (up) _p1.addScaledVector(this.axis(bone, UP), up);
      const sup = support(_p1.x, _p1.z, _p1.y - r);
      const gap = _p1.y - r - sup;
      if (gap < min) min = gap;
      if (bone === this.b.pelvis) under = sup;
    }
    if (!Number.isFinite(min)) return;
    // I luften: luft = 1, eller tydligt höjd över underlaget under höften (hopp)
    const lift = (pose.hojd || 0) - under * 100;
    const air = Math.max(Math.min(1, Math.max(0, pose.luft || 0)), Math.min(1, Math.max(0, (lift - 10) / 15)));
    const dy = min < 0 ? -min : -min * (1 - air);
    this.model.position.y += dy * contact;
  }

  reset() {
    this.model.position.set(0, 0, 0);
    this.model.rotation.set(0, 0, 0);
    if (this.rootRest && this.b.root) this.b.root.position.copy(this.rootRest);
  }
}

// ---------------- Verktyg för Claude ----------------
const jointProps = Object.fromEntries(
  Object.entries(JOINT_HELP).map(([k, d]) => [k, k.endsWith('_hand') ? { type: 'string', enum: HAND_FORMS, description: d } : { type: 'number', description: d }]),
);

export const MOTION_TOOL = {
  name: 'skapa_rorelse',
  description: `Skapa och utför en egen kroppsrörelse när spelaren ber om något som inte finns bland handlingarna i gor_handling (t.ex. "peka på fönstret", "gör en karatespark", "visa hur stor fisken var", "gör en honnör").
Beskriv rörelsen som nyckelbilder: tid i sekunder från start plus vinklar i grader för de leder som ska röra sig. Alla vinklar utgår från att personen står rakt med armarna hängande längs sidorna (värde 0). Leder som inte anges i en nyckelbild behåller värdet från förra nyckelbilden. En mjuk kurva går genom nyckelbilderna och lederna fjädrar lite, så rörelsen blir följsam av sig själv.
Gör rörelserna MÄNSKLIGA, inte stela:
- Använd många leder samtidigt. En verklig rörelse engagerar hela kroppen: höfterna (hoft_*), bröstkorgen (brost_*), axlarna (axel, axel_framat), huvudet som följer med eller tittar dit handen går, underarmarna (underarm_vrid), handlederna och fingrarna.
- Förberedelse och efterrörelse: böj knäna och dra armarna bakåt innan ett hopp, låt kroppen fjädra och svaja tillbaka efter en landning eller ett kast.
- Asymmetri och överlapp: vänster och höger sida är sällan exakt lika, och delar av kroppen startar och stannar lite efter varandra (huvudet och händerna sist).
- Tätare nyckelbilder (0,15–0,4 s) i snabba partier, glesare i lugna. Upprepa en bild med små skillnader för att hålla en pose levande.
- Vikten: står man på ett ben lutar höften (hoft_luta) och överkroppen åt andra hållet.
Hela kroppen: med hela_kroppen = true styr du hela skelettet fritt (den vanliga animationen stängs av). Kroppen hålls automatiskt mot golvet och möblerna: den sjunker aldrig igenom något och vilar mot underlaget när den sitter, ligger, står på knä eller på händerna, så höjden (hojd) behöver bara vara ungefärlig. Sätt luft = 1 när kroppen ska lämna marken (hopp, volt) och tillbaka till 0 vid landningen. volt, hjulning och rulla vrider kroppen runt höften (kullerbytta, hjul, rulla på golvet, stå på händerna = volt 180 med armarna rakt upp); kropp_lutning och kropp_sida vrider runt fötterna. kropp_framat/kropp_sidled flyttar kroppen; slutar rörelsen stående flyttas personen dit på riktigt.
Sätt hela_kroppen = true så fort benen, höften, höjden eller kroppens lutning används; annars fortsätter benen som vanligt (och rörelsen går att göra sittande).
Sätt hall_kvar = true om personen ska stanna kvar i sista posen (t.ex. ligga kvar på golvet) tills spelaren ber om något annat. Nästa rörelse börjar mjukt från den posen.
Recept: ligga på rygg från sittande på golvet = volt -90 med benen raka. Ligga på mage = volt 90. Sitta på golvet = hojd -86, ben_framat 85 (båda), kna 20, händerna bakom (arm_framat -30). Stå på knä = hojd -48, kna 90 (båda), fot -50, tar 40. Kullerbytta = huk, sedan volt 0→360 under ca 1,4 s medan kropp_framat ökar till ca 120 och kroppen är hopkrupen (kna 130, ben_framat 115, overkropp_framat 60, huvud_nick 60). Färdiga rörelser att utgå från: ${Object.keys(PRESETS).join(', ')}.
Ge rörelsen ett kort namn (små bokstäver, understreck) så sparas den och kan göras igen med spela_rorelse.
Exempel (vinka med höger hand): {"namn":"vinka_glatt","beskrivning":"vinkar glatt","loop":false,"hela_kroppen":false,"nyckelbilder":[{"tid":0.35,"h_arm_utat":145,"h_armbage":30,"h_underarm_vrid":-20,"h_hand":"oppen","huvud_luta":-6,"brost_luta":-4,"h_axel":8},{"tid":0.6,"h_armbage":60,"h_handled":10},{"tid":0.85,"h_armbage":25,"h_handled":-10},{"tid":1.1,"h_armbage":60,"h_handled":10},{"tid":1.35,"h_armbage":28,"h_handled":-5},{"tid":1.7,"h_arm_utat":40,"h_armbage":40,"huvud_luta":0,"brost_luta":0,"h_axel":0}]}`,
  input_schema: {
    type: 'object',
    properties: {
      namn: { type: 'string', description: 'kort namn, t.ex. honnor eller karatespark' },
      beskrivning: { type: 'string', description: 'vad rörelsen föreställer, några ord' },
      loop: { type: 'boolean', description: 'upprepa rörelsen en stund (t.ex. för dans eller jubel)' },
      hela_kroppen: { type: 'boolean', description: 'styr hela kroppen (ben, höjd, lutning); den vanliga animationen stängs av' },
      hall_kvar: { type: 'boolean', description: 'stanna kvar i sista posen tills spelaren ber om något annat' },
      nyckelbilder: {
        type: 'array',
        items: { type: 'object', properties: { tid: { type: 'number' }, ...jointProps }, required: ['tid'] },
      },
    },
    required: ['namn', 'nyckelbilder'],
  },
  eager_input_streaming: true,
};

export const PLAY_MOTION_TOOL = {
  name: 'spela_rorelse',
  description: 'Gör en rörelse som redan finns (färdig eller tidigare skapad med skapa_rorelse). Namnen står i systemprompten.',
  input_schema: {
    type: 'object',
    properties: { namn: { type: 'string' } },
    required: ['namn'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};
