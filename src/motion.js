import * as THREE from 'three';
import { en, L } from './i18n.js';

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
  nacke_nick: 'bara nacken: positivt = böj nacken framåt, negativt = bakåt (huvud_* vrider nacke och huvud tillsammans)',
  nacke_vrid: 'bara nacken: positivt = vrid åt vänster',
  nacke_luta: 'bara nacken: positivt = luta mot höger',
  kake: 'käken: öppna munnen i grader (0 = stängd, 25 = vidöppen)',
  ogon_vrid: 'ögonen: positivt = titta åt vänster (grader, högst ca 30)',
  ogon_nick: 'ögonen: positivt = titta ner, negativt = upp',
  overkropp_framat: 'positivt = böj överkroppen framåt (buga), negativt = luta bakåt',
  overkropp_vrid: 'positivt = vrid överkroppen åt vänster',
  overkropp_luta: 'positivt = luta åt höger',
  landrygg_framat: 'bara ländryggen/magen: positivt = böj framåt, negativt = svanka',
  landrygg_vrid: 'bara ländryggen: positivt = vrid åt vänster',
  landrygg_luta: 'bara ländryggen: positivt = luta åt höger',
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
  h_tumme_in: 'höger tumme: för tummen in över handflatan (positivt) eller ut från handen (negativt)',
  h_pekfinger: 'höger pekfinger: böj (0–90), läggs till handformen och fingrar',
  h_langfinger: 'höger långfinger: böj',
  h_ringfinger: 'höger ringfinger: böj',
  h_lillfinger: 'höger lillfinger: böj',
  h_fingrar_isar: 'höger hand: sprid fingrarna (positivt) eller tryck ihop dem',
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
  v_tumme_in: 'vänster tumme, som höger',
  v_pekfinger: 'vänster pekfinger, som höger',
  v_langfinger: 'vänster långfinger, som höger',
  v_ringfinger: 'vänster ringfinger, som höger',
  v_lillfinger: 'vänster lillfinger, som höger',
  v_fingrar_isar: 'vänster hand, som höger',
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
// Engelska namn och beskrivningar för de färdiga rörelserna
export const PRESETS_EN = {
  peka: ['point', 'points straight ahead with the right hand'],
  tumme_upp: ['thumbs up', 'gives a thumbs up with the right hand'],
  buga: ['bow', 'bows deeply'],
  nicka: ['nod', 'nods in agreement'],
  skaka_pa_huvudet: ['shake head', 'shakes their head'],
  armarna_i_kors: ['arms crossed', 'stands with arms crossed'],
  handerna_pa_hoften: ['hands on hips', 'stands with hands on hips'],
  hoppa: ['jump', 'jumps with both feet, arms up'],
  kullerbytta: ['somersault', 'does a forward somersault'],
  bakatvolt: ['backflip', 'does a backflip in the air'],
  hjula: ['cartwheel', 'does a cartwheel'],
  sta_pa_handerna: ['handstand', 'does a handstand for a while'],
  rulla_runt: ['roll around', 'lies down and rolls around on the floor'],
  snurra: ['spin', 'spins around with arms out'],
  visa_musklerna: ['flex', 'flexes their arm muscles'],
  sitta_pa_golvet: ['sit on the floor', 'sits on the floor with legs forward'],
  ligga_pa_rygg: ['lie on back', 'lies down on their back on the floor'],
  ligga_pa_magen: ['lie on stomach', 'lies down on their stomach on the floor'],
  sta_pa_kna: ['kneel', 'kneels down'],
  resa_sig: ['get up', 'gets up from the floor'],
  fridstecken: ['peace sign', 'makes a peace sign with the right hand'],
};
export function motionTitle(name) {
  if (en && PRESETS_EN[name]) return PRESETS_EN[name][0];
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

// Omvärlden som kroppen ska ta hänsyn till (sätts av spelet):
// support(x, z, y) = underlagets höjd, solids = möbler som lådor {x1,z1,x2,z2,y1,y2},
// walls = rummets väggar {minX, maxX, minZ, maxZ, door: {z1, z2, h}}, bodies(rig) = andra personers kroppar
// som kapslar [{a, b, r}]
const world = { support: () => 0, solids: [], walls: null, bodies: () => [] };
const support = (x, z, y) => world.support(x, z, y);
export function setWorld(w) {
  Object.assign(world, w);
}
export function setSupport(fn) {
  world.support = fn;
}

const _push = new THREE.Vector3();
const _seg = new THREE.Line3();
const _cp = new THREE.Vector3();
// Hur långt och åt vilket håll en punkt (med radien r) måste flyttas för att inte vara inne i något
// prev = var punkten var förra bildrutan. Den knuffas då ut genom den sida den kom in från, så att
// en snabb rörelse inte tar sig igenom till andra sidan av en möbel.
function pushOut(p, r, bodies, out, allowDown = true, prev = null) {
  out.set(0, 0, 0);
  // Möbler: ut genom den närmaste sidan (eller uppåt; nedåt bara under skivor som en bordsskiva)
  let deepest = 0;
  const from = prev && prev.distanceToSquared(p) < 0.25 ? prev : null;
  for (const s of world.solids) {
    if (p.x <= s.x1 - r || p.x >= s.x2 + r || p.z <= s.z1 - r || p.z >= s.z2 + r || p.y <= s.y1 - r || p.y >= s.y2 + r) continue;
    // Sidor som punkten var utanför förra gången (om någon)
    const was = from && {
      x1: from.x <= s.x1 - r + 0.002,
      x2: from.x >= s.x2 + r - 0.002,
      z1: from.z <= s.z1 - r + 0.002,
      z2: from.z >= s.z2 + r - 0.002,
      y1: from.y <= s.y1 - r + 0.002,
      y2: from.y >= s.y2 + r - 0.002,
    };
    const only = was && Object.values(was).some(Boolean) ? was : null;
    let bx = 0;
    let by = 0;
    let bz = 0;
    let best = Infinity;
    const tryExit = (face, x, y, z) => {
      if (only && !only[face]) return;
      const l = Math.abs(x + y + z);
      if (l < best) {
        best = l;
        bx = x;
        by = y;
        bz = z;
      }
    };
    tryExit('x1', s.x1 - r - p.x, 0, 0);
    tryExit('x2', s.x2 + r - p.x, 0, 0);
    tryExit('z1', 0, 0, s.z1 - r - p.z);
    tryExit('z2', 0, 0, s.z2 + r - p.z);
    tryExit('y2', 0, s.y2 + r - p.y, 0);
    if ((allowDown || only?.y1) && s.y1 > 0.05) tryExit('y1', 0, s.y1 - r - p.y, 0);
    if (!Number.isFinite(best)) continue;
    if (best > deepest) {
      deepest = best;
      _push.set(bx, by, bz);
    }
  }
  if (deepest > 0) out.add(_push);
  // Väggar (utom dörröppningen)
  const w = world.walls;
  if (w) {
    const inDoor = p.z > w.door.z1 && p.z < w.door.z2 && p.y < w.door.h;
    if (p.x - r < w.minX && !inDoor) out.x += w.minX + r - p.x;
    if (p.x + r > w.maxX) out.x += w.maxX - r - p.x;
    if (p.z - r < w.minZ) out.z += w.minZ + r - p.z;
    if (p.z + r > w.maxZ) out.z += w.maxZ - r - p.z;
  }
  // Andra personer
  for (const c of bodies) {
    _seg.set(c.a, c.b).closestPointToPoint(p, true, _cp);
    const d = p.distanceTo(_cp);
    const need = c.r + r;
    if (d >= need) continue;
    if (d < 1e-4) _push.set(p.x - (c.a.x + c.b.x) / 2, 0, p.z - (c.a.z + c.b.z) / 2);
    else _push.copy(p).sub(_cp);
    if (_push.lengthSq() < 1e-8) _push.set(1, 0, 0);
    out.addScaledVector(_push.normalize(), need - d);
  }
  return out;
}

// Fingrarnas böjning i grader för varje handform: [tumme, pekfinger, långfinger, ringfinger, lillfinger]
const FINGER_NAMES = ['pekfinger', 'langfinger', 'ringfinger', 'lillfinger'];
// Hur mycket varje finger sprids (tumme, pek, lång, ring, lill)
const SPREAD = [0, 1, 0.3, -0.4, -1];
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
    this.prev = new Map();
    // Underbenen, som får vridas ut ur möbler även när en vanlig animation styr (t.ex. fötter under en stol)
    this.calves = new Set([this.b.R.calf, this.b.L.calf].filter(Boolean));
    this.fingerAxis = {};
    this.handDir = {};
    this.palmNormal = {};
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      const f1 = x.fingers[1]?.[0];
      const f4 = x.fingers[4]?.[0];
      if (f1 && f4 && x.hand) {
        // Axeln går från lillfingret till pekfingret
        const across = f1.getWorldPosition(new THREE.Vector3()).sub(f4.getWorldPosition(new THREE.Vector3())).normalize();
        this.fingerAxis[s] = across;
        // Handens längdriktning och handflatans normal (mätt i neutral pose)
        this.handDir[s] = x.fingers[2][0].getWorldPosition(new THREE.Vector3()).sub(x.hand.getWorldPosition(new THREE.Vector3())).normalize();
        this.palmNormal[s] = new THREE.Vector3().crossVectors(across, this.handDir[s]).normalize();
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
    if (has(/^(huvud|nacke)/)) [this.b.neck, this.b.head].forEach((b) => used.add(b));
    if (has(/^landrygg/)) this.torso.forEach((b) => used.add(b));
    for (const [p, s] of [['h', 'R'], ['v', 'L']]) {
      const x = this.b[s];
      if (has(new RegExp(`^${p}_(arm|armbage|handled|underarm)`))) [x.upper, x.fore, x.hand].forEach((b) => used.add(b));
      if (has(new RegExp(`^${p}_(hand|fingrar|tumme|tumme_in|pekfinger|langfinger|ringfinger|lillfinger|fingrar_isar)$`))) x.fingers.flat().forEach((b) => used.add(b));
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
    if (torso[0] && (pose.landrygg_framat || pose.landrygg_vrid || pose.landrygg_luta)) {
      this.rotate(torso[0], torsoR, -v('landrygg_framat'));
      this.rotate(torso[0], torsoU, v('landrygg_vrid'));
      this.rotate(torso[0], torsoF, v('landrygg_luta'));
    }
    const top = spine[spine.length - 1] || pelvis;
    if (neck && (pose.nacke_nick || pose.nacke_vrid || pose.nacke_luta)) {
      this.rotate(neck, this.axis(top, RIGHT), -v('nacke_nick'));
      this.rotate(neck, this.axis(top, UP), v('nacke_vrid'));
      this.rotate(neck, this.axis(top, FWD), v('nacke_luta'));
    }
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
      const extra = [v(`${p}_tumme`), ...FINGER_NAMES.map((n) => extraF + v(`${p}_${n}`))];
      const spread = v(`${p}_fingrar_isar`);
      const thumbIn = v(`${p}_tumme_in`);
      const across = this.fingerAxis[s];
      if ((curls || extra.some(Boolean) || spread || thumbIn) && across && x.hand) {
        const side = s === 'R' ? 1 : -1;
        x.fingers.forEach((chain, fi) => {
          if (!chain.length) return;
          // Sprida fingrarna: runt handflatans normal (pekfingret mot tummen, lillfingret bort)
          if (spread && fi > 0) this.rotate(chain[0], this.axis(x.hand, this.palmNormal[s]).clone(), -spread * SPREAD[fi]);
          if (thumbIn && fi === 0) this.rotate(chain[0], this.axis(x.hand, this.handDir[s]).clone(), -side * thumbIn);
          const bend = (curls ? curls[fi] : 0) * w + extra[fi];
          if (!bend) return;
          for (const bone of chain) {
            const ax = this.axis(x.hand, across).clone();
            this.rotate(bone, ax, side * bend * (fi === 0 ? 0.5 : 1));
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
    const bodies = world.bodies(this);
    if (contact > 0) {
      this.ground(pose, contact);
      this.pushBody(contact, bodies);
    }
    // 7. Armar och ben som ändå går in i något vrids ut i sina leder
    this.fixLimbs(bodies, used);
    // Kom ihåg var kroppsdelarna är, till nästa bildruta
    for (const [bone, , up] of this.contactPoints()) {
      if (!this.prev.has(bone)) this.prev.set(bone, new THREE.Vector3());
      this.pointOf(bone, up, this.prev.get(bone));
    }
  }

  // Flytta hela kroppen ut ur möbler, väggar och andra personer. Knuffen i sidled sparas till nästa
  // bildruta och släpps långsamt, så att en rörelse som vill fortsätta in i en möbel (en kullerbytta mot
  // soffan) stannar framför den i stället för att till slut tryckas igenom till andra sidan.
  pushBody(contact, bodies) {
    const carry = (this.carry ||= new THREE.Vector3());
    carry.multiplyScalar(0.92);
    if (carry.lengthSq() > 1e-8) {
      this.model.position.addScaledVector(carry, contact);
      this.model.updateMatrixWorld(true);
    }
    const total = _pos;
    for (let iter = 0; iter < 5; iter++) {
      let px = 0;
      let nx = 0;
      let py = 0;
      let ny = 0;
      let pz = 0;
      let nz = 0;
      for (const [bone, r, up] of this.contactPoints()) {
        this.pointOf(bone, up, _p1);
        // Hela kroppen knuffas uppåt eller åt sidan, aldrig ner under en bordsskiva
        pushOut(_p1, r, bodies, _p2, false, this.prev.get(bone));
        px = Math.max(px, _p2.x);
        nx = Math.min(nx, _p2.x);
        py = Math.max(py, _p2.y);
        ny = Math.min(ny, _p2.y);
        pz = Math.max(pz, _p2.z);
        nz = Math.min(nz, _p2.z);
      }
      // Kläms kroppen från båda håll vinner det största
      total.set(px > -nx ? px : nx, py > -ny ? py : ny, pz > -nz ? pz : nz);
      if (total.lengthSq() < 1e-6) break;
      // Förflyttningen räknas i rotens koordinater (roten är bara vriden runt y)
      this.model.parent.getWorldQuaternion(_q).invert();
      total.applyQuaternion(_q);
      this.model.position.addScaledVector(total, contact);
      carry.x += total.x;
      carry.z += total.z;
      this.model.updateMatrixWorld(true);
    }
  }

  // Luta överkroppen bakåt (grader) runt höften, t.ex. mot en stolsrygg; nacken tar tillbaka en del så att
  // blicken stannar kvar
  leanBack(deg) {
    const base = this.torso[0];
    if (!base || Math.abs(deg) < 0.05) return;
    this.rotate(base, this.axis(base, RIGHT).clone(), deg);
    if (this.b.neck) this.rotate(this.b.neck, this.axis(this.b.neck, RIGHT).clone(), -deg * 0.5);
  }

  // Hur djupt någon del av kroppen är inne i något just nu (meter), för felsökning och tester
  maxPenetration() {
    const bodies = world.bodies(this);
    let worst = 0;
    let who = '';
    for (const [bone, r, up] of this.contactPoints()) {
      this.pointOf(bone, up, _p1);
      const d = pushOut(_p1, r - 0.01, bodies, _p2).length();
      if (d > worst) {
        worst = d;
        who = bone.name;
      }
    }
    return { depth: worst, part: who };
  }

  pointOf(bone, up, out) {
    bone.getWorldPosition(out);
    if (up) out.addScaledVector(this.axis(bone, UP), up);
    return out;
  }

  // Leder och de punkter de styr: överarmen flyttar armbågen, underarmen handen, låret knät osv.
  limbChains() {
    if (this._chains) return this._chains;
    const r = new Map(this.contactPoints().map(([b, rad]) => [b, rad]));
    this._chains = [];
    for (const s of ['R', 'L']) {
      const x = this.b[s];
      const finger = x.fingers[2]?.[1];
      this._chains.push([x.upper, [x.fore]], [x.fore, [x.hand, finger]], [x.thigh, [x.calf]], [x.calf, [x.foot, x.toe]]);
      for (const leg of [x.thigh, x.calf]) if (leg) leg.isLeg = true;
    }
    this._chains = this._chains.filter(([j]) => j).map(([j, pts]) => [j, pts.filter(Boolean).map((b) => [b, r.get(b) ?? 0.03])]);
    return this._chains;
  }

  // Armarna rättas alltid; benen bara om rörelsen styr dem (annars skulle t.ex. knäna hos den som
  // sitter i soffan knuffas av sitsen)
  fixLimbs(bodies, used) {
    if (!world.solids.length && !bodies.length) return;
    for (const [joint, pts] of this.limbChains()) {
      if (!used.has(joint) && joint.isLeg) continue;
      for (let iter = 0; iter < 2; iter++) {
        let best = 0;
        let hit = null;
        for (const [bone, rad] of pts) {
          bone.getWorldPosition(_p1);
          pushOut(_p1, rad, bodies, _p2, true, this.prev.get(bone));
          // Golvet
          const floor = support(_p1.x, _p1.z, _p1.y - rad);
          if (_p1.y - rad < floor - 0.002) _p2.y = Math.max(_p2.y, floor + rad - _p1.y);
          const l = _p2.length();
          if (l > best) {
            best = l;
            hit = bone;
            _push.copy(_p2);
            _cp.copy(_p1);
          }
        }
        if (best < 0.004) break;
        // Vrid leden så att punkten följer knuffen (rotationsaxel = hävarm × knuff)
        joint.getWorldPosition(_p2);
        const arm = _cp.sub(_p2);
        const axis = _p1.crossVectors(arm, _push);
        const len = axis.length();
        if (len < 1e-6 || !hit) break;
        const angle = Math.min(joint.isLeg ? 0.25 : 0.4, ((best * best) / len) * 1.1);
        this.rotate(joint, axis.divideScalar(len), angle / DEG);
      }
    }
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
    this.carry?.set(0, 0, 0);
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
  description: L(
    `Skapa och utför en egen kroppsrörelse när spelaren ber om något som inte finns bland handlingarna i gor_handling (t.ex. "peka på fönstret", "gör en karatespark", "visa hur stor fisken var", "gör en honnör").
Beskriv rörelsen som nyckelbilder: tid i sekunder från start plus vinklar i grader för de leder som ska röra sig. Alla vinklar utgår från att personen står rakt med armarna hängande längs sidorna (värde 0). Leder som inte anges i en nyckelbild behåller värdet från förra nyckelbilden. En mjuk kurva går genom nyckelbilderna och lederna fjädrar lite, så rörelsen blir följsam av sig själv.
Gör rörelserna MÄNSKLIGA, inte stela:
- Använd många leder samtidigt. En verklig rörelse engagerar hela kroppen: höfterna (hoft_*), ländryggen (landrygg_*), bröstkorgen (brost_*), axlarna (axel, axel_framat), nacken (nacke_*) och huvudet som följer med eller tittar dit handen går, ögonen (ogon_*), käken (kake), underarmarna (underarm_vrid), handlederna, varje finger för sig (pekfinger, langfinger, ringfinger, lillfinger, tumme, tumme_in, fingrar_isar), fotlederna och tårna.
- Kroppen kan inte gå igenom möbler, väggar eller andra personer: en hand som trycks mot bordet stannar på bordsskivan, och den som rullar mot soffan stannar mot den.
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
    `Create and perform your own body movement when the player asks for something that is not among the actions in gor_handling (e.g. "point at the window", "do a karate kick", "show how big the fish was", "salute").
Describe the movement as keyframes (nyckelbilder): time in seconds from the start (tid) plus angles in degrees for the joints that should move. All angles are relative to standing straight with the arms hanging along the sides (value 0). Joints not given in a keyframe keep the value from the previous keyframe. A smooth curve runs through the keyframes and the joints spring a little, so the movement flows by itself. Parameter and joint names are Swedish identifiers – use them exactly (h_ = right side, v_ = left side).
Make movements HUMAN, not stiff:
- Use many joints at once. A real movement engages the whole body: the hips (hoft_*), lower back (landrygg_*), chest (brost_*), shoulders (axel, axel_framat), neck (nacke_*) and the head that follows or looks where the hand goes, the eyes (ogon_*), the jaw (kake), forearms (underarm_vrid), wrists, each finger separately (pekfinger = index, langfinger = middle, ringfinger = ring, lillfinger = little, tumme = thumb, tumme_in, fingrar_isar = spread), the ankles and the toes.
- The body cannot pass through furniture, walls or other people: a hand pressed against the table stops on the table top, and someone rolling towards the sofa stops against it.
- Anticipation and follow-through: bend the knees and pull the arms back before a jump, let the body spring and sway back after a landing or a throw.
- Asymmetry and overlap: left and right are rarely exactly the same, and body parts start and stop slightly after one another (the head and hands last).
- Denser keyframes (0.15–0.4 s) in fast parts, sparser in calm ones. Repeat a frame with small differences to keep a pose alive.
- Weight: standing on one leg tilts the hip (hoft_luta) and the upper body the other way.
Whole body: with hela_kroppen = true you control the whole skeleton freely (the normal animation is switched off). The body is automatically kept against the floor and furniture: it never sinks through anything and rests on the surface when sitting, lying, kneeling or on the hands, so the height (hojd) only needs to be approximate. Set luft = 1 when the body should leave the ground (jump, flip) and back to 0 on landing. volt, hjulning and rulla rotate the body around the hips (somersault, cartwheel, rolling on the floor, handstand = volt 180 with arms straight up); kropp_lutning and kropp_sida rotate around the feet. kropp_framat/kropp_sidled move the body; if the movement ends standing, the person is actually moved there.
Set hela_kroppen = true as soon as the legs, hips, height or the body's tilt are used; otherwise the legs carry on as usual (and the movement can be done seated).
Set hall_kvar = true if the person should stay in the last pose (e.g. stay lying on the floor) until the player asks for something else. The next movement starts smoothly from that pose.
Recipes: lying on the back from sitting on the floor = volt -90 with straight legs. Lying on the stomach = volt 90. Sitting on the floor = hojd -86, ben_framat 85 (both), kna 20, hands behind (arm_framat -30). Kneeling = hojd -48, kna 90 (both), fot -50, tar 40. Somersault = crouch, then volt 0→360 over about 1.4 s while kropp_framat increases to about 120 and the body is tucked (kna 130, ben_framat 115, overkropp_framat 60, huvud_nick 60). Ready-made movements to start from: ${Object.keys(PRESETS).join(', ')}.
Give the movement a short name (namn: lower case, underscores) and it is saved and can be done again with spela_rorelse. Write beskrivning in English.
Example (wave with the right hand): {"namn":"happy_wave","beskrivning":"waves happily","loop":false,"hela_kroppen":false,"nyckelbilder":[{"tid":0.35,"h_arm_utat":145,"h_armbage":30,"h_underarm_vrid":-20,"h_hand":"oppen","huvud_luta":-6,"brost_luta":-4,"h_axel":8},{"tid":0.6,"h_armbage":60,"h_handled":10},{"tid":0.85,"h_armbage":25,"h_handled":-10},{"tid":1.1,"h_armbage":60,"h_handled":10},{"tid":1.35,"h_armbage":28,"h_handled":-5},{"tid":1.7,"h_arm_utat":40,"h_armbage":40,"huvud_luta":0,"brost_luta":0,"h_axel":0}]}`,
  ),
  input_schema: {
    type: 'object',
    properties: {
      namn: { type: 'string', description: L('kort namn, t.ex. honnor eller karatespark', 'short name, e.g. salute or karate_kick') },
      beskrivning: { type: 'string', description: L('vad rörelsen föreställer, några ord', 'what the movement shows, a few words') },
      loop: { type: 'boolean', description: L('upprepa rörelsen en stund (t.ex. för dans eller jubel)', 'repeat the movement for a while (e.g. for dancing or cheering)') },
      hela_kroppen: { type: 'boolean', description: L('styr hela kroppen (ben, höjd, lutning); den vanliga animationen stängs av', 'control the whole body (legs, height, tilt); the normal animation is switched off') },
      hall_kvar: { type: 'boolean', description: L('stanna kvar i sista posen tills spelaren ber om något annat', 'stay in the last pose until the player asks for something else') },
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
  description: L('Gör en rörelse som redan finns (färdig eller tidigare skapad med skapa_rorelse). Namnen står i systemprompten.', 'Perform a movement that already exists (ready-made or created earlier with skapa_rorelse). The names are listed in the system messages.'),
  input_schema: {
    type: 'object',
    properties: { namn: { type: 'string' } },
    required: ['namn'],
    additionalProperties: false,
  },
  strict: true,
  eager_input_streaming: true,
};
