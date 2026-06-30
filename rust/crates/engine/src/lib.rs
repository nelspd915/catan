pub struct GameState {
    pub board: Board,
    pub players: Vec<PlayerState>,
    pub bank: ResourceCounts,
    pub phase: Phase,
    pub turn: TurnState,
}

pub struct Board {
    pub tiles: Vec<Tile>,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub robber: TileId,
}

pub struct TileId(u8);

pub struct Tile {
    pub terrain: Terrain,
    pub number: Option<u8>,
    pub nodes: [NodeId; 6],
}

pub enum Terrain {
    Desert,
    Hills,
    Forest,
    Mountains,
    Fields,
    Pasture,
}

pub struct Node {
    pub adjacent_tiles: Vec<TileId>, // usually <= 3
    pub edges: Vec<EdgeId>,          // usually <= 3
    pub port: Option<Port>,
    pub building: Option<Building>,
}

pub enum Port {
    Brick,
    Lumber,
    Wool,
    Grain,
    Ore,
    Generic,
}

pub struct EdgeId(u8);

pub enum Building {
    Settlement(PlayerId),
    City(PlayerId),
}

pub struct Edge {
    pub nodes: [NodeId; 2],
    pub road: Option<Road>,
}

pub struct Road {
    pub owner: PlayerId,
}

pub struct NodeId(u8);

pub struct PlayerId(u8);

pub struct PlayerState {
    id: PlayerId,
    resources: ResourceCounts,
    roads_remaining: u8,
    settlements_remaining: u8,
    cities_remaining: u8,
    victory_points: u8,
    longest_road: u8,
    army_size: u8,
}

pub struct ResourceCounts {
    pub brick: u8,
    pub lumber: u8,
    pub wool: u8,
    pub grain: u8,
    pub ore: u8,
}