// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice A 5-7-5 poem read out of a wallet address. seed = address, data unused.
/// Every word list has 16 entries with a fixed syllable count, so any address yields 5-7-5:
///   [ADJ 2] [NOUN 3]
///   one [NOUN 2] [VERB 1] [PREP 1] the [NOUN 1]
///   [ADV 2] [NOUN 1] [VERB 2]
/// plus one Japanese season word (kigo).
contract HashHaiku {
    using Strings for uint256;

    string private constant ADJ2 =
        "quiet|silver|hollow|paper|distant|frozen|borrowed|gentle|golden|hidden|empty|early|final|salted|broken|sudden";
    string private constant NOUN3 =
        "signature|memory|envelope|satellite|umbrella|festival|telephone|nebula|harmony|galaxy|overpass|calendar|tapestry|butterfly|kimono|horizon";
    string private constant NOUN2 =
        "lantern|ledger|harbor|mirror|window|ferry|pocket|river|garden|signal|letter|kettle|engine|compass|island|station";
    string private constant VERB1 =
        "drifts|hums|waits|burns|sleeps|falls|glows|turns|leans|sways|blinks|hides|rests|swims|sinks|floats";
    string private constant PREP1 = "through|in|past|near|from|by|on|at|through|in|past|near|from|by|on|at";
    string private constant NOUN1 =
        "rain|salt|ash|glass|moon|frost|smoke|dust|light|ink|tide|steam|wind|snow|sand|rust";
    string private constant ADV2 =
        "only|slowly|softly|nearly|almost|always|never|barely|maybe|rarely|simply|gently|even|surely|newly|mostly";
    string private constant VERB2 =
        "remains|returns|survives|forgets|arrives|repeats|unfolds|persists|dissolves|begins|recalls|resumes|awakes|belongs|escapes|becomes";
    string private constant KIGO =
        unicode"初雪|夕立|蝉時雨|春一番|月見|霜柱|朧月|星月夜|花冷え|木枯らし|秋の暮|薄氷|若葉|稲妻|雪解け|蛍";

    function render(uint256 seed, uint256) external pure returns (string memory) {
        uint256 h = uint256(keccak256(abi.encode(seed)));
        string memory n1 = _pick(NOUN1, h >> 20);
        // The last line gets a different single-syllable noun from the middle line.
        string memory n1b = _pick(NOUN1, (((h >> 20) & 15) + 1 + ((h >> 36) % 15)));

        string memory l1 = string.concat(_pick(ADJ2, h), " ", _pick(NOUN3, h >> 4));
        string memory l2 = string.concat(
            "one ", _pick(NOUN2, h >> 8), " ", _pick(VERB1, h >> 12), " ", _pick(PREP1, h >> 16), " the ", n1
        );
        string memory l3 = string.concat(_pick(ADV2, h >> 24), " ", n1b, " ", _pick(VERB2, h >> 28));

        string memory addr = Strings.toHexString(address(uint160(seed)));
        // DejaVu Sans Mono advance is 0.602em; at 18px that is about 10.84px per character.
        // The longest possible line is 36 characters (about 390px), so every poem fits.
        uint256 cursorX = 48 + (bytes(l3).length * 1084) / 100 + 2;

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 540"><rect width="480" height="540" fill="#0B0B0C"/>',
            '<text x="48" y="120" font-family="Noto Sans CJK JP,sans-serif" font-size="22" fill="#E8202A">',
            _pick(KIGO, h >> 40),
            '</text><g font-family="DejaVu Sans Mono,monospace" font-size="18" fill="#F2F0EB">',
            '<text x="48" y="236">', l1, '</text><text x="48" y="282">', l2, '</text><text x="48" y="328">', l3,
            '</text></g><rect x="', cursorX.toString(), '" y="313" width="10" height="19" fill="#E8202A"/>',
            '<g font-family="DejaVu Sans Mono,monospace" font-size="15" fill="#6E6C68"><text x="48" y="500">',
            _short(addr),
            '</text><text x="432" y="500" text-anchor="end">HASH HAIKU</text></g></svg>'
        );
    }

    /// Returns entry (i % 16) of a "|"-separated list.
    function _pick(string memory list, uint256 i) private pure returns (string memory) {
        bytes memory b = bytes(list);
        uint256 want = i & 15;
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

    function _short(string memory a) private pure returns (string memory) {
        bytes memory b = bytes(a);
        bytes memory out = new bytes(13);
        for (uint256 i = 0; i < 6; i++) out[i] = b[i];
        out[6] = ".";
        out[7] = ".";
        out[8] = ".";
        for (uint256 i = 0; i < 4; i++) out[9 + i] = b[38 + i];
        return string(out);
    }
}
