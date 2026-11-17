// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice One tile pattern per UTC day. seed = the day's seed, data = days since 1970-01-01.
contract DailyBlock {
    using Strings for uint256;

    function render(uint256 seed, uint256 day) external pure returns (string memory) {
        uint256 hue = seed % 360;
        string memory bg = string.concat("hsl(", hue.toString(), ",35%,9%)");
        string memory fg = string.concat("hsl(", hue.toString(), ",25%,88%)");
        string memory ac = string.concat("hsl(", ((hue + 150) % 360).toString(), ",85%,58%)");

        uint256 bits = uint256(keccak256(abi.encode(seed)));
        bytes memory cells;
        for (uint256 i = 0; i < 32; i++) {
            uint256 n = (bits >> (i * 4)) & 15;
            uint256 kind = n >> 2; // 0 empty, 1-2 foreground, 3 accent
            if (kind == 0) continue;
            uint256 rot = n & 3;
            uint256 col = i % 4;
            uint256 row = i / 4;
            string memory fill = kind == 3 ? ac : fg;
            cells = abi.encodePacked(cells, _tile(col, row, rot, fill), _tile(7 - col, row, rot ^ 1, fill));
        }

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 540"><defs><path id="q" d="M0 0h60a60 60 0 0 1-60 60z"/></defs>',
            '<rect width="480" height="540" fill="',
            bg,
            '"/>',
            string(cells),
            '<g font-family="monospace" font-size="20" fill="',
            fg,
            '"><text x="20" y="517">',
            _date(day),
            '</text><text x="460" y="517" text-anchor="end">DAILY BLOCK</text></g></svg>'
        );
    }

    function _tile(uint256 col, uint256 row, uint256 rot, string memory fill) private pure returns (bytes memory) {
        return abi.encodePacked(
            '<use href="#q" fill="',
            fill,
            '" transform="translate(',
            (col * 60).toString(),
            " ",
            (row * 60).toString(),
            ") rotate(",
            (rot * 90).toString(),
            ' 30 30)"/>'
        );
    }

    /// days since epoch -> YYYY-MM-DD
    function _date(uint256 day) private pure returns (string memory) {
        uint256 z = day + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 d = doy - (153 * mp + 2) / 5 + 1;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y += 1;
        return string.concat(y.toString(), "-", _pad(m), "-", _pad(d));
    }

    function _pad(uint256 v) private pure returns (string memory) {
        return v < 10 ? string.concat("0", v.toString()) : v.toString();
    }
}
