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

pub struct Tile {
    pub terrain: Terrain,
    pub number: Option<u8>,
    pub nodes: [NodeId; 6],
}

pub struct Node {
    pub adjacent_tiles: Vec<TileId>, // usually <= 3
    pub edges: Vec<EdgeId>,          // usually <= 3
    pub port: Option<Port>,
    pub building: Option<Building>,
}

pub struct Edge {
    pub nodes: [NodeId; 2],
    pub road: Option<Road>,
}