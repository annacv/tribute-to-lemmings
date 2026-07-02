import bombSvg from '../images/characters/bomb.svg';
import booomSvg from '../images/characters/booom.svg';
import lemmingSvg from '../images/characters/lemming.svg';
import stalactiteSmallSvg from '../images/characters/stalactite-small.svg';
import stalactiteMediumSvg from '../images/characters/stalactite-medium.svg';
import stalactiteLargeSvg from '../images/characters/stalactite-large.svg';
import stalactiteCrack1Svg from '../images/characters/stalactite-crack-1.svg';
import stalactiteCrack2Svg from '../images/characters/stalactite-crack-2.svg';
import balloonSvg from '../images/characters/balloon.svg';
import gameSongOgg from '../sounds/03_-_Lemmings_-_DOS_-_Lemming_2.ogg';
import fireSfxWav from '../sounds/FIRE.WAV';
import dieSfxWav from '../sounds/DIE.WAV';
import rankingMusicOgg from '../sounds/14_-_Lemmings_-_DOS_-_Dance_of_the_Reed-Flutes.ogg';
import yippeeSfxWav from '../sounds/YIPPEE.WAV';
import electricSfxWav from '../sounds/ELECTRIC.WAV';
import bangSfxWav from '../sounds/BANG.WAV';
import tentonSfxWav from '../sounds/TENTON.WAV';
import fallingSfxMp3 from '../sounds/intro-falling-sound-effect.mp3';
import caveLoopOgg from '../sounds/113_-_Lemmings_-_DOS_-_Tim_5.ogg';
import explodeSfxWav from '../sounds/EXPLODE.WAV';
import chainSfxWav from '../sounds/CHAIN.WAV';
import scrapeSfxWav from '../sounds/SCRAPE.WAV';
import tingSfxWav from '../sounds/TING.WAV';
import mousepreSfxWav from '../sounds/MOUSEPRE.WAV';
import abyssLoopOgg from '../sounds/121_-_Lemmings_-_DOS_-_Awesome.ogg';
import doorSfxWav from '../sounds/DOOR.WAV';
import letsgoSfxWav from '../sounds/LETSGO.WAV';
import mantrapSfxWav from '../sounds/MANTRAP.WAV';
import thudSfxWav from '../sounds/THUD.WAV';
import balloonSfxMp3 from '../sounds/intro-balloon-sound-effect.mp3';
import theEndMusicOgg from '../sounds/109_-_Lemmings_-_DOS_-_Tim_2.ogg';
import backgroundUndergroundSvg from '../images/backgrounds/background-underground.svg';
import backgroundUndergroundAbyssSvg from '../images/backgrounds/background-underground-abyss.svg';
import backgroundTunnelSvg from '../images/backgrounds/background-tunnel.svg';
import tunnelCeilingSvg from '../images/backgrounds/tunnel-ceiling.svg';
import abyssCeilingSvg from '../images/backgrounds/abyss-ceiling.svg';
import backgroundAbyssSvg from '../images/backgrounds/background-abyss.svg';
import backgroundTheEndSvg from '../images/backgrounds/background-theend.svg';
import abyssDoorEntranceSvg from '../images/backgrounds/abyss-door-entrance.svg';
import abyssDoorEntranceOpenSvg from '../images/backgrounds/abyss-door-entrance-open.svg';
import abyssDoorExitSvg from '../images/backgrounds/abyss-door-exit.svg';
import crackMark1Svg from '../images/backgrounds/crack-mark-1.svg';
import crackMark2Svg from '../images/backgrounds/crack-mark-2.svg';
import crackMark3Svg from '../images/backgrounds/crack-mark-3.svg';
import crackMark4Svg from '../images/backgrounds/crack-mark-4.svg';
import groundHole1Svg from '../images/backgrounds/ground-hole-1.svg';
import groundHole2Svg from '../images/backgrounds/ground-hole-2.svg';
import groundHole3Svg from '../images/backgrounds/ground-hole-3.svg';
import groundHole4Svg from '../images/backgrounds/ground-hole-4.svg';
import soundIconSvg from '../images/icons/sound.svg?raw';
import mutedIconSvg from '../images/icons/muted.svg?raw';
import arrowLeftIconSvg from '../images/icons/arrow-left.svg?raw';
import arrowRightIconSvg from '../images/icons/arrow-right.svg?raw';

export const SPRITES = {
  bomb: bombSvg,
  booom: booomSvg,
  lemming: lemmingSvg,
} as const;

export const STALACTITE_SVGS = [
  stalactiteSmallSvg,
  stalactiteMediumSvg,
  stalactiteLargeSvg,
] as const;

export const STALACTITE_CRACK_SVGS = [
  stalactiteCrack1Svg,
  stalactiteCrack2Svg,
] as const;

export const ABYSS_DOOR_ENTRANCE_SVG = abyssDoorEntranceSvg;
export const ABYSS_DOOR_ENTRANCE_OPEN_SVG = abyssDoorEntranceOpenSvg;
export const ABYSS_DOOR_EXIT_SVG = abyssDoorExitSvg;
export const BALLOON_SVG = balloonSvg;

export const GAME_SONG = gameSongOgg;
export const FIRE_SFX = fireSfxWav;
export const DIE_SFX = dieSfxWav;
export const RANKING_MUSIC = rankingMusicOgg;
export const YIPPEE_SFX = yippeeSfxWav;
export const ELECTRIC_SFX = electricSfxWav;
export const BANG_SFX = bangSfxWav;
export const TENTON_SFX = tentonSfxWav;
export const FALLING_SFX = fallingSfxMp3;
export const CAVE_LOOP = caveLoopOgg;
export const EXPLODE_SFX = explodeSfxWav;
export const ABYSS_LOOP = abyssLoopOgg;
export const THE_END_MUSIC = theEndMusicOgg;
export const BALLOON_SFX = balloonSfxMp3;
export const DOOR_SFX = doorSfxWav;
export const LETSGO_SFX = letsgoSfxWav;
export const MANTRAP_SFX = mantrapSfxWav;
export const THUD_SFX = thudSfxWav;
export const CHAIN_SFX = chainSfxWav;
export const SCRAPE_SFX = scrapeSfxWav;
export const COUNT_TICK_SFX = tingSfxWav;
export const COUNT_CHIME_SFX = mousepreSfxWav;
export const UNDERGROUND_BACKGROUND_SVG = backgroundUndergroundSvg;
export const UNDERGROUND_ABYSS_BACKGROUND_SVG = backgroundUndergroundAbyssSvg;
export const TUNNEL_BACKGROUND_SVG = backgroundTunnelSvg;
export const TUNNEL_CEILING_SVG = tunnelCeilingSvg;
export const ABYSS_CEILING_SVG = abyssCeilingSvg;
export const ABYSS_BACKGROUND_SVG = backgroundAbyssSvg;
export const THE_END_BACKGROUND_SVG = backgroundTheEndSvg;
export const ICON_SOUND_SVG = soundIconSvg;
export const ICON_MUTED_SVG = mutedIconSvg;
export const ICON_ARROW_LEFT_SVG = arrowLeftIconSvg;
export const ICON_ARROW_RIGHT_SVG = arrowRightIconSvg;

export const CRACK_MARK_SVGS = [
  crackMark1Svg,
  crackMark2Svg,
  crackMark3Svg,
  crackMark4Svg,
] as const;

export const GROUND_HOLE_SVGS = [
  groundHole1Svg,
  groundHole3Svg,
  groundHole2Svg,
  groundHole4Svg,
] as const;
