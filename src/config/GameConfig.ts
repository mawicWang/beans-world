export const GameConfig = {
    // World Dimensions
    WORLD_WIDTH: 3000,
    WORLD_HEIGHT: 3000,

    // Bean Stats
    BEAN: {
        MATURITY_AGE: 60000, // 1 minute
        VISION_RADIUS: 200,
        GUARD_VISION_RADIUS: 300,
        MAX_CHASE_DIST: 500,
        CHARGE_DURATION: 300, // ms
        IDLE_DURATION_MIN: 500,
        IDLE_DURATION_MAX: 2000,
        HOARD_RADIUS_MULTIPLIER: 2.5,
        MIN_ATTR: 1,
        MAX_ATTR: 20,

        // Physics
        SPRING_STIFFNESS: 0.1,
        SPRING_DAMPING: 0.6,
        ROPE_LENGTH: 0,

        // Satiety
        START_SATIETY: 80,
        MAX_SATIETY_BASE: 80,
        MAX_SATIETY_CON_MULT: 2,
    },

    // Food
    FOOD: {
        SPAWN_INTERVAL: 500, // ms
    },

    // Spatial Grid
    GRID: {
        CELL_SIZE: 300,
    }
};
