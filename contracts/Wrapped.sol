// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice A wallet's year as a card. seed = wallet address.
/// data = 12 monthly transaction counts (16 bits each, January in the lowest bits)
///        followed by the number of active days (16 bits at bit 192).
contract Wrapped {
    using Strings for uint256;

    string public constant YEAR = "2026";

    function render(uint256 seed, uint256 data) external pure returns (string memory) {
        uint256 hue = uint256(keccak256(abi.encode(seed))) % 360;
        string memory bg = string.concat("hsl(", hue.toString(), ",35%,9%)");
        string memory fg = string.concat("hsl(", hue.toString(), ",25%,88%)");
        string memory ac = string.concat("hsl(", ((hue + 150) % 360).toString(), ",85%,58%)");

        uint256 max = 1;
        uint256 total;
        for (uint256 i = 0; i < 12; i++) {
            uint256 c = (data >> (i * 16)) & 0xffff;
            total += c;
            if (c > max) max = c;
        }

        bytes memory bars;
        bytes memory letters = "JFMAMJJASOND";
        for (uint256 i = 0; i < 12; i++) {
            uint256 c = (data >> (i * 16)) & 0xffff;
            uint256 h = 4 + (c * 256) / max;
            uint256 x = 24 + i * 36;
            bars = abi.encodePacked(
                bars,
                '<rect x="',
                x.toString(),
                '" y="',
                (420 - h).toString(),
                '" width="28" height="',
                h.toString(),
                '" fill="',
                c == max && total > 0 ? ac : fg,
                '"/><text x="',
                (x + 14).toString(),
                '" y="446" text-anchor="middle" font-size="14">',
                letters[i],
                "</text>"
            );
        }

        string memory addr = Strings.toHexString(address(uint160(seed)));
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 540"><rect width="480" height="540" fill="',
            bg,
            '"/><g font-family="monospace" fill="',
            fg,
            '"><text x="24" y="52" font-size="28">ONCHAIN ',
            YEAR,
            '</text><text x="24" y="82" font-size="16">',
            _short(addr),
            "</text>",
            string(bars),
            '<text x="24" y="500" font-size="20">TX ',
            total.toString(),
            '</text><text x="456" y="500" font-size="20" text-anchor="end">ACTIVE DAYS ',
            ((data >> 192) & 0xffff).toString(),
            "</text></g></svg>"
        );
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
