
export interface ISpatialObject {
    x: number;
    y: number;
    width?: number; // Approximate width/radius for querying
    height?: number;
    id?: string;
}

export class SpatialGrid<T extends ISpatialObject> {
    private cellSize: number;
    // private width: number;
    // private height: number;
    private grid: Map<string, T[]> = new Map();
    private objectKeys: Map<T, string[]> = new Map();

    constructor(_width: number, _height: number, cellSize: number) {
        // this.width = width;
        // this.height = height;
        this.cellSize = cellSize;
    }

    private getKey(x: number, y: number): string {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        return `${col},${row}`;
    }

    private getKeysForObject(obj: T): string[] {
        const keys: string[] = [];
        // Determine the range of cells the object might overlap with.
        // Assuming obj is a point or has a small radius, we can check 4 corners or just center.
        // For beans, we treat them as points for insertion, but query with a radius.
        // However, if we want strict collision, we might need to insert into multiple cells.
        // For "find neighbor" queries, point insertion is usually sufficient if the query logic checks adjacent cells.

        // Let's stick to point insertion for simplicity first, as beans are small compared to typical cell size.
        // If an object is large, it should occupy multiple cells.
        // Let's assume point insertion for now.
        keys.push(this.getKey(obj.x, obj.y));
        return keys;
    }

    public add(obj: T) {
        const keys = this.getKeysForObject(obj);
        this.objectKeys.set(obj, keys);
        for (const key of keys) {
            if (!this.grid.has(key)) {
                this.grid.set(key, []);
            }
            this.grid.get(key)!.push(obj);
        }
    }

    public remove(obj: T) {
        const keys = this.objectKeys.get(obj);
        if (!keys) return;

        for (const key of keys) {
            const cell = this.grid.get(key);
            if (cell) {
                const index = cell.indexOf(obj);
                if (index !== -1) {
                    cell.splice(index, 1);
                }
                if (cell.length === 0) {
                    this.grid.delete(key);
                }
            }
        }
        this.objectKeys.delete(obj);
    }

    public update(obj: T) {
        // Optimization: check if keys changed
        const oldKeys = this.objectKeys.get(obj);
        const newKeys = this.getKeysForObject(obj);

        // Simple comparison for single-cell point objects
        if (oldKeys && oldKeys.length === 1 && newKeys.length === 1 && oldKeys[0] === newKeys[0]) {
            return;
        }

        this.remove(obj);
        this.add(obj);
    }

    public query(x: number, y: number, radius: number): T[] {
        const results: Set<T> = new Set();
        const startCol = Math.floor((x - radius) / this.cellSize);
        const endCol = Math.floor((x + radius) / this.cellSize);
        const startRow = Math.floor((y - radius) / this.cellSize);
        const endRow = Math.floor((y + radius) / this.cellSize);

        for (let col = startCol; col <= endCol; col++) {
            for (let row = startRow; row <= endRow; row++) {
                const key = `${col},${row}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const obj of cell) {
                        results.add(obj);
                    }
                }
            }
        }
        return Array.from(results);
    }

    public clear() {
        this.grid.clear();
        this.objectKeys.clear();
    }
}
