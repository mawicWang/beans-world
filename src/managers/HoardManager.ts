import Phaser from 'phaser';
import { TownCenter } from '../objects/structure/TownCenter';
import { ConstructionSite } from '../objects/structure/ConstructionSite';

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
  // Map ID -> ConstructionSite
  private constructionSites: Map<string, ConstructionSite>;

  // Group for physics collision
  public structureGroup: Phaser.Physics.Arcade.StaticGroup;

  private idCounter: number = 0;
  private territoryGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.townCenters = new Map();
    this.constructionSites = new Map();
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

  public startConstruction(hoardId: string, x: number, y: number, buildingType: string, cost: number) {
      const siteId = `site_${++this.idCounter}_${Date.now()}`;
      const site = new ConstructionSite(this.scene, x, y, siteId, buildingType, cost, () => {
          // On Complete
          this.finishConstruction(siteId, hoardId, buildingType);
      });
      this.constructionSites.set(siteId, site);
      this.structureGroup.add(site);
      return siteId;
  }

  private finishConstruction(siteId: string, hoardId: string, buildingType: string) {
      const site = this.constructionSites.get(siteId);
      if (site) {
          const x = site.x;
          const y = site.y;
          this.constructionSites.delete(siteId);
          // Actually spawn the building here. For now, just another dummy structure or upgrade logic
          // But since we only have TownCenter, let's just log it or maybe spawn a decorative structure?
          console.log(`Construction of ${buildingType} complete at ${x}, ${y} for hoard ${hoardId}`);

          // For demo purposes, we can spawn a "Storage Pit" (just a visual box for now, until we make classes)
          // Or we can just leave it cleared.
      }
  }

  public getConstructionSites(hoardId: string): ConstructionSite[] {
      // Return sites close to this hoard?
      // Ideally we should link sites to hoards. For now, we return all sites near the hoard center.
      const town = this.townCenters.get(hoardId);
      if (!town) return [];

      const sites: ConstructionSite[] = [];
      for (const site of this.constructionSites.values()) {
          if (Phaser.Math.Distance.Between(site.x, site.y, town.x, town.y) < town.radius) {
              sites.push(site);
          }
      }
      return sites;
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
      for (const site of this.constructionSites.values()) {
          site.destroy();
      }
      this.constructionSites.clear();
  }
}
