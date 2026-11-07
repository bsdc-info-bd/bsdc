import type { Box } from './ornament';

/**
 * Alpha runs from the supplied signature, cropped without changing the ink.
 * Source: https://debatesylhetbd.onrender.com/wiki/signature.png
 * Mirrored at DebateSylhetBD/debatesylhetbd, Git blob fc0b44db10f1746687acdbf05e0bb0133a704d2a.
 * The original is already transparent; signature.png is its 186 x 77 alpha crop.
 * Each four-byte run is row, column, length, opacity. Drawing it as PDF vector
 * rectangles avoids a browser image dependency and retains the source shape.
 */
const RUNS =
  'ACMBQAAkAYABIgGAASMC/wElAUACIgGAAiMC/wIlAUADIgP/AyUBvwQhAYAEIgT/BCYBQAUhAv8FIwG/BSQC/wUmAUAGIAGABiEB' +
  '/wYiAYAGIwFABiQC/wYmAYAHHQNAByAC/wciAb8HIwGAByQC/wcmAb8HJwVACBgCQAgaAr8IHBP/CC8CvwgxBIAINQFACRUCQAkX' +
  'Ab8JGAn/CSEDvwkkA/8JJwK/CSkO/wk3Ab8JOAKAChMBQAoUAb8KFQb/ChsBvwocAkAKHgGACh8B/wogAYAKJAG/CiUC/wotAkAK' +
  'LwOACjIBvwozCf8KPAKACxIBgAsTBf8LGAG/CxkBQAsdAYALHgL/CyABgAskAYALJQL/CzUBQAs2AoALOAG/CzkG/ws/AYAMEQGA' +
  'DBIE/wwWAb8MFwFADB0BgAweAf8MHwGADCQBQAwlAv8MJwFADDoCgAw8Bf8MQQGADRABgA0RBP8NFQFADRwBgA0dAv8NJAFADSUC' +
  '/w0nAUANPQGADT4E/w1CAb8OEAT/DhQBgA4cAYAOHQH/Dh4BgA4lAv8OJwGADj8BgA5ABP8ORAFADw8BgA8QA/8PEwGADxsBgA8c' +
  'Av8PHgFADyUBvw8mAf8PJwG/D0ABQA9BBP8PRQFAEA8E/xAbAYAQHAH/EB0BgBAlAb8QJgH/ECcBvxBCAb8QQwP/EEYBQBEOAYAR' +
  'DwP/ERIBgBEaAYARGwL/ER0BgBElAYARJgL/EUMBvxFEA/8RRwFAEg4BgBIPA/8SEgGAEhoBgBIbAf8SHAGAEiUBQBImAv8SKAFA' +
  'EkQBvxJFAv8SRwG/EwwBgBMNAb8TDgT/ExoC/xMcAYATJgL/EygBQBNEAUATRQP/E0gBvxQMAb8UDQT/FBEBvxQZAYAUGgH/FBsB' +
  'vxQmAb8UJwH/FCgBgBRFAYAURgP/FEkBgBUMAb8VDQT/FREBgBUZAv8VGwGAFSYBvxUnAf8VKAG/FUYBgBVHA/8VSgGAFgwBvxYN' +
  'BP8WEQGAFhgBgBYZAv8WJgGAFicB/xYoAb8WKQNAFkcBvxZIA/8WSwGAFwwBgBcNBP8XEQGAFxgC/xcaAYAXIwFAFyQBgBclAr8X' +
  'Jwj/Fy8BvxcwAoAXRwFAF0gE/xdMAUAYDAGAGA0E/xgRAUAYFwGAGBgC/xggAUAYIQGAGCIBvxgjEf8YNAGAGEgBgBhJBP8ZDAGA' +
  'GQ0E/xkXAYAZGAH/GRkBgBkeAUAZHwG/GSAW/xk2AYAZSQGAGUoD/xlNAb8aDAGAGg0E/xoXAv8aGQGAGh0BgBoeGv8aOAGAGkoB' +
  'vxpLA/8aTgGAGwwBgBsNA/8bEAG/GxYBgBsXAv8bGwFAGxwBvxsdCf8bJgG/GycC/xspAb8bKgJAGywDgBsvAb8bMAn/GzkBvxs6' +
  'AYAbSwGAG0wD/xtPAUAcDAGAHA0D/xwQAb8cFgL/HBgBgBwaAYAcGwf/HCIBvxwjAYAcJAFAHCcBQBwoAv8cMgGAHDMI/xw7AYAc' +
  'TAGAHE0C/xxPAb8dDAGAHQ0D/x0QAb8dFQGAHRYC/x0YAr8dGgb/HSABvx0hAUAdKAL/HSoBQB00AYAdNQf/HTwBvx1LAUAdTAGA' +
  'HU0D/x1QAUAeDAGAHg0D/x4QAb8eFQGAHhYI/x4eAYAeKAG/HikB/x4qAUAeNgGAHjcG/x49Ab8eSQFAHkoBvx5LBf8fDAG/Hw0D' +
  '/x8QAYAfFQf/HxwBgB8oAb8fKQH/HyoBvx84Ab8fOQX/Hz4Bvx9HAYAfSAb/H04Bvx9PAUAgDAG/IA0D/yAQAYAgEwFAIBQBvyAV' +
  'Bf8gGgGAICgBQCApAf8gKgG/IDkBgCA6Bf8gPwGAIEQBQCBFAb8gRgf/IE0BgCEMAb8hDQP/IRABgCESAYAhEwX/IRgBvyEZAUAh' +
  'KAFAISkC/yE6AYAhOwX/IUABgCFCAUAhQwG/IUQG/yFKAb8hSwFAIgwBvyINA/8iEAGAIhEBvyISBP8iFgG/IhcBQCIpAv8iKwFA' +
  'IjsBgCI8Bf8iQQG/IkIF/yJHAb8iSAFAIwwBvyMNCf8jKQG/IyoB/yMrAUAjPAG/Iz0I/yNFAb8jRgFAJAwBvyQNCP8kFQGAJCkB' +
  'vyQqAf8kKwG/JDsBQCQ8Ab8kPQb/JEMBvyREAUAlDAG/JQ0E/yURAb8lEgFAJRMC/yUVAYAlKQFAJSoB/yUrAb8lOAFAJTkBvyU6' +
  'CP8lQgG/JgwBvyYNA/8mEAGAJhIBgCYTAv8mKQFAJioC/yY3AYAmOAv/JkMBQCcLAYAnDAT/JxABvycSAYAnEwH/JxQBgCcqAv8n' +
  'LAFAJzUBgCc2CP8nPgG/Jz8E/ydDAb8oCgGAKAsF/ygQAb8oEgL/KBQBgCgqAb8oKwH/KCwBQCgzAYAoNAj/KDwBgCg/BP8oQwG/' +
  'KQkBgCkKBv8pEAG/KREBQCkSAv8pKgG/KSsB/yksAYApMAFAKTEBvykyCP8pOgGAKT8BvylABP8pRAFAKggBgCoJAv8qCwG/KgwF' +
  '/yoRAYAqEgH/KhMBvyoqAYAqKwH/KiwBvyouAUAqLwG/KjAH/yo3Ab8qOAFAKj8BQCpABP8qRAFAKwcBgCsIAv8rCgG/KwwH/ysT' +
  'AYArKgFAKysC/ystAb8rLgf/KzUBvys2AUArPwFAK0AE/ytEAb8rqwNAK64CgCuwCL8ruAH/K7kBQCwGAYAsBwL/LAkBvywLAUAs' +
  'DAf/LCgBQCwpAr8sKwj/LDMBvyw0AUAsQAG/LEEE/yyfA0AsogKALKQEvyyoDf8stQK/LLcBgCy4Af8suQGALQUBgC0GAv8tCAG/' +
  'LQsBQC0MAf8tDQG/LQ4E/y0SAb8tJQFALSYBvy0nCf8tMAK/LTIBQC1AAb8tQQT/LUUBQC2UBEAtmAKALZoDvy2dDv8tqwO/La4C' +
  'gC2wA0AuBAGALgUD/y4LAYAuDAH/Lg0Cvy4PA/8uEgGALiIBQC4jAb8uJAn/Li0Bvy4uAkAuQAFALkEE/y5FAUAuigJALowCgC6O' +
  'BL8ukg3/Lp8Dvy6iAoAupARALwMBgC8EA/8vBwFALwsBgC8MAf8vDQGALw4BQC8PA/8vEgG/Lx4CQC8gAb8vIQb/LycCvy8pAkAv' +
  'KwG/LywB/y8tAYAvQAFAL0EE/y9FAYAvggJAL4QBgC+FA78viA3/L5UDvy+YAoAvmgNAMAMD/zAGAYAwCwGAMAwB/zANAYAwDwG/' +
  'MBAD/zATAUAwGwFAMBwCvzAeBv8wJAG/MCUCQDArAUAwLAH/MC0BvzBBBP8wRQGAMHsCQDB9AYAwfgK/MIAK/zCKA78wjQKAMI8D' +
  'QDECAYAxAwL/MQUBgDELAYAxDAH/MQ0BgDEPAb8xEAP/MRMBvzEXAUAxGAGAMRkBvzEaCP8xIgG/MSMBQDErAUAxLAH/MS0BvzFB' +
  'Ab8xQgP/MUUBvzF0AkAxdgGAMXcDvzF6CP8xggK/MYQCgDGGAkAyAQGAMgID/zIFAUAyCwG/MgwB/zINAUAyDwX/MhQCvzIWCf8y' +
  'HwG/MiABQDIsAv8yQQG/MkID/zJFAb8ybQJAMm8BgDJwAr8ycgn/MnsCvzJ9AYAyfgJAMwEBgDMCAv8zBAGAMwsC/zMNAUAzDgGA' +
  'Mw8P/zMeAb8zHwGAMywC/zMuAUAzQQG/M0ID/zNFAb8zZgJAM2gBgDNpAr8zawn/M3QCvzN2AoAzeAJANAED/zQLAv80DQGANA4T' +
  '/zQhAYA0LAG/NC0B/zQuAUA0QQG/NEID/zRFAYA0XwJANGEBgDRiAr80ZAn/NG0CvzRvAYA0cAJANQABQDUBA/81CgFANQsX/zUi' +
  'Ab81IwFANSwBgDUtAf81LgGANUEBvzVCA/81RQGANVgCQDVaAYA1WwO/NV4I/zVmAr81aAGANWkCQDYAAUA2AQL/NgMBvzYKAUA2' +
  'CwH/NgwBvzYNDv82GwKANh0BvzYeBv82JAGANiwBQDYtAf82LgG/NkEE/zZFAYA2UwFANlQBgDZVAr82Vwj/Nl8DvzZiAYA2YwJA' +
  'NwABQDcBA/83CgFANwsB/zcMAr83DgL/NxACvzcSAUA3FAGANxUH/zccAYA3HwGANyAF/zclAb83LAFANy0B/zcuAb83QAGAN0EE' +
  '/zdNAkA3TwGAN1ABvzdRCP83WQK/N1sBgDdcAkA4AQP/OAQBQDgKAYA4CwH/OAwBgDgNAv84DwGAOBYBgDgXB/84HgGAOB8BQDgh' +
  'AYA4IgX/OCcBgDgtAv84QAT/OEQBgDhIAkA4SgK/OEwH/zhTAr84VQJAOQEBvzkCAv85BAG/OQoBgDkLAf85DAG/OQ0C/zkPAUA5' +
  'FwGAORgBvzkZB/85IAKAOSMBgDkkBP85KAGAOS0BvzkuAf85LwFAOT4BQDk/Ab85QAT/OUQDvzlHBv85TQK/OU8BgDlQAkA6AQFA' +
  'OgID/zoFAYA6CgGAOgsE/zoZAoA6Gwj/OiMBgDokAr86JgP/OikBgDotAb86LgH/Oi8BQDo6AkA6PAK/Oj4K/zpIAr86SgJAOwIB' +
  'vzsDA/87BgFAOwoBvzsLA/87DgG/OxwBgDsdDf87KgGAOy0BgDsuAf87LwGAOzUCQDs3AYA7OAG/OzkL/ztEAb87RQGAO0YBQDwC' +
  'AUA8AwP/PAYBvzwKAb88CwP/PA4BgDweAoA8IAv/PCsDvzwuAv88MAO/PDMO/zxBAkA9AwGAPQQD/z0HAb89CgG/PQsD/z0OAYA9' +
  'IQKAPSMa/z09Ar89PwFAPgQBgD4FA/8+CAG/PgkBQD4KBP8+JAKAPiYBvz4nEf8+OAK/PjoCQD8FAYA/Bgf/Pw0Bvz8oAUA/KQGA' +
  'PyoBvz8rCP8/MwK/PzUCQEAGAYBABwb/QA0BgEAlAkBAJwK/QCkH/0AwAb9AMQJAQQcBgEEIBf9BDQG/QQ4BgEEfAkBBIQGAQSIC' +
  'v0EkB/9BKwG/QSwE/0EwAb9CCQGAQgoG/0IQAb9CEQOAQhQEQEIYAoBCGgS/Qh4I/0ImAr9CKAJAQiwBv0ItA/9CMAG/QwkBQEMK' +
  'F/9DIQK/QyMCQEMsAUBDLQT/QzEBQEQJAUBECgP/RA4CgEQQAr9EEgf/RBkDv0QcAoBEHgJARC0BgEQuA/9EMQG/RQkBgEUKAv9F' +
  'DAG/RS4Bv0UvA/9FMgGARgkBgEYKAv9GDAGARi8Bv0YwA/9GMwFARwkBgEcKAv9HDAGARy8BQEcwA/9HMwG/SAkBgEgKAv9IDAGA' +
  'SDAE/0g0AUBJCQGASQoC/0kMAYBJMAG/STED/0k0AUBKCQFASgoC/0oMAUBKMAFASjED/0o0AYBLCgJASzED/0s0AYBMMQGATDIB' +
  'v0wzAYA=';

