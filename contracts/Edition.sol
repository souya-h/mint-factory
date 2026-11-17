// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IRenderer {
    function render(uint256 seed, uint256 data) external view returns (string memory svg);
}

/// @notice Generic paid edition. One deployment per project; the artwork lives in the renderer.
contract Edition is ERC721 {
    using Strings for uint256;

    /// PerMint: fresh random seed per token. PerMinter: seed = minter address, one per wallet.
    /// PerDay: every token minted on the same UTC day shares that day's seed.
    /// PerSeed: the minter supplies the seed in `data` (e.g. a transaction hash); each seed can be minted once.
    enum SeedMode {
        PerMint,
        PerMinter,
        PerDay,
        PerSeed
    }

    struct Config {
        string name;
        string symbol;
        string description;
        address renderer;
        address payout;
        uint256 price; // price of the first mint
        uint256 priceStep; // added to the price after every `stepEvery` mints (0 = flat price)
        uint32 stepEvery;
        uint64 startTime;
        uint64 endTime; // 0 = no end
        uint32 maxSupply; // 0 = unlimited
        SeedMode seedMode;
    }

    error NotStarted();
    error Ended();
    error SoldOut();
    error WrongPrice();
    error AlreadyMinted();
    error NotOwner();
    error WrongMode();
    error SeedTaken();
    error WithdrawFailed();

    event Minted(address indexed to, uint256 indexed tokenId, uint256 seed, uint256 data);

    IRenderer public immutable renderer;
    address public immutable payout;
    address public immutable owner;
    uint256 public immutable price;
    uint256 public immutable priceStep;
    uint32 public immutable stepEvery;
    uint64 public immutable startTime;
    uint64 public endTime;
    uint32 public immutable maxSupply;
    SeedMode public immutable seedMode;
    string public description;

    uint256 public totalSupply;
    mapping(uint256 => uint256) public seedOf;
    mapping(uint256 => uint256) public dataOf;
    mapping(address => bool) public minted;
    mapping(uint256 => uint256) public daySeed;
    mapping(uint256 => bool) public seedUsed;

    constructor(Config memory c) ERC721(c.name, c.symbol) {
        renderer = IRenderer(c.renderer);
        payout = c.payout;
        owner = msg.sender;
        price = c.price;
        priceStep = c.priceStep;
        stepEvery = c.stepEvery;
        startTime = c.startTime;
        endTime = c.endTime;
        maxSupply = c.maxSupply;
        seedMode = c.seedMode;
        description = c.description;
    }

    function mint(uint256 data) external payable returns (uint256 id) {
        if (block.timestamp < startTime) revert NotStarted();
        if (endTime != 0 && block.timestamp >= endTime) revert Ended();
        if (maxSupply != 0 && totalSupply >= maxSupply) revert SoldOut();
        if (msg.value != currentPrice()) revert WrongPrice();

        uint256 seed;
        if (seedMode == SeedMode.PerMinter) {
            if (minted[msg.sender]) revert AlreadyMinted();
            minted[msg.sender] = true;
            seed = uint160(msg.sender);
        } else if (seedMode == SeedMode.PerSeed) {
            if (data == 0 || seedUsed[data]) revert SeedTaken();
            seedUsed[data] = true;
            seed = data;
        } else if (seedMode == SeedMode.PerDay) {
            data = block.timestamp / 1 days;
            seed = _fixDaySeed(data);
        } else {
            seed = uint256(keccak256(abi.encode(block.prevrandao, totalSupply, msg.sender)));
        }

        id = ++totalSupply;
        seedOf[id] = seed;
        dataOf[id] = data;
        _mint(msg.sender, id);
        emit Minted(msg.sender, id, seed, data);
    }

    /// @notice Price of the next mint. Starts at `price` and rises by `priceStep` every `stepEvery` mints.
    function currentPrice() public view returns (uint256) {
        if (priceStep == 0 || stepEvery == 0) return price;
        return price + priceStep * (totalSupply / stepEvery);
    }

    /// @notice Fixes today's seed without minting (PerDay only). Anyone may call.
    function poke() external returns (uint256) {
        if (seedMode != SeedMode.PerDay) revert WrongMode();
        return _fixDaySeed(block.timestamp / 1 days);
    }

    function _fixDaySeed(uint256 day) internal returns (uint256 seed) {
        seed = daySeed[day];
        if (seed == 0) {
            seed = uint256(keccak256(abi.encode(blockhash(block.number - 1), day, address(this)))) | 1;
            daySeed[day] = seed;
        }
    }

    /// @notice Sends the whole balance to the fixed payout address. Anyone may call.
    function withdraw() external {
        (bool ok,) = payout.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    /// @notice Ends the sale now.
    function close() external {
        if (msg.sender != owner) revert NotOwner();
        endTime = uint64(block.timestamp);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        string memory svg = renderer.render(seedOf[id], dataOf[id]);
        return _json(string.concat(name(), " #", id.toString()), svg);
    }

    function contractURI() external view returns (string memory) {
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat('{"name":"', name(), '","description":"', description, '"}')))
        );
    }

    function _json(string memory title, string memory svg) internal view returns (string memory) {
        return string.concat(
            "data:application/json;base64,",
            Base64.encode(
                bytes(
                    string.concat(
                        '{"name":"',
                        title,
                        '","description":"',
                        description,
                        '","image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(svg)),
                        '"}'
                    )
                )
            )
        );
    }
}
