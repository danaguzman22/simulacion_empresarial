// #106: the five NEXUS archetypes (D-46), adapted from docs/referencias/Manual_CyD_Mesa_de_Control.html as components:
// pure SVG, no external images. Gradient ids get a per-card prefix so several cards on one page never collide.
// Generated from the prototype; edit the drawings here.
import type { Archetype } from "../domain/archetype";

type ArtProps = { idPrefix: string };

function OwlArt({ idPrefix }: ArtProps) {
  return <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 250 150" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id={`${idPrefix}bg-b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#122f56"/><stop offset="1" stopColor="#060d1a"/></linearGradient>
    <linearGradient id={`${idPrefix}su-b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3f63"/><stop offset="1" stopColor="#131d2f"/></linearGradient>
    <radialGradient id={`${idPrefix}gl-b`} cx=".5" cy=".4"><stop offset="0" stopColor="#5ba7ee" stopOpacity=".35"/><stop offset="1" stopColor="#5ba7ee" stopOpacity="0"/></radialGradient></defs>
    <rect width="250" height="150" fill={`url(#${idPrefix}bg-b)`}/><rect width="250" height="150" fill={`url(#${idPrefix}gl-b)`}/>
    <g stroke="#5fb4f5" strokeWidth="1" fill="none" opacity=".55">
    <rect x="18" y="20" width="34" height="20" rx="2"/><rect x="18" y="52" width="34" height="20" rx="2"/><path d="M52 30h16v32h-16"/><circle cx="80" cy="46" r="9"/>
    <path d="M196 26v46M186 62v10M206 48v24M216 38v34" strokeWidth="3" strokeLinecap="round" opacity=".7"/>
    <path d="M176 34l14-10 12 8 14-14" strokeDasharray="3 3"/></g>
    <path d="M0 150 L34 104 L216 104 L250 150Z" fill="#0b1728"/><path d="M34 104h182" stroke="#3f6fbf" strokeWidth="1.4" opacity=".7"/>
    <path d="M125 62 Q96 78 90 150 L160 150 Q154 78 125 62Z" fill={`url(#${idPrefix}su-b)`}/>
    <path d="M125 66 L112 150 M125 66 L138 150" stroke="#0d1626" strokeWidth="1.2" opacity=".8"/>
    <path d="M125 68 l-11 10 11 12 11-12z" fill="#c3452f"/>
    <ellipse cx="125" cy="45" rx="30" ry="27" fill="#3d5170"/>
    <path d="M99 27 q6-16 14-4 M151 27 q-6-16-14-4" stroke="#3d5170" strokeWidth="9" fill="none" strokeLinecap="round"/>
    <ellipse cx="125" cy="50" rx="22" ry="17" fill="#4a6285"/>
    <circle cx="113" cy="42" r="10.5" fill="#f4d580" stroke="#a8801f" strokeWidth="2.2"/>
    <circle cx="137" cy="42" r="10.5" fill="#f4d580" stroke="#a8801f" strokeWidth="2.2"/>
    <circle cx="113" cy="42" r="4.2" fill="#141414"/><circle cx="137" cy="42" r="4.2" fill="#141414"/>
    <circle cx="115" cy="40" r="1.5" fill="#fff" opacity=".9"/><circle cx="139" cy="40" r="1.5" fill="#fff" opacity=".9"/>
    <path d="M123.5 42h3" stroke="#a8801f" strokeWidth="2.4"/>
    <path d="M125 50 l-5 8 h10z" fill="#e8a33c"/>
    <path d="M150 92 L172 70" stroke="#5fb4f5" strokeWidth="3.4" strokeLinecap="round"/><circle cx="173" cy="69" r="3.4" fill="#a9dcff"/>
    </svg>;
}

function FoxArt({ idPrefix }: ArtProps) {
  return <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 250 150" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id={`${idPrefix}bg-z`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0913f"/><stop offset=".55" stopColor="#a13d16"/><stop offset="1" stopColor="#2a1006"/></linearGradient>
    <linearGradient id={`${idPrefix}su-z`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22304a"/><stop offset="1" stopColor="#0d1420"/></linearGradient></defs>
    <rect width="250" height="150" fill={`url(#${idPrefix}bg-z)`}/>
    <circle cx="196" cy="40" r="21" fill="#ffd28a" opacity=".85"/>
    <g fill="#40170a" opacity=".92"><rect x="8" y="72" width="26" height="78"/><rect x="38" y="54" width="20" height="96"/><rect x="62" y="86" width="16" height="64"/><rect x="172" y="66" width="24" height="84"/><rect x="200" y="80" width="30" height="70"/><rect x="234" y="58" width="16" height="92"/></g>
    <g fill="#ffca7a" opacity=".55"><rect x="13" y="80" width="5" height="5"/><rect x="23" y="94" width="5" height="5"/><rect x="43" y="64" width="5" height="5"/><rect x="47" y="84" width="5" height="5"/><rect x="178" y="76" width="5" height="5"/><rect x="206" y="92" width="5" height="5"/><rect x="239" y="70" width="5" height="5"/></g>
    <rect x="0" y="118" width="250" height="4" fill="#2a1006" opacity=".6"/>
    <path d="M125 66 Q92 84 86 150 L164 150 Q158 84 125 66Z" fill={`url(#${idPrefix}su-z)`}/>
    <path d="M125 70 L110 150 M125 70 L140 150" stroke="#080d16" strokeWidth="1.3"/>
    <path d="M125 72 l-10 9 10 13 10-13z" fill="#c2412a"/>
    <path d="M104 44 L96 12 L120 32Z" fill="#d9702f"/><path d="M105 40 L100 20 L116 33Z" fill="#3a1608"/>
    <path d="M146 44 L154 12 L130 32Z" fill="#d9702f"/><path d="M145 40 L150 20 L134 33Z" fill="#3a1608"/>
    <path d="M125 34 Q100 36 101 52 Q103 70 125 76 Q147 70 149 52 Q150 36 125 34Z" fill="#e07f3a"/>
    <path d="M125 52 Q112 54 112 64 Q112 74 125 78 Q138 74 138 64 Q138 54 125 52Z" fill="#f6e3cc"/>
    <path d="M125 66 l-5 4 5 4 5-4z" fill="#1a1a1a"/>
    <path d="M108 50 q6-3 11 1" stroke="#1a1a1a" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
    <path d="M142 50 q-6-3-11 1" stroke="#1a1a1a" strokeWidth="2.6" fill="none" strokeLinecap="round"/>
    <path d="M118 72 q7 5 14 0" stroke="#1a1a1a" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    <rect x="152" y="94" width="15" height="26" rx="3" fill="#0f1b2c" stroke="#5fb4f5" strokeWidth="1.4"/><rect x="154.5" y="97" width="10" height="18" fill="#5fb4f5" opacity=".55"/>
    </svg>;
}

function BeaverArt({ idPrefix }: ArtProps) {
  return <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 250 150" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id={`${idPrefix}bg-c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d6b52"/><stop offset="1" stopColor="#03231c"/></linearGradient>
    <linearGradient id={`${idPrefix}ve-c`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f8d6c"/><stop offset="1" stopColor="#14503d"/></linearGradient></defs>
    <rect width="250" height="150" fill={`url(#${idPrefix}bg-c)`}/>
    <g stroke="#4fdca8" strokeWidth=".7" opacity=".28">
    <path d="M0 20h250M0 45h250M0 70h250M0 95h250M0 120h250M25 0v150M50 0v150M75 0v150M175 0v150M200 0v150M225 0v150"/></g>
    <g transform="rotate(-9 190 62)"><rect x="150" y="26" width="84" height="60" fill="#062f26" stroke="#6ee7b7" strokeWidth="1.6" opacity=".9"/>
    <path d="M158 40h30v18h-30zM196 40h30M196 50h22M196 60h30M158 68h68" stroke="#6ee7b7" strokeWidth="1.1" fill="none" opacity=".85"/>
    <text x="160" y="34" fontFamily="monospace" fontSize="7" fill="#6ee7b7">A3</text></g>
    <rect x="12" y="24" width="34" height="104" rx="3" fill="#04221b" stroke="#2f8d6c" strokeWidth="1.4"/>
    <g fill="#6ee7b7"><rect x="18" y="34" width="22" height="3"/><rect x="18" y="46" width="16" height="3"/><rect x="18" y="58" width="22" height="3"/><rect x="18" y="70" width="12" height="3"/><rect x="18" y="82" width="22" height="3"/></g>
    <circle cx="42" cy="34" r="2" fill="#7dffd0"/><circle cx="42" cy="58" r="2" fill="#ffd166"/>
    <path d="M112 70 Q80 88 74 150 L152 150 Q146 88 112 70Z" fill="#1d3a30"/>
    <path d="M112 74 Q92 88 88 150 L136 150 Q132 88 112 74Z" fill={`url(#${idPrefix}ve-c)`}/>
    <g fill="#f4f4f4" opacity=".85"><rect x="90" y="106" width="46" height="5"/><rect x="90" y="120" width="46" height="5"/></g>
    <ellipse cx="112" cy="52" rx="27" ry="24" fill="#7a4a1e"/>
    <ellipse cx="88" cy="42" rx="7" ry="8" fill="#5e3715"/><ellipse cx="136" cy="42" rx="7" ry="8" fill="#5e3715"/>
    <path d="M84 34 q28-22 56 0 l3 6 q-31-16-62 0z" fill="#f0c419"/><path d="M84 40 h56 v5 h-56z" fill="#d9a706"/>
    <ellipse cx="112" cy="64" rx="15" ry="11" fill="#a06a34"/>
    <rect x="105" y="64" width="6.4" height="13" rx="1.6" fill="#fff"/><rect x="112.6" y="64" width="6.4" height="13" rx="1.6" fill="#fff"/>
    <ellipse cx="112" cy="60" rx="4" ry="3" fill="#2a1a08"/>
    <circle cx="103" cy="50" r="3.4" fill="#171717"/><circle cx="121" cy="50" r="3.4" fill="#171717"/>
    <circle cx="104" cy="49" r="1.1" fill="#fff"/><circle cx="122" cy="49" r="1.1" fill="#fff"/>
    <path d="M92 36 q-6-6-2-12 M132 36 q6-6 2-12" stroke="#c9e9dc" strokeWidth="1.6" fill="none" opacity=".5"/>
    </svg>;
}

function BullArt({ idPrefix }: ArtProps) {
  return <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 250 150" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id={`${idPrefix}bg-t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a0d0d"/><stop offset=".6" stopColor="#1c0505"/><stop offset="1" stopColor="#0a0202"/></linearGradient>
    <radialGradient id={`${idPrefix}sp-t`} cx=".78" cy=".42"><stop offset="0" stopColor="#ffb648" stopOpacity=".55"/><stop offset="1" stopColor="#ffb648" stopOpacity="0"/></radialGradient>
    <linearGradient id={`${idPrefix}co-t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5c1616"/><stop offset="1" stopColor="#2a0808"/></linearGradient></defs>
    <rect width="250" height="150" fill={`url(#${idPrefix}bg-t)`}/><rect width="250" height="150" fill={`url(#${idPrefix}sp-t)`}/>
    <g fill="#2c0a0a"><rect x="176" y="52" width="66" height="98" rx="3"/><rect x="188" y="30" width="14" height="24"/></g>
    <g stroke="#ffc663" strokeWidth="1.3" opacity=".9"><path d="M196 66 l24-22M200 78 l30-16M192 58 l18-20"/></g>
    <g fill="#ffd48a"><circle cx="222" cy="44" r="2.6"/><circle cx="236" cy="60" r="1.8"/><circle cx="208" cy="34" r="1.6"/><circle cx="230" cy="82" r="2.2"/><circle cx="214" cy="96" r="1.5"/><circle cx="244" cy="38" r="1.4"/></g>
    <path d="M112 68 Q68 90 62 150 L164 150 Q158 90 112 68Z" fill={`url(#${idPrefix}co-t)`}/>
    <path d="M112 72 L100 150 M112 72 L126 150" stroke="#170404" strokeWidth="1.5"/>
    <path d="M84 96 q14-8 28-2" stroke="#170404" strokeWidth="2" fill="none"/>
    <ellipse cx="112" cy="48" rx="31" ry="28" fill="#7d2323"/>
    <path d="M84 40 Q58 24 62 8 Q80 14 92 34Z" fill="#e8e3d6"/><path d="M84 40 Q66 28 66 16" stroke="#c2bba9" strokeWidth="1.6" fill="none"/>
    <path d="M140 40 Q166 24 162 8 Q144 14 132 34Z" fill="#e8e3d6"/><path d="M140 40 Q158 28 158 16" stroke="#c2bba9" strokeWidth="1.6" fill="none"/>
    <ellipse cx="112" cy="64" rx="19" ry="14" fill="#a94040"/>
    <ellipse cx="105" cy="62" rx="3.4" ry="4.4" fill="#2a0808"/><ellipse cx="119" cy="62" rx="3.4" ry="4.4" fill="#2a0808"/>
    <circle cx="112" cy="71" r="7.5" fill="none" stroke="#e8b23c" strokeWidth="3"/>
    <ellipse cx="99" cy="42" rx="4.4" ry="3.6" fill="#fff"/><ellipse cx="125" cy="42" rx="4.4" ry="3.6" fill="#fff"/>
    <circle cx="100" cy="42" r="2" fill="#141414"/><circle cx="126" cy="42" r="2" fill="#141414"/>
    <path d="M92 32 q8-6 16-2 M132 32 q-8-6-16-2" stroke="#4a1010" strokeWidth="2.4" fill="none" strokeLinecap="round"/>
    <path d="M146 108 L184 78" stroke="#8e9aa6" strokeWidth="9" strokeLinecap="round"/>
    <path d="M182 80 l10-8 6 8 -10 8z" fill="#b6c1cc"/>
    </svg>;
}

function SquirrelArt({ idPrefix }: ArtProps) {
  return <svg aria-hidden="true" className="block h-full w-full" viewBox="0 0 250 150" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id={`${idPrefix}bg-a`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a3410"/><stop offset="1" stopColor="#170f03"/></linearGradient>
    <linearGradient id={`${idPrefix}ta-a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b5722a"/><stop offset="1" stopColor="#6d3f12"/></linearGradient></defs>
    <rect width="250" height="150" fill={`url(#${idPrefix}bg-a)`}/>
    <g opacity=".85"><rect x="14" y="18" width="62" height="42" rx="3" fill="#2c1e06" stroke="#e0b352" strokeWidth="1.2"/>
    <g stroke="#ffe6a3" strokeWidth="1"><path d="M20 28h50M20 36h50M20 44h50M20 52h50M36 22v40M54 22v40"/></g>
    <rect x="20" y="28" width="16" height="8" fill="#e0b352" opacity=".5"/></g>
    <g><circle cx="196" cy="30" r="9" fill="#e8bb45" stroke="#fff0bf" strokeWidth="1.4"/><circle cx="216" cy="48" r="11" fill="#e8bb45" stroke="#fff0bf" strokeWidth="1.4"/><circle cx="192" cy="60" r="7" fill="#e8bb45" stroke="#fff0bf" strokeWidth="1.2"/>
    <text x="192.5" y="34" fontSize="9" fontFamily="serif" fill="#7a5c10">$</text><text x="212" y="53" fontSize="11" fontFamily="serif" fill="#7a5c10">$</text></g>
    <g><rect x="186" y="86" width="19" height="27" rx="2.5" fill="#3f7fd4"/><rect x="209" y="86" width="19" height="27" rx="2.5" fill="#c94a4a"/>
    <g stroke="#fff" strokeWidth="1" opacity=".65"><path d="M190 93h11M190 98h11M213 93h11M213 98h11"/></g></g>
    <path d="M139 84 Q186 62 172 132 Q152 128 140 106Z" fill={`url(#${idPrefix}ta-a)`}/>
    <path d="M146 92 Q176 78 168 122" stroke="#d99a45" strokeWidth="2.4" fill="none" opacity=".7"/>
    <path d="M120 70 Q92 88 88 150 L152 150 Q148 88 120 70Z" fill="#3b2a12"/>
    <path d="M120 74 Q104 88 102 150 L138 150 Q136 88 120 74Z" fill="#5a4520"/>
    <path d="M120 76 l-9 8 9 11 9-11z" fill="#7f2b2b"/>
    <path d="M104 32 q-4-14 4-14 q8 2 8 14z" fill="#a6641d"/><path d="M136 32 q4-14-4-14 q-8 2-8 14z" fill="#a6641d"/>
    <ellipse cx="120" cy="48" rx="24" ry="22" fill="#b8762a"/>
    <ellipse cx="120" cy="58" rx="13" ry="10" fill="#f2ddb4"/>
    <ellipse cx="120" cy="53" rx="3.4" ry="2.6" fill="#3a2408"/>
    <rect x="117.4" y="56" width="5.2" height="9" rx="1.4" fill="#fff"/>
    <circle cx="110" cy="43" r="8.4" fill="#fdf6e4" opacity=".28" stroke="#241a08" strokeWidth="2"/>
    <circle cx="130" cy="43" r="8.4" fill="#fdf6e4" opacity=".28" stroke="#241a08" strokeWidth="2"/>
    <path d="M118.4 43h3.2" stroke="#241a08" strokeWidth="2"/>
    <circle cx="110" cy="43" r="3" fill="#1a1206"/><circle cx="130" cy="43" r="3" fill="#1a1206"/>
    <path d="M104 60 l-14 4 M104 64 l-14 0 M136 60 l14 4 M136 64 l14 0" stroke="#f2ddb4" strokeWidth="1" opacity=".6"/>
    </svg>;
}

const arts: Record<Exclude<Archetype, "ninguno">, (props: ArtProps) => React.JSX.Element> = { buho: OwlArt, zorro: FoxArt, castor: BeaverArt, toro: BullArt, ardilla: SquirrelArt };

export function ArchetypeArt({ archetype, idPrefix }: { archetype: Exclude<Archetype, "ninguno">; idPrefix: string }) {
  const Art = arts[archetype];
  return <Art idPrefix={idPrefix} />;
}
