// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice One haiku per day, written for the day's place in the Japanese calendar of 72 micro-seasons
/// (shichijuni-ko). seed = the day's seed, data = days since 1970-01-01 (UTC).
/// Season boundaries follow the usual calendar dates; real ones shift by about a day from year to year.
contract DailyHaiku {
    using Strings for uint256;

    // Start date (MMDD) of each micro-season as 72 big-endian uint16, in calendar order from risshun.
    bytes private constant STARTS = hex"00cc00d100d600db00e0012d01320137013c01410146014b0195019a019f01a401a901ae01f901fe02030209020e0213025e02630268026d027202bd02c302c802cd02d302d803220327032c03310337033c0386038b03900395039b03a003eb03f003f503fa03ff0404044e04530458045d0462046704b204b704bc04c004c604cb00650069006e00730078007d0082";

    string private constant KANJI = unicode"東風解凍|黄鶯睍睆|魚上氷|土脉潤起|霞始靆|草木萌動|蟄虫啓戸|桃始笑|菜虫化蝶|雀始巣|櫻始開|雷乃発声|玄鳥至|鴻雁北|虹始見|葭始生|霜止出苗|牡丹華|蛙始鳴|蚯蚓出|竹笋生|蚕起食桑|紅花栄|麦秋至|蟷螂生|腐草為螢|梅子黄|乃東枯|菖蒲華|半夏生|温風至|蓮始開|鷹乃学習|桐始結花|土潤溽暑|大雨時行|涼風至|寒蝉鳴|蒙霧升降|綿柎開|天地始粛|禾乃登|草露白|鶺鴒鳴|玄鳥去|雷乃収声|蟄虫坏戸|水始涸|鴻雁来|菊花開|蟋蟀在戸|霜始降|霎時施|楓蔦黄|山茶始開|地始凍|金盞香|虹蔵不見|朔風払葉|橘始黄|閉塞成冬|熊蟄穴|鱖魚群|乃東生|麋角解|雪下出麦|芹乃栄|水泉動|雉始雊|款冬華|水沢腹堅|鶏始乳";
    string private constant ROMAJI = "harukaze kori wo toku|uguisu naku|uo kori wo izuru|tsuchi no sho uruoi okoru|kasumi hajimete tanabiku|somoku mebae izuru|sugomori mushi to wo hiraku|momo hajimete saku|namushi cho to naru|suzume hajimete sukuu|sakura hajimete saku|kaminari sunawachi koe wo hassu|tsubame kitaru|kogan kaeru|niji hajimete arawaru|ashi hajimete shozu|shimo yamite nae izuru|botan hana saku|kawazu hajimete naku|mimizu izuru|takenoko shozu|kaiko okite kuwa wo hamu|benibana sakau|mugi no toki itaru|kamakiri shozu|kusaretaru kusa hotaru to naru|ume no mi kibamu|natsukarekusa karuru|ayame hana saku|hange shozu|atsukaze itaru|hasu hajimete hiraku|taka sunawachi waza wo narau|kiri hajimete hana wo musubu|tsuchi uruoite mushiatsushi|taiu tokidoki furu|suzukaze itaru|higurashi naku|fukaki kiri matou|wata no hana shibe hiraku|tenchi hajimete samushi|kokumono sunawachi minoru|kusa no tsuyu shiroshi|sekirei naku|tsubame saru|kaminari sunawachi koe wo osamu|mushi kakurete to wo fusagu|mizu hajimete karuru|kogan kitaru|kiku no hana hiraku|kirigirisu to ni ari|shimo hajimete furu|kosame tokidoki furu|momiji tsuta kibamu|tsubaki hajimete hiraku|chi hajimete koru|kinsenka saku|niji kakurete miezu|kitakaze konoha wo harau|tachibana hajimete kibamu|sora samuku fuyu to naru|kuma ana ni komoru|sake no uo muragaru|natsukarekusa shozu|sawashika no tsuno otsuru|yuki watarite mugi nobiru|seri sunawachi sakau|shimizu atataka wo fukumu|kiji hajimete naku|fuki no hana saku|sawamizu kori tsumeru|niwatori hajimete toya ni tsuku";
    string private constant ENGLISH = "East wind melts the ice|Bush warblers start singing|Fish emerge from the ice|Rain moistens the soil|Mist starts to linger|Grass sprouts, trees bud|Hibernating insects surface|First peach blossoms|Caterpillars become butterflies|Sparrows start to nest|First cherry blossoms|Distant thunder|Swallows return|Wild geese fly north|First rainbows|First reeds sprout|Last frost, rice seedlings grow|Peonies bloom|Frogs start singing|Worms surface|Bamboo shoots sprout|Silkworms feast on mulberry|Safflowers bloom|Wheat ripens|Praying mantises hatch|Rotten grass becomes fireflies|Plums turn yellow|Self-heal withers|Irises bloom|Crow-dipper sprouts|Warm winds blow|First lotus blossoms|Hawks learn to fly|Paulownia trees bear seeds|Earth is damp, air is humid|Great rains sometimes fall|Cool winds blow|Evening cicadas sing|Thick fog descends|Cotton flowers bloom|The heat starts to die down|Rice ripens|Dew glistens white on grass|Wagtails sing|Swallows leave|Thunder ceases|Insects hole up underground|Farmers drain the fields|Wild geese return|Chrysanthemums bloom|Crickets chirp at the door|First frost|Light rains sometimes fall|Maple leaves and ivy turn|Camellias bloom|The land starts to freeze|Daffodils bloom|Rainbows hide|North wind strips the leaves|Citrus leaves turn yellow|Cold sets in, winter begins|Bears start hibernating|Salmon gather upstream|Self-heal sprouts|Deer shed their antlers|Wheat sprouts under snow|Water parsley flourishes|Springs thaw|Pheasants start to call|Butterburs bud|Ice thickens on streams|Hens start laying eggs";

    string private constant ADJ2 =
        "quiet|silver|hollow|paper|distant|frozen|borrowed|gentle|golden|hidden|empty|early|final|salted|broken|sudden";
    string private constant NOUN3 =
        "signature|memory|envelope|satellite|umbrella|festival|telephone|nebula|harmony|galaxy|overpass|calendar|tapestry|butterfly|kimono|horizon";
    string private constant NOUN2 =
        "lantern|ledger|harbor|mirror|window|ferry|pocket|river|garden|signal|letter|kettle|engine|compass|island|station";
    string private constant VERB1 =
        "drifts|hums|waits|burns|sleeps|falls|glows|turns|leans|sways|blinks|hides|rests|swims|sinks|floats";
    string private constant PREP1 = "through|in|past|near|from|by|on|at";
    string private constant ADV2 = "only|slowly|softly|nearly|almost|always|never|barely";
    string private constant VERB2 =
        "remains|returns|survives|forgets|arrives|repeats|unfolds|persists|dissolves|begins|recalls|resumes|awakes|belongs|escapes|becomes";
    // One-syllable nouns for each season: spring, summer, autumn, winter.
    string private constant SPRING = "mist|rain|bud|dew|wind|moss|silt|bloom";
    string private constant SUMMER = "heat|rain|light|tide|dusk|moth|steam|haze";
    string private constant AUTUMN = "dew|moon|dusk|smoke|ash|leaf|rice|wind";
    string private constant WINTER = "snow|frost|ice|ash|smoke|dark|sleet|wind";

    function render(uint256 seed, uint256 day) external pure returns (string memory) {
        (uint256 y, uint256 m, uint256 d) = _ymd(day);
        uint256 k = kou(m * 100 + d);
        // Seasons by the old calendar: 18 micro-seasons each, starting at risshun.
        string memory season = k < 18 ? SPRING : k < 36 ? SUMMER : k < 54 ? AUTUMN : WINTER;

        uint256 h = uint256(keccak256(abi.encode(seed)));
        uint256 a = (h >> 20) & 7;
        string memory l1 = string.concat(_pick(ADJ2, h & 15), " ", _pick(NOUN3, (h >> 4) & 15));
        string memory l2 = string.concat(
            "one ", _pick(NOUN2, (h >> 8) & 15), " ", _pick(VERB1, (h >> 12) & 15), " ", _pick(PREP1, (h >> 16) & 7),
            " the ", _pick(season, a)
        );
        string memory l3 = string.concat(
            _pick(ADV2, (h >> 24) & 7), " ", _pick(season, (a + 1 + ((h >> 28) % 7)) & 7), " ", _pick(VERB2, (h >> 32) & 15)
        );
        uint256 cursorX = 48 + (bytes(l3).length * 1084) / 100 + 2;

        return string.concat(
            string.concat(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 540"><rect width="480" height="540" fill="#0B0B0C"/>',
                '<text x="48" y="104" font-family="Noto Serif CJK JP,Noto Sans CJK JP,serif" font-size="34" fill="#E8202A">',
                _pick(KANJI, k),
                '</text><g font-family="DejaVu Sans Mono,monospace" font-size="13" fill="#8A8782"><text x="48" y="134">',
                _pick(ROMAJI, k),
                '</text><text x="48" y="154">',
                _pick(ENGLISH, k),
                "</text></g>"
            ),
            string.concat(
                '<g font-family="DejaVu Sans Mono,monospace" font-size="18" fill="#F2F0EB">',
                '<text x="48" y="262">', l1, '</text><text x="48" y="304">', l2, '</text><text x="48" y="346">', l3,
                '</text></g><rect x="', cursorX.toString(), '" y="331" width="10" height="19" fill="#E8202A"/>',
                '<g font-family="DejaVu Sans Mono,monospace" font-size="15" fill="#6E6C68"><text x="48" y="500">',
                y.toString(), "-", _pad(m), "-", _pad(d),
                '</text><text x="432" y="500" text-anchor="end">DAILY HAIKU</text></g></svg>'
            )
        );
    }

    /// @notice Index (0-71) of the micro-season a calendar date (MMDD) falls in.
    function kou(uint256 mmdd) public pure returns (uint256 best) {
        bytes memory starts = STARTS;
        uint256 bestStart;
        bool found;
        for (uint256 i = 0; i < 72; i++) {
            uint256 s = (uint256(uint8(starts[2 * i])) << 8) | uint8(starts[2 * i + 1]);
            if (s <= mmdd && (!found || s > bestStart)) {
                best = i;
                bestStart = s;
                found = true;
            }
        }
    }

    /// Returns entry i of a "|"-separated list.
    function _pick(string memory list, uint256 want) private pure returns (string memory) {
        bytes memory b = bytes(list);
        uint256 start;
        uint256 n;
        for (uint256 k = 0; k <= b.length; k++) {
            if (k == b.length || b[k] == "|") {
                if (n == want) {
                    bytes memory out = new bytes(k - start);
                    for (uint256 j = 0; j < out.length; j++) out[j] = b[start + j];
                    return string(out);
                }
                n++;
                start = k + 1;
            }
        }
        return "";
    }

    /// days since epoch -> (year, month, day)
    function _ymd(uint256 day) private pure returns (uint256 y, uint256 m, uint256 d) {
        uint256 z = day + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        d = doy - (153 * mp + 2) / 5 + 1;
        m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
    }

    function _pad(uint256 v) private pure returns (string memory) {
        return v < 10 ? string.concat("0", v.toString()) : v.toString();
    }
}
