import Phaser from 'phaser';
import { TownCenter } from '../objects/structure/TownCenter';

// Keeping HoardData for backward compatibility if needed,
// but primarily we act as a manager for TownCenters.
export interface HoardData {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export default class HoardManager {
  private scene: Phaser.Scene;
  // Map ID -> TownCenter
  private townCenters: Map<string, TownCenter>;
  // Group for physics collision
  public structureGroup: Phaser.Physics.Arcade.StaticGroup;

  private idCounter: number = 0;
  private territoryGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.townCenters = new Map();
    this.structureGroup = scene.physics.add.staticGroup();

    // Graphics for territories (drawn below everything)
    this.territoryGraphics = scene.add.graphics();
    this.territoryGraphics.setDepth(-1);
  }

  public registerHoard(x: number, y: number, radius: number): string {
    const id = `town_${++this.idCounter}_${Date.now()}`;

    const townCenter = new TownCenter(this.scene, x, y, id, radius);
    this.townCenters.set(id, townCenter);
    this.structureGroup.add(townCenter);

    return id;
  }

  public getHoard(id: string): HoardData | undefined {
    const center = this.townCenters.get(id);
    if (!center) return undefined;

    // Return an object compatible with the old interface
    return {
      id: center.id,
      x: center.x,
      y: center.y,
      radius: center.radius
    };
  }

  public getTownCenter(id: string): TownCenter | undefined {
    return this.townCenters.get(id);
  }

  public getGroup(): Phaser.Physics.Arcade.StaticGroup {
      return this.structureGroup;
  }

  public pruneEmptyHoards(beans: { hoardId: string | null, inheritedHoardId?: string | null }[]) {
    // 1. Collect all active hoard IDs from Beans and Cocoons (which store inheritedHoardId)
    const activeHoardIds = new Set<string>();
    for (const bean of beans) {
      if (bean.hoardId) {
        activeHoardIds.add(bean.hoardId);
      }
      // Check for inherited ID if available (e.g. Cocoon)
      if (bean.inheritedHoardId) {
          activeHoardIds.add(bean.inheritedHoardId);
      }
    }

    // 2. Identify hoards to remove
    const idsToRemove: string[] = [];
    for (const id of this.townCenters.keys()) {
      if (!activeHoardIds.has(id)) {
        idsToRemove.push(id);
      }
    }

    // 3. Delete them
    for (const id of idsToRemove) {
      const center = this.townCenters.get(id);
      if (center) {
        center.destroy(); // Removes from scene and physics group
      }
      this.townCenters.delete(id);
    }
  }

  public update() {
    this.territoryGraphics.clear();
    this.territoryGraphics.fillStyle(0x00ff00, 0.1); // Faint green
    this.territoryGraphics.lineStyle(2, 0x006400, 0.3);

    for (const center of this.townCenters.values()) {
        this.territoryGraphics.fillCircle(center.x, center.y, center.radius);
        this.territoryGraphics.strokeCircle(center.x, center.y, center.radius);
    }
  }

  public destroy() {
      this.territoryGraphics.destroy();
      for (const center of this.townCenters.values()) {
          center.destroy();
      }
      this.townCenters.clear();
  }
}