export function officialSignature(origin: Box): readonly string[] {
  const width = 186;
  const height = 77;
  const scale = Math.min(origin.width / width, origin.height / height);
  if (scale <= 0) return [];
  const left = origin.x + (origin.width - width * scale) / 2;
  const bottom = origin.y + (origin.height - height * scale) / 2;
  const bytes = atob(RUNS);
  const groups = new Map<number, string[]>();
  for (let i = 0; i < bytes.length; i += 4) {
    const row = bytes.charCodeAt(i);
    const column = bytes.charCodeAt(i + 1);
    const length = bytes.charCodeAt(i + 2);
    const alpha = bytes.charCodeAt(i + 3);
    const paths = groups.get(alpha) ?? [];
    paths.push(
      `${(left + column * scale).toFixed(3)} ${(bottom + (height - row - 1) * scale).toFixed(3)} ${(length * scale).toFixed(3)} ${scale.toFixed(3)} re`,
    );
    groups.set(alpha, paths);
  }
  // All usages put the signature over white. Blend the source's anti-aliasing
  // against that white, leaving transparent pixels completely untouched.
  return [
    'q',
    ...[...groups].map(
      ([alpha, paths]) => `${(1 - alpha / 255).toFixed(3)} g ${paths.join(' ')} f`,
    ),
    'Q',
  ];
}
