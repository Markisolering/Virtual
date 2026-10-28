import * as THREE from 'three';

// Bakar hudtexturer för det skannade huvudet direkt på grafikkortet. Huvudet ritas "utvikt" i sin
// UV-karta, och för varje punkt på huden räknas färg, höjd (porer, rynkor, hårstrån) och glans fram
// utifrån var punkten sitter i ansiktet. Två texturer kommer ut:
//   albedo: hudens färg (sRGB)
//   normal: RG = ytans lutning (normalkarta i tangentrummet, räknad ur höjden), B = grovhet,
//           A = hur mycket ljuset sprids under ytan (hud 1, tyg 0)
// Allt varierar med personens utseende (look): hudton, rodnad, fräknar, skäggstubb, hårfärg, ålder.

const SKIN_TONES = [
  // [sRGB, sannolikhet] – från ljus nordisk hud till mörk
  ['#e8c4b0', 3],
  ['#e0b49a', 3],
  ['#d4a383', 2],
  ['#c18a68', 1.4],
  ['#a86f4f', 1],
  ['#8a5638', 0.8],
  ['#6b3f27', 0.7],
  ['#4e2c1c', 0.5],
];
const HAIR = ['#1c1410', '#2b1d14', '#3b2a1e', '#5a3f2a', '#7a5a3a', '#9c7a52', '#b89a6e', '#6e6862', '#a9a39c'];
const IRIS = [
  ['#5f7f9c', '#8c7b4e'], // blå
  ['#7d98ae', '#a08a55'], // ljusblå
  ['#6b7f5a', '#8a6a35'], // grön
  ['#6a5a3a', '#4a3018'], // nötbrun
  ['#6a4426', '#3a2210'], // brun
  ['#4a2c16', '#2a170c'], // mörkbrun
  ['#7a8790', '#6f6040'], // grå
];

function pick(rnd, list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * total;
  for (const [v, w] of list) if ((x -= w) <= 0) return v;
  return list[0][0];
}

// Slumpa ett utseende (samma frö ger samma person)
export function randomLook(rnd) {
  const skin = pick(rnd, SKIN_TONES);
  const skinIndex = SKIN_TONES.findIndex(([c]) => c === skin);
  const dark = skinIndex / (SKIN_TONES.length - 1);
  const hair = dark > 0.35 ? HAIR[Math.floor(rnd() * 2)] : HAIR[Math.floor(rnd() * HAIR.length)];
  const iris = dark > 0.35 ? IRIS[3 + Math.floor(rnd() * 3)] : IRIS[Math.floor(rnd() * IRIS.length)];
  const c = new THREE.Color(skin);
  return {
    skin,
    skinLinear: c.clone(),
    dark,
    hair,
    iris,
    pupil: 0.3 + rnd() * 0.08,
    teeth: ['#eee6d6', '#e8dcc4', '#f2ece0', '#e2d4b8'][Math.floor(rnd() * 4)],
    stubble: rnd() < 0.6 ? 0.3 + rnd() * 0.7 : 0, // skäggstubb
    freckles: dark < 0.3 && rnd() < 0.45 ? rnd() : rnd() * 0.15,
    blush: 0.3 + rnd() * 0.6, // rodnad på kinder och näsa
    age: rnd(), // 0 ung, 1 äldre: djupare rynkor
    hairline: rnd() * 0.6, // hur långt bak hårfästet sitter
    brows: 0.7 + rnd() * 0.5,
    seed: rnd() * 100,
    buzz: rnd(),
    shirt: ['#1d1e22', '#2b3440', '#3c3a36', '#5a1f24', '#e8e4dc', '#4a5a48', '#20314f'][Math.floor(rnd() * 7)],
  };
}

const BAKE_VERT = /* glsl */ `
attribute float region;
varying vec3 vPos;
varying vec3 vNor;
varying vec2 vUv;
varying float vRegion;
void main() {
  vPos = position / 0.01;
  vNor = normal;
  vUv = uv;
  vRegion = region;
  gl_Position = vec4( uv.x - 1.0, uv.y * 2.0 - 1.0, 0.0, 1.0 );
}`;

const BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vPos;
varying vec3 vNor;
varying vec2 vUv;
varying float vRegion;
uniform int mode; // 0 färg, 1 detaljer, 2 felsökning (rutnät)
uniform vec3 skin;
uniform vec3 hair;
uniform float dark;
uniform float stubble;
uniform float freckles;
uniform float blush;
uniform float age;
uniform float hairline;
uniform float brows;
uniform float seed;
uniform float buzz;
uniform vec3 shirt;

float hash1( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
vec3 hash3( vec3 p ) {
  p = vec3( dot( p, vec3( 127.1, 311.7, 74.7 ) ), dot( p, vec3( 269.5, 183.3, 246.1 ) ), dot( p, vec3( 113.5, 271.9, 124.6 ) ) );
  return fract( sin( p ) * 43758.5453123 );
}
float noise( vec3 x ) {
  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( hash1( i ), hash1( i + vec3( 1, 0, 0 ) ), f.x ), mix( hash1( i + vec3( 0, 1, 0 ) ), hash1( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( hash1( i + vec3( 0, 0, 1 ) ), hash1( i + vec3( 1, 0, 1 ) ), f.x ), mix( hash1( i + vec3( 0, 1, 1 ) ), hash1( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float fbm( vec3 p ) { float s = 0.0; float a = 0.5; for ( int i = 0; i < 5; i ++ ) { s += a * noise( p ); p = p * 2.02 + 1.7; a *= 0.5; } return s; }
// Avstånd till närmaste slumpade punkt (cellbrus): porer och prickar
vec2 worley( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p );
  float d1 = 9.0; float id = 0.0;
  for ( int z = -1; z <= 1; z ++ ) for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec3 g = vec3( x, y, z );
    vec3 o = hash3( i + g + seed );
    float d = length( g + o - f );
    if ( d < d1 ) { d1 = d; id = hash1( i + g + seed * 3.1 ); }
  }
  return vec2( d1, id );
}
float blob( vec2 q, vec2 c, vec2 r ) { vec2 d = ( q - c ) / r; return exp( - dot( d, d ) ); }
float band( float x, float a, float b, float soft ) { return smoothstep( a - soft, a + soft, x ) * ( 1.0 - smoothstep( b - soft, b + soft, x ) ); }
float segDist( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a; vec2 ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ); }

// ---- Ansiktets landmärken i UV (ansiktsdelen, u och v 0..1) ----
const vec2 EYE_R = vec2( 0.347, 0.721 ); // personens högra öga (vänster i bilden)
const vec2 EYE_L = vec2( 0.653, 0.721 );
const vec2 NOSE = vec2( 0.5, 0.57 );
const vec2 MOUTH = vec2( 0.5, 0.434 );

// Läpparnas röda del (vermilion) med amorbåge
float lipMask( vec2 q ) {
  float x = ( q.x - MOUTH.x ) / 0.072;
  if ( abs( x ) > 1.2 ) return 0.0;
  float w = max( 0.0, 1.0 - x * x );
  float top = 0.443 + 0.026 * pow( w, 0.6 ) - 0.006 * exp( - x * x * 60.0 ) + 0.004 * exp( - pow( abs( x ) - 0.2, 2.0 ) * 80.0 );
  float bottom = 0.425 - 0.034 * pow( w, 0.55 );
  float soft = 0.0025;
  return smoothstep( bottom - soft, bottom + soft, q.y ) * ( 1.0 - smoothstep( top - soft, top + soft, q.y ) ) * smoothstep( 1.08, 0.9, abs( x ) );
}

// Ögonbryn: tätheten (0..1) och strånas riktning
float browDensity( vec2 q, out vec2 dir ) {
  float side = q.x < 0.5 ? -1.0 : 1.0;
  float x = abs( q.x - 0.5 ); // 0 vid näsroten
  // Längs brynet: inre ände x 0.06, topp x 0.15, yttre ände x 0.23
  float t = clamp( ( x - 0.055 ) / 0.18, 0.0, 1.0 );
  float center = 0.775 + 0.022 * sin( t * 2.6 ) - 0.012 * t;
  float thick = mix( 0.016, 0.006, t * t ) * brows;
  float d = abs( q.y - center ) / thick;
  float along = smoothstep( 0.045, 0.07, x ) * ( 1.0 - smoothstep( 0.215, 0.245, x ) );
  dir = normalize( vec2( side * mix( 0.35, 1.0, smoothstep( 0.0, 0.35, t ) ), mix( 0.9, -0.15, t ) ) );
  return along * smoothstep( 1.0, 0.45, d );
}

// Strån i ett fält av celler: täckning (0..1) för hår som växer i riktningen dir
float strands( vec2 q, vec2 dir, float scale, float len, float width, float density ) {
  vec2 p = q * scale;
  vec2 i = floor( p );
  float cover = 0.0;
  for ( int y = -2; y <= 2; y ++ ) for ( int x = -2; x <= 2; x ++ ) {
    vec2 c = i + vec2( x, y );
    vec3 h = hash3( vec3( c, seed ) );
    if ( h.z > density ) continue;
    vec2 root = c + h.xy;
    vec2 d = normalize( dir + ( h.yx - 0.5 ) * 0.5 );
    float l = len * ( 0.6 + 0.6 * h.x );
    float s = segDist( p, root, root + d * l );
    cover = max( cover, smoothstep( width, width * 0.3, s ) );
  }
  return cover;
}

// Hårfästets höjd (cm) runt huvudet: vinkeln 0 rakt fram, pi rakt bak.
// Panna, tinningar, polisonger framför örat, bågen över örat och nacken.
float hairlineAt( float a ) {
  float y = 10.6;
  y = mix( y, 9.9, smoothstep( 0.2, 0.6, a ) );
  y = mix( y, 8.6, smoothstep( 0.6, 0.95, a ) );
  y = mix( y, 1.6, smoothstep( 1.08, 1.2, a ) ); // polisongen framför örat
  y = mix( y, 6.6, smoothstep( 1.27, 1.36, a ) ); // bågen över örat
  y = mix( y, 2.5, smoothstep( 1.8, 2.0, a ) );
  y = mix( y, -4.5, smoothstep( 1.95, 2.6, a ) ); // nacken
  return y;
}

void main() {
  vec3 p = vPos;
  bool face = vUv.x < 1.0;
  vec2 q = face ? vUv : vec2( -1.0 );

  if ( mode == 2 ) {
    // Felsökning: rutnät i UV (var 0,05) och centimeter
    vec2 g = abs( fract( vUv * 20.0 + 0.5 ) - 0.5 );
    vec2 G = abs( fract( vUv * 10.0 + 0.5 ) - 0.5 );
    vec3 c = vec3( 0.7 );
    if ( min( g.x, g.y ) < 0.04 ) c = vec3( 0.3, 0.6, 0.9 );
    if ( G.x < 0.03 ) c = vec3( 1.0, 0.2, 0.2 );
    if ( G.y < 0.03 ) c = vec3( 0.2, 0.9, 0.2 );
    gl_FragColor = vec4( c, 1.0 );
    return;
  }

  // ---- Områden ----
  float eyes = blob( q, EYE_R, vec2( 0.06, 0.04 ) ) + blob( q, EYE_L, vec2( 0.06, 0.04 ) );
  float underEye = blob( q, EYE_R + vec2( 0.0, -0.035 ), vec2( 0.05, 0.018 ) ) + blob( q, EYE_L + vec2( 0.0, -0.035 ), vec2( 0.05, 0.018 ) );
  float lids = blob( q, EYE_R + vec2( 0.0, 0.018 ), vec2( 0.045, 0.014 ) ) + blob( q, EYE_L + vec2( 0.0, 0.018 ), vec2( 0.045, 0.014 ) );
  float cheeks = blob( q, vec2( 0.3, 0.6 ), vec2( 0.09, 0.08 ) ) + blob( q, vec2( 0.7, 0.6 ), vec2( 0.09, 0.08 ) );
  float noseTip = blob( q, NOSE, vec2( 0.05, 0.04 ) );
  float noseAll = blob( q, vec2( 0.5, 0.61 ), vec2( 0.05, 0.08 ) );
  float forehead = blob( q, vec2( 0.5, 0.86 ), vec2( 0.2, 0.08 ) );
  float chin = blob( q, vec2( 0.5, 0.32 ), vec2( 0.08, 0.05 ) );
  float ears = blob( q, vec2( 0.06, 0.55 ), vec2( 0.07, 0.13 ) ) + blob( q, vec2( 0.94, 0.55 ), vec2( 0.07, 0.13 ) );
  float lip = lipMask( q );
  float mouthAround = blob( q, MOUTH, vec2( 0.1, 0.05 ) );
  // Skäggets område: överläpp, haka, käke och kinderna nedtill (inte läpparna)
  float beard = face ? smoothstep( 0.5, 0.46, q.y ) * smoothstep( 0.12, 0.2, q.y ) * smoothstep( 0.17, 0.27, q.x ) * smoothstep( 0.83, 0.73, q.x ) : 0.0;
  beard = max( beard, face ? smoothstep( 0.6, 0.5, q.y ) * smoothstep( 0.16, 0.24, abs( q.x - 0.5 ) ) * smoothstep( 0.36, 0.3, abs( q.x - 0.5 ) ) : 0.0 );
  beard *= 1.0 - smoothstep( 0.2, 0.9, lip + blob( q, MOUTH, vec2( 0.06, 0.016 ) ) );
  beard *= 1.0 - noseAll;
  // Hårbotten: ovanför ett hårfäste som går runt huvudet (i centimeter)
  float theta = atan( p.x, p.z + 1.0 );
  float at = abs( theta );
  float hl = hairlineAt( at ) + hairline * 1.6 * smoothstep( 1.2, 0.3, at );
  hl += ( fbm( p * 1.3 ) - 0.5 ) * 0.7;
  // Öronen (inget hår på och precis runt dem)
  float earDist = length( vec2( p.y - 1.8, p.z + 0.2 ) );
  float earZone = smoothstep( 6.8, 7.4, abs( p.x ) ) * smoothstep( 4.0, 3.2, earDist );
  // Mjukt hårfäste: glesare strån närmast kanten, med små oregelbundenheter
  float edge = ( p.y - hl ) + ( noise( p * 6.0 ) - 0.5 ) * 0.5;
  float scalp = smoothstep( -0.9, 1.1, edge ) * ( 1.0 - earZone );
  scalp *= mix( step( hash1( floor( p * 9.0 ) ), smoothstep( -0.9, 0.9, edge ) ), 1.0, smoothstep( 0.2, 1.4, edge ) );
  scalp = clamp( scalp, 0.0, 1.0 );
  // Inne i munnen och ögonhålorna
  float mouthInside = vRegion > 0.5 && vRegion < 1.5 ? 1.0 : 0.0;
  float eyeSocket = vRegion > 1.5 ? 1.0 : 0.0;

  // ---- Höjd: porer, rynkor, strån ----
  vec2 pore = worley( p * mix( 13.0, 9.0, noseTip + chin * 0.5 ) );
  float poreDepth = ( 0.55 + 0.6 * noseTip + 0.4 * cheeks ) * ( 1.0 - lip ) * ( 1.0 - lids * 0.7 );
  float h = 0.55 - smoothstep( 0.32, 0.0, pore.x ) * 0.16 * poreDepth;
  h += ( noise( p * 45.0 ) - 0.5 ) * 0.05 + ( noise( p * 12.0 ) - 0.5 ) * 0.04;
  // Fina linjer i huden som korsar varandra
  float cross1 = abs( sin( dot( p, vec3( 9.0, 6.5, 2.0 ) ) * 6.0 + noise( p * 4.0 ) * 4.0 ) );
  float cross2 = abs( sin( dot( p, vec3( -7.0, 8.0, 3.0 ) ) * 6.0 + noise( p * 4.0 + 5.0 ) * 4.0 ) );
  h -= ( smoothstep( 0.12, 0.0, cross1 ) + smoothstep( 0.12, 0.0, cross2 ) ) * 0.007 * ( 1.0 - lip );
  float wr = 0.4 + age * 0.8;
  // Pannan: vågräta rynkor
  float fl = sin( q.y * 6.2831 * 22.0 + fbm( p * 0.9 ) * 5.0 );
  h -= smoothstep( 0.75, 1.0, fl ) * forehead * band( q.x, 0.33, 0.67, 0.05 ) * 0.03 * wr;
  // Kråksparkar i ögonvrårna
  for ( int s = 0; s < 2; s ++ ) {
    vec2 corner = s == 0 ? vec2( 0.29, 0.715 ) : vec2( 0.71, 0.715 );
    vec2 d = q - corner;
    float a = atan( d.y, d.x * ( s == 0 ? -1.0 : 1.0 ) );
    float r = length( d );
    float lines = smoothstep( 0.7, 1.0, sin( a * 16.0 + fbm( p * 2.0 ) * 3.0 ) );
    h -= lines * smoothstep( 0.012, 0.025, r ) * smoothstep( 0.07, 0.035, r ) * 0.035 * wr;
  }
  // Under ögonen
  float ul = smoothstep( 0.7, 1.0, sin( q.y * 6.2831 * 70.0 + fbm( p * 3.0 ) * 6.0 ) );
  h -= ul * underEye * 0.04 * wr;
  // Näs-läppvecket
  for ( int s = 0; s < 2; s ++ ) {
    float sx = s == 0 ? -1.0 : 1.0;
    float d = segDist( q, vec2( 0.5 + sx * 0.055, 0.545 ), vec2( 0.5 + sx * 0.085, 0.43 ) );
    h -= exp( - pow( d / 0.006, 2.0 ) ) * 0.08 * ( 0.4 + age );
  }
  // Läpparnas lodräta linjer
  float ll = smoothstep( 0.6, 1.0, sin( ( q.x - 0.5 ) * 6.2831 * 75.0 + noise( p * 5.0 ) * 3.0 ) );
  h -= ll * lip * 0.06;
  h += lip * 0.03;

  // ---- Färg ----
  vec3 col = skin;
  // Ojämnheter i huden: fläckvis lite rödare eller brunare
  float m1 = fbm( p * 0.7 + seed );
  float m2 = fbm( p * 3.0 + seed * 2.0 );
  col *= 1.0 + ( m1 - 0.5 ) * 0.18 + ( m2 - 0.5 ) * 0.08;
  float red = clamp( blush * ( cheeks * 0.55 + noseTip * 0.6 + ears * 0.6 + chin * 0.2 + lids * 0.25 ) + ( m2 - 0.45 ) * 0.25 + mouthAround * 0.1, 0.0, 1.0 );
  red *= 1.0 - dark * 0.6;
  col = mix( col, col * vec3( 1.06, 0.7, 0.68 ), red * 0.6 );
  // Gulare panna, blåaktigt under ögonen, mörkare ögonlock
  col = mix( col, col * vec3( 1.04, 0.98, 0.86 ), forehead * 0.4 );
  col = mix( col, col * vec3( 0.82, 0.76, 0.86 ), underEye * ( 0.45 + age * 0.3 ) );
  col = mix( col, col * vec3( 0.86, 0.74, 0.74 ), lids * 0.5 );
  // Fräknar och födelsemärken
  vec2 fr = worley( p * 3.2 );
  float frArea = freckles * ( noseAll + cheeks * 1.2 + forehead * 0.5 + 0.15 );
  col = mix( col, col * vec3( 0.72, 0.58, 0.46 ), smoothstep( 0.32, 0.18, fr.x ) * step( fr.y, frArea * 0.7 ) * 0.7 );
  vec2 mole = worley( p * 0.6 );
  col = mix( col, col * vec3( 0.42, 0.3, 0.24 ), smoothstep( 0.05, 0.03, mole.x ) * step( mole.y, 0.12 ) );
  // Läppar
  vec3 lipCol = mix( skin * vec3( 1.0, 0.52, 0.52 ), skin * vec3( 0.78, 0.55, 0.58 ), dark );
  lipCol *= 0.92 + 0.12 * noise( p * 8.0 );
  col = mix( col, lipCol, lip * 0.85 );
  // Skäggstubb: en blågrå skugga av stråna under huden och korta strån
  float stub = beard * stubble;
  col = mix( col, col * mix( vec3( 0.78, 0.78, 0.82 ), vec3( 0.9 ), dark ), stub * 0.75 );
  vec2 sw = worley( p * 16.0 );
  float dots = smoothstep( 0.22, 0.08, sw.x ) * step( sw.y, 0.8 );
  col = mix( col, hair * 0.6, dots * stub * 0.6 );
  h += dots * stub * 0.05;
  // Ögonbryn: strå för strå
  if ( face ) {
    vec2 dir;
    float dens = browDensity( q, dir );
    if ( dens > 0.01 ) {
      float s1 = strands( q, dir, 900.0, 7.0, 0.35, dens );
      float s2 = strands( q + 0.0007, dir, 650.0, 8.0, 0.4, dens * 0.8 );
      float b = max( s1, s2 );
      col = mix( col, col * 0.8, dens * 0.5 );
      col = mix( col, hair * ( 0.6 + 0.4 * hash1( vec3( q * 900.0, 1.0 ) ) ), b * 0.92 );
      h += b * 0.08;
    }
  }
  // Snaggat hår: skugga av hårrötterna och korta strån
  if ( scalp > 0.01 ) {
    // Korta strån tätt intill varandra: hårfärgen dominerar, huden lyser igenom lite
    col = mix( col, mix( col, hair, 0.75 + 0.2 * buzz ), scalp );
    vec2 hw = worley( p * 26.0 );
    float hd = smoothstep( 0.4, 0.1, hw.x );
    col = mix( col, hair * ( 0.6 + 0.6 * hw.y ), hd * scalp * 0.9 );
    h += hd * scalp * 0.06;
  }
  // Munhålan och ögonhålorna
  col = mix( col, vec3( 0.42, 0.12, 0.12 ), mouthInside );
  col = mix( col, col * 0.4, eyeSocket );
  // Ögonvrårna (caruncle): rosa och våta
  float caruncle = blob( q, vec2( 0.392, 0.718 ), vec2( 0.008, 0.008 ) ) + blob( q, vec2( 0.608, 0.718 ), vec2( 0.008, 0.008 ) );
  col = mix( col, vec3( 0.75, 0.33, 0.33 ), clamp( caruncle, 0.0, 1.0 ) * 0.8 );

  // Tröja nedtill på halsen (rund halsringning, lägre fram), stickad struktur
  float collar = -13.0 + 2.2 * smoothstep( 1.4, 0.0, at ) + ( noise( p * 2.0 ) - 0.5 ) * 0.1;
  float cloth = smoothstep( collar + 0.08, collar - 0.08, p.y ) * ( face ? smoothstep( 0.3, 0.2, q.y ) : 1.0 );
  float knit = abs( sin( p.x * 12.0 + abs( sin( p.y * 6.0 ) ) * 2.0 ) ) * abs( sin( p.y * 9.0 ) );
  col = mix( col, shirt * ( 0.8 + 0.3 * knit + 0.1 * noise( p * 3.0 ) ), cloth );
  h = mix( h, 0.4 + knit * 0.2, cloth );
  if ( mode == 0 ) {
    gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
    return;
  }
  // Grovhet: blankare i T-zonen och på läpparna, mattare på kinder, hals och hår
  float rough = 0.62;
  rough -= 0.08 * ( forehead + noseAll ) - 0.04 * cheeks;
  rough = mix( rough, 0.42, lip );
  rough = mix( rough, 0.75, scalp );
  rough = mix( rough, 0.3, mouthInside + caruncle );
  rough += ( noise( p * 6.0 ) - 0.5 ) * 0.08 + smoothstep( 0.32, 0.0, pore.x ) * 0.12 * poreDepth;
  rough = mix( rough, 0.9, cloth );
  // B: hur mycket ljuset sprids under ytan (hud 1, tyg 0, hår lite mindre)
  gl_FragColor = vec4( clamp( h, 0.0, 1.0 ), clamp( rough, 0.15, 0.95 ), ( 1.0 - cloth ) * ( 1.0 - scalp * 0.4 ), 1.0 );
}`;

// Höjd -> normalkarta. Lutningen räknas per texel; strength styr hur djupt porer och rynkor ser ut.
const NORMAL_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform float strength;
varying vec2 vUv;
float H( vec2 o ) { return texture2D( map, vUv + o * texel ).r; }
void main() {
  float dx = ( H( vec2( 1.0, 0.0 ) ) - H( vec2( -1.0, 0.0 ) ) ) * 0.5 + ( H( vec2( 1.0, 1.0 ) ) - H( vec2( -1.0, 1.0 ) ) + H( vec2( 1.0, -1.0 ) ) - H( vec2( -1.0, -1.0 ) ) ) * 0.25;
  float dy = ( H( vec2( 0.0, 1.0 ) ) - H( vec2( 0.0, -1.0 ) ) ) * 0.5 + ( H( vec2( 1.0, 1.0 ) ) - H( vec2( 1.0, -1.0 ) ) + H( vec2( -1.0, 1.0 ) ) - H( vec2( -1.0, -1.0 ) ) ) * 0.25;
  vec3 n = normalize( vec3( - dx * strength, - dy * strength, 1.0 ) );
  vec4 d = texture2D( map, vUv );
  gl_FragColor = vec4( n.xy * 0.5 + 0.5, d.g, d.b );
}`;

const FILL_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec2 texel;
uniform float stepSize;
varying vec2 vUv;
void main() {
  vec4 c = texture2D( map, vUv );
  if ( c.a > 0.5 ) { gl_FragColor = c; return; }
  vec4 sum = vec4( 0.0 );
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    vec4 s = texture2D( map, vUv + vec2( x, y ) * texel * stepSize );
    if ( s.a > 0.5 ) sum += vec4( s.rgb, 1.0 );
  }
  gl_FragColor = sum.a > 0.0 ? vec4( sum.rgb / sum.a, 1.0 ) : vec4( 0.0 );
}`;

let quadScene = null;
function quad(material) {
  if (!quadScene) {
    quadScene = { scene: new THREE.Scene(), camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mesh: new THREE.Mesh(new THREE.PlaneGeometry(2, 2)) };
    quadScene.mesh.frustumCulled = false;
    quadScene.scene.add(quadScene.mesh);
  }
  quadScene.mesh.material = material;
  return quadScene;
}

export function bakeSkin(renderer, head, look, debug = false) {
  const max = renderer.capabilities.maxTextureSize;
  const W = max >= 4096 ? 4096 : 2048;
  const H = W / 2;
  const uniforms = {
    mode: { value: 0 },
    skin: { value: new THREE.Color(look.skin) },
    hair: { value: new THREE.Color(look.hair) },
    dark: { value: look.dark },
    stubble: { value: look.stubble },
    freckles: { value: look.freckles },
    blush: { value: look.blush },
    age: { value: look.age },
    hairline: { value: look.hairline },
    brows: { value: look.brows },
    seed: { value: look.seed },
    buzz: { value: look.buzz },
    shirt: { value: new THREE.Color(look.shirt) },
  };
  const bakeMat = new THREE.ShaderMaterial({ uniforms, vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, side: THREE.DoubleSide });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(head.geometry, [bakeMat]);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const fill = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, stepSize: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: FILL_FRAG,
  });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  const make = (srgb, mips) =>
    new THREE.WebGLRenderTarget(W, H, {
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
      generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
  const out = {};
  for (let [name, mode, srgb] of [
    ['albedo', debug ? 2 : 0, true],
    ['detail', 1, false],
  ]) {
    const isDetail = name === 'detail';
    uniforms.mode.value = mode;
    let a = make(srgb, false);
    let b = make(srgb, false);
    renderer.setRenderTarget(a);
    renderer.clear();
    renderer.render(scene, cam);
    // Fyll ut kanterna i UV-kartan så att inga sömmar syns när texturen förminskas
    const steps = [1, 1, 2, 4, 8, 16, 32];
    steps.forEach((s, i) => {
      const last = i === steps.length - 1;
      const target = last ? make(srgb, !isDetail) : b;
      fill.uniforms.map.value = a.texture;
      fill.uniforms.stepSize.value = s;
      const q = quad(fill);
      renderer.setRenderTarget(target);
      renderer.render(q.scene, q.camera);
      if (last) {
        a.dispose();
        b.dispose();
        a = target;
      } else [a, b] = [b, a];
    });
    if (isDetail) {
      // Höjden blir en normalkarta (med mipmaps); grovhet och spridning följer med i B och A
      const normalMat = new THREE.ShaderMaterial({
        uniforms: { map: { value: a.texture }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, strength: { value: 9 * (W / 4096) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
        fragmentShader: NORMAL_FRAG,
      });
      const target = make(false, true);
      const q = quad(normalMat);
      renderer.setRenderTarget(target);
      renderer.render(q.scene, q.camera);
      normalMat.dispose();
      a.dispose();
      a = target;
      name = 'normal';
    }
    a.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    a.texture.wrapS = a.texture.wrapT = THREE.ClampToEdgeWrapping;
    // UV-kartan sträcker sig över två rutor (ansikte 0..1, bakhuvud 1..2)
    a.texture.repeat.set(0.5, 1);
    out[name] = a.texture;
    out[`${name}Target`] = a;
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;
  bakeMat.dispose();
  fill.dispose();
  return out;
}
